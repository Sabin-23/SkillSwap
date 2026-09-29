import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { usersApi } from '../../api/index.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { useAsync } from '../../hooks/useAsync.js';
import { formatDate, FORMAT_LABELS } from '../../utils/format.js';
import { ReviewCard } from '../../components/domain/ReviewCard.jsx';
import { Avatar, Button, Card, ConfirmDialog, EmptyState, ErrorMessage, Icon, Input, PageHeader, PageLoader, ProgressBar, Select, SkillTag, StarRating, Textarea } from '../../components/ui/index.jsx';

/** The signed-in user's own profile, as others see it, plus completion status. */
export function MyProfilePage() {
  const { user } = useAuth();
  const { data, loading, error, reload } = useAsync(() => usersApi.get(user.id), [user.id]);

  if (loading) return <PageLoader />;
  if (error) return <ErrorMessage error={error} onRetry={reload} />;
  const profile = data.user;

  return (
    <div className="stack stack--lg">
      <PageHeader
        title="My Profile"
        subtitle="This is how other members see you."
        actions={
          <>
            <Button to="/app/skills" variant="outline" icon={<Icon name="book" size={16} />}>
              Manage skills
            </Button>
            <Button to="/app/profile/edit" icon={<Icon name="edit" size={16} />}>
              Edit Profile
            </Button>
          </>
        }
      />
      <Card>
        <div className="profile-hero">
          <Avatar name={profile.fullName} src={profile.avatarUrl} size={112} />
          <div className="profile-hero__body">
            <h1>{profile.fullName}</h1>
            <div className="profile-hero__meta">
              {profile.location && (
                <span>
                  <Icon name="mapPin" size={14} /> {profile.location}
                </span>
              )}
              {profile.learningFormat && (
                <span>
                  <Icon name="video" size={14} /> {FORMAT_LABELS[profile.learningFormat]}
                </span>
              )}
              <span>
                <Icon name="calendar" size={14} /> Member since {formatDate(profile.memberSince, { month: 'long' })}
              </span>
            </div>
            <StarRating value={profile.rating || 0} count={profile.reviewCount} />
            <p className="mt-3">{profile.bio || <span className="muted">You have not written a bio yet.</span>}</p>
          </div>
        </div>
        <hr className="divider" />
        <div className="profile-stats">
          <div>
            <strong>{profile.completedExchanges}</strong>
            <span>Completed exchanges</span>
          </div>
          <div>
            <strong>{profile.teachingSessions}</strong>
            <span>Sessions taught</span>
          </div>
          <div>
            <strong>{profile.reviewCount}</strong>
            <span>Reviews</span>
          </div>
          <div>
            <strong>{user.wallet.availableBalance}</strong>
            <span>Points available {user.profile.showPointsPublicly ? '(public)' : '(private)'}</span>
          </div>
        </div>
      </Card>

      <div className="profile-grid">
        <Card>
          <h3>Skills I teach</h3>
          <div className="skill-list">{profile.skills.teaches.length ? profile.skills.teaches.map((s) => <SkillTag key={s.id} skill={s} tone="teach" />) : <span className="faint">No teaching skills added yet.</span>}</div>
          <h3 className="mt-5">Skills I want to learn</h3>
          <div className="skill-list">{profile.skills.wantsToLearn.length ? profile.skills.wantsToLearn.map((s) => <SkillTag key={s.id} skill={s} tone="learn" />) : <span className="faint">Nothing listed yet.</span>}</div>
        </Card>
        <Card>
          <h3>Profile completion</h3>
          <ProgressBar value={user.completion.percent} label={`Profile ${user.completion.percent}% complete`} showValue={false} tone={user.completion.percent === 100 ? 'success' : 'primary'} />
          {user.completion.missing.length ? (
            <ul className="completion-list mt-3">
              {user.completion.missing.map((item) => (
                <li key={item.key}>
                  <Icon name="alert" size={14} /> {item.label}
                </li>
              ))}
            </ul>
          ) : (
            <p className="small text-success mt-3">Everything is filled in. Nice work!</p>
          )}
        </Card>
      </div>

      <Card>
        <div className="card__header">
          <h2>Reviews about me</h2>
          <Link to="/app/reviews" className="small">
            All reviews
          </Link>
        </div>
        {profile.reviews.length ? profile.reviews.map((review) => <ReviewCard key={review.id} review={review} />) : <EmptyState compact icon="star" title="No reviews yet." message="Complete an exchange to receive your first review." />}
      </Card>
    </div>
  );
}

