import { createContext, useContext, useEffect, useState } from 'react';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { hashPin, verifyPin } from '../utils/hashPin';

const AuthContext = createContext(null);
const DEFAULT_PIN = '080808';
const SETTINGS_DOC = doc(db, 'config', 'settings');

export function AuthProvider({ children }) {
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    initSettings().finally(() => setLoading(false));
  }, []);

  async function initSettings() {
    try {
      const snap = await getDoc(SETTINGS_DOC);
      if (!snap.exists()) {
        const pinHash = await hashPin(DEFAULT_PIN);
        await setDoc(SETTINGS_DOC, { pinHash, createdAt: serverTimestamp() });
      }
      setError(null);
    } catch (e) {
      console.error('Init settings error:', e);
      setError(e.message || 'Gagal terhubung ke database');
    }
  }

  async function checkPin(pin) {
    const snap = await getDoc(SETTINGS_DOC);
    if (!snap.exists()) return false;
    const { pinHash } = snap.data();
    return verifyPin(pin, pinHash);
  }

  async function unlock(pin) {
    const ok = await checkPin(pin);
    if (ok) setIsUnlocked(true);
    return ok;
  }

  function lock() {
    setIsUnlocked(false);
  }

  async function changePin(oldPin, newPin) {
    const ok = await checkPin(oldPin);
    if (!ok) throw new Error('PIN lama salah');
    if (!/^\d{6}$/.test(newPin)) throw new Error('PIN baru harus 6 digit angka');
    const pinHash = await hashPin(newPin);
    await setDoc(SETTINGS_DOC, { pinHash, updatedAt: serverTimestamp() }, { merge: true });
  }

  return (
    <AuthContext.Provider value={{ isUnlocked, loading, error, unlock, lock, changePin }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
