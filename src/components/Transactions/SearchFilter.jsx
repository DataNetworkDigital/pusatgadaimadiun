import Modal from '../common/Modal';

export default function FilterSheet({ open, onClose, filters, setFilters, accounts, onClear }) {
  function update(patch) {
    setFilters((f) => ({ ...f, ...patch }));
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Filter Transaksi"
      footer={
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClear}
            className="flex-1 py-3 rounded-xl border border-line bg-paper text-ink-soft font-semibold text-sm active:bg-cream-deep"
          >
            Reset
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-3 rounded-xl bg-indigo text-cream font-semibold text-sm active:bg-indigo-deep"
          >
            Terapkan
          </button>
        </div>
      }
    >
      <div className="space-y-5">
        <div>
          <label className="block text-[12px] font-semibold text-ink-mute uppercase tracking-[0.3px] mb-2">
            Cari Keterangan
          </label>
          <input
            type="search"
            className="w-full bg-paper border border-line rounded-xl px-4 py-3 text-[14px] text-ink placeholder-ink-mute focus:outline-none focus:border-indigo focus:ring-2 focus:ring-indigo-soft"
            placeholder="cth: belanja"
            value={filters.search}
            onChange={(e) => update({ search: e.target.value })}
          />
        </div>

        <div>
          <label className="block text-[12px] font-semibold text-ink-mute uppercase tracking-[0.3px] mb-2">
            Jenis
          </label>
          <div className="grid grid-cols-4 gap-2">
            {[
              { v: '', l: 'Semua' },
              { v: 'income', l: 'Masuk' },
              { v: 'expense', l: 'Keluar' },
              { v: 'transfer', l: 'Transfer' },
            ].map((opt) => (
              <button
                key={opt.v || 'all'}
                type="button"
                onClick={() => update({ type: opt.v })}
                className={
                  'py-2 rounded-xl border text-[13px] font-semibold transition ' +
                  (filters.type === opt.v
                    ? 'bg-indigo border-indigo text-cream'
                    : 'bg-paper border-line text-ink-soft active:bg-cream-deep')
                }
              >
                {opt.l}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-[12px] font-semibold text-ink-mute uppercase tracking-[0.3px] mb-2">
            Rekening
          </label>
          <select
            className="w-full bg-paper border border-line rounded-xl px-4 py-3 text-[14px] text-ink focus:outline-none focus:border-indigo focus:ring-2 focus:ring-indigo-soft"
            value={filters.accountId}
            onChange={(e) => update({ accountId: e.target.value })}
          >
            <option value="">Semua rekening</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[12px] font-semibold text-ink-mute uppercase tracking-[0.3px] mb-2">
              Dari
            </label>
            <input
              type="date"
              className="w-full bg-paper border border-line rounded-xl px-3 py-3 text-[14px] text-ink focus:outline-none focus:border-indigo focus:ring-2 focus:ring-indigo-soft"
              value={filters.dateFrom}
              onChange={(e) => update({ dateFrom: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-[12px] font-semibold text-ink-mute uppercase tracking-[0.3px] mb-2">
              Sampai
            </label>
            <input
              type="date"
              className="w-full bg-paper border border-line rounded-xl px-3 py-3 text-[14px] text-ink focus:outline-none focus:border-indigo focus:ring-2 focus:ring-indigo-soft"
              value={filters.dateTo}
              onChange={(e) => update({ dateTo: e.target.value })}
            />
          </div>
        </div>
      </div>
    </Modal>
  );
}
