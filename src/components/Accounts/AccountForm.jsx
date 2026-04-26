import { useState, useEffect } from 'react';
import Modal from '../common/Modal';
import CurrencyInput from '../common/CurrencyInput';

const DEFAULT_BANKS = ['BCA', 'BRI', 'BNI', 'Mandiri', 'BSI', 'CIMB Niaga', 'Permata', 'Jago', 'Blu', 'DANA', 'GoPay', 'OVO', 'ShopeePay', 'Kas/Tunai', 'Lainnya'];

export default function AccountForm({ open, onClose, onSubmit, initial }) {
  const isEdit = !!initial;
  const [bankSelect, setBankSelect] = useState('');
  const [customName, setCustomName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [balance, setBalance] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    if (initial) {
      const known = DEFAULT_BANKS.includes(initial.name);
      setBankSelect(known ? initial.name : 'Lainnya');
      setCustomName(known ? '' : initial.name);
      setAccountNumber(initial.accountNumber || '');
      setBalance(initial.balance || 0);
    } else {
      setBankSelect('');
      setCustomName('');
      setAccountNumber('');
      setBalance(0);
    }
    setError('');
  }, [open, initial]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    const name = bankSelect === 'Lainnya' ? customName.trim() : bankSelect;
    if (!name) { setError('Nama rekening wajib diisi'); return; }
    setSubmitting(true);
    try {
      await onSubmit({ name, accountNumber, balance });
      onClose();
    } catch (e) {
      setError(e.message || 'Gagal menyimpan');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? 'Edit Rekening' : 'Tambah Rekening'}
      footer={
        <button type="submit" form="account-form" className="btn-primary w-full" disabled={submitting}>
          {submitting ? 'Menyimpan...' : 'Simpan'}
        </button>
      }
    >
      <form id="account-form" onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="label-text">Nama Bank / Dompet</label>
          <select className="input-field" value={bankSelect} onChange={(e) => setBankSelect(e.target.value)} required>
            <option value="">Pilih bank</option>
            {DEFAULT_BANKS.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
        </div>
        {bankSelect === 'Lainnya' && (
          <div>
            <label className="label-text">Nama Custom</label>
            <input type="text" className="input-field" value={customName} onChange={(e) => setCustomName(e.target.value)} placeholder="cth: Bank Jatim" />
          </div>
        )}
        <div>
          <label className="label-text">Nomor Rekening (opsional)</label>
          <input type="text" inputMode="numeric" className="input-field" value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} placeholder="cth: 1234567890" />
        </div>
        <div>
          <label className="label-text">{isEdit ? 'Saldo Saat Ini' : 'Saldo Awal'}</label>
          <CurrencyInput value={balance} onChange={setBalance} />
        </div>
        {error && <p className="text-sm text-expense">{error}</p>}
      </form>
    </Modal>
  );
}
