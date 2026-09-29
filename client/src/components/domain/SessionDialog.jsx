import { useEffect, useState } from 'react';
import { sessionsApi } from '../../api/index.js';
import { useToast } from '../../context/ToastContext.jsx';
import { todayISO } from '../../utils/format.js';
import { Button, Icon, Input, Modal, Select, Textarea } from '../ui/index.jsx';

function addMinutes(time, minutes) {
  if (!time) return '';
  const [h, m] = time.split(':').map(Number);
  const total = h * 60 + m + minutes;
  if (total >= 24 * 60) return '23:59';
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

/**
 * Schedule a new session for an accepted request, or reschedule an existing one.
 * Pass `request` to create, or `session` to edit.
 */
export function SessionDialog({ open, onClose, request, session, onSaved }) {
  const toast = useToast();
  const editing = Boolean(session);
  const [form, setForm] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});

  useEffect(() => {
    if (!open) return;
    setError(null);
    setFieldErrors({});
    if (session) {
      setForm({
        scheduledDate: session.scheduledDate,
        startTime: session.startTime,
        endTime: session.endTime,
        format: session.format,
        location: session.location || '',
        meetingLink: session.meetingLink || '',
        notes: session.notes || '',
      });
    } else {
      const duration = request?.durationMinutes || 60;
      setForm({
        scheduledDate: '',
        startTime: '18:00',
        endTime: addMinutes('18:00', duration),
        format: 'ONLINE',
        location: '',
        meetingLink: '',
        notes: '',
      });
    }
  }, [open, session, request]);

  function update(key, value) {
    setForm((current) => {
      const next = { ...current, [key]: value };
      if (key === 'startTime' && !editing && request?.durationMinutes) {
        next.endTime = addMinutes(value, request.durationMinutes);
      }
      return next;
    });
  }

  async function submit(event) {
    event.preventDefault();
    setError(null);
    setFieldErrors({});
    const errors = {};
    if (!form.scheduledDate) errors.scheduledDate = 'Choose a date.';
    if (!form.startTime) errors.startTime = 'Choose a start time.';
    if (!form.endTime) errors.endTime = 'Choose an end time.';
    if (form.startTime && form.endTime && form.endTime <= form.startTime) errors.endTime = 'End time must be after start time.';
    if (form.format === 'IN_PERSON' && !form.location.trim()) errors.location = 'Location is required for in-person sessions.';
    if (form.scheduledDate && new Date(`${form.scheduledDate}T${form.startTime || '00:00'}:00`) < new Date()) {
      errors.scheduledDate = 'Choose a future date and time.';
    }
    if (Object.keys(errors).length) {
      setFieldErrors(errors);
      return;
    }
    setLoading(true);
    try {
      const payload = {
        scheduledDate: form.scheduledDate,
        startTime: form.startTime,
        endTime: form.endTime,
        format: form.format,
        location: form.format === 'IN_PERSON' ? form.location.trim() : null,
        meetingLink: form.format === 'ONLINE' ? form.meetingLink.trim() || null : null,
        notes: form.notes.trim() || null,
      };
      const data = editing ? await sessionsApi.update(session.id, payload) : await sessionsApi.create({ ...payload, exchangeRequestId: request.id });
      toast.success(editing ? 'Session updated.' : 'Session scheduled.');
      onSaved?.(data.session);
      onClose();
    } catch (err) {
      setError(err.message);
      setFieldErrors(err.fields || {});
    } finally {
      setLoading(false);
    }
  }

  const skillName = session?.skill?.name || request?.skill?.name;
  const partner = session?.partner?.fullName || (request?.direction === 'RECEIVED' ? request?.sender?.fullName : request?.receiver?.fullName);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? 'Reschedule session' : 'Schedule a session'}
      description={skillName ? `${skillName} with ${partner}` : undefined}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button type="submit" form="session-form" loading={loading}>
            {editing ? 'Save changes' : 'Schedule session'}
          </Button>
        </>
      }
    >
      {error && (
        <div className="alert alert--danger mb-4" role="alert">
          <Icon name="alert" size={18} /> {error}
        </div>
      )}
      <form id="session-form" onSubmit={submit} className="stack">
        <Input label="Date" type="date" min={todayISO()} value={form.scheduledDate || ''} onChange={(e) => update('scheduledDate', e.target.value)} error={fieldErrors.scheduledDate} required />
        <div className="form-grid">
          <Input label="Start time" type="time" value={form.startTime || ''} onChange={(e) => update('startTime', e.target.value)} error={fieldErrors.startTime} required />
          <Input label="End time" type="time" value={form.endTime || ''} onChange={(e) => update('endTime', e.target.value)} error={fieldErrors.endTime} required />
        </div>
        <Select label="Format" value={form.format || 'ONLINE'} onChange={(e) => update('format', e.target.value)} error={fieldErrors.format}>
          <option value="ONLINE">Online</option>
          <option value="IN_PERSON">In person</option>
        </Select>
        {form.format === 'IN_PERSON' ? (
          <Input label="Location" placeholder="e.g. Kigali Public Library, Room 2" value={form.location || ''} onChange={(e) => update('location', e.target.value)} error={fieldErrors.location} required />
        ) : (
          <Input label="Meeting link (optional)" type="url" placeholder="https://meet.example.com/…" value={form.meetingLink || ''} onChange={(e) => update('meetingLink', e.target.value)} error={fieldErrors.meetingLink} />
        )}
        <Textarea label="Notes (optional)" rows={3} placeholder="What to prepare, topics to cover…" value={form.notes || ''} onChange={(e) => update('notes', e.target.value)} error={fieldErrors.notes} maxLength={1000} />
      </form>
    </Modal>
  );
}
