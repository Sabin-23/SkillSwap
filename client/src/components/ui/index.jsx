import { Link } from 'react-router-dom';
import { assetUrl } from '../../api/client.js';
import { initials, labelize } from '../../utils/format.js';
import { Icon } from './Icon.jsx';
import { Button } from './Button.jsx';

export { Icon } from './Icon.jsx';
export { Button } from './Button.jsx';
export { Spinner, PageLoader } from './Spinner.jsx';
export { Input, Textarea, Select, Checkbox, Toggle } from './FormField.jsx';
export { Modal, ConfirmDialog } from './Modal.jsx';

export function Card({ children, className = '', as: Tag = 'div', padded = true, ...rest }) {
  return (
    <Tag className={`card ${padded ? 'card--padded' : ''} ${className}`.trim()} {...rest}>
      {children}
    </Tag>
  );
}

export function Avatar({ name = '', src, size = 40, className = '' }) {
  const url = assetUrl(src);
  return (
    <span className={`avatar ${className}`.trim()} style={{ width: size, height: size, fontSize: Math.max(11, size / 2.6) }}>
      {url ? <img src={url} alt={name ? `${name}'s profile picture` : 'Profile picture'} width={size} height={size} /> : <span aria-hidden="true">{initials(name) || '?'}</span>}
    </span>
  );
}

const STATUS_TONES = {
  PENDING: 'warning',
  ACCEPTED: 'info',
  REJECTED: 'danger',
  CANCELLED: 'neutral',
  COMPLETED: 'success',
  SCHEDULED: 'info',
  ACTIVE: 'success',
  SUSPENDED: 'danger',
  INACTIVE: 'neutral',
  OPEN: 'warning',
  UNDER_REVIEW: 'info',
  RESOLVED: 'success',
  DISMISSED: 'neutral',
  RESERVED: 'warning',
  DISPUTED: 'danger',
  REFUNDED: 'neutral',
  SPLIT: 'info',
  VISIBLE: 'success',
  REMOVED: 'danger',
  USER: 'neutral',
  ADMIN: 'primary',
};

export function Badge({ children, tone, status, className = '', size = 'md' }) {
  const resolvedTone = tone || (status ? STATUS_TONES[status] || 'neutral' : 'neutral');
  return (
    <span className={`badge badge--${resolvedTone} badge--${size} ${className}`.trim()}>
      {children ?? labelize(status)}
    </span>
  );
}

export function EmptyState({ icon = 'inbox', title, message, action, compact = false }) {
  return (
    <div className={`empty-state ${compact ? 'empty-state--compact' : ''}`}>
      <span className="empty-state__icon">
        <Icon name={icon} size={compact ? 24 : 32} />
      </span>
      <h3>{title}</h3>
      {message && <p>{message}</p>}
      {action}
    </div>
  );
}

export function ErrorMessage({ error, onRetry, title = 'Something went wrong' }) {
  if (!error) return null;
  const message = typeof error === 'string' ? error : error.message || 'Something went wrong. Please try again.';
  return (
    <div className="error-box" role="alert">
      <Icon name="alert" size={20} />
      <div>
        <strong>{title}</strong>
        <p>{message}</p>
      </div>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry} icon={<Icon name="refresh" size={16} />}>
          Retry
        </Button>
      )}
    </div>
  );
}

export function Pagination({ pagination, onPageChange }) {
  if (!pagination || pagination.totalPages <= 1) return null;
  const { page, totalPages } = pagination;
  return (
    <nav className="pagination" aria-label="Pagination">
      <Button variant="ghost" size="sm" onClick={() => onPageChange(page - 1)} disabled={page <= 1} icon={<Icon name="chevronLeft" size={16} />}>
        Previous
      </Button>
      <span className="pagination__info">
        Page {page} of {totalPages}
      </span>
      <Button variant="ghost" size="sm" onClick={() => onPageChange(page + 1)} disabled={page >= totalPages}>
        Next <Icon name="chevronRight" size={16} />
      </Button>
    </nav>
  );
}

export function StarRating({ value = 0, count, size = 16, interactive = false, onChange, label = 'Rating' }) {
  const rounded = Math.round(value * 2) / 2;
  if (interactive) {
    return (
      <div className="stars stars--interactive" role="radiogroup" aria-label={label}>
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            role="radio"
            aria-checked={value === star}
            aria-label={`${star} star${star > 1 ? 's' : ''}`}
            className={`stars__btn ${star <= value ? 'is-active' : ''}`}
            onClick={() => onChange?.(star)}
          >
            <Icon name="star" size={size + 6} strokeWidth={1.5} />
          </button>
        ))}
      </div>
    );
  }
  return (
    <span className="stars" aria-label={value ? `${value} out of 5 stars` : 'No rating yet'}>
      {[1, 2, 3, 4, 5].map((star) => (
        <Icon key={star} name="star" size={size} className={star <= rounded ? 'is-active' : star - 0.5 === rounded ? 'is-half' : ''} />
      ))}
      {value ? <strong className="stars__value">{Number(value).toFixed(1)}</strong> : <span className="stars__value muted">New</span>}
      {count !== undefined && <span className="stars__count">({count})</span>}
    </span>
  );
}

export function ProgressBar({ value = 0, label, showValue = true, tone = 'primary' }) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div className="progress">
      {(label || showValue) && (
        <div className="progress__header">
          {label && <span>{label}</span>}
          {showValue && <strong>{pct}%</strong>}
        </div>
      )}
      <div className="progress__track" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={label || 'Progress'}>
        <div className={`progress__bar progress__bar--${tone}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function Tabs({ tabs, active, onChange, ariaLabel = 'Sections' }) {
  return (
    <div className="tabs" role="tablist" aria-label={ariaLabel}>
      {tabs.map((tab) => (
        <button
          key={tab.value}
          type="button"
          role="tab"
          aria-selected={active === tab.value}
          className={`tabs__tab ${active === tab.value ? 'is-active' : ''}`}
          onClick={() => onChange(tab.value)}
        >
          {tab.label}
          {tab.count !== undefined && tab.count > 0 && <span className="tabs__count">{tab.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions, backTo }) {
  return (
    <header className="page-header">
      <div>
        {backTo && (
          <Link to={backTo} className="page-header__back">
            <Icon name="chevronLeft" size={16} /> Back
          </Link>
        )}
        <h1>{title}</h1>
        {subtitle && <p className="page-header__subtitle">{subtitle}</p>}
      </div>
      {actions && <div className="page-header__actions">{actions}</div>}
    </header>
  );
}

export function StatCard({ label, value, icon, tone = 'primary', hint, to }) {
  const content = (
    <>
      <span className={`stat-card__icon stat-card__icon--${tone}`}>
        <Icon name={icon} size={20} />
      </span>
      <div>
        <p className="stat-card__label">{label}</p>
        <p className="stat-card__value">{value ?? '—'}</p>
        {hint && <p className="stat-card__hint">{hint}</p>}
      </div>
    </>
  );
  return to ? (
    <Link to={to} className="stat-card stat-card--link">
      {content}
    </Link>
  ) : (
    <div className="stat-card">{content}</div>
  );
}

export function SkillTag({ skill, tone = 'teach', onRemove, removing }) {
  return (
    <span className={`skill-tag skill-tag--${tone}`}>
      {skill.name}
      {onRemove && (
        <button type="button" className="skill-tag__remove" onClick={() => onRemove(skill)} aria-label={`Remove ${skill.name}`} disabled={removing}>
          <Icon name="x" size={12} />
        </button>
      )}
    </span>
  );
}
