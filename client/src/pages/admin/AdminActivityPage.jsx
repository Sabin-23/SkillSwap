import { useState } from 'react';
import { Link } from 'react-router-dom';
import { adminApi } from '../../api/index.js';
import { useAsync } from '../../hooks/useAsync.js';
import { formatDate, formatDateTime, formatTime, labelize } from '../../utils/format.js';
import { Badge, EmptyState, ErrorMessage, PageHeader, PageLoader, Pagination, Select, Tabs } from '../../components/ui/index.jsx';

export function AdminActivityPage() {
  const [tab, setTab] = useState('audit');
  return (
    <div>
      <PageHeader title="Activity" subtitle="Audit log of administrator actions, plus every request and session on the platform." />
      <Tabs
        active={tab}
        onChange={setTab}
        tabs={[
          { value: 'audit', label: 'Audit log' },
          { value: 'requests', label: 'Requests' },
          { value: 'sessions', label: 'Sessions' },
        ]}
      />
      {tab === 'audit' && <AuditPanel />}
      {tab === 'requests' && <RequestsPanel />}
      {tab === 'sessions' && <SessionsPanel />}
    </div>
  );
}

function AuditPanel() {
  const [page, setPage] = useState(1);
  const { data, loading, error, reload } = useAsync(() => adminApi.auditLogs({ page }), [page]);
  if (loading && !data) return <PageLoader />;
  if (error) return <ErrorMessage error={error} onRetry={reload} />;
  if (!data.items.length) return <EmptyState icon="history" title="No admin actions recorded yet." />;
  return (
    <>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>When</th>
              <th>Admin</th>
              <th>Action</th>
              <th>Target</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((log) => (
              <tr key={log.id}>
                <td>{formatDateTime(log.createdAt)}</td>
                <td>{log.admin?.fullName || '—'}</td>
                <td>
                  <strong>{labelize(log.action)}</strong>
                  {log.details && <div className="small muted">{typeof log.details === 'string' ? log.details : JSON.stringify(log.details)}</div>}
                </td>
                <td>
                  {labelize(log.targetType)} {log.targetId ? `#${log.targetId}` : ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination pagination={data.pagination} onPageChange={setPage} />
    </>
  );
}

function RequestsPanel() {
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const { data, loading, error, reload } = useAsync(() => adminApi.requests({ status: status || undefined, page }), [status, page]);
  return (
    <>
      <div className="filter-bar">
        <Select label="Status" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} placeholder="All">
          {['PENDING', 'ACCEPTED', 'REJECTED', 'CANCELLED', 'COMPLETED'].map((value) => (
            <option key={value} value={value}>{labelize(value)}</option>
          ))}
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
                  <th>Skill</th>
                  <th>Learner</th>
                  <th>Teacher</th>
                  <th>Points</th>
                  <th>Status</th>
                  <th>When</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((request) => (
                  <tr key={request.id}>
                    <td>{request.skill.name}</td>
                    <td>
                      <Link to={`/admin/users/${request.sender.id}`}>{request.sender.fullName}</Link>
                    </td>
                    <td>
                      <Link to={`/admin/users/${request.receiver.id}`}>{request.receiver.fullName}</Link>
                    </td>
                    <td>{request.pointCost}</td>
                    <td>
                      <Badge status={request.status} />
                    </td>
                    <td>{formatDate(request.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination pagination={data.pagination} onPageChange={setPage} />
        </>
      ) : (
        <EmptyState icon="swap" title="No requests match." />
      )}
    </>
  );
}

function SessionsPanel() {
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const { data, loading, error, reload } = useAsync(() => adminApi.sessions({ status: status || undefined, page }), [status, page]);
  return (
    <>
      <div className="filter-bar">
        <Select label="Status" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} placeholder="All">
          {['SCHEDULED', 'COMPLETED', 'CANCELLED'].map((value) => (
            <option key={value} value={value}>{labelize(value)}</option>
          ))}
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
                  <th>Skill</th>
                  <th>When</th>
                  <th>Teacher</th>
                  <th>Learner</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((session) => (
                  <tr key={session.id}>
                    <td>{session.skill.name}</td>
                    <td>
                      {formatDate(session.scheduledDate)} {formatTime(session.startTime)}–{formatTime(session.endTime)}
                    </td>
                    <td>
                      <Link to={`/admin/users/${session.host.id}`}>{session.host.fullName}</Link>
                    </td>
                    <td>
                      <Link to={`/admin/users/${session.participant.id}`}>{session.participant.fullName}</Link>
                    </td>
                    <td>
                      <Badge status={session.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination pagination={data.pagination} onPageChange={setPage} />
        </>
      ) : (
        <EmptyState icon="calendar" title="No sessions match." />
      )}
    </>
  );
}
