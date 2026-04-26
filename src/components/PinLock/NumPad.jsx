function PadButton({ value, onTap, children, variant = 'digit', disabled }) {
  return (
    <button
      type="button"
      onClick={() => onTap(value)}
      disabled={disabled}
      className={
        'w-full aspect-square rounded-full font-semibold transition active:scale-95 select-none ' +
        (variant === 'digit'
          ? 'bg-white text-gray-900 text-3xl shadow-sm border border-gray-100 active:bg-gray-100'
          : variant === 'action'
          ? 'bg-transparent text-gray-600 text-sm active:bg-gray-100'
          : 'invisible')
      }
      style={{ touchAction: 'manipulation' }}
    >
      {children ?? value}
    </button>
  );
}

export default function NumPad({ onDigit, onBackspace, onClear, disabled }) {
  return (
    <div className="grid grid-cols-3 gap-3 sm:gap-4 max-w-xs mx-auto w-full">
      {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
        <PadButton key={n} value={n} onTap={onDigit} disabled={disabled} />
      ))}
      <PadButton value={null} variant="action" onTap={onClear} disabled={disabled}>
        Hapus
      </PadButton>
      <PadButton value={0} onTap={onDigit} disabled={disabled} />
      <PadButton value={null} variant="action" onTap={onBackspace} disabled={disabled}>
        ⌫
      </PadButton>
    </div>
  );
}
