import { useState } from 'react';
import { pointsApi } from '../../api/index.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useAsync } from '../../hooks/useAsync.js';
import { formatDateTime, labelize } from '../../utils/format.js';
import { Card, EmptyState, ErrorMessage, Icon, PageHeader, PageLoader, Pagination, Select, StatCard } from '../../components/ui/index.jsx';

const TX_ICONS = {
  RESERVATION: { tone: 'hold', icon: 'lock' },
  REFUND: { tone: 'in', icon: 'refresh' },
  SESSION_PAYMENT: { tone: 'out', icon: 'coins' },
  SESSION_REWARD: { tone: 'in', icon: 'gift' },
  BONUS: { tone: 'in', icon: 'gift' },
  ADMIN_ADJUSTMENT: { tone: 'in', icon: 'shield' },
  PENALTY: { tone: 'out', icon: 'ban' },
};

export function PointsPage() {
  const { user } = useAuth();
  const [type, setType] = useState('');
  const [page, setPage] = useState(1);
  const wallet = useAsync(() => pointsApi.wallet(), []);
  const history = useAsync(() => pointsApi.transactions({ type: type || undefined, page }), [type, page]);
  const rates = useAsync(() => pointsApi.rates(), []);

  const summary = wallet.data?.wallet || user.wallet;
  const reservations = wallet.data?.reservations || [];

  return (
    <div className="stack stack--lg">
      <PageHeader title="My Points" subtitle="SkillSwap Points keep exchanges fair. They have no cash value and cannot be bought or withdrawn." />

      <div className="grid grid--4">
        <StatCard icon="coins" tone="accent" label="Available" value={summary.availableBalance} hint="Ready to spend" />
        <StatCard icon="lock" tone="warning" label="Reserved" value={summary.reservedBalance} hint="Held for open requests" />
        <StatCard icon="gift" tone="success" label="Earned" value={summary.totalEarned} hint="From teaching and bonuses" />
        <StatCard icon="swap" tone="primary" label="Spent" value={summary.totalSpent} hint="On completed sessions" />
      </div>

      {wallet.error && <ErrorMessage error={wallet.error} onRetry={wallet.reload} />}

      {reservations.length > 0 && (
        <Card>
          <h2>Reserved for upcoming exchanges</h2>
          <p className="muted small mb-3">These points are held until the session is completed, cancelled or refunded.</p>
          {reservations.map((item) => (
            <div className="tx-row" key={item.id}>
              <span className="tx-row__icon tx-row__icon--hold">
                <Icon name="lock" size={18} />
              </span>
              <div className="tx-row__body">
                <strong>
                  {item.skillName} with {item.teacherName}
                </strong>
                <span>
                  {labelize(item.status)} · {labelize(item.requestStatus)} · {formatDateTime(item.createdAt)}
                </span>
              </div>
              <div className="tx-row__amount">
                <strong className="amount--neutral">{item.points}</strong>
                <span>on hold</span>
              </div>
            </div>
          ))}
        </Card>
      )}

      <Card>
        <div className="card__header">
          <h2>Transaction history</h2>
          <Select label="Type" value={type} onChange={(e) => { setType(e.target.value); setPage(1); }} placeholder="All types">
            <option value="RESERVATION">Reservations</option>
            <option value="REFUND">Refunds</option>
            <option value="SESSION_PAYMENT">Session payments</option>
            <option value="SESSION_REWARD">Session rewards</option>
            <option value="BONUS">Bonuses</option>
            <option value="ADMIN_ADJUSTMENT">Admin adjustments</option>
            <option value="PENALTY">Penalties</option>
          </Select>
        </div>
        {history.loading && !history.data ? (
          <PageLoader label="Loading history…" />
        ) : history.error ? (
          <ErrorMessage error={history.error} onRetry={history.reload} />
        ) : history.data.items.length ? (
          <>
            {history.data.items.map((tx) => {
              const meta = TX_ICONS[tx.type] || TX_ICONS.ADMIN_ADJUSTMENT;
              const tone = tx.amount > 0 ? 'in' : tx.amount < 0 ? 'out' : meta.tone;
              return (
                <div className="tx-row" key={tx.id}>
                  <span className={`tx-row__icon tx-row__icon--${tone}`}>
                    <Icon name={meta.icon} size={18} />
                  </span>
                  <div className="tx-row__body">
                    <strong>{tx.description}</strong>
                    <span>
                      {labelize(tx.type)}
                      {tx.skillName ? ` · ${tx.skillName}` : ''} · {formatDateTime(tx.createdAt)}
                    </span>
                  </div>
                  <div className="tx-row__amount">
                    <strong className={tx.amount > 0 ? 'amount--positive' : tx.amount < 0 ? 'amount--negative' : 'amount--neutral'}>
                      {tx.amount > 0 ? '+' : ''}
                      {tx.amount}
                    </strong>
                    <span>balance {tx.balanceAfter}</span>
                  </div>
                </div>
              );
            })}
            <Pagination pagination={history.data.pagination} onPageChange={setPage} />
          </>
        ) : (
          <EmptyState compact icon="history" title="No transactions yet." message="Earn a welcome bonus when you join, then spend points on sessions you want to learn." />
        )}
      </Card>

      <Card>
        <h2>Session rates</h2>
        <p className="muted small mb-3">What it costs (and what you earn) for a completed session. The API always decides the price — never the browser.</p>
        {rates.data?.items?.length ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Duration</th>
                  <th>Points</th>
                </tr>
              </thead>
              <tbody>
                {rates.data.items.map((rate) => (
                  <tr key={rate.id}>
                    <td>{rate.durationMinutes} minutes</td>
                    <td>
                      <strong>{rate.pointCost}</strong>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted">Rates are loading…</p>
        )}
      </Card>
    </div>
  );
}
