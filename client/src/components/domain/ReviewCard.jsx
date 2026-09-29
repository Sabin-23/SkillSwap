import { Link } from 'react-router-dom';
import { formatDate } from '../../utils/format.js';
import { Avatar, Badge, Button, Icon, StarRating } from '../ui/index.jsx';

/**
 * A review. `person` picks which participant is shown (reviewer by default).
 */
export function ReviewCard({ review, person = 'reviewer', onEdit, onDelete, onReport, showStatus = false }) {
  const shown = person === 'reviewer' ? review.reviewer : review.reviewedUser;
  return (
    <article className="review-card">
      <header className="review-card__header">
        <Avatar name={shown.fullName} src={shown.avatarUrl} size={36} />
        <div>
          <strong>
            <Link to={`/app/users/${shown.id}`}>{shown.fullName}</Link>
            {person === 'reviewed' && <span className="muted"> (you reviewed)</span>}
          </strong>
          <span>
            {review.skillName} · {formatDate(review.createdAt)}
          </span>
        </div>
        <div className="review-card__actions">
          {showStatus && <Badge status={review.status} />}
          {onEdit && (
            <Button size="sm" variant="ghost" onClick={() => onEdit(review)} aria-label="Edit review" icon={<Icon name="edit" size={14} />} />
          )}
          {onDelete && (
            <Button size="sm" variant="ghost" onClick={() => onDelete(review)} aria-label="Delete review" icon={<Icon name="trash" size={14} />} />
          )}
          {onReport && (
            <Button size="sm" variant="ghost" onClick={() => onReport(review)} aria-label="Report review" icon={<Icon name="flag" size={14} />} />
          )}
        </div>
      </header>
      <StarRating value={review.rating} size={14} />
      {review.comment && <p className="mt-2">{review.comment}</p>}
    </article>
  );
}
