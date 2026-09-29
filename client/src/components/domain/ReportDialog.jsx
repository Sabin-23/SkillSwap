import { useEffect, useState } from 'react';
import { reportsApi } from '../../api/index.js';
import { useToast } from '../../context/ToastContext.jsx';
import { labelize } from '../../utils/format.js';
import { Button, Icon, Modal, Select, Textarea } from '../ui/index.jsx';

const REASONS = ['HARASSMENT', 'SPAM', 'INAPPROPRIATE_CONTENT', 'NO_SHOW', 'SCAM', 'SESSION_PROBLEM', 'OTHER'];

/**
 * Report a user, message, review or session.
 * target: { type: 'USER'|'MESSAGE'|'REVIEW'|'SESSION', id, userId, label }
 */
export function ReportDialog({ open, onClose, target, onSubmitted }) {
  const toast = useToast();
  const [reason, setReason] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});

  useEffect(() => {
    if (!open) return;
    setReason(target?.type === 'SESSION' ? 'SESSION_PROBLEM' : '');
    setDescription('');
    setError(null);
    setFieldErrors({});
  }, [open, target]);

  if (!target) return null;

  async function submit(event) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setFieldErrors({});
    try {
      await reportsApi.create({
        targetType: target.type,
        targetId: target.id,
        reportedUserId: target.userId,
        reason,
        description,
      });
      toast.success('Report submitted. Our moderators will review it.');
      onSubmitted?.();
      onClose();
    } catch (err) {
      setError(err.message);
      setFieldErrors(err.fields || {});
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      title={`Report ${target.type.toLowerCase()}`}
      description={target.label}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button type="submit" form="report-form" variant="danger" loading={loading}>
            Submit report
          </Button>
        </>
      }
    >
      {error && (
        <div className="alert alert--danger mb-4" role="alert">
          <Icon name="alert" size={18} /> {error}
        </div>
      )}
      {target.type === 'SESSION' && (
        <div className="alert alert--info mb-4">
          <Icon name="info" size={18} /> Reporting a session freezes its reserved points until an administrator reviews the dispute.
        </div>
      )}
      <form id="report-form" onSubmit={submit} className="stack">
        <Select label="Reason" value={reason} onChange={(e) => setReason(e.target.value)} required placeholder="Choose a reason" error={fieldErrors.reason}>
          {REASONS.map((value) => (
            <option key={value} value={value}>
              {labelize(value)}
            </option>
          ))}
        </Select>
        <Textarea label="Describe the problem" value={description} onChange={(e) => setDescription(e.target.value)} required minLength={10} maxLength={2000} placeholder="Please include what happened and when." error={fieldErrors.description} hint="At least 10 characters." />
      </form>
    </Modal>
  );
}
