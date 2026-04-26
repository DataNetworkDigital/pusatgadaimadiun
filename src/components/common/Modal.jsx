import { useEffect } from 'react';

export default function Modal({ open, onClose, title, children, footer }) {
  useEffect(() => {
    if (!open) return;
    const orig = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = orig; };
  }, [open]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" role="dialog">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-xl animate-fade-in max-h-[92svh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 sticky top-0 bg-white rounded-t-2xl">
          <h2 className="font-semibold text-gray-900">{title}</h2>
          <button type="button" onClick={onClose} className="text-gray-400 text-2xl leading-none w-8 h-8 flex items-center justify-center">×</button>
        </div>
        <div className="px-5 py-4 overflow-y-auto flex-1">
          {children}
        </div>
        {footer && (
          <div className="px-5 py-3 border-t border-gray-100 bg-gray-50 sm:rounded-b-2xl">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
