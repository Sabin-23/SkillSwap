import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { usersApi } from '../../api/index.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { SkillPicker } from '../../components/domain/SkillPicker.jsx';
import { Avatar, Button, Card, Icon, Input, SkillTag, Textarea } from '../../components/ui/index.jsx';

const FORMATS = [
  { value: 'ONLINE', title: 'Online', text: 'Video calls and chat' },
  { value: 'IN_PERSON', title: 'In person', text: 'Meet locally' },
  { value: 'EITHER', title: 'Either', text: 'Flexible, whatever works' },
];

export function OnboardingPage() {
  const { user, setUser, refresh } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [form, setForm] = useState({
    fullName: user.fullName,
    bio: user.profile.bio || '',
    location: user.profile.location || '',
    learningFormat: user.profile.learningFormat || '',
  });
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [picking, setPicking] = useState(null);

  const teaches = user.skills.teaches;
  const learns = user.skills.wantsToLearn;

  async function saveProfile(next) {
    setSaving(true);
    setError(null);
    try {
      const payload = {
        fullName: form.fullName.trim(),
        bio: form.bio.trim() || null,
        location: form.location.trim() || null,
        learningFormat: form.learningFormat || null,
      };
      if (next === 'finish') payload.onboardingCompleted = true;
      const data = await usersApi.update(user.id, payload);
      setUser(data.user);
      if (next === 'finish') {
        toast.success('Your profile is ready. Welcome to SkillSwap!');
        navigate('/app', { replace: true });
      } else {
        setStep(next);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function uploadAvatar(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setAvatarUploading(true);
    try {
      await usersApi.uploadAvatar(user.id, file);
      await refresh();
      toast.success('Profile photo updated.');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setAvatarUploading(false);
      event.target.value = '';
    }
  }

  async function addSkill(skill, type) {
    setPicking(skill.id);
    try {
      await usersApi.addSkill(user.id, { skillId: skill.id, type });
      await refresh();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setPicking(null);
    }
  }

  async function removeSkill(skill, type) {
    try {
      await usersApi.removeSkill(user.id, skill.id, type);
      await refresh();
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function skipAll() {
    setSaving(true);
    try {
      const data = await usersApi.update(user.id, { onboardingCompleted: true });
      setUser(data.user);
      navigate('/app', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  const steps = ['About you', 'Skills you teach', 'Skills you want to learn', 'Learning format'];

  return (
    <div className="onboarding">
      <div className="text-center mb-5">
        <span className="eyebrow">Step {step + 1} of {steps.length}</span>
        <h1>{steps[step]}</h1>
        <p className="muted">You can skip anything and complete it later from your profile.</p>
      </div>
      <div className="onboarding__steps" aria-hidden="true">
        {steps.map((label, index) => (
          <span key={label} className={index <= step ? 'is-done' : ''} />
        ))}
      </div>
      {error && (
        <div className="alert alert--danger mb-4" role="alert">
          <Icon name="alert" size={18} /> {error}
        </div>
      )}

      <Card>
        {step === 0 && (
          <div className="stack">
            <div className="avatar-upload">
              <Avatar name={user.fullName} src={user.profile.avatarUrl} size={80} />
              <div>
                <p className="small muted" style={{ marginBottom: 8 }}>
                  Profile picture (JPEG, PNG, WebP or GIF, max 2 MB)
                </p>
                <label className="btn btn--outline btn--sm">
                  <Icon name="camera" size={16} /> {avatarUploading ? 'Uploading…' : 'Upload photo'}
                  <input type="file" accept="image/*" onChange={uploadAvatar} className="sr-only" disabled={avatarUploading} />
                </label>
              </div>
            </div>
            <Input label="Full name" value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} required />
            <Textarea label="Short bio" placeholder="What do you do, and why do you enjoy teaching or learning?" value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} maxLength={600} />
            <Input label="Location" placeholder="City or region" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
          </div>
        )}

        {step === 1 && (
          <div className="stack">
            <div>
              <p className="user-card__section">Skills you can teach</p>
              <div className="skill-list">
                {teaches.length ? teaches.map((s) => <SkillTag key={s.id} skill={s} tone="teach" onRemove={(skill) => removeSkill(skill, 'TEACHES')} />) : <span className="faint small">Pick at least one skill below.</span>}
              </div>
            </div>
            <SkillPicker onPick={(skill) => addSkill(skill, 'TEACHES')} excludeIds={[...teaches, ...learns].map((s) => s.id)} picking={picking} />
          </div>
        )}

        {step === 2 && (
          <div className="stack">
            <div>
              <p className="user-card__section">Skills you want to learn</p>
              <div className="skill-list">
                {learns.length ? learns.map((s) => <SkillTag key={s.id} skill={s} tone="learn" onRemove={(skill) => removeSkill(skill, 'WANTS_TO_LEARN')} />) : <span className="faint small">Pick at least one skill below.</span>}
              </div>
            </div>
            <SkillPicker onPick={(skill) => addSkill(skill, 'WANTS_TO_LEARN')} excludeIds={[...teaches, ...learns].map((s) => s.id)} picking={picking} />
          </div>
        )}

        {step === 3 && (
          <div className="choice-grid" role="radiogroup" aria-label="Preferred learning format">
            {FORMATS.map((option) => (
              <button key={option.value} type="button" role="radio" aria-checked={form.learningFormat === option.value} className={`choice ${form.learningFormat === option.value ? 'is-selected' : ''}`} onClick={() => setForm({ ...form, learningFormat: option.value })}>
                <strong>{option.title}</strong>
                <span>{option.text}</span>
              </button>
            ))}
          </div>
        )}

        <div className="form-actions mt-5">
          <Button variant="ghost" onClick={skipAll} disabled={saving}>
            Skip for now
          </Button>
          {step > 0 && (
            <Button variant="outline" onClick={() => setStep(step - 1)} disabled={saving}>
              Back
            </Button>
          )}
          {step < steps.length - 1 ? (
            <Button onClick={() => (step === 0 ? saveProfile(1) : setStep(step + 1))} loading={saving}>
              Continue
            </Button>
          ) : (
            <Button onClick={() => saveProfile('finish')} loading={saving} icon={<Icon name="check" size={16} />}>
              Finish setup
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}
