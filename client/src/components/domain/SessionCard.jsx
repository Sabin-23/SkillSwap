import { Link } from 'react-router-dom';
import { formatTime, SESSION_FORMAT_LABELS } from '../../utils/format.js';
import { Avatar, Badge, Button, Card, Icon } from '../ui/index.jsx';

export function SessionCard({ session, busy, actions = {} }) {
  const date = new Date(`${session.scheduledDate}T00:00:00`);
  const day = date.getDate();
  const month = date.toLocaleDateString(undefined, { month: 'short' });
  const isScheduled = session.status === 'SCHEDULED';

  return (
    <Card className="request-card">
      <div className="session-card__when" aria-hidden="true">
        <strong>{day}</strong>
        <span>{month}</span>
      </div>
      <div className="request-card__body">
        <div className="request-card__title">
          <h3>{session.skill.name}</h3>
          <Badge status={session.status} />
          {session.paymentStatus === 'DISPUTED' && <Badge status="DISPUTED">Under review</Badge>}
          <span className="small muted">{session.role === 'TEACHER' ? 'You teach' : 'You learn'}</span>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <Avatar name={session.partner.fullName} src={session.partner.avatarUrl} size={24} />
          <span className="small">
            with <Link to={`/app/users/${session.partner.id}`}>{session.partner.fullName}</Link>
          </span>
        </div>
        <div className="session-card__details">
          <span>
            <Icon name="calendar" size={13} /> {date.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
          </span>
          <span>
            <Icon name="clock" size={13} /> {formatTime(session.startTime)} – {formatTime(session.endTime)}
          </span>
          <span>
            <Icon name={session.format === 'ONLINE' ? 'video' : 'mapPin'} size={13} /> {SESSION_FORMAT_LABELS[session.format]}
            {session.location && ` · ${session.location}`}
          </span>
          {session.meetingLink && (
            <a href={session.meetingLink} target="_blank" rel="noopener noreferrer">
              <Icon name="external" size={13} /> Join meeting
            </a>
          )}
          <span>
            <Icon name="coins" size={13} /> {session.pointCost} points
          </span>
        </div>
        {session.notes && <p className="request-card__message">{session.notes}</p>}
        <div className="request-card__actions">
          <Button size="sm" variant="outline" onClick={() => actions.onView?.(session)}>
            View
          </Button>
          {isScheduled && (
            <>
              <Button size="sm" variant="secondary" onClick={() => actions.onReschedule?.(session)} icon={<Icon name="edit" size={14} />}>
                Reschedule
              </Button>
              {session.hasStarted && session.paymentStatus !== 'DISPUTED' && (
                <Button size="sm" variant="success" loading={busy === 'complete'} onClick={() => actions.onComplete?.(session)} icon={<Icon name="check" size={14} />}>
                  Mark Complete
                </Button>
              )}
              <Button size="sm" variant="ghost" loading={busy === 'cancel'} onClick={() => actions.onCancel?.(session)}>
                Cancel
              </Button>
              <Button size="sm" variant="ghost" onClick={() => actions.onReport?.(session)} icon={<Icon name="flag" size={14} />}>
                Report a problem
              </Button>
            </>
          )}
        </div>
      </div>
    </Card>
  );
}
