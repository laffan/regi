import { useEffect, useRef, type ReactNode } from 'react';

interface Props {
  title: string;
  onClose: () => void;
  children: ReactNode;
  actions: ReactNode;
  /** Room for an item editor rather than a field or two. */
  wide?: boolean;
}

export function Dialog({ title, onClose, children, actions, wide }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    ref.current?.querySelector<HTMLElement>('input, button')?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="dialog-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        ref={ref}
        style={wide ? { width: 'min(640px, 100%)', maxHeight: 'calc(100vh - 32px)', overflowY: 'auto' } : undefined}
      >
        <div className="dialog-title">{title}</div>
        {children}
        <div className="dialog-actions">{actions}</div>
      </div>
    </div>
  );
}
