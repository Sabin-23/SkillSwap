import { useState } from 'react';
import { Link } from 'react-router-dom';
import { adminApi } from '../../api/index.js';
import { useToast } from '../../context/ToastContext.jsx';
import { useAsync } from '../../hooks/useAsync.js';
import { formatDate } from '../../utils/format.js';
import { Badge, Button, ConfirmDialog, EmptyState, ErrorMessage, Icon, Input, PageHeader, PageLoader, Pagination, Select, StarRating } from '../../components/ui/index.jsx';

export function AdminReviewsPage() {
  const toast = useToast();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const { data, loading, error, reload } = useAsync(() => adminApi.reviews({ q, status, page }), [q, status, page]);
  const [confirm, setConfirm] = useState(null);
  const [busy, setBusy] = useState(false);

  async function apply() {
    setBusy(true);
    try {
      if (confirm.action === 'remove') {
        await adminApi.removeReview(confirm.review.id);
        toast.success('Review removed from public profiles.');
      } else {
        await adminApi.restoreReview(confirm.review.id);
        toast.success('Review restored.');
      }
      reload({ silent: true });
      setConfirm(null);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader title="Manage Reviews" subtitle="Remove abusive ratings or restore reviews that were taken down by mistake." />
      <div className="filter-bar">
        <Input className="filter-bar__search" label="Search" type="search" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Name or comment" />
        <Select label="Status" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} placeholder="Any status">
          <option value="VISIBLE">Visible</option>
          <option value="REMOVED">Removed</option>
        </Select>
      </div>
      {loading && !data ? (
        <PageLoader />
      ) : error ? (
        <ErrorMessage error={error} onRetry={reload} />
      ) : data.items.length ? (
        <>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Review</th>
                  <th>About</th>
                  <th>Rating</th>
                  <th>Status</th>
                  <th>Date</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.items.map((review) => (
                  <tr key={review.id}>
                    <td>
                      <strong>
                        <Link to={`/admin/users/${review.reviewer.id}`}>{review.reviewer.fullName}</Link>
                      </strong>
                      <div className="small muted">{review.comment || 'No comment.'}</div>
                    </td>
                    <td>
                      <Link to={`/admin/users/${review.reviewedUser.id}`}>{review.reviewedUser.fullName}</Link>
                      <div className="small muted">{review.skillName}</div>
                    </td>
                    <td>
                      <StarRating value={review.rating} size={14} />
                    </td>
                    <td>
                      <Badge status={review.status} />
                    </td>
                    <td>{formatDate(review.createdAt)}</td>
                    <td>
                      <div className="table__actions">
                        {review.status === 'VISIBLE' ? (
                          <Button size="sm" variant="ghost" onClick={() => setConfirm({ action: 'remove', review })} icon={<Icon name="ban" size={14} />}>
                            Remove
                          </Button>
                        ) : (
                          <Button size="sm" variant="ghost" onClick={() => setConfirm({ action: 'restore', review })} icon={<Icon name="refresh" size={14} />}>
                            Restore
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination pagination={data.pagination} onPageChange={setPage} />
        </>
      ) : (
        <EmptyState icon="star" title="No reviews match." />
      )}
      <ConfirmDialog
        open={Boolean(confirm)}
        onClose={() => setConfirm(null)}
        onConfirm={apply}
        loading={busy}
        danger={confirm?.action === 'remove'}
        title={confirm?.action === 'remove' ? 'Remove this review?' : 'Restore this review?'}
        message={confirm?.action === 'remove' ? 'It will no longer appear on the member’s public profile or in their rating average.' : 'The review will be visible again and will count towards the rating.'}
        confirmLabel={confirm?.action === 'remove' ? 'Remove' : 'Restore'}
      />
    </div>
  );
}
