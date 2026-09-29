import { useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { messagesApi, usersApi } from '../../api/index.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { useAsync } from '../../hooks/useAsync.js';
import { formatDate, FORMAT_LABELS } from '../../utils/format.js';
import { MatchChip } from '../../components/domain/UserCard.jsx';
import { RequestDialog } from '../../components/domain/RequestDialog.jsx';
import { ReportDialog } from '../../components/domain/ReportDialog.jsx';
import { ReviewCard } from '../../components/domain/ReviewCard.jsx';
import { Avatar, Badge, Button, Card, EmptyState, ErrorMessage, Icon, PageHeader, PageLoader, SkillTag, StarRating } from '../../components/ui/index.jsx';

export function UserProfilePage() {
  const { id } = useParams();
  const { user: me, isAdmin } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const userId = Number(id);
  const { data, loading, error, reload } = useAsync(() => usersApi.get(userId), [userId]);
  const [requestOpen, setRequestOpen] = useState(false);
  const [requestSkillId, setRequestSkillId] = useState(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [openingChat, setOpeningChat] = useState(false);

  if (Number.isNaN(userId)) return <ErrorMessage error="That profile link is not valid." />;
  if (loading) return <PageLoader label="Loading profile…" />;
  if (error) {
    return (
      <div className="stack">
        <PageHeader title="Profile" backTo="/app/find" />
        <ErrorMessage error={error.status === 404 ? 'This profile is private or no longer available.' : error} onRetry={error.status === 404 ? undefined : reload} />
      </div>
    );
  }

  const profile = data.user;
  if (profile.isSelf && !isAdmin) {
    return <Navigate to="/app/profile" replace />;
  }
  const pendingRequest = profile.activeRequests?.find((r) => r.status === 'PENDING');
  const acceptedRequest = profile.activeRequests?.find((r) => r.status === 'ACCEPTED');

  async function openChat() {
    setOpeningChat(true);
    try {
      const { conversation } = await messagesApi.open(profile.id);
      navigate(isAdmin ? `/app/messages/${conversation.id}` : `/app/messages/${conversation.id}`);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setOpeningChat(false);
    }
  }

  function startRequest(skillId = null) {
    setRequestSkillId(skillId);
    setRequestOpen(true);
  }

  return (
    <div className="stack stack--lg">
      <PageHeader title={profile.fullName} backTo={isAdmin ? '/admin/users' : '/app/find'} />
      <Card>
        <div className="profile-hero">
          <Avatar name={profile.fullName} src={profile.avatarUrl} size={112} />
          <div className="profile-hero__body">
            <div className="row" style={{ gap: 10 }}>
              <h1>{profile.fullName}</h1>
              {profile.status !== 'ACTIVE' && <Badge status={profile.status} />}
              {profile.match && <MatchChip match={profile.match} />}
            </div>
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
            <p className="mt-3">{profile.bio || <span className="muted">This member has not written a bio yet.</span>}</p>
            {profile.match?.reasons?.length > 0 && (
              <ul className="match-reasons mt-3">
                {profile.match.reasons.map((reason) => (
                  <li key={reason}>
                    <Icon name="sparkles" size={13} /> {reason}
                  </li>
                ))}
              </ul>
            )}
          </div>
          {!isAdmin && (
            <div className="profile-hero__actions">
              {pendingRequest ? (
                <Button variant="secondary" to="/app/requests">
                  Request pending
                </Button>
              ) : acceptedRequest ? (
                <Button variant="secondary" to="/app/requests">
                  Exchange in progress
                </Button>
              ) : (
                <Button onClick={() => startRequest()} icon={<Icon name="swap" size={16} />} disabled={profile.status !== 'ACTIVE'}>
                  Request Skill Exchange
                </Button>
              )}
              <Button variant="outline" onClick={openChat} loading={openingChat} disabled={!profile.canMessage} icon={<Icon name="message" size={16} />} title={profile.canMessage ? undefined : 'Messaging unlocks once you have an exchange request together.'}>
                Message
              </Button>
              <Button variant="ghost" onClick={() => setReportOpen(true)} icon={<Icon name="flag" size={16} />}>
                Report
              </Button>
            </div>
          )}
        </div>
        {!profile.canMessage && !isAdmin && (
          <p className="small muted mt-3">
            <Icon name="lock" size={12} /> Messaging opens after one of you sends a skill exchange request.
          </p>
        )}
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
          {profile.points && (
            <div>
              <strong>{profile.points.totalEarned}</strong>
              <span>Points earned</span>
            </div>
          )}
        </div>
      </Card>

      <div className="profile-grid">
        <Card>
          <h3>Teaches</h3>
          <div className="skill-list">
            {profile.skills.teaches.length ? (
              profile.skills.teaches.map((skill) => (
                <button key={skill.id} type="button" className="skill-tag skill-tag--teach" onClick={() => !isAdmin && startRequest(skill.id)} title={isAdmin ? undefined : `Request to learn ${skill.name}`} style={{ cursor: isAdmin ? 'default' : 'pointer' }}>
                  {skill.name}
                  {me?.skills?.wantsToLearn?.some((s) => s.id === skill.id) && <Icon name="heart" size={12} />}
                </button>
              ))
            ) : (
              <span className="faint">No teaching skills listed.</span>
            )}
          </div>
          {!isAdmin && profile.skills.teaches.length > 0 && <p className="small muted mt-3">Tap a skill to request a session for it.</p>}
          <h3 className="mt-5">Wants to learn</h3>
          <div className="skill-list">{profile.skills.wantsToLearn.length ? profile.skills.wantsToLearn.map((s) => <SkillTag key={s.id} skill={s} tone="learn" />) : <span className="faint">Nothing listed yet.</span>}</div>
        </Card>
        <Card>
          <div className="card__header">
            <h3>Reviews</h3>
            <StarRating value={profile.rating || 0} count={profile.reviewCount} size={14} />
          </div>
          {profile.reviews.length ? profile.reviews.map((review) => <ReviewCard key={review.id} review={review} onReport={isAdmin ? undefined : () => setReportOpen({ type: 'REVIEW', id: review.id, userId: review.reviewer.id, label: `Review by ${review.reviewer.fullName}` })} />) : <EmptyState compact icon="star" title="No reviews yet." message={`${profile.fullName} has not received any reviews so far.`} />}
        </Card>
      </div>

      <RequestDialog open={requestOpen} onClose={() => setRequestOpen(false)} partner={profile} initialSkillId={requestSkillId} onSent={() => reload({ silent: true })} />
      <ReportDialog
        open={Boolean(reportOpen)}
        onClose={() => setReportOpen(false)}
        target={typeof reportOpen === 'object' ? reportOpen : { type: 'USER', id: profile.id, userId: profile.id, label: profile.fullName }}
      />
    </div>
  );
}
