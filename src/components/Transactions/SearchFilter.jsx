export default function SearchFilter({ filters, setFilters, accounts }) {
  return (
    <div className="card space-y-3">
      <input
        type="search"
        className="input-field"
        placeholder="Cari keterangan..."
        value={filters.search}
        onChange={(e) => setFilters({ ...filters, search: e.target.value })}
      />
      <div className="grid grid-cols-2 gap-2">
        <select className="input-field" value={filters.type} onChange={(e) => setFilters({ ...filters, type: e.target.value })}>
          <option value="">Semua Jenis</option>
          <option value="income">Pemasukan</option>
          <option value="expense">Pengeluaran</option>
          <option value="transfer">Transfer</option>
        </select>
        <select className="input-field" value={filters.accountId} onChange={(e) => setFilters({ ...filters, accountId: e.target.value })}>
          <option value="">Semua Rekening</option>
          {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs text-gray-500">Dari</label>
          <input type="date" className="input-field" value={filters.dateFrom} onChange={(e) => setFilters({ ...filters, dateFrom: e.target.value })} />
        </div>
        <div>
          <label className="text-xs text-gray-500">Sampai</label>
          <input type="date" className="input-field" value={filters.dateTo} onChange={(e) => setFilters({ ...filters, dateTo: e.target.value })} />
        </div>
      </div>
    </div>
  );
}
