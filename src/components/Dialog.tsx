import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';

export function Dialog({ title, children, onClose, className = '', active = true }: { title: string; children: ReactNode; onClose?: () => void; className?: string; active?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!active) return;
    const previous = document.activeElement as HTMLElement | null;
    const dialog = ref.current!;
    const focusable = () => [...dialog.querySelectorAll<HTMLElement>('button:not(:disabled), input, [tabindex="0"]')];
    (focusable()[0] || dialog).focus({ preventScroll: true });
    const keydown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && closeRef.current) { e.preventDefault(); e.stopPropagation(); closeRef.current(); }
      if (e.key !== 'Tab') return;
      const items = focusable();
      const first = items[0], last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
      if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
    };
    dialog.addEventListener('keydown', keydown);
    return () => { dialog.removeEventListener('keydown', keydown); if (previous?.isConnected) previous.focus({ preventScroll: true }); };
  }, [active]);
  return <div className="dialog-backdrop" inert={!active || undefined} aria-hidden={!active || undefined}><div ref={ref} className={`dialog ${className}`} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1}>{children}</div></div>;
}
