import { useEffect, useState } from 'react';
import { pointsApi, requestsApi } from '../../api/index.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { Button, Icon, Modal, Select, Textarea } from '../ui/index.jsx';

/**
 * Two-step "Send Skill Exchange Request" dialog:
 * 1. choose skill, duration and message; 2. confirm the server-side quote.
 */
export function RequestDialog({ open, onClose, partner, initialSkillId, onSent }) {
  const { user, refresh } = useAuth();
  const toast = useToast();
  const [rates, setRates] = useState([]);
  const [skillId, setSkillId] = useState('');
  const [duration, setDuration] = useState('60');
  const [message, setMessage] = useState('');
  const [quote, setQuote] = useState(null);
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});

  useEffect(() => {
    if (!open) return;
    setStep(1);
    setQuote(null);
    setError(null);
    setFieldErrors({});
    setMessage('');
    setSkillId(initialSkillId ? String(initialSkillId) : partner?.skills?.teaches?.[0]?.id ? String(partner.skills.teaches[0].id) : '');
    pointsApi
      .rates()
      .then((data) => {
        setRates(data.items);
        if (data.items.length && !data.items.some((r) => String(r.durationMinutes) === duration)) {
          setDuration(String(data.items[0].durationMinutes));
        }
      })
      .catch(() => setRates([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, partner?.id, initialSkillId]);

  if (!partner) return null;

  async function getQuote(event) {
    event.preventDefault();
    setError(null);
    setFieldErrors({});
    if (!skillId) {
      setFieldErrors({ skillId: 'Please select a skill.' });
      return;
    }
    setLoading(true);
    try {
      const data = await requestsApi.quote({ receiverId: partner.id, skillId: Number(skillId), durationMinutes: Number(duration) });
      setQuote(data);
      setStep(2);
    } catch (err) {
      setError(err.message);
      setFieldErrors(err.fields || {});
    } finally {
      setLoading(false);
    }
  }

  async function confirm() {
    setLoading(true);
    setError(null);
    try {
      const data = await requestsApi.create({ receiverId: partner.id, skillId: Number(skillId), durationMinutes: Number(duration), message });
      toast.success(`Request sent to ${partner.fullName}. ${quote.pointCost} points reserved.`);
      refresh();
      onSent?.(data.request);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const selectedRate = rates.find((r) => String(r.durationMinutes) === duration);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={step === 1 ? 'Send Skill Exchange Request' : 'Request Skill Exchange?'}
      description={step === 1 ? `Ask ${partner.fullName} to teach you one of their skills.` : 'Please confirm the details below.'}
      footer={
        step === 1 ? (
          <>
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" form="request-form" loading={loading}>
              Continue
            </Button>
          </>
        ) : (
          <>
            <Button variant="ghost" onClick={() => setStep(1)} disabled={loading}>
              Back
            </Button>
            <Button onClick={confirm} loading={loading} disabled={!quote?.sufficient}>
              Confirm Request
            </Button>
          </>
        )
      }
    >
      {error && (
        <div className="alert alert--danger mb-4" role="alert">
          <Icon name="alert" size={18} /> {error}
        </div>
      )}
      {step === 1 ? (
        <form id="request-form" onSubmit={getQuote} className="stack">
          <Select label="Skill you want to learn" value={skillId} onChange={(e) => setSkillId(e.target.value)} error={fieldErrors.skillId} required placeholder="Select a skill">
            {partner.skills.teaches.map((skill) => (
              <option key={skill.id} value={skill.id}>
                {skill.name}
              </option>
            ))}
          </Select>
          <Select label="Session duration" value={duration} onChange={(e) => setDuration(e.target.value)} error={fieldErrors.durationMinutes} required hint="The point cost is set by the platform based on duration.">
            {rates.map((rate) => (
              <option key={rate.id} value={rate.durationMinutes}>
                {rate.durationMinutes} minutes · {rate.pointCost} points
              </option>
            ))}
          </Select>
          <Textarea label="Message (optional)" value={message} onChange={(e) => setMessage(e.target.value)} maxLength={1000} placeholder={`Tell ${partner.fullName} what you would like to learn and what you can offer in return.`} error={fieldErrors.message} />
          <p className="small muted">
            Your balance: <strong>{user?.wallet?.availableBalance ?? 0} points</strong>
            {selectedRate && ` · This request reserves ${selectedRate.pointCost} points until the session is completed.`}
          </p>
        </form>
      ) : (
        <div className="stack">
          <dl className="kv">
            <dt>Skill</dt>
            <dd>{quote.skillName}</dd>
            <dt>Teacher</dt>
            <dd>{quote.teacherName}</dd>
            <dt>Duration</dt>
            <dd>{quote.durationMinutes} minutes</dd>
            <dt>Cost</dt>
            <dd>{quote.pointCost} SkillSwap Points</dd>
            <dt>Your balance</dt>
            <dd>{quote.availableBalance} points</dd>
            <dt>After request</dt>
            <dd className={quote.sufficient ? '' : 'text-danger'}>{quote.balanceAfter} available points</dd>
          </dl>
          {!quote.sufficient && (
            <div className="alert alert--warning" role="alert">
              <Icon name="alert" size={18} /> Insufficient SkillSwap Points. Teach a skill to earn more points.
            </div>
          )}
          {quote.sufficient && <p className="small muted">Points stay reserved until the session is completed. If the request is declined or cancelled they are refunded.</p>}
        </div>
      )}
    </Modal>
  );
}
