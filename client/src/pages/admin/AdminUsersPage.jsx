import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { adminApi } from '../../api/index.js';
import { useToast } from '../../context/ToastContext.jsx';
import { useAsync, useDebouncedValue } from '../../hooks/useAsync.js';
import { formatDate } from '../../utils/format.js';
import { UserProfilePage } from '../app/UserProfilePage.jsx';
import { Avatar, Badge, Button, Card, ConfirmDialog, EmptyState, ErrorMessage, Icon, Input, PageHeader, PageLoader, Pagination, Select, Textarea } from '../../components/ui/index.jsx';

export function AdminUsersPage() {
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get('q') || '');
  const debounced = useDebouncedValue(q);
  const filters = { q: debounced, status: params.get('status') || '', role: params.get('role') || '', page: params.get('page') || '1' };
  const { data, loading, error, reload } = useAsync(() => adminApi.users(filters), [JSON.stringify(filters)]);
  const [confirm, setConfirm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState('');

  function update(changes) {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(changes)) {
      if (!value) next.delete(key);
      else next.set(key, String(value));
    }
    if (!('page' in changes)) next.delete('page');
    setParams(next);
  }

  async function applyStatus(user, status) {
    setBusy(true);
    try {
      await adminApi.setUserStatus(user.id, status, reason);
      toast.success(status === 'SUSPENDED' ? `${user.fullName} has been suspended.` : `${user.fullName} is active again.`);
      reload({ silent: true });
      setConfirm(null);
      setReason('');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(user) {
    setBusy(true);
    try {
      await adminApi.deleteUser(user.id);
      toast.success(`${user.fullName}'s account was deleted.`);
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
      <PageHeader title="Manage Users" subtitle="Search, suspend or remove member accounts." />
      <div className="filter-bar">
        <Input className="filter-bar__search" label="Search" type="search" placeholder="Name or email" value={q} onChange={(e) => { setQ(e.target.value); update({ q: e.target.value }); }} />
        <Select label="Status" value={filters.status} onChange={(e) => update({ status: e.target.value })} placeholder="Any status">
          <option value="ACTIVE">Active</option>
          <option value="SUSPENDED">Suspended</option>
        </Select>
        <Select label="Role" value={filters.role} onChange={(e) => update({ role: e.target.value })} placeholder="Any role">
          <option value="USER">Member</option>
          <option value="ADMIN">Admin</option>
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
                  <th>Member</th>
                  <th>Status</th>
                  <th>Rating</th>
                  <th>Exchanges</th>
                  <th>Points</th>
                  <th>Joined</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.items.map((member) => (
                  <tr key={member.id}>
                    <td>
                      <div className="cell-user">
                        <Avatar name={member.fullName} src={member.avatarUrl} size={36} />
                        <div>
                          <strong>
                            <Link to={`/admin/users/${member.id}`}>{member.fullName}</Link>
                          </strong>
                          <span>{member.email}</span>
                        </div>
                      </div>
                    </td>
                    <td>
                      <Badge status={member.status} /> {member.role === 'ADMIN' && <Badge status="ADMIN" size="sm" />}
                    </td>
                    <td>{member.rating ?? '—'}</td>
                    <td>{member.completedExchanges}</td>
                    <td>
                      {member.points.available}
                      {member.points.reserved ? ` (+${member.points.reserved} held)` : ''}
                    </td>
                    <td>{formatDate(member.createdAt)}</td>
                    <td>
                      {member.role !== 'ADMIN' && (
                        <div className="table__actions">
                          {member.status === 'ACTIVE' ? (
                            <Button size="sm" variant="outline" onClick={() => setConfirm({ kind: 'status', status: 'SUSPENDED', user: member })}>
                              Suspend
                            </Button>
                          ) : (
                            <Button size="sm" variant="success" onClick={() => setConfirm({ kind: 'status', status: 'ACTIVE', user: member })}>
                              Activate
                            </Button>
                          )}
                          <Button size="sm" variant="ghost" onClick={() => setConfirm({ kind: 'delete', user: member })} icon={<Icon name="trash" size={14} />} aria-label="Delete user" />
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination pagination={data.pagination} onPageChange={(page) => update({ page })} />
        </>
      ) : (
        <EmptyState icon="users" title="No members match." message="Try a different search or filter." />
      )}

      <ConfirmDialog
        open={Boolean(confirm)}
        onClose={() => { setConfirm(null); setReason(''); }}
        loading={busy}
        danger={confirm?.kind === 'delete' || confirm?.status === 'SUSPENDED'}
        title={confirm?.kind === 'delete' ? `Delete ${confirm.user.fullName}?` : confirm?.status === 'SUSPENDED' ? `Suspend ${confirm?.user.fullName}?` : `Reactivate ${confirm?.user.fullName}?`}
        confirmLabel={confirm?.kind === 'delete' ? 'Delete account' : confirm?.status === 'SUSPENDED' ? 'Suspend' : 'Activate'}
        onConfirm={() => (confirm?.kind === 'delete' ? remove(confirm.user) : applyStatus(confirm.user, confirm.status))}
      >
        {confirm?.kind === 'delete' ? (
          <p>Their profile, messages and reviews will be removed. Accounts with reserved points cannot be deleted.</p>
        ) : (
          <>
            <p>{confirm?.status === 'SUSPENDED' ? 'They will be signed out and cannot log in until you reactivate the account.' : 'They will be able to sign in again immediately.'}</p>
            <Textarea className="mt-3" label="Reason (optional)" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
          </>
        )}
      </ConfirmDialog>
    </div>
  );
}

export function AdminUserDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  return (
    <div>
      <Button variant="ghost" size="sm" onClick={() => navigate('/admin/users')} icon={<Icon name="chevronLeft" size={16} />}>
        All members
      </Button>
      <UserProfilePage key={id} />
    </div>
  );
}

export function AdminUserPage() {
  return (
    <Card>
      <p className="muted">Open a member from the table to view their public profile.</p>
    </Card>
  );
}
