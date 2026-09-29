import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { messagesApi, requestsApi } from '../../api/index.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { useAsync } from '../../hooks/useAsync.js';
import { RequestCard } from '../../components/domain/RequestCard.jsx';
import { ReviewDialog } from '../../components/domain/ReviewDialog.jsx';
import { SessionDialog } from '../../components/domain/SessionDialog.jsx';
import { Button, ConfirmDialog, EmptyState, ErrorMessage, PageHeader, PageLoader, Pagination, Select, Tabs } from '../../components/ui/index.jsx';

const TABS = [
  { value: 'received', label: 'Received' },
  { value: 'sent', label: 'Sent' },
  { value: 'completed', label: 'Completed' },
];

const EMPTY = {
  received: { title: 'No incoming requests yet.', message: 'When someone wants to learn from you, their request will appear here.' },
  sent: { title: 'You have not sent any requests.', message: 'Find a skill partner and send your first exchange request.' },
  completed: { title: 'No completed exchanges yet.', message: 'Finished exchanges show up here so you can leave reviews.' },
};

export function RequestsPage() {
  const { refresh } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const tab = TABS.some((t) => t.value === params.get('tab')) ? params.get('tab') : 'received';
  const status = params.get('status') || '';
  const page = Number(params.get('page') || 1);

  const counts = useAsync(() => requestsApi.counts(), []);
  const list = useAsync(() => requestsApi[tab]({ status: status || undefined, page }), [tab, status, page]);
  const [busy, setBusy] = useState({});
  const [confirm, setConfirm] = useState(null);
  const [scheduling, setScheduling] = useState(null);
  const [reviewing, setReviewing] = useState(null);

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
    list.reload({ silent: true });
    counts.reload({ silent: true });
    refresh();
  }

  async function run(request, action, fn, successMessage) {
    setBusy({ [request.id]: action });
    try {
      await fn(request.id);
      toast.success(successMessage);
      refreshAll();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy({});
      setConfirm(null);
    }
  }

  async function openChat(request) {
    const other = request.direction === 'RECEIVED' ? request.sender : request.receiver;
    try {
      const { conversation } = await messagesApi.open(other.id);
      navigate(`/app/messages/${conversation.id}`);
    } catch (err) {
      toast.error(err.message);
    }
  }

  const actions = {
    onAccept: (request) => run(request, 'accept', requestsApi.accept, `Accepted. ${request.sender.fullName} has been notified — schedule a session when you are ready.`),
    onReject: (request) =>
      setConfirm({
        title: 'Reject this request?',
        message: `${request.sender.fullName} will be notified and their reserved points will be returned.`,
        confirmLabel: 'Reject request',
        danger: true,
        onConfirm: () => run(request, 'reject', requestsApi.reject, 'Request rejected.'),
      }),
    onCancel: (request) =>
      setConfirm({
        title: request.status === 'ACCEPTED' ? 'Cancel this exchange?' : 'Cancel this request?',
        message: request.status === 'ACCEPTED' ? 'Any scheduled session will be cancelled and the reserved points refunded to the learner.' : 'Your reserved points will be returned to your available balance.',
        confirmLabel: 'Yes, cancel',
        danger: true,
        onConfirm: () => run(request, 'cancel', requestsApi.cancel, 'Cancelled.'),
      }),
    onSchedule: (request) => setScheduling(request),
    onMessage: openChat,
    onReview: (request) => setReviewing(request),
  };

  const tabsWithCounts = TABS.map((t) => ({ ...t, count: t.value === 'received' ? counts.data?.pendingReceived : t.value === 'sent' ? counts.data?.pendingSent : undefined }));
  const data = list.data;

  return (
    <div>
      <PageHeader title="Skill Exchange Requests" subtitle="Manage the exchanges you have requested and been asked for." actions={<Button to="/app/find">Find a partner</Button>} />
      <div className="row row--between mb-3" style={{ alignItems: 'flex-end', flexWrap: 'wrap', gap: 12 }}>
        <Tabs tabs={tabsWithCounts} active={tab} onChange={(value) => setQuery({ tab: value, status: '' })} ariaLabel="Request folders" />
        {tab !== 'completed' && (
          <Select label="Status" value={status} onChange={(e) => setQuery({ status: e.target.value })} placeholder="All statuses" style={{ minWidth: 160 }}>
            <option value="PENDING">Pending</option>
            <option value="ACCEPTED">Accepted</option>
            <option value="REJECTED">Rejected</option>
            <option value="CANCELLED">Cancelled</option>
            <option value="COMPLETED">Completed</option>
          </Select>
        )}
      </div>

      {list.loading && !data ? (
        <PageLoader label="Loading requests…" />
      ) : list.error ? (
        <ErrorMessage error={list.error} onRetry={list.reload} />
      ) : data.items.length ? (
        <div className="stack">
          {data.items.map((request) => (
            <RequestCard key={request.id} request={request} busy={busy[request.id]} actions={actions} />
          ))}
          <Pagination pagination={data.pagination} onPageChange={(p) => setQuery({ page: p })} />
        </div>
      ) : (
        <EmptyState icon="swap" title={status ? 'No requests match that status.' : EMPTY[tab].title} message={status ? 'Try clearing the status filter.' : EMPTY[tab].message} action={tab === 'sent' ? <Button to="/app/find">Find a Skill Partner</Button> : undefined} />
      )}

      <ConfirmDialog open={Boolean(confirm)} onClose={() => setConfirm(null)} loading={Object.keys(busy).length > 0} {...(confirm || {})} />
      <SessionDialog open={Boolean(scheduling)} onClose={() => setScheduling(null)} request={scheduling} onSaved={refreshAll} />
      <ReviewDialog open={Boolean(reviewing)} onClose={() => setReviewing(null)} request={reviewing} onSaved={refreshAll} />
    </div>
  );
}
