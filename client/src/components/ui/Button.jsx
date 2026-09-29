import { Link } from 'react-router-dom';
import { Spinner } from './Spinner.jsx';

/**
 * variant: primary | secondary | ghost | danger | outline | accent
 * size: sm | md | lg
 */
export function Button({
  children,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  to,
  href,
  type = 'button',
  className = '',
  icon,
  block = false,
  ...rest
}) {
  const classes = `btn btn--${variant} btn--${size} ${block ? 'btn--block' : ''} ${className}`.trim();
  const content = (
    <>
      {loading ? <Spinner size={16} /> : icon}
      {children && <span>{children}</span>}
    </>
  );
  if (to) {
    return (
      <Link to={to} className={classes} aria-disabled={disabled || undefined} {...rest}>
        {content}
      </Link>
    );
  }
  if (href) {
    return (
      <a href={href} className={classes} target="_blank" rel="noopener noreferrer" {...rest}>
        {content}
      </a>
    );
  }
  return (
    <button type={type} className={classes} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {content}
    </button>
  );
}
