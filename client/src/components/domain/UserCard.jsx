import { Link } from 'react-router-dom';
import { FORMAT_LABELS } from '../../utils/format.js';
import { Avatar, Button, Card, Icon, SkillTag, StarRating } from '../ui/index.jsx';

export function MatchChip({ match }) {
  if (!match?.label) return null;
  const tone = match.label.startsWith('Great') ? 'great' : match.label.startsWith('Good') ? 'good' : 'potential';
  return (
    <span className={`match-chip match-chip--${tone}`}>
      <Icon name="sparkles" size={12} /> {match.label}
    </span>
  );
}

export function UserCard({ user, onRequest }) {
  return (
    <Card className="user-card">
      <div className="user-card__top">
        <Avatar name={user.fullName} src={user.avatarUrl} size={56} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <h3 className="user-card__name">
            <Link to={`/app/users/${user.id}`}>{user.fullName}</Link>
          </h3>
          <div className="user-card__meta">
            {user.location && (
              <span>
                <Icon name="mapPin" size={13} /> {user.location}
              </span>
            )}
            {user.learningFormat && <span>· {FORMAT_LABELS[user.learningFormat]}</span>}
          </div>
          <div className="row" style={{ gap: 8, marginTop: 4 }}>
            <StarRating value={user.rating || 0} count={user.reviewCount} size={14} />
            <MatchChip match={user.match} />
          </div>
        </div>
      </div>
      {user.bio && <p className="user-card__bio">{user.bio}</p>}
      <div>
        <p className="user-card__section">Teaches</p>
        <div className="skill-list">
          {user.skills.teaches.length ? user.skills.teaches.map((s) => <SkillTag key={s.id} skill={s} tone="teach" />) : <span className="faint small">No teaching skills yet</span>}
        </div>
      </div>
      <div>
        <p className="user-card__section">Wants to learn</p>
        <div className="skill-list">
          {user.skills.wantsToLearn.length ? user.skills.wantsToLearn.map((s) => <SkillTag key={s.id} skill={s} tone="learn" />) : <span className="faint small">Nothing listed yet</span>}
        </div>
      </div>
      <div className="user-card__actions">
        <Button to={`/app/users/${user.id}`} variant="outline" size="sm">
          View Profile
        </Button>
        <Button size="sm" onClick={() => onRequest?.(user)} disabled={!user.skills.teaches.length}>
          Send Request
        </Button>
      </div>
    </Card>
  );
}
