import { useId } from 'react';

function FieldWrapper({ id, label, hint, error, required, children, className = '' }) {
  return (
    <div className={`field ${error ? 'field--error' : ''} ${className}`.trim()}>
      {label && (
        <label className="field__label" htmlFor={id}>
          {label}
          {required && <span aria-hidden="true"> *</span>}
        </label>
      )}
      {children}
      {hint && !error && (
        <p className="field__hint" id={`${id}-hint`}>
          {hint}
        </p>
      )}
      {error && (
        <p className="field__error" id={`${id}-error`} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export function Input({ label, hint, error, required, className, id: givenId, ...rest }) {
  const autoId = useId();
  const id = givenId || autoId;
  return (
    <FieldWrapper id={id} label={label} hint={hint} error={error} required={required} className={className}>
      <input
        id={id}
        className="input"
        required={required}
        aria-invalid={Boolean(error) || undefined}
        aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
        {...rest}
      />
    </FieldWrapper>
  );
}

export function Textarea({ label, hint, error, required, className, id: givenId, rows = 4, ...rest }) {
  const autoId = useId();
  const id = givenId || autoId;
  return (
    <FieldWrapper id={id} label={label} hint={hint} error={error} required={required} className={className}>
      <textarea
        id={id}
        className="input input--textarea"
        rows={rows}
        required={required}
        aria-invalid={Boolean(error) || undefined}
        aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
        {...rest}
      />
    </FieldWrapper>
  );
}

export function Select({ label, hint, error, required, className, id: givenId, children, placeholder, ...rest }) {
  const autoId = useId();
  const id = givenId || autoId;
  return (
    <FieldWrapper id={id} label={label} hint={hint} error={error} required={required} className={className}>
      <select
        id={id}
        className="input input--select"
        required={required}
        aria-invalid={Boolean(error) || undefined}
        aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
        {...rest}
      >
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {children}
      </select>
    </FieldWrapper>
  );
}

export function Checkbox({ label, hint, className = '', id: givenId, ...rest }) {
  const autoId = useId();
  const id = givenId || autoId;
  return (
    <div className={`field field--checkbox ${className}`.trim()}>
      <input id={id} type="checkbox" className="checkbox" {...rest} />
      <label htmlFor={id}>
        <span>{label}</span>
        {hint && <small>{hint}</small>}
      </label>
    </div>
  );
}

export function Toggle({ label, hint, checked, onChange, id: givenId, disabled }) {
  const autoId = useId();
  const id = givenId || autoId;
  return (
    <div className="toggle-row">
      <div>
        <label htmlFor={id} className="toggle-row__label">
          {label}
        </label>
        {hint && <p className="field__hint">{hint}</p>}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        className={`toggle ${checked ? 'toggle--on' : ''}`}
        onClick={() => onChange(!checked)}
        disabled={disabled}
      >
        <span className="toggle__knob" />
      </button>
    </div>
  );
}
