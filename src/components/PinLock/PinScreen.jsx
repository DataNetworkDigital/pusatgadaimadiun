import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import NumPad from './NumPad';
import KawungMark from '../common/KawungMark';
import BatikPattern from '../common/BatikPattern';
import { useAuth } from '../../contexts/AuthContext';

const LOCKOUT_MS = 30000;
const MAX_ATTEMPTS = 5;

export default function PinScreen() {
  const { unlock, loading, error: authError } = useAuth();
  const navigate = useNavigate();
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [shake, setShake] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [lockedUntil, setLockedUntil] = useState(0);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const isLocked = lockedUntil > now;
  const lockSeconds = Math.max(0, Math.ceil((lockedUntil - now) / 1000));

  useEffect(() => {
    if (pin.length === 6 && !isLocked) {
      verify(pin);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin, isLocked]);

  async function verify(value) {
    try {
      const ok = await unlock(value);
      if (!ok) {
        setShake(true);
        setError('PIN salah');
        const next = attempts + 1;
        setAttempts(next);
        setTimeout(() => {
          setShake(false);
          setPin('');
        }, 400);
        if (next >= MAX_ATTEMPTS) {
          setLockedUntil(Date.now() + LOCKOUT_MS);
          setAttempts(0);
          setError(`Terlalu banyak percobaan. Tunggu ${LOCKOUT_MS / 1000} detik.`);
        }
      }
    } catch (e) {
      setError(e.message || 'Gagal memverifikasi PIN');
      setPin('');
    }
  }

  function handleDigit(d) {
    if (isLocked || loading) return;
    setError('');
    setPin((p) => (p.length < 6 ? p + String(d) : p));
  }

  function handleBackspace() {
    if (isLocked || loading) return;
    setPin((p) => p.slice(0, -1));
  }

  const statusText = loading
    ? 'Menghubungkan...'
    : isLocked
    ? `Terkunci ${lockSeconds} detik`
    : error || authError || '';

  return (
    <div className="min-h-[100svh] flex flex-col bg-cream relative overflow-hidden safe-top safe-bottom">
      <BatikPattern opacity={0.05} color="#2D4A6B" />

      <div className="flex-1 flex flex-col items-center justify-center px-8 pt-12 relative z-10">
        <KawungMark size={72} color="#2D4A6B" bg="#FFFCF5" />

        <h1 className="font-display text-[26px] font-semibold text-ink mt-5 mb-1 tracking-tight">
          Pusat Gadai Madiun
        </h1>
        <p className="text-[15px] text-ink-soft text-center leading-snug max-w-[280px]">
          PIN hanya untuk pengguna asli. Untuk demo, lewati saja.
        </p>

        <div className={`flex gap-3.5 mt-11 ${shake ? 'animate-shake' : ''}`}>
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className={`w-4 h-4 rounded-full border-2 transition-colors duration-150 ${
                i < pin.length ? 'bg-indigo border-indigo' : 'bg-transparent border-kayu'
              }`}
            />
          ))}
        </div>

        <div className="h-6 mt-5 text-xs text-terra font-medium" aria-live="polite">
          {statusText}
        </div>
      </div>

      <div className="px-6 pb-7 relative z-10">
        <NumPad onDigit={handleDigit} onBackspace={handleBackspace} disabled={loading || isLocked} />

        <button
          type="button"
          onClick={() => navigate('/demo')}
          className="w-full mt-[18px] py-3.5 px-4 bg-indigo text-cream rounded-[14px] font-semibold text-[15px] tracking-wide flex items-center justify-center gap-2 shadow-cta active:bg-indigo-deep transition"
        >
          <span
            className="w-[7px] h-[7px] rounded-full bg-emas"
            style={{ boxShadow: '0 0 0 2px #2D4A6B, 0 0 0 3px rgba(255,255,255,0.4)' }}
          />
          Lanjut ke Mode Demo
        </button>
        <p className="text-center text-[11px] text-ink-mute mt-2.5 leading-snug">
          Mode demo memuat data contoh. Tidak menyimpan apa-apa.
        </p>
      </div>
    </div>
  );
}
