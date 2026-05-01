import { IcPlus } from './icons';

export default function FAB({ onClick, ariaLabel = 'Tambah', icon }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className="fixed bottom-24 right-4 sm:bottom-8 sm:right-8 w-[60px] h-[60px] rounded-[22px] bg-indigo text-cream flex items-center justify-center shadow-cta active:bg-indigo-deep transition z-20 safe-bottom"
      style={{ boxShadow: '0 6px 18px rgba(45,74,107,0.32), 0 2px 4px rgba(45,74,107,0.18)' }}
    >
      {icon || <IcPlus size={28} sw={2.2} />}
    </button>
  );
}
