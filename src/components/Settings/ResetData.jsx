import { useState } from 'react';
import Modal from '../common/Modal';
import { useData } from '../../contexts/DataContext';

const CONFIRM_TEXT = 'HAPUS SEMUA';

export default function ResetData({ open, onClose }) {
  const { resetAllData } = useData();
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function handleConfirm() {
    if (text !== CONFIRM_TEXT) { setError(`Ketik "${CONFIRM_TEXT}" untuk konfirmasi`); return; }
    setSubmitting(true);
    try {
      await resetAllData();
      setText('');
      onClose();
    } catch (e) {
      setError(e.message || 'Gagal');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Reset Semua Data"
      footer={
        <button type="button" onClick={handleConfirm} className="btn-danger w-full" disabled={submitting || text !== CONFIRM_TEXT}>
          {submitting ? 'Menghapus...' : 'Hapus Semua Data'}
        </button>
      }
    >
      <div className="space-y-4">
        <div className="bg-expense-bg border border-expense/30 rounded-lg p-3 text-sm text-expense">
          ⚠️ Semua rekening, transaksi, utang, piutang, dan reminder akan dihapus permanen. Tindakan ini tidak bisa dibatalkan.
        </div>
        <div>
          <label className="label-text">Ketik "{CONFIRM_TEXT}" untuk konfirmasi</label>
          <input type="text" className="input-field" value={text} onChange={(e) => { setText(e.target.value); setError(''); }} placeholder={CONFIRM_TEXT} />
        </div>
        {error && <p className="text-sm text-expense">{error}</p>}
      </div>
    </Modal>
  );
}
