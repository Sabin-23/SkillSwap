import { useState } from 'react';
import { Link } from 'react-router-dom';
import { adminApi } from '../../api/index.js';
import { useToast } from '../../context/ToastContext.jsx';
import { useAsync } from '../../hooks/useAsync.js';
import { formatDateTime, labelize } from '../../utils/format.js';
import { Badge, Button, Card, EmptyState, ErrorMessage, Icon, Input, Modal, PageHeader, PageLoader, Pagination, Select, StatCard, Textarea } from '../../components/ui/index.jsx';

export function AdminPointsPage() {
  const toast = useToast();
  const overview = useAsync(() => adminApi.pointsOverview(), []);
  const [txType, setTxType] = useState('');
  const [txQ, setTxQ] = useState('');
  const [txPage, setTxPage] = useState(1);
  const txs = useAsync(() => adminApi.pointsTransactions({ type: txType || undefined, q: txQ || undefined, page: txPage }), [txType, txQ, txPage]);
  const [adjust, setAdjust] = useState({ open: false, userId: '', amount: '', reason: '' });
  const [rateForm, setRateForm] = useState({ durationMinutes: '45', pointCost: '8' });
  const [saving, setSaving] = useState(false);
  const [dispute, setDispute] = useState(null);
  const [disputeForm, setDisputeForm] = useState({ action: 'RELEASE', teacherPoints: '', reason: '' });

  async function reloadAll() {
    overview.reload({ silent: true });
    txs.reload({ silent: true });
  }

  async function submitAdjust(event) {
    event.preventDefault();
    setSaving(true);
    try {
      await adminApi.adjustPoints({ userId: Number(adjust.userId), amount: Number(adjust.amount), reason: adjust.reason });
      toast.success('Balance adjusted.');
      setAdjust({ open: false, userId: '', amount: '', reason: '' });
      reloadAll();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function saveRate(rate, patch) {
    try {
      await adminApi.updateRate(rate.id, patch);
      toast.success('Rate updated.');
      overview.reload({ silent: true });
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function addRate(event) {
    event.preventDefault();
    try {
      await adminApi.createRate({ durationMinutes: Number(rateForm.durationMinutes), pointCost: Number(rateForm.pointCost) });
      toast.success('Rate added.');
      setRateForm({ durationMinutes: '45', pointCost: '8' });
      overview.reload({ silent: true });
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function saveBonus(bonus, patch) {
    try {
      await adminApi.updateBonus(bonus.id, patch);
      toast.success('Bonus updated.');
      overview.reload({ silent: true });
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function resolveDispute(event) {
    event.preventDefault();
    setSaving(true);
    try {
      await adminApi.resolveDispute(dispute.exchangeRequestId, {
        action: disputeForm.action,
        teacherPoints: disputeForm.action === 'SPLIT' ? Number(disputeForm.teacherPoints) : undefined,
        reason: disputeForm.reason,
      });
      toast.success('Dispute resolved.');
      setDispute(null);
      reloadAll();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (overview.loading && !overview.data) return <PageLoader label="Loading points…" />;
  if (overview.error) return <ErrorMessage error={overview.error} onRetry={overview.reload} />;
  const { overview: stats, rates, bonuses, disputes } = overview.data;

  return (
    <div className="stack stack--lg">
      <PageHeader
        title="Points Management"
        subtitle="Wallets, rates, bonuses and disputed session payments. Points have no cash value."
        actions={
          <Button onClick={() => setAdjust({ open: true, userId: '', amount: '', reason: '' })} icon={<Icon name="plus" size={16} />}>
            Adjust a balance
          </Button>
        }
      />
      <div className="grid grid--4">
        <StatCard icon="coins" tone="accent" label="Available in circulation" value={stats.availableInCirculation} />
        <StatCard icon="lock" tone="warning" label="Reserved" value={stats.reservedInCirculation} />
        <StatCard icon="gift" tone="success" label="Bonuses granted" value={stats.totalBonuses} />
        <StatCard icon="flag" tone="danger" label="Disputed payments" value={stats.disputedPayments} />
      </div>

      {disputes.length > 0 && (
        <Card>
          <h2>Open disputes</h2>
          {disputes.map((item) => (
            <div className="tx-row" key={item.id}>
              <span className="tx-row__icon tx-row__icon--hold">
                <Icon name="flag" size={18} />
              </span>
              <div className="tx-row__body">
                <strong>
                  {item.skillName} · {item.points} points
                </strong>
                <span>
                  Learner {item.learner.fullName} → teacher {item.teacher.fullName}
                  {item.reportId ? ` · report #${item.reportId}` : ''}
                </span>
              </div>
              <div className="row">
                {item.reportId && (
                  <Button size="sm" variant="ghost" to={`/admin/reports?id=${item.reportId}`}>
                    Report
                  </Button>
                )}
                <Button size="sm" onClick={() => { setDispute(item); setDisputeForm({ action: 'RELEASE', teacherPoints: String(Math.floor(item.points / 2)), reason: '' }); }}>
                  Resolve
                </Button>
              </div>
            </div>
          ))}
        </Card>
      )}

      <div className="grid grid--2">
        <Card>
          <h2>Session rates</h2>
          <div className="table-wrap mt-3">
            <table className="table">
              <thead>
                <tr>
                  <th>Minutes</th>
                  <th>Points</th>
                  <th>Active</th>
                </tr>
              </thead>
              <tbody>
                {rates.map((rate) => (
                  <tr key={rate.id}>
                    <td>{rate.durationMinutes}</td>
                    <td>
                      <Input type="number" min="0" defaultValue={rate.pointCost} aria-label={`Cost for ${rate.durationMinutes} minutes`} onBlur={(e) => {
                        const value = Number(e.target.value);
                        if (value !== rate.pointCost) saveRate(rate, { pointCost: value });
                      }} />
                    </td>
                    <td>
                      <Button size="sm" variant={rate.active ? 'success' : 'outline'} onClick={() => saveRate(rate, { active: !rate.active })}>
                        {rate.active ? 'Active' : 'Off'}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <form className="row mt-3" onSubmit={addRate} style={{ alignItems: 'flex-end' }}>
            <Input label="Minutes" type="number" min="15" value={rateForm.durationMinutes} onChange={(e) => setRateForm({ ...rateForm, durationMinutes: e.target.value })} />
            <Input label="Points" type="number" min="0" value={rateForm.pointCost} onChange={(e) => setRateForm({ ...rateForm, pointCost: e.target.value })} />
            <Button type="submit" size="sm">Add rate</Button>
          </form>
        </Card>

        <Card>
          <h2>Bonuses</h2>
          {bonuses.map((bonus) => (
            <div className="tx-row" key={bonus.id}>
              <span className="tx-row__icon tx-row__icon--in">
                <Icon name="gift" size={18} />
              </span>
              <div className="tx-row__body">
                <strong>{bonus.name}</strong>
                <span>{bonus.description}</span>
              </div>
              <div className="row" style={{ alignItems: 'center' }}>
                <Input type="number" min="0" defaultValue={bonus.points} aria-label={`${bonus.name} points`} style={{ width: 80 }} onBlur={(e) => {
                  const value = Number(e.target.value);
                  if (value !== bonus.points) saveBonus(bonus, { points: value });
                }} />
                <Button size="sm" variant={bonus.active ? 'success' : 'outline'} onClick={() => saveBonus(bonus, { active: !bonus.active })}>
                  {bonus.active ? 'On' : 'Off'}
                </Button>
              </div>
            </div>
          ))}
        </Card>
      </div>

      <Card>
        <div className="card__header">
          <h2>Ledger</h2>
          <div className="row">
            <Input type="search" placeholder="Member or description" value={txQ} onChange={(e) => { setTxQ(e.target.value); setTxPage(1); }} aria-label="Search ledger" />
            <Select value={txType} onChange={(e) => { setTxType(e.target.value); setTxPage(1); }} placeholder="All types" aria-label="Transaction type">
              {['RESERVATION', 'REFUND', 'SESSION_PAYMENT', 'SESSION_REWARD', 'BONUS', 'ADMIN_ADJUSTMENT', 'PENALTY'].map((type) => (
                <option key={type} value={type}>{labelize(type)}</option>
              ))}
            </Select>
          </div>
        </div>
        {txs.loading && !txs.data ? (
          <PageLoader />
        ) : txs.error ? (
          <ErrorMessage error={txs.error} onRetry={txs.reload} />
        ) : txs.data.items.length ? (
          <>
            {txs.data.items.map((tx) => (
              <div className="tx-row" key={tx.id}>
                <span className={`tx-row__icon ${tx.amount >= 0 ? 'tx-row__icon--in' : 'tx-row__icon--out'}`}>
                  <Icon name="coins" size={18} />
                </span>
                <div className="tx-row__body">
                  <strong>
                    <Link to={`/admin/users/${tx.user.id}`}>{tx.user.fullName}</Link> · {tx.description}
                  </strong>
                  <span>
                    {labelize(tx.type)} · {formatDateTime(tx.createdAt)}
                  </span>
                </div>
                <div className="tx-row__amount">
                  <strong className={tx.amount >= 0 ? 'amount--positive' : 'amount--negative'}>
                    {tx.amount > 0 ? '+' : ''}
                    {tx.amount}
                  </strong>
                  <span>bal {tx.balanceAfter}</span>
                </div>
              </div>
            ))}
            <Pagination pagination={txs.data.pagination} onPageChange={setTxPage} />
          </>
        ) : (
          <EmptyState compact icon="history" title="No transactions match." />
        )}
      </Card>

      <Modal open={adjust.open} onClose={() => setAdjust({ ...adjust, open: false })} title="Adjust a member’s points" description="Requires a reason. The change is written to the ledger as ADMIN_ADJUSTMENT." footer={<><Button variant="ghost" onClick={() => setAdjust({ ...adjust, open: false })}>Cancel</Button><Button type="submit" form="adjust-form" loading={saving}>Apply</Button></>}>
        <form id="adjust-form" className="stack" onSubmit={submitAdjust}>
          <Input label="User ID" type="number" min="1" value={adjust.userId} onChange={(e) => setAdjust({ ...adjust, userId: e.target.value })} required hint="Find the numeric ID on the member’s admin profile URL." />
          <Input label="Amount" type="number" value={adjust.amount} onChange={(e) => setAdjust({ ...adjust, amount: e.target.value })} required hint="Positive credits the wallet; negative debits it. Cannot go below zero." />
          <Textarea label="Reason" value={adjust.reason} onChange={(e) => setAdjust({ ...adjust, reason: e.target.value })} required minLength={3} maxLength={500} />
        </form>
      </Modal>

      <Modal open={Boolean(dispute)} onClose={() => setDispute(null)} title="Resolve disputed payment" description={dispute ? `${dispute.skillName} · ${dispute.points} points` : ''} footer={<><Button variant="ghost" onClick={() => setDispute(null)}>Cancel</Button><Button type="submit" form="dispute-form" loading={saving}>Resolve</Button></>}>
        <form id="dispute-form" className="stack" onSubmit={resolveDispute}>
          <Select label="Action" value={disputeForm.action} onChange={(e) => setDisputeForm({ ...disputeForm, action: e.target.value })}>
            <option value="RELEASE">Release to teacher</option>
            <option value="REFUND">Refund learner</option>
            <option value="SPLIT">Split</option>
          </Select>
          {disputeForm.action === 'SPLIT' && <Input label="Points for the teacher" type="number" min="0" value={disputeForm.teacherPoints} onChange={(e) => setDisputeForm({ ...disputeForm, teacherPoints: e.target.value })} />}
          <Textarea label="Reason" value={disputeForm.reason} onChange={(e) => setDisputeForm({ ...disputeForm, reason: e.target.value })} required minLength={3} />
        </form>
      </Modal>
    </div>
  );
}
