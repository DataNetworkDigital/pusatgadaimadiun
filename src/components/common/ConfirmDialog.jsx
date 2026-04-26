import Modal from './Modal';

export default function ConfirmDialog({ open, onClose, onConfirm, title, message, confirmLabel = 'Hapus', confirmVariant = 'danger' }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title || 'Konfirmasi'}
      footer={
        <div className="flex gap-2">
          <button type="button" className="btn-secondary flex-1" onClick={onClose}>Batal</button>
          <button
            type="button"
            className={confirmVariant === 'danger' ? 'btn-danger flex-1' : 'btn-primary flex-1'}
            onClick={() => { onConfirm(); onClose(); }}
          >
            {confirmLabel}
          </button>
        </div>
      }
    >
      <p className="text-gray-700 text-sm">{message}</p>
    </Modal>
  );
}
