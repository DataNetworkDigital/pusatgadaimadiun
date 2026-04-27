function PadButton({ children, onClick, ariaLabel, variant = 'digit', disabled }) {
  const base =
    'h-16 rounded-2xl flex items-center justify-center select-none transition active:scale-[0.97] disabled:opacity-50 disabled:active:scale-100';
  const styles =
    variant === 'digit'
      ? 'bg-paper border border-line shadow-[0_1px_0_rgba(140,110,60,0.05)] font-display text-[28px] font-medium text-ink active:bg-cream-deep'
      : 'bg-transparent text-ink active:bg-cream-deep/60';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      className={`${base} ${styles}`}
      style={{ touchAction: 'manipulation' }}
    >
      {children}
    </button>
  );
}

function BackspaceIcon({ size = 26 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 5H8L2 12l6 7h13a1 1 0 001-1V6a1 1 0 00-1-1z" />
      <path d="M14 9l-5 6M9 9l5 6" />
    </svg>
  );
}

export default function NumPad({ onDigit, onBackspace, disabled }) {
  return (
    <div className="grid grid-cols-3 gap-3.5">
      {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
        <PadButton key={n} onClick={() => onDigit(n)} disabled={disabled} ariaLabel={`Tombol ${n}`}>
          {n}
        </PadButton>
      ))}
      <div aria-hidden />
      <PadButton onClick={() => onDigit(0)} disabled={disabled} ariaLabel="Tombol 0">
        0
      </PadButton>
      <PadButton variant="action" onClick={onBackspace} disabled={disabled} ariaLabel="Hapus angka terakhir">
        <BackspaceIcon />
      </PadButton>
    </div>
  );
}
