import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, CircleDot, Clock, Info, MinusCircle, Radio, XCircle } from 'lucide-react';

// ── PageHeader ───────────────────────────────────────────────────────────────
export function PageHeader({ title, subtitle, icon: Icon, eyebrow, actions }) {
  return (
    <header className="page-head">
      <div className="head-main">
        {Icon && <div className="head-icon" aria-hidden="true"><Icon size={24} /></div>}
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

// ── StatusBadge: icon + text so state is never conveyed by colour alone ───────
const STATUS = {
  live: { cls: 'badge-live', icon: Radio, pulse: true },
  ok: { cls: 'badge-ok', icon: CheckCircle2 },
  warn: { cls: 'badge-warn', icon: AlertTriangle },
  error: { cls: 'badge-error', icon: XCircle },
  info: { cls: 'badge-info', icon: Info },
  off: { cls: 'badge-off', icon: MinusCircle },
  ended: { cls: 'badge-off', icon: CircleDot },
  scheduled: { cls: 'badge-warn', icon: Clock },
};

export function StatusBadge({ status = 'info', children, title }) {
  const s = STATUS[status] || STATUS.info;
  const Icon = s.icon;
  return (
    <span className={`badge ${s.cls}`} title={title}>
      {s.pulse ? <span className="pulse-dot" aria-hidden="true" /> : <Icon size={13} aria-hidden="true" />}
      {children}
    </span>
  );
}

// ── EmptyState / LoadingState / ErrorState ───────────────────────────────────
export function EmptyState({ icon: Icon, title, children, action }) {
  return (
    <div className="state">
      {Icon && <div className="state-icon" aria-hidden="true"><Icon size={26} /></div>}
      <h2>{title}</h2>
      {children && <p>{children}</p>}
      {action}
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

export function ErrorState({ message, onRetry }) {
  return (
    <div className="state" role="alert">
      <div className="state-icon" style={{ background: '#fdeceb', color: 'var(--stop)' }} aria-hidden="true"><XCircle size={26} /></div>
      <h2>Something went wrong</h2>
      <p>{message}</p>
      {onRetry && <button className="btn btn-outline btn-sm" onClick={onRetry}>Try again</button>}
    </div>
  );
}

export const Skeleton = ({ height = 16, width = '100%', style }) => (
  <div className="skeleton" aria-hidden="true" style={{ height, width, ...style }} />
);

// ── Tabs: roving tabindex + arrow / Home / End keys ──────────────────────────
export function Tabs({ tabs, value, onChange, label, idPrefix = 'tab', variant }) {
  const refs = useRef([]);
  const onKeyDown = (e) => {
    const i = tabs.findIndex((t) => t.id === value);
    let next = -1;
    if (e.key === 'ArrowRight') next = (i + 1) % tabs.length;
    else if (e.key === 'ArrowLeft') next = (i - 1 + tabs.length) % tabs.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = tabs.length - 1;
    if (next < 0) return;
    e.preventDefault();
    onChange(tabs[next].id);
    refs.current[next]?.focus();
  };
  return (
    <div className={`tabs ${variant === 'pill' ? 'tabs-pill' : ''}`} role="tablist" aria-label={label} onKeyDown={onKeyDown}>
      {tabs.map((t, i) => (
        <button
          key={t.id} ref={(el) => (refs.current[i] = el)} role="tab" type="button"
          id={`${idPrefix}-${t.id}`} aria-controls={`${idPrefix}-panel-${t.id}`}
          aria-selected={value === t.id} tabIndex={value === t.id ? 0 : -1}
          className="tab" onClick={() => onChange(t.id)}
        >
          {t.icon && <t.icon size={16} aria-hidden="true" />}{t.label}
          {t.count !== undefined && <span className="count">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

export const TabPanel = ({ id, active, idPrefix = 'tab', children }) => (
  active ? <div role="tabpanel" id={`${idPrefix}-panel-${id}`} aria-labelledby={`${idPrefix}-${id}`} tabIndex={-1}>{children}</div> : null
);

// ── Confirm dialog: a promise-based replacement for window.confirm ────────────
const ConfirmContext = createContext(async () => false);
export const useConfirm = () => useContext(ConfirmContext);

export function ConfirmProvider({ children }) {
  const ref = useRef(null);
  const [opts, setOpts] = useState(null);
  const resolver = useRef(null);

  const confirm = useCallback((options) => new Promise((resolve) => {
    resolver.current = resolve;
    setOpts(options);
  }), []);

  useEffect(() => { if (opts) ref.current?.showModal(); }, [opts]);

  const close = (result) => {
    ref.current?.close();
    setOpts(null);
    resolver.current?.(result);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <dialog ref={ref} className="dialog" aria-labelledby="confirm-title" aria-describedby="confirm-body" onCancel={(e) => { e.preventDefault(); close(false); }}>
        {opts && (
          <>
            <div className="dialog-body">
              <h2 id="confirm-title">{opts.title}</h2>
              <p id="confirm-body" className="muted">{opts.body}</p>
            </div>
            <div className="dialog-actions">
              <button className="btn btn-outline" onClick={() => close(false)} autoFocus>Cancel</button>
              <button className={`btn ${opts.danger ? 'btn-danger' : 'btn-primary'}`} onClick={() => close(true)}>{opts.confirmLabel || 'Confirm'}</button>
            </div>
          </>
        )}
      </dialog>
    </ConfirmContext.Provider>
  );
}

// ── Modal: a general native <dialog> (focus trap, Esc to close, returns focus) ──
export function Modal({ open, onClose, title, children, wide }) {
  const ref = useRef(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} className="dialog" style={wide ? { width: 'min(680px, calc(100vw - 32px))' } : undefined} aria-labelledby="modal-title"
      onCancel={(e) => { e.preventDefault(); onClose(); }} onClick={(e) => { if (e.target === ref.current) onClose(); }}>
      {open && (
        <>
          <div className="dialog-body">
            <h2 id="modal-title">{title}</h2>
            {children}
          </div>
          <div className="dialog-actions"><button className="btn btn-primary" onClick={onClose} autoFocus>Close</button></div>
        </>
      )}
    </dialog>
  );
}
