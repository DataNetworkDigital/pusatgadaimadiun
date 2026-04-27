import { DEMO_CONFIG } from '../../config/demo';

export default function DemoCTA() {
  return (
    <div className="card bg-gradient-to-br from-indigo-700 to-indigo-900 text-white border-none shadow-lg">
      <div className="space-y-1">
        <h3 className="text-base font-bold">Butuh aplikasi seperti ini untuk bisnis kamu?</h3>
        <p className="text-sm text-indigo-100">
          Hubungi <span className="font-semibold">{DEMO_CONFIG.companyName}</span> — {DEMO_CONFIG.tagline}.
        </p>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <a
          href={DEMO_CONFIG.ctaWhatsApp}
          target="_blank"
          rel="noopener noreferrer"
          className="bg-white text-indigo-700 rounded-lg py-2 text-sm font-semibold text-center active:opacity-80"
        >
          Hubungi Kami
        </a>
        <a
          href={DEMO_CONFIG.ctaWebsite}
          target="_blank"
          rel="noopener noreferrer"
          className="bg-indigo-600/40 text-white border border-white/30 rounded-lg py-2 text-sm font-semibold text-center active:opacity-80"
        >
          Lihat Portfolio
        </a>
      </div>
    </div>
  );
}
