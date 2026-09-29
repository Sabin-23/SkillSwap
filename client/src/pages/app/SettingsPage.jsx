import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { authApi, reportsApi, usersApi } from '../../api/index.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { useAsync } from '../../hooks/useAsync.js';
import { formatDate, labelize } from '../../utils/format.js';
import { Badge, Button, Card, ConfirmDialog, EmptyState, ErrorMessage, Icon, Input, PageHeader, Toggle } from '../../components/ui/index.jsx';

const SECTIONS = [
  { id: 'account', label: 'Account' },
  { id: 'privacy', label: 'Privacy' },
  { id: 'notifications', label: 'Notifications' },
  { id: 'reports', label: 'My reports' },
  { id: 'danger', label: 'Delete account' },
];

export function SettingsPage({ admin = false }) {
  const { user, setUser, logout } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [section, setSection] = useState('account');
  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', password: '', confirmPassword: '' });
  const [passwordErrors, setPasswordErrors] = useState({});
  const [passwordError, setPasswordError] = useState(null);
  const [savingPassword, setSavingPassword] = useState(false);
  const [savingToggle, setSavingToggle] = useState(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(null);
  const reports = useAsync(() => (admin ? Promise.resolve({ items: [] }) : reportsApi.mine()), [admin]);

  async function patch(payload, key) {
    setSavingToggle(key);
    try {
      const data = await usersApi.update(user.id, payload);
      setUser(data.user);
      toast.success('Settings saved.');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSavingToggle(null);
    }
  }

  async function changePassword(event) {
    event.preventDefault();
    const errors = {};
    if (!passwordForm.currentPassword) errors.currentPassword = 'Current password is required.';
    if (passwordForm.password.length < 8) errors.password = 'Password must be at least 8 characters.';
    else if (!/[A-Za-z]/.test(passwordForm.password) || !/\d/.test(passwordForm.password)) errors.password = 'Use at least one letter and one number.';
    if (passwordForm.password !== passwordForm.confirmPassword) errors.confirmPassword = 'Passwords do not match.';
    setPasswordErrors(errors);
    if (Object.keys(errors).length) return;
    setSavingPassword(true);
    setPasswordError(null);
    try {
      await authApi.changePassword(passwordForm);
      toast.success('Password updated.');
      setPasswordForm({ currentPassword: '', password: '', confirmPassword: '' });
    } catch (err) {
      setPasswordError(err.message);
      setPasswordErrors(err.fields || {});
    } finally {
      setSavingPassword(false);
    }
  }

  async function confirmDelete() {
    setDeleting(true);
    setDeleteError(null);
    try {
      await usersApi.remove(user.id, deletePassword);
      toast.success('Your account has been deleted.');
      await logout();
      navigate('/', { replace: true });
    } catch (err) {
      setDeleteError(err.message);
    } finally {
      setDeleting(false);
    }
  }

  const nav = admin ? SECTIONS.filter((s) => s.id === 'account') : SECTIONS;

  return (
    <div>
      <PageHeader title={admin ? 'Admin Settings' : 'Settings'} subtitle={admin ? 'Your administrator account.' : 'Control how you appear, how we notify you, and your account itself.'} />
      <div className="settings-grid">
        <nav className="settings-nav" aria-label="Settings sections">
          {nav.map((item) => (
            <button key={item.id} type="button" className={`nav-link ${section === item.id ? 'active' : ''}`} onClick={() => setSection(item.id)}>
              {item.label}
            </button>
          ))}
        </nav>

        <div className="stack">
          {section === 'account' && (
            <>
              <Card>
                <h2>Account</h2>
                <dl className="kv mt-3">
                  <dt>Name</dt>
                  <dd>{user.fullName}</dd>
                  <dt>Email</dt>
                  <dd>{user.email}</dd>
                  <dt>Role</dt>
                  <dd>
                    <Badge status={user.role} />
                  </dd>
                </dl>
                {!admin && (
                  <p className="small muted mt-3">
                    To change your name or photo, visit <a href="/app/profile/edit">Edit Profile</a>.
                  </p>
                )}
              </Card>
              <Card>
                <h2>Change password</h2>
                {passwordError && (
                  <div className="alert alert--danger mb-4" role="alert">
                    <Icon name="alert" size={18} /> {passwordError}
                  </div>
                )}
                <form onSubmit={changePassword} className="stack" noValidate>
                  <Input label="Current password" type="password" autoComplete="current-password" value={passwordForm.currentPassword} onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })} error={passwordErrors.currentPassword} required />
                  <Input label="New password" type="password" autoComplete="new-password" value={passwordForm.password} onChange={(e) => setPasswordForm({ ...passwordForm, password: e.target.value })} error={passwordErrors.password} hint="At least 8 characters, with a letter and a number." required />
                  <Input label="Confirm new password" type="password" autoComplete="new-password" value={passwordForm.confirmPassword} onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })} error={passwordErrors.confirmPassword} required />
                  <div className="form-actions">
                    <Button type="submit" loading={savingPassword}>
                      Update password
                    </Button>
                  </div>
                </form>
              </Card>
            </>
          )}

          {section === 'privacy' && (
            <Card>
              <h2>Privacy</h2>
              <div className="stack mt-3">
                <Toggle
                  label="Public profile"
                  hint="When off, only you and administrators can view your profile."
                  checked={user.profile.isPublic}
                  onChange={(checked) => patch({ isPublic: checked }, 'isPublic')}
                  disabled={savingToggle === 'isPublic'}
                />
                <Toggle
                  label="Show points on my public profile"
                  hint="Displays how many points you have earned. Your available balance stays private."
                  checked={user.profile.showPointsPublicly}
                  onChange={(checked) => patch({ showPointsPublicly: checked }, 'showPointsPublicly')}
                  disabled={savingToggle === 'showPointsPublicly'}
                />
              </div>
            </Card>
          )}

          {section === 'notifications' && (
            <Card>
              <h2>Notifications</h2>
              <div className="stack mt-3">
                <Toggle
                  label="In-app notifications"
                  hint="Bells, badges and the notifications page."
                  checked={user.profile.notifyInApp}
                  onChange={(checked) => patch({ notifyInApp: checked }, 'notifyInApp')}
                  disabled={savingToggle === 'notifyInApp'}
                />
                <Toggle
                  label="Email notifications"
                  hint="We only send email when an SMTP server is configured. In development, messages are written to the server log."
                  checked={user.profile.notifyEmail}
                  onChange={(checked) => patch({ notifyEmail: checked }, 'notifyEmail')}
                  disabled={savingToggle === 'notifyEmail'}
                />
              </div>
            </Card>
          )}

          {section === 'reports' && (
            <Card>
              <h2>Reports you have submitted</h2>
              {reports.loading ? (
                <p className="muted">Loading…</p>
              ) : reports.error ? (
                <ErrorMessage error={reports.error} onRetry={reports.reload} />
              ) : reports.data.items.length ? (
                <div className="table-wrap mt-3">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Target</th>
                        <th>Reason</th>
                        <th>Status</th>
                        <th>Submitted</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reports.data.items.map((report) => (
                        <tr key={report.id}>
                          <td>
                            {labelize(report.targetType)}
                            {report.reportedUser ? ` · ${report.reportedUser.fullName}` : ''}
                          </td>
                          <td>{labelize(report.reason)}</td>
                          <td>
                            <Badge status={report.status} />
                          </td>
                          <td>{formatDate(report.createdAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <EmptyState compact icon="flag" title="You have not submitted any reports." message="If something goes wrong in an exchange, you can report a member, message, review or session." />
              )}
            </Card>
          )}

          {section === 'danger' && (
            <Card className="danger-zone">
              <h3>Delete account</h3>
              <p className="muted">This permanently removes your profile, skills, messages and reviews. You cannot delete an account that still has reserved points — cancel or complete those exchanges first.</p>
              <Button variant="danger" className="mt-3" onClick={() => setDeleteOpen(true)} icon={<Icon name="trash" size={16} />}>
                Delete my account
              </Button>
            </Card>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={confirmDelete}
        title="Delete your SkillSwap account?"
        confirmLabel="Delete account"
        danger
        loading={deleting}
      >
        <p>This cannot be undone. Enter your password to confirm.</p>
        <Input className="mt-3" label="Password" type="password" value={deletePassword} onChange={(e) => setDeletePassword(e.target.value)} error={deleteError} required />
      </ConfirmDialog>
    </div>
  );
}
