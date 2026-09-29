import { Link } from 'react-router-dom';
import { formatDate, timeAgo } from '../../utils/format.js';
import { Avatar, Badge, Button, Card, Icon } from '../ui/index.jsx';

/**
 * A single exchange request with the actions available to the viewer.
 * actions: { onAccept, onReject, onCancel, onSchedule, onMessage, onReview, onViewSession }
 */
export function RequestCard({ request, busy, actions = {} }) {
  const isReceived = request.direction === 'RECEIVED';
  const other = isReceived ? request.sender : request.receiver;
  const roleText = request.role === 'TEACHER' ? `wants to learn ${request.skill.name} from you` : `teaches you ${request.skill.name}`;
  const scheduled = request.session?.status === 'SCHEDULED' ? request.session : null;

  return (
    <Card className="request-card">
      <Avatar name={other.fullName} src={other.avatarUrl} size={48} />
      <div className="request-card__body">
        <div className="request-card__title">
          <h3>
            <Link to={`/app/users/${other.id}`}>{other.fullName}</Link>
          </h3>
          <Badge status={request.status} />
          {request.paymentStatus === 'DISPUTED' && <Badge status="DISPUTED">Under review</Badge>}
        </div>
        <p className="muted small" style={{ marginBottom: 4 }}>
          {roleText} · {request.durationMinutes} min · <strong>{request.pointCost} points</strong>
        </p>
        <div className="request-card__meta">
          <span>{isReceived ? 'Received' : 'Sent'} {timeAgo(request.createdAt)}</span>
          {scheduled && (
            <span>
              <Icon name="calendar" size={13} /> Session {formatDate(scheduled.scheduledDate)} at {scheduled.startTime?.slice(0, 5)}
            </span>
          )}
          {request.status === 'COMPLETED' && request.session?.scheduledDate && <span>Completed {formatDate(request.session.scheduledDate)}</span>}
        </div>
        {request.message && <p className="request-card__message">“{request.message}”</p>}

        <div className="request-card__actions">
          {request.status === 'PENDING' && isReceived && (
            <>
              <Button size="sm" variant="success" loading={busy === 'accept'} onClick={() => actions.onAccept?.(request)} icon={<Icon name="check" size={16} />}>
                Accept
              </Button>
              <Button size="sm" variant="outline" loading={busy === 'reject'} onClick={() => actions.onReject?.(request)} icon={<Icon name="x" size={16} />}>
                Reject
              </Button>
            </>
          )}
          {request.status === 'PENDING' && !isReceived && (
            <Button size="sm" variant="outline" loading={busy === 'cancel'} onClick={() => actions.onCancel?.(request)}>
              Cancel request
            </Button>
          )}
          {request.status === 'ACCEPTED' && !scheduled && request.paymentStatus !== 'DISPUTED' && (
            <Button size="sm" onClick={() => actions.onSchedule?.(request)} icon={<Icon name="calendar" size={16} />}>
              Schedule session
            </Button>
          )}
          {request.status === 'ACCEPTED' && scheduled && (
            <Button size="sm" variant="secondary" to="/app/sessions">
              View session
            </Button>
          )}
          {['PENDING', 'ACCEPTED', 'COMPLETED'].includes(request.status) && (
            <Button size="sm" variant="ghost" onClick={() => actions.onMessage?.(request)} icon={<Icon name="message" size={16} />}>
              Message
            </Button>
          )}
          {request.status === 'ACCEPTED' && request.paymentStatus !== 'DISPUTED' && (
            <Button size="sm" variant="ghost" loading={busy === 'cancel'} onClick={() => actions.onCancel?.(request)}>
              Cancel exchange
            </Button>
          )}
          {request.status === 'COMPLETED' && request.canReview && (
            <Button size="sm" variant="accent" onClick={() => actions.onReview?.(request)} icon={<Icon name="star" size={16} />}>
              Leave a review
            </Button>
          )}
          {request.status === 'COMPLETED' && request.myReview && (
            <span className="small muted row" style={{ gap: 4 }}>
              <Icon name="check" size={14} /> You rated {request.myReview.rating}/5
            </span>
          )}
        </div>
      </div>
    </Card>
  );
}
