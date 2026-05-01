export default function IconButton({
  onClick,
  variant = 'default',
  active = false,
  ariaLabel,
  className = '',
  children,
}) {
  const base = 'w-10 h-10 rounded-xl flex items-center justify-center transition active:scale-[0.97]';
  let style = '';
  if (variant === 'primary') {
    style = 'bg-indigo border border-indigo text-cream active:bg-indigo-deep';
  } else if (active) {
    style = 'bg-indigo-soft border border-indigo text-indigo';
  } else {
    style = 'bg-paper border border-line text-ink active:bg-cream-deep';
  }
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className={`${base} ${style} ${className}`}
    >
      {children}
    </button>
  );
}
