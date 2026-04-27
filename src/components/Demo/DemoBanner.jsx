export default function DemoBanner() {
  return (
    <div className="sticky top-0 z-40 bg-emas h-[26px] flex items-center justify-center gap-2 px-4 shadow-[0_1px_0_rgba(140,110,60,0.2)]">
      <span
        className="w-1.5 h-1.5 rounded-full bg-cream"
        style={{ boxShadow: '0 0 0 2px #C9952F, 0 0 0 3px rgba(255,255,255,0.4)' }}
      />
      <span className="text-[11px] font-bold text-cream uppercase tracking-[0.6px]">Mode Demo</span>
      <span className="text-[11px] text-cream/90">· Data tidak disimpan</span>
    </div>
  );
}
