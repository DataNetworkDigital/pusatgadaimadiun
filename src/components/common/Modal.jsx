import { useEffect } from 'react';

export default function Modal({ open, onClose, title, subtitle, children, footer, size = 'md' }) {
  useEffect(() => {
    if (!open) return;
    const orig = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = orig;
    };
  }, [open]);

  if (!open) return null;

  const widthClass =
    size === 'sm' ? 'sm:max-w-sm' : size === 'lg' ? 'sm:max-w-lg' : 'sm:max-w-md';

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      role="dialog"
      aria-modal="true"
    >
      <div
        className="absolute inset-0 bg-ink/45 animate-[fade-in_0.2s_ease-out]"
        onClick={onClose}
      />
      <div
        className={`relative bg-cream w-full ${widthClass} rounded-t-[24px] sm:rounded-[24px] shadow-sheet max-h-[92svh] flex flex-col animate-[slideUp_0.25s_ease-out] sm:animate-fade-in`}
      >
        <div className="px-5 pt-3 pb-2 flex-shrink-0">
          <div className="w-10 h-1 bg-line rounded-full mx-auto mb-3.5 sm:hidden" aria-hidden />
          {title && (
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <h2 className="font-display text-[22px] font-semibold text-ink m-0 leading-tight">
                  {title}
                </h2>
                {subtitle && (
                  <p className="text-[14px] text-ink-soft mt-1">{subtitle}</p>
                )}
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Tutup"
                className="text-ink-mute text-[28px] leading-none w-9 h-9 flex items-center justify-center rounded-full active:bg-cream-deep flex-shrink-0 -mt-1"
              >
                ×
              </button>
            </div>
          )}
        </div>
        <div className="px-5 py-3 overflow-y-auto flex-1">{children}</div>
        {footer && (
          <div className="px-5 pt-3 pb-6 sm:pb-5 flex-shrink-0 safe-bottom">{footer}</div>
        )}
      </div>
    </div>
  );
}
