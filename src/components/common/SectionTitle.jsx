export default function SectionTitle({ children, action, className = '' }) {
  return (
    <div className={`flex items-baseline justify-between px-1 mb-2.5 ${className}`}>
      <h3 className="font-display text-[19px] font-semibold text-ink m-0 tracking-tight">
        {children}
      </h3>
      {action}
    </div>
  );
}
