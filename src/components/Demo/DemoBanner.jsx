export default function DemoBanner() {
  return (
    <div className="sticky top-0 z-40 bg-amber-50 border-b border-amber-500/60 text-amber-900">
      <div className="max-w-3xl mx-auto px-4 py-2 text-[13px] flex items-center justify-center gap-2 text-center">
        <span className="font-semibold">MODE DEMO</span>
        <span className="hidden sm:inline">— Data di-reset otomatis setiap hari · Coba tambah, edit, hapus sesuka hati</span>
        <span className="sm:hidden">— Data reset harian</span>
      </div>
    </div>
  );
}
