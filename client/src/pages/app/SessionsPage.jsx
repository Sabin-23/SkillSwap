import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { sessionsApi } from '../../api/index.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { useAsync } from '../../hooks/useAsync.js';
import { formatDate, formatTime, SESSION_FORMAT_LABELS } from '../../utils/format.js';
import { ReportDialog } from '../../components/domain/ReportDialog.jsx';
import { SessionCard } from '../../components/domain/SessionCard.jsx';
import { SessionDialog } from '../../components/domain/SessionDialog.jsx';
import { Avatar, Badge, Button, ConfirmDialog, EmptyState, ErrorMessage, Icon, Modal, PageHeader, PageLoader, Pagination, Tabs } from '../../components/ui/index.jsx';

const VIEWS = [
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'today', label: 'Today' },
  { value: 'past', label: 'Past' },
  { value: 'cancelled', label: 'Cancelled' },
];

const EMPTY = {
  upcoming: { title: 'No upcoming sessions.', message: 'Accept a request or schedule a session for an accepted exchange to see it here.' },
  today: { title: 'Nothing scheduled for today.', message: 'Enjoy the free time, or find a new skill partner.' },
  past: { title: 'No past sessions yet.', message: 'Completed sessions are listed here with their outcomes.' },
  cancelled: { title: 'No cancelled sessions.', message: 'Sessions that were cancelled will show up here.' },
};

export function SessionsPage() {
  const { refresh } = useAuth();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const view = VIEWS.some((v) => v.value === params.get('view')) ? params.get('view') : 'upcoming';
  const page = Number(params.get('page') || 1);
  const { data, loading, error, reload } = useAsync(() => sessionsApi.list({ view, page }), [view, page]);
  const [busy, setBusy] = useState({});
  const [confirm, setConfirm] = useState(null);
  const [editing, setEditing] = useState(null);
  const [viewing, setViewing] = useState(null);
  const [reporting, setReporting] = useState(null);

  function setQuery(changes) {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(changes)) {
      if (!value) next.delete(key);
      else next.set(key, String(value));
    }
    if (!('page' in changes)) next.delete('page');
    setParams(next);
  }

  function refreshAll() {
    reload({ silent: true });
    refresh();
  }

  async function run(session, action, fn, message) {
    setBusy({ [session.id]: action });
    try {
      await fn(session.id);
      toast.success(message);
      refreshAll();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy({});
      setConfirm(null);
    }
  }

  const actions = {
    onView: setViewing,
    onReschedule: setEditing,
    onComplete: (session) =>
      setConfirm({
        title: 'Mark this session as completed?',
        message: session.role === 'LEARNER' ? `${session.pointCost} reserved points will be transferred to ${session.partner.fullName}, and the exchange will be marked complete.` : `You will receive ${session.pointCost} points from ${session.partner.fullName}, and the exchange will be marked complete.`,
        confirmLabel: 'Mark complete',
        onConfirm: () => run(session, 'complete', sessionsApi.complete, 'Session completed. You can now leave a review.'),
      }),
    onCancel: (session) =>
      setConfirm({
        title: 'Cancel this session?',
        message: `${session.partner.fullName} will be notified. The exchange stays accepted so you can reschedule later.`,
        confirmLabel: 'Cancel session',
        danger: true,
        onConfirm: () => run(session, 'cancel', sessionsApi.cancel, 'Session cancelled.'),
      }),
    onReport: (session) => setReporting(session),
  };

  return (
    <div>
      <PageHeader title="Sessions" subtitle="Your scheduled, past and cancelled learning sessions." actions={<Button to="/app/requests" variant="outline">Schedule from a request</Button>} />
      <Tabs tabs={VIEWS} active={view} onChange={(value) => setQuery({ view: value })} ariaLabel="Session views" />

      {loading && !data ? (
        <PageLoader label="Loading sessions…" />
      ) : error ? (
        <ErrorMessage error={error} onRetry={reload} />
      ) : data.items.length ? (
        <div className="stack">
          {data.items.map((session) => (
            <SessionCard key={session.id} session={session} busy={busy[session.id]} actions={actions} />
          ))}
          <Pagination pagination={data.pagination} onPageChange={(p) => setQuery({ page: p })} />
        </div>
      ) : (
        <EmptyState icon="calendar" title={EMPTY[view].title} message={EMPTY[view].message} action={view === 'upcoming' ? <Button to="/app/requests?tab=received">Go to requests</Button> : undefined} />
      )}

      <ConfirmDialog open={Boolean(confirm)} onClose={() => setConfirm(null)} loading={Object.keys(busy).length > 0} {...(confirm || {})} />
      <SessionDialog open={Boolean(editing)} onClose={() => setEditing(null)} session={editing} onSaved={refreshAll} />
      <ReportDialog open={Boolean(reporting)} onClose={() => setReporting(null)} target={reporting ? { type: 'SESSION', id: reporting.id, userId: reporting.partner.id, label: `${reporting.skill.name} session with ${reporting.partner.fullName} on ${formatDate(reporting.scheduledDate)}` } : null} onSubmitted={refreshAll} />
      <SessionDetailModal session={viewing} onClose={() => setViewing(null)} />
    </div>
  );
}

export function SessionDetailModal({ session, onClose }) {
  if (!session) return null;
  return (
    <Modal open onClose={onClose} title={`${session.skill.name} session`} description={`${session.role === 'TEACHER' ? 'You are teaching' : 'You are learning'} · ${session.pointCost} points`} footer={<Button onClick={onClose}>Close</Button>}>
      <div className="row mb-4" style={{ gap: 10 }}>
        <Avatar name={session.partner.fullName} src={session.partner.avatarUrl} size={40} />
        <div>
          <strong>
            <Link to={`/app/users/${session.partner.id}`}>{session.partner.fullName}</Link>
          </strong>
          <div className="row" style={{ gap: 6 }}>
            <Badge status={session.status} />
            {session.paymentStatus && <Badge status={session.paymentStatus} size="sm" />}
          </div>
        </div>
      </div>
      <dl className="kv">
        <dt>Date</dt>
        <dd>{formatDate(session.scheduledDate, { weekday: 'long' })}</dd>
        <dt>Time</dt>
        <dd>
          {formatTime(session.startTime)} – {formatTime(session.endTime)}
        </dd>
        <dt>Format</dt>
        <dd>{SESSION_FORMAT_LABELS[session.format]}</dd>
        {session.location && (
          <>
            <dt>Location</dt>
            <dd>{session.location}</dd>
          </>
        )}
        {session.meetingLink && (
          <>
            <dt>Meeting link</dt>
            <dd>
              <a href={session.meetingLink} target="_blank" rel="noopener noreferrer">
                {session.meetingLink} <Icon name="external" size={12} />
              </a>
            </dd>
          </>
        )}
        {session.notes && (
          <>
            <dt>Notes</dt>
            <dd>{session.notes}</dd>
          </>
        )}
        {session.completedAt && (
          <>
            <dt>Completed</dt>
            <dd>{formatDate(session.completedAt)}</dd>
          </>
        )}
      </dl>
    </Modal>
  );
}
