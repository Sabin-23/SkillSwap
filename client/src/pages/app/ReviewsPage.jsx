import { useState } from 'react';
import { reviewsApi } from '../../api/index.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { useAsync } from '../../hooks/useAsync.js';
import { ReportDialog } from '../../components/domain/ReportDialog.jsx';
import { ReviewCard } from '../../components/domain/ReviewCard.jsx';
import { ReviewDialog } from '../../components/domain/ReviewDialog.jsx';
import { Button, Card, ConfirmDialog, EmptyState, ErrorMessage, PageHeader, PageLoader, StarRating, Tabs } from '../../components/ui/index.jsx';

export function ReviewsPage() {
  const { refresh } = useAuth();
  const toast = useToast();
  const [tab, setTab] = useState('received');
  const { data, loading, error, reload } = useAsync(() => reviewsApi.mine(), []);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [reporting, setReporting] = useState(null);
  const [busy, setBusy] = useState(false);

  function refreshAll() {
    reload({ silent: true });
    refresh();
  }

  async function confirmDelete() {
    setBusy(true);
    try {
      await reviewsApi.remove(deleting.id);
      toast.success('Review deleted.');
      refreshAll();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
      setDeleting(null);
    }
  }

  if (loading) return <PageLoader label="Loading reviews…" />;
  if (error) return <ErrorMessage error={error} onRetry={reload} />;

  const received = data.received;
  const given = data.given;
  const summary = received.summary;
  const distribution = summary?.distribution || {};

  return (
    <div className="stack stack--lg">
      <PageHeader title="Reviews & Ratings" subtitle="What partners have said about you, and the feedback you have shared." />
      <Card>
        <div className="rating-summary">
          <div className="rating-summary__big">
            <strong>{summary?.average ? Number(summary.average).toFixed(1) : '—'}</strong>
            <StarRating value={summary?.average || 0} />
            <span className="small muted">{summary?.total || 0} review{summary?.total === 1 ? '' : 's'}</span>
          </div>
          <div className="rating-summary__bars">
            {[5, 4, 3, 2, 1].map((star) => {
              const count = distribution[star] || 0;
              const pct = summary?.total ? Math.round((count / summary.total) * 100) : 0;
              return (
                <div className="bar-chart__row" key={star}>
                  <span className="bar-chart__label">{star} ★</span>
                  <div className="bar-chart__track">
                    <div className="bar-chart__bar" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="bar-chart__value">{count}</span>
                </div>
              );
            })}
          </div>
        </div>
      </Card>

      <Tabs
        active={tab}
        onChange={setTab}
        tabs={[
          { value: 'received', label: 'Received', count: received.items.length },
          { value: 'given', label: 'Given', count: given.items.length },
        ]}
      />

      {tab === 'received' &&
        (received.items.length ? (
          <div className="stack">
            {received.items.map((review) => (
              <Card key={review.id} padded>
                <ReviewCard review={review} onReport={() => setReporting(review)} />
              </Card>
            ))}
          </div>
        ) : (
          <EmptyState icon="star" title="No reviews yet." message="Complete an exchange and your partner will be able to rate the session." action={<Button to="/app/requests" variant="outline">View my exchanges</Button>} />
        ))}

      {tab === 'given' &&
        (given.items.length ? (
          <div className="stack">
            {given.items.map((review) => (
              <Card key={review.id} padded>
                <ReviewCard review={review} person="reviewed" onEdit={() => setEditing(review)} onDelete={() => setDeleting(review)} showStatus={review.status !== 'VISIBLE'} />
              </Card>
            ))}
          </div>
        ) : (
          <EmptyState icon="edit" title="You have not written any reviews." message="After a completed exchange you can rate your partner from the Requests page." action={<Button to="/app/requests?tab=completed" variant="outline">Completed exchanges</Button>} />
        ))}

      <ReviewDialog open={Boolean(editing)} onClose={() => setEditing(null)} review={editing} onSaved={refreshAll} />
      <ConfirmDialog open={Boolean(deleting)} onClose={() => setDeleting(null)} onConfirm={confirmDelete} loading={busy} title="Delete your review?" message="Your rating and comment will be removed permanently. You can write a new review afterwards." confirmLabel="Delete review" danger />
      <ReportDialog open={Boolean(reporting)} onClose={() => setReporting(null)} target={reporting ? { type: 'REVIEW', id: reporting.id, userId: reporting.reviewer.id, label: `Review by ${reporting.reviewer.fullName}` } : null} />
    </div>
  );
}
