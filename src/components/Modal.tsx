import { useEffect, type ReactNode } from 'react';
import { X } from 'lucide-react';

interface Props {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  icon?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  width?: string;
}

export function Modal({ open, onClose, title, icon, children, footer, width = 'max-w-2xl' }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-3 backdrop-blur-[2px] sm:p-6"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div role="dialog" aria-modal="true" className={`chalk-card flex max-h-[90vh] w-full ${width} flex-col`}>
        <div className="flex items-center gap-3 border-b border-chalk/20 px-4 py-3">
          {icon && <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-chalk/30 bg-subtle text-chalk">{icon}</span>}
          <h2 className="min-w-0 flex-1 truncate text-lg font-bold tracking-wide text-chalk">{title}</h2>
          <button className="btn btn-ghost !p-1" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">{children}</div>
        {footer && <div className="border-t border-chalk/20 px-4 py-3">{footer}</div>}
      </div>
    </div>
  );
}
