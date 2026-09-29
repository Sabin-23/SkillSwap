import { useEffect, useState } from 'react';
import { reviewsApi } from '../../api/index.js';
import { useToast } from '../../context/ToastContext.jsx';
import { Button, Icon, Modal, StarRating, Textarea } from '../ui/index.jsx';

/** Create a review for a completed exchange (`request`) or edit an existing `review`. */
export function ReviewDialog({ open, onClose, request, review, onSaved }) {
  const toast = useToast();
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!open) return;
    setRating(review?.rating || 0);
    setComment(review?.comment || '');
    setError(null);
  }, [open, review]);

  const partnerName = review?.reviewedUser?.fullName || (request?.direction === 'RECEIVED' ? request?.sender?.fullName : request?.receiver?.fullName);

  async function submit(event) {
    event.preventDefault();
    if (!rating) {
      setError('Please choose a star rating.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = review
        ? await reviewsApi.update(review.id, { rating, comment })
        : await reviewsApi.create({ exchangeRequestId: request.id, rating, comment });
      toast.success(review ? 'Review updated.' : 'Thanks for your review!');
      onSaved?.(data.review);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      title={review ? 'Edit your review' : `Review ${partnerName || 'your partner'}`}
      description={request ? `${request.skill.name} exchange` : review?.skillName}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button type="submit" form="review-form" loading={loading}>
            {review ? 'Save review' : 'Submit review'}
          </Button>
        </>
      }
    >
      {error && (
        <div className="alert alert--danger mb-4" role="alert">
          <Icon name="alert" size={18} /> {error}
        </div>
      )}
      <form id="review-form" onSubmit={submit} className="stack">
        <div className="field">
          <span className="field__label">Your rating</span>
          <StarRating interactive value={rating} onChange={setRating} size={22} />
        </div>
        <Textarea label="Comment (optional)" value={comment} onChange={(e) => setComment(e.target.value)} maxLength={1000} placeholder="What went well? What could be better?" />
      </form>
    </Modal>
  );
}
