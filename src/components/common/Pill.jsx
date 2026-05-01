const TONES = {
  daun: 'bg-daun-soft text-daun',
  terra: 'bg-terra-soft text-terra',
  langit: 'bg-langit-soft text-langit',
  emas: 'bg-emas-soft text-emas',
  indigo: 'bg-indigo-soft text-indigo',
  neutral: 'bg-cream-deep text-ink-soft',
};

export default function Pill({ tone = 'neutral', children, className = '' }) {
  return (
    <span
      className={`text-[11px] font-semibold uppercase tracking-[0.1px] px-2.5 py-[3px] rounded-[10px] ${TONES[tone] || TONES.neutral} ${className}`}
    >
      {children}
    </span>
  );
}
