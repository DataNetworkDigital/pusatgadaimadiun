import { useState } from 'react';
import Modal from '../common/Modal';
import { useAuth } from '../../contexts/AuthContext';

export default function ChangePinForm({ open, onClose }) {
  const { changePin } = useAuth();
  const [oldPin, setOldPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setError(''); setSuccess('');
    if (!/^\d{6}$/.test(oldPin)) { setError('PIN lama harus 6 digit angka'); return; }
    if (!/^\d{6}$/.test(newPin)) { setError('PIN baru harus 6 digit angka'); return; }
    if (newPin !== confirmPin) { setError('Konfirmasi PIN tidak cocok'); return; }
    setSubmitting(true);
    try {
      await changePin(oldPin, newPin);
      setSuccess('PIN berhasil diubah');
      setOldPin(''); setNewPin(''); setConfirmPin('');
      setTimeout(() => { setSuccess(''); onClose(); }, 1200);
    } catch (e) {
      setError(e.message || 'Gagal mengubah PIN');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Ganti PIN"
      footer={
        <button type="submit" form="pin-form" className="btn-primary w-full" disabled={submitting}>
          {submitting ? 'Memproses...' : 'Simpan'}
        </button>
      }
    >
      <form id="pin-form" onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="label-text">PIN Lama</label>
          <input type="password" inputMode="numeric" maxLength={6} pattern="\d{6}" className="input-field tracking-widest text-center" value={oldPin} onChange={(e) => setOldPin(e.target.value.replace(/\D/g, ''))} />
        </div>
        <div>
          <label className="label-text">PIN Baru</label>
          <input type="password" inputMode="numeric" maxLength={6} pattern="\d{6}" className="input-field tracking-widest text-center" value={newPin} onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ''))} />
        </div>
        <div>
          <label className="label-text">Konfirmasi PIN Baru</label>
          <input type="password" inputMode="numeric" maxLength={6} pattern="\d{6}" className="input-field tracking-widest text-center" value={confirmPin} onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ''))} />
        </div>
        {error && <p className="text-sm text-expense">{error}</p>}
        {success && <p className="text-sm text-income">{success}</p>}
      </form>
    </Modal>
  );
}
