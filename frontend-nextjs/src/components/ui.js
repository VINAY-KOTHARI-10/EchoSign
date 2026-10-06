// Small shared building blocks. The class names are the ones the React app uses, so both sites look identical.
import { XCircle } from 'lucide-react';

export function PageHeader({ title, subtitle, eyebrow, actions }) {
  return (
    <header className="page-head">
      <div className="head-main">
        <div>
          {eyebrow && <div className="eyebrow">{eyebrow}</div>}
          <h1>{title}</h1>
          {subtitle && <p className="subtitle">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="row wrap">{actions}</div>}
    </header>
  );
}

const STATUS = { live: 'badge-live', ok: 'badge-ok', warn: 'badge-warn', error: 'badge-error', info: 'badge-info', off: 'badge-off', ended: 'badge-off' };

export function StatusBadge({ status = 'info', children }) {
  return (
    <span className={`badge ${STATUS[status] || STATUS.info}`}>
      {status === 'live' && <span className="pulse-dot" aria-hidden="true" />}
      {children}
    </span>
  );
}

export function EmptyState({ title, children, action }) {
  return (
    <div className="state">
      {title && <h2>{title}</h2>}
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

export function ErrorState({ title = 'Something went wrong', message, children }) {
  return (
    <div className="state" role="alert">
      <div className="state-icon" style={{ background: '#fdeceb', color: 'var(--stop)' }} aria-hidden="true"><XCircle size={26} /></div>
      <h2>{title}</h2>
      {message && <p>{message}</p>}
      {children}
    </div>
  );
}

export function LoadingState({ label = 'Loading…' }) {
  return (
    <div className="state" role="status" aria-live="polite">
      <div className="spinner" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}
