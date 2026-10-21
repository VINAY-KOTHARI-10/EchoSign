'use client';

// A pop-up dialog. Closing it goes "back" in history, which removes the intercepted route and shows the list again.
// Escape closes it, focus moves into it when it opens, and the page behind does not scroll.
import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

export default function Modal({ children, closeLabel = 'Close' }) {
  const router = useRouter();
  const panel = useRef(null);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') router.back(); };
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panel.current?.focus();
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = previous; };
  }, [router]);

  return (
    <div className="modal-scrim" onClick={() => router.back()}>
      <div ref={panel} tabIndex={-1} role="dialog" aria-modal="true" className="modal-panel" onClick={(e) => e.stopPropagation()}>
        <button type="button" onClick={() => router.back()} className="btn btn-outline btn-sm modal-close">✕ {closeLabel}</button>
        {children}
      </div>
    </div>
  );
}
