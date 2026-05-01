import { DEMO_CONFIG } from '../../config/demo';
import BatikPattern from '../common/BatikPattern';
import { IcMail } from '../common/icons';

export default function DemoCTA() {
  return (
    <a
      href={DEMO_CONFIG.ctaEmail}
      target="_blank"
      rel="noopener noreferrer"
      className="block bg-indigo text-cream rounded-2xl px-4 py-3.5 relative overflow-hidden shadow-cta active:bg-indigo-deep transition"
    >
      <BatikPattern opacity={0.08} color="#F8F1E2" />
      <div className="relative z-[1] flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <div className="font-display text-[14px] font-bold text-cream leading-tight">
            Mau aplikasi seperti ini?
          </div>
          <div className="text-[12px] text-cream/85 mt-0.5 truncate">
            Hubungi {DEMO_CONFIG.companyName.replace(/\s*\(.*\)\s*/, '')} ·{' '}
            {DEMO_CONFIG.ctaEmail.replace(/^mailto:/, '')}
          </div>
        </div>
        <div className="w-9 h-9 rounded-[10px] bg-cream text-indigo flex items-center justify-center flex-shrink-0">
          <IcMail size={16} sw={2} />
        </div>
      </div>
    </a>
  );
}
