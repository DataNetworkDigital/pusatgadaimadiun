export default function PageHeader({ title, subtitle, action, className = '' }) {
  return (
    <div className={`flex items-center gap-3 py-4 ${className}`}>
      <div className="flex-1 min-w-0">
        <h1 className="font-display text-[26px] font-semibold text-ink leading-tight tracking-[-0.4px]">
          {title}
        </h1>
        {subtitle && <div className="text-sm text-ink-soft mt-1">{subtitle}</div>}
      </div>
      {action}
    </div>
  );
}
