export function Spinner({ size = 24, className = '', label = 'Loading' }) {
  return (
    <span className={`spinner ${className}`.trim()} style={{ width: size, height: size }} role="status" aria-label={label} />
  );
}

export function PageLoader({ label = 'Loading…' }) {
  return (
    <div className="page-loader" role="status" aria-live="polite">
      <Spinner size={32} />
      <p>{label}</p>
    </div>
  );
}
