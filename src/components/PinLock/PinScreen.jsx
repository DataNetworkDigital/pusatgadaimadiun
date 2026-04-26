import { useEffect, useState } from 'react';
import NumPad from './NumPad';
import { useAuth } from '../../contexts/AuthContext';
import { hashPin } from '../../utils/hashPin';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../firebase';

const LOCKOUT_MS = 30000;
const MAX_ATTEMPTS = 5;

export default function PinScreen() {
  const { unlock, loading, error: authError } = useAuth();
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [shake, setShake] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [lockedUntil, setLockedUntil] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [isDefaultPin, setIsDefaultPin] = useState(false);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'config', 'settings'));
        if (snap.exists()) {
          const defaultHash = await hashPin('080808');
          setIsDefaultPin(snap.data().pinHash === defaultHash);
        }
      } catch {}
    })();
  }, [loading]);

  const isLocked = lockedUntil > now;
  const lockSeconds = Math.max(0, Math.ceil((lockedUntil - now) / 1000));

  useEffect(() => {
    if (pin.length === 6 && !isLocked) {
      verify(pin);
    }
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
    if (isLocked) return;
    setError('');
    setPin((p) => (p.length < 6 ? p + String(d) : p));
  }

  function handleBackspace() {
    if (isLocked) return;
    setPin((p) => p.slice(0, -1));
  }

  function handleClear() {
    if (isLocked) return;
    setPin('');
  }

  return (
    <div className="min-h-[100svh] flex flex-col items-center justify-between bg-gradient-to-b from-primary-50 to-white px-6 pt-12 pb-8 safe-top safe-bottom">
      <div className="flex flex-col items-center w-full max-w-sm">
        <div className="w-16 h-16 rounded-2xl bg-primary flex items-center justify-center text-white text-2xl font-extrabold shadow-lg mb-4">
          ₽
        </div>
        <h1 className="text-2xl font-bold text-gray-900">Pusat Gadai Madiun</h1>
        <p className="text-gray-500 text-sm mt-1">Masukkan PIN untuk masuk</p>

        <div className={`flex gap-3 mt-10 ${shake ? 'animate-shake' : ''}`}>
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className={
                'w-3.5 h-3.5 rounded-full transition ' +
                (i < pin.length ? 'bg-primary scale-110' : 'bg-gray-300')
              }
            />
          ))}
        </div>

        <div className="h-6 mt-4 text-sm text-expense font-medium">
          {loading ? 'Menghubungkan...' : isLocked ? `Terkunci ${lockSeconds} detik` : error || authError || ''}
        </div>
      </div>

      <div className="w-full max-w-sm">
        <NumPad
          onDigit={handleDigit}
          onBackspace={handleBackspace}
          onClear={handleClear}
          disabled={loading || isLocked}
        />
        {isDefaultPin && (
          <p className="text-center text-xs text-gray-400 mt-6">PIN default: 080808 (segera ganti di Pengaturan)</p>
        )}
      </div>
    </div>
  );
}
