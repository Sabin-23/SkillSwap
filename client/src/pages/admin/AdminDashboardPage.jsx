import { adminApi } from '../../api/index.js';
import { useAsync } from '../../hooks/useAsync.js';
import { labelize } from '../../utils/format.js';
import { Card, ErrorMessage, PageHeader, PageLoader, StatCard } from '../../components/ui/index.jsx';

function BarChart({ rows, labelKey, valueKey }) {
  const max = Math.max(1, ...rows.map((row) => Number(row[valueKey] || 0)));
  return (
    <div className="bar-chart">
      {rows.map((row) => (
        <div className="bar-chart__row" key={row[labelKey]}>
          <span className="bar-chart__label">{labelize(row[labelKey])}</span>
          <div className="bar-chart__track">
            <div className="bar-chart__bar" style={{ width: `${(Number(row[valueKey]) / max) * 100}%` }} />
          </div>
          <span className="bar-chart__value">{row[valueKey]}</span>
        </div>
      ))}
    </div>
  );
}

function ColumnChart({ rows }) {
  const max = Math.max(1, ...rows.map((row) => Number(row.count || 0)));
  return (
    <div className="column-chart">
      {rows.map((row) => (
        <div className="column-chart__col" key={row.month}>
          <div className="column-chart__bar" style={{ height: `${(Number(row.count) / max) * 100}%` }}>
            <span>{row.count}</span>
          </div>
          <span className="column-chart__label">{row.month.slice(5)}</span>
        </div>
      ))}
    </div>
  );
}

export function AdminDashboardPage() {
  const { data, loading, error, reload } = useAsync(() => adminApi.dashboard(), []);
  if (loading) return <PageLoader label="Loading platform stats…" />;
  if (error) return <ErrorMessage error={error} onRetry={reload} />;
  const { totals, charts } = data;

  return (
    <div className="stack stack--lg">
      <PageHeader title="Admin Dashboard" subtitle="A live snapshot of SkillSwap members, exchanges and points." />
      <div className="grid grid--4">
        <StatCard to="/admin/users" icon="users" label="Members" value={totals.totalUsers} hint={`${totals.activeUsers} active · ${totals.suspendedUsers} suspended`} />
        <StatCard to="/admin/reports" icon="flag" tone="warning" label="Open reports" value={totals.openReports} hint={totals.disputedPayments ? `${totals.disputedPayments} disputed payments` : 'Nothing in dispute'} />
        <StatCard to="/admin/points" icon="coins" tone="accent" label="Points in circulation" value={totals.pointsInCirculation} />
        <StatCard icon="star" tone="success" label="Average rating" value={totals.averageRating ?? '—'} hint={`${totals.totalReviews} reviews`} />
      </div>
      <div className="grid grid--4">
        <StatCard icon="swap" label="Requests" value={totals.totalRequests} hint={`${totals.pendingRequests} pending`} />
        <StatCard icon="check" tone="success" label="Completed exchanges" value={totals.completedExchanges} />
        <StatCard icon="calendar" tone="info" label="Upcoming sessions" value={totals.upcomingSessions} hint={`${totals.completedSessions} completed`} />
        <StatCard icon="book" label="Skills" value={totals.totalSkills} hint={`${totals.newUsers30d} new members in 30 days`} />
      </div>

      <div className="grid grid--2">
        <Card>
          <h2>Requests by status</h2>
          {charts.requestsByStatus.length ? <BarChart rows={charts.requestsByStatus} labelKey="status" valueKey="count" /> : <p className="muted">No requests yet.</p>}
        </Card>
        <Card>
          <h2>Sessions by status</h2>
          {charts.sessionsByStatus.length ? <BarChart rows={charts.sessionsByStatus} labelKey="status" valueKey="count" /> : <p className="muted">No sessions yet.</p>}
        </Card>
        <Card>
          <h2>New members (6 months)</h2>
          {charts.signupsByMonth.length ? <ColumnChart rows={charts.signupsByMonth} /> : <p className="muted">No sign-ups yet.</p>}
        </Card>
        <Card>
          <h2>Most taught skills</h2>
          {charts.topTaughtSkills.length ? <BarChart rows={charts.topTaughtSkills} labelKey="name" valueKey="count" /> : <p className="muted">No teaching skills added yet.</p>}
        </Card>
      </div>
    </div>
  );
}
