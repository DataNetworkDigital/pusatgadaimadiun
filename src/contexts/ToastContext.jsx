import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

const ToastContext = createContext({ showToast: () => {} });

const DEFAULT_DURATION = 2400;

export function ToastProvider({ children }) {
  const [toast, setToast] = useState(null);
  const timerRef = useRef(null);

  const dismiss = useCallback(() => {
    setToast(null);
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const showToast = useCallback((msg, opts = {}) => {
    if (!msg) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    setToast({ msg, tone: opts.tone || 'default', id: Date.now() });
    timerRef.current = setTimeout(() => {
      setToast(null);
      timerRef.current = null;
    }, opts.duration || DEFAULT_DURATION);
  }, []);

  useEffect(() => () => timerRef.current && clearTimeout(timerRef.current), []);

  return (
    <ToastContext.Provider value={{ showToast, dismiss }}>
      {children}
      {toast && (
        <div
          key={toast.id}
          role="status"
          aria-live="polite"
          className="fixed left-1/2 bottom-[100px] sm:bottom-12 -translate-x-1/2 z-[60] bg-ink text-cream px-[18px] py-3 rounded-[14px] shadow-toast text-[14px] font-medium max-w-[80%] text-center pointer-events-none"
          style={{ animation: 'toastIn 0.2s ease-out' }}
        >
          {toast.msg}
        </div>
      )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
