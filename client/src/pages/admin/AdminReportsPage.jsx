import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { adminApi } from '../../api/index.js';
import { useToast } from '../../context/ToastContext.jsx';
import { useAsync } from '../../hooks/useAsync.js';
import { formatDate, formatDateTime, labelize } from '../../utils/format.js';
import { Avatar, Badge, Button, Card, Checkbox, EmptyState, ErrorMessage, Icon, Input, PageHeader, PageLoader, Pagination, Select, Textarea } from '../../components/ui/index.jsx';

export function AdminReportsPage() {
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const selectedId = params.get('id');
  const filters = { status: params.get('status') || '', targetType: params.get('targetType') || '', page: params.get('page') || '1' };
  const list = useAsync(() => adminApi.reports(filters), [JSON.stringify(filters)]);
  const detail = useAsync(() => (selectedId ? adminApi.report(selectedId) : Promise.resolve(null)), [selectedId]);

  function update(changes) {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(changes)) {
      if (!value) next.delete(key);
      else next.set(key, String(value));
    }
    if (!('page' in changes) && !('id' in changes)) next.delete('page');
    setParams(next);
  }

  return (
    <div>
      <PageHeader title="Manage Reports" subtitle="Review member reports, take action, and close the loop." />
      {selectedId ? (
        <ReportDetail
          data={detail.data}
          loading={detail.loading}
          error={detail.error}
          onBack={() => update({ id: '' })}
          onReload={() => {
            detail.reload({ silent: true });
            list.reload({ silent: true });
          }}
        />
      ) : (
        <>
          <div className="filter-bar">
            <Select label="Status" value={filters.status} onChange={(e) => update({ status: e.target.value })} placeholder="All statuses">
              <option value="OPEN">Open</option>
              <option value="UNDER_REVIEW">Under review</option>
              <option value="RESOLVED">Resolved</option>
              <option value="DISMISSED">Dismissed</option>
            </Select>
            <Select label="Type" value={filters.targetType} onChange={(e) => update({ targetType: e.target.value })} placeholder="All types">
              <option value="USER">User</option>
              <option value="MESSAGE">Message</option>
              <option value="REVIEW">Review</option>
              <option value="SESSION">Session</option>
              <option value="CONTENT">Content</option>
            </Select>
          </div>
          {list.loading && !list.data ? (
            <PageLoader />
          ) : list.error ? (
            <ErrorMessage error={list.error} onRetry={list.reload} />
          ) : list.data.items.length ? (
            <>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Report</th>
                      <th>Against</th>
                      <th>Reason</th>
                      <th>Status</th>
                      <th>Submitted</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {list.data.items.map((report) => (
                      <tr key={report.id}>
                        <td>
                          <strong>{labelize(report.targetType)}</strong>
                          <div className="small muted">by {report.reporter.fullName}</div>
                        </td>
                        <td>{report.reportedUser ? report.reportedUser.fullName : '—'}</td>
                        <td>{labelize(report.reason)}</td>
                        <td>
                          <Badge status={report.status} />
                        </td>
                        <td>{formatDate(report.createdAt)}</td>
                        <td>
                          <Button size="sm" variant="outline" onClick={() => update({ id: report.id })}>
                            Review
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination pagination={list.data.pagination} onPageChange={(page) => update({ page })} />
            </>
          ) : (
            <EmptyState icon="flag" title="No reports to review." message="Open reports from members will appear here." />
          )}
        </>
      )}
    </div>
  );
}

function ReportDetail({ data, loading, error, onBack, onReload }) {
  const toast = useToast();
  const [form, setForm] = useState({ status: 'UNDER_REVIEW', adminResponse: '', suspendUser: false, removeContent: false, paymentAction: '', teacherPoints: '' });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);

  useEffect(() => {
    if (!data?.report) return;
    setForm({
      status: data.report.status === 'OPEN' ? 'UNDER_REVIEW' : data.report.status,
      adminResponse: data.report.adminResponse || '',
      suspendUser: false,
      removeContent: false,
      paymentAction: '',
      teacherPoints: '',
    });
  }, [data]);

  if (loading && !data) return <PageLoader />;
  if (error) return <ErrorMessage error={error} />;
  const report = data.report;
  const evidence = report.evidence;
  const sessionDispute = report.targetType === 'SESSION' && evidence?.paymentStatus === 'DISPUTED';

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    setSaveError(null);
    try {
      await adminApi.updateReport(report.id, {
        status: form.status,
        adminResponse: form.adminResponse || undefined,
        suspendUser: form.suspendUser || undefined,
        removeContent: form.removeContent || undefined,
        paymentAction: form.paymentAction || undefined,
        teacherPoints: form.paymentAction === 'SPLIT' && form.teacherPoints !== '' ? Number(form.teacherPoints) : undefined,
      });
      toast.success('Report updated.');
      onReload();
    } catch (err) {
      setSaveError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="stack">
      <Button variant="ghost" size="sm" onClick={onBack} icon={<Icon name="chevronLeft" size={16} />}>
        All reports
      </Button>
      <div className="report-detail">
        <Card>
          <div className="row row--between">
            <h2>
              {labelize(report.targetType)} · {labelize(report.reason)}
            </h2>
            <Badge status={report.status} />
          </div>
          <dl className="kv mt-3">
            <dt>Reporter</dt>
            <dd>
              <Link to={`/admin/users/${report.reporter.id}`}>{report.reporter.fullName}</Link>
            </dd>
            <dt>Reported</dt>
            <dd>
              {report.reportedUser ? (
                <span className="row" style={{ gap: 8 }}>
                  <Avatar name={report.reportedUser.fullName} src={report.reportedUser.avatarUrl} size={24} />
                  <Link to={`/admin/users/${report.reportedUser.id}`}>{report.reportedUser.fullName}</Link>
                  {report.reportedUser.status === 'SUSPENDED' && <Badge status="SUSPENDED" size="sm" />}
                </span>
              ) : (
                '—'
              )}
            </dd>
            <dt>Submitted</dt>
            <dd>{formatDateTime(report.createdAt)}</dd>
            {report.resolvedBy && (
              <>
                <dt>Resolved by</dt>
                <dd>
                  {report.resolvedBy.fullName} · {formatDateTime(report.resolvedAt)}
                </dd>
              </>
            )}
          </dl>
          <h3 className="mt-4">Description</h3>
          <p>{report.description}</p>
          {evidence && (
            <div className="evidence mt-4">
              <strong>Evidence</strong>
              {evidence.type === 'MESSAGE' && <p>{evidence.deleted ? 'The message was deleted.' : evidence.content}</p>}
              {evidence.type === 'REVIEW' && (
                <p>
                  {evidence.rating}/5 · {evidence.comment || 'No comment.'} ({labelize(evidence.status)})
                </p>
              )}
              {evidence.type === 'SESSION' && (
                <p>
                  {evidence.skillName} on {evidence.scheduledDate} {evidence.startTime}–{evidence.endTime} · {labelize(evidence.status)} · payment {labelize(evidence.paymentStatus)} ({evidence.points} points)
                </p>
              )}
            </div>
          )}
        </Card>

        <Card>
          <h2>Moderator actions</h2>
          {saveError && (
            <div className="alert alert--danger mb-4" role="alert">
              {saveError}
            </div>
          )}
          <form className="stack" onSubmit={submit}>
            <Select label="Status" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              <option value="OPEN">Open</option>
              <option value="UNDER_REVIEW">Under review</option>
              <option value="RESOLVED">Resolved</option>
              <option value="DISMISSED">Dismissed</option>
            </Select>
            <Textarea label="Response to the reporter" value={form.adminResponse} onChange={(e) => setForm({ ...form, adminResponse: e.target.value })} maxLength={1000} hint="Shared with the person who filed the report." />
            {report.reportedUser && <Checkbox label={`Suspend ${report.reportedUser.fullName}`} checked={form.suspendUser} onChange={(e) => setForm({ ...form, suspendUser: e.target.checked })} />}
            {['MESSAGE', 'REVIEW'].includes(report.targetType) && <Checkbox label="Remove the reported content" checked={form.removeContent} onChange={(e) => setForm({ ...form, removeContent: e.target.checked })} />}
            {sessionDispute && (
              <>
                <div className="alert alert--warning">
                  <Icon name="info" size={16} /> This session has frozen points. Choose how to settle them.
                </div>
                <Select label="Payment action" value={form.paymentAction} onChange={(e) => setForm({ ...form, paymentAction: e.target.value })} placeholder="Leave points frozen">
                  <option value="RELEASE">Release to teacher</option>
                  <option value="REFUND">Refund learner</option>
                  <option value="SPLIT">Split</option>
                </Select>
                {form.paymentAction === 'SPLIT' && (
                  <Input label="Points for the teacher" type="number" min="0" value={form.teacherPoints} onChange={(e) => setForm({ ...form, teacherPoints: e.target.value })} hint={`Of ${evidence.points} reserved points.`} />
                )}
              </>
            )}
            <Button type="submit" loading={saving}>
              Save decision
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