const FORMATS = [
  { value: 'ONLINE', label: 'Online' },
  { value: 'IN_PERSON', label: 'In person' },
  { value: 'EITHER', label: 'Either' },
];

export function EditProfilePage() {
  const { user, setUser, refresh } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    fullName: user.fullName,
    bio: user.profile.bio || '',
    location: user.profile.location || '',
    learningFormat: user.profile.learningFormat || '',
  });
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});
  const [error, setError] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);

  async function submit(event) {
    event.preventDefault();
    const nextErrors = {};
    if (form.fullName.trim().length < 2) nextErrors.fullName = 'Please enter your full name.';
    if (form.bio.length > 600) nextErrors.bio = 'Bio must be at most 600 characters.';
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    setSaving(true);
    setError(null);
    try {
      const data = await usersApi.update(user.id, {
        fullName: form.fullName.trim(),
        bio: form.bio.trim() || null,
        location: form.location.trim() || null,
        learningFormat: form.learningFormat || null,
      });
      setUser(data.user);
      toast.success('Profile updated.');
      navigate('/app/profile');
    } catch (err) {
      setError(err.message);
      setErrors(err.fields || {});
    } finally {
      setSaving(false);
    }
  }

  async function uploadAvatar(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast.error('The file is too large. Maximum size is 2 MB.');
      event.target.value = '';
      return;
    }
    setUploading(true);
    try {
      await usersApi.uploadAvatar(user.id, file);
      await refresh();
      toast.success('Profile photo updated.');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setUploading(false);
      event.target.value = '';
    }
  }

  async function removeAvatar() {
    try {
      await usersApi.deleteAvatar(user.id);
      await refresh();
      toast.success('Profile photo removed.');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setConfirmRemove(false);
    }
  }

  return (
    <div className="container--narrow" style={{ margin: '0 auto' }}>
      <PageHeader title="Edit Profile" subtitle="Keep your profile up to date so partners know what to expect." backTo="/app/profile" />
      <Card>
        <div className="avatar-upload mb-5">
          <Avatar name={user.fullName} src={user.profile.avatarUrl} size={96} />
          <div>
            <p className="small muted" style={{ marginBottom: 8 }}>
              JPEG, PNG, WebP or GIF · max 2 MB
            </p>
            <div className="avatar-upload__actions">
              <label className="btn btn--outline btn--sm">
                <Icon name="upload" size={16} /> {uploading ? 'Uploading…' : user.profile.avatarUrl ? 'Replace photo' : 'Upload photo'}
                <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="sr-only" onChange={uploadAvatar} disabled={uploading} />
              </label>
              {user.profile.avatarUrl && (
                <Button variant="ghost" size="sm" onClick={() => setConfirmRemove(true)} icon={<Icon name="trash" size={16} />}>
                  Remove
                </Button>
              )}
            </div>
          </div>
        </div>
        {error && (
          <div className="alert alert--danger mb-4" role="alert">
            <Icon name="alert" size={18} /> {error}
          </div>
        )}
        <form onSubmit={submit} className="stack" noValidate>
          <Input label="Full name" value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} error={errors.fullName} required />
          <Textarea label="Bio" value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} error={errors.bio} maxLength={600} hint={`${form.bio.length}/600 characters`} />
          <div className="form-grid">
            <Input label="Location" placeholder="City or region" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} error={errors.location} />
            <Select label="Preferred learning format" value={form.learningFormat} onChange={(e) => setForm({ ...form, learningFormat: e.target.value })} placeholder="Choose a format" error={errors.learningFormat}>
              {FORMATS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </div>
          <div className="form-actions">
            <Button variant="ghost" to="/app/profile">
              Cancel
            </Button>
            <Button type="submit" loading={saving}>
              Save changes
            </Button>
          </div>
        </form>
      </Card>
      <ConfirmDialog open={confirmRemove} onClose={() => setConfirmRemove(false)} onConfirm={removeAvatar} title="Remove profile photo?" message="Your initials will be shown instead." confirmLabel="Remove" danger />
    </div>
  );
}
