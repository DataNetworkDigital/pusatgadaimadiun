import { useMemo, useState } from 'react';
import { useData } from '../../contexts/DataContext';
import PageHeader from '../common/PageHeader';
import IconButton from '../common/IconButton';
import Card from '../common/Card';
import Modal from '../common/Modal';
import ProjectCard from './ProjectCard';
import ProjectForm from './ProjectForm';
import ExportSheet from './ExportSheet';
import PeriodPickerSheet, { resolvePeriod } from './PeriodPickerSheet';
import { formatCurrency } from '../../utils/formatCurrency';
import { projectSummary } from '../../utils/projectSchedule';
import { exportProjectsToExcel, exportProjectsToPdf } from '../../utils/projectExport';
import { toDate, formatDate } from '../../utils/formatDate';
import { IcPlus, IcDownload, IcChevronRight, IcSearch, IcSort, IcCheck } from '../common/icons';

const SORT_OPTIONS = [
  { id: 'start-asc', label: 'Tanggal mulai terlama' },
  { id: 'start-desc', label: 'Tanggal mulai terbaru' },
  { id: 'name-asc', label: 'Nama A–Z' },
  { id: 'name-desc', label: 'Nama Z–A' },
  { id: 'modal-desc', label: 'Modal terbesar' },
  { id: 'modal-asc', label: 'Modal terkecil' },
  { id: 'default', label: 'Terbaru ditambah' },
];

export default function ProjectList() {
  const { projects, accounts, addProject } = useData();
  const [tab, setTab] = useState('active');
  const [formOpen, setFormOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [period, setPeriod] = useState({ id: 'this-month' });
  const [periodOpen, setPeriodOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('start-asc');
  const [sortOpen, setSortOpen] = useState(false);
  const range = useMemo(() => resolvePeriod(period), [period]);

  const active = useMemo(() => projects.filter((p) => p.status === 'active'), [projects]);
  const archived = useMemo(
    () => projects.filter((p) => p.status === 'completed' || p.status === 'default'),
    [projects]
  );
  const list = tab === 'active' ? active : archived;

  const displayList = useMemo(() => {
    const q = search.trim().toLowerCase();
    let arr = q
      ? list.filter(
          (p) =>
            (p.name || '').toLowerCase().includes(q) ||
            (p.ownerName || '').toLowerCase().includes(q)
        )
      : list;
    const startMs = (p) => { const d = toDate(p.startDate); return d ? d.getTime() : 0; };
    const modal = (p) => Number(p.disbursedAmount) || 0;
    arr = [...arr];
    switch (sort) {
      case 'name-asc': arr.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'id')); break;
      case 'name-desc': arr.sort((a, b) => (b.name || '').localeCompare(a.name || '', 'id')); break;
      case 'start-desc': arr.sort((a, b) => startMs(b) - startMs(a)); break;
      case 'start-asc': arr.sort((a, b) => startMs(a) - startMs(b)); break;
      case 'modal-desc': arr.sort((a, b) => modal(b) - modal(a)); break;
      case 'modal-asc': arr.sort((a, b) => modal(a) - modal(b)); break;
      default: break; // keep original (createdAt desc) order
    }
    return arr;
  }, [list, search, sort]);

  const activeSortLabel = SORT_OPTIONS.find((o) => o.id === sort)?.label;

  const totals = useMemo(() => {
    let modal = 0;
    let expectedRemaining = 0;
    active.forEach((p) => {
      modal += Number(p.disbursedAmount) || 0;
      expectedRemaining += projectSummary(p).expectedRemaining;
    });
    return { modal, expectedRemaining };
  }, [active]);

  const periodReturn = useMemo(() => {
    let received = 0;
    let pending = 0;
    let receivedCount = 0;
    projects.forEach((p) => {
      (p.payments || []).forEach((pay) => {
        const due = toDate(pay.dueDate);
        const recv = toDate(pay.receivedDate);
        const inRangeRecv = recv && (!range.from || recv >= range.from) && (!range.to || recv <= range.to);
        const inRangeDue = due && (!range.from || due >= range.from) && (!range.to || due <= range.to);
        if (inRangeRecv) {
          received += pay.receivedAmount || 0;
          receivedCount += 1;
        }
        if (inRangeDue && pay.receivedAmount == null) {
          pending += pay.expectedAmount || 0;
        }
      });
    });
    return { received, pending, receivedCount };
  }, [projects, range]);

  return (
    <div>
      <PageHeader
        title="Project"
        subtitle={`${active.length} aktif · ${archived.length} riwayat`}
        action={
          <div className="flex items-center gap-2">
            {projects.length > 0 && (
              <IconButton onClick={() => setExportOpen(true)} ariaLabel="Export project">
                <IcDownload size={18} sw={1.9} />
              </IconButton>
            )}
            <IconButton variant="primary" onClick={() => setFormOpen(true)} ariaLabel="Tambah project">
              <IcPlus size={20} sw={2.2} />
            </IconButton>
          </div>
        }
      />

      <div className="bg-cream-deep rounded-[14px] p-1 flex gap-1 mb-4">
        {[
          { id: 'active', label: 'Aktif' },
          { id: 'archived', label: 'Riwayat' },
        ].map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={
              'flex-1 py-2.5 rounded-[10px] text-[14px] font-semibold transition ' +
              (tab === t.id
                ? 'bg-paper text-indigo shadow-[0_1px_3px_rgba(140,110,60,0.1)]'
                : 'bg-transparent text-ink-soft')
            }
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'active' && active.length > 0 && (
        <>
          <Card className="mb-3">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <div className="text-[12px] text-ink-mute uppercase tracking-[0.3px] font-medium">
                  Modal Aktif
                </div>
                <div
                  className="font-display text-[20px] font-semibold text-ink mt-0.5"
                  style={{ fontVariantNumeric: 'tabular-nums' }}
                >
                  {formatCurrency(totals.modal)}
                </div>
              </div>
              <div>
                <div className="text-[12px] text-ink-mute uppercase tracking-[0.3px] font-medium">
                  Ekspektasi Belum Cair
                </div>
                <div
                  className="font-display text-[20px] font-semibold text-daun mt-0.5"
                  style={{ fontVariantNumeric: 'tabular-nums' }}
                >
                  {formatCurrency(totals.expectedRemaining)}
                </div>
              </div>
            </div>
          </Card>

          <Card className="mb-3.5 !bg-daun-soft !border-daun/30">
            <button
              type="button"
              onClick={() => setPeriodOpen(true)}
              className="w-full flex items-center justify-between gap-2 -mx-1 -mt-0.5 mb-2 active:opacity-80"
            >
              <div className="text-[12px] text-daun uppercase tracking-[0.3px] font-semibold">
                Return · {range.label}
                {range.from && range.to && period.id === 'custom'
                  ? ` (${formatDate(range.from, { short: true })} – ${formatDate(range.to, {
                      short: true,
                    })})`
                  : ''}
              </div>
              <span className="text-[11px] text-daun font-semibold flex items-center gap-0.5">
                Ubah <IcChevronRight size={12} stroke="#5C8A4E" sw={2.4} />
              </span>
            </button>
            <div className="flex items-baseline justify-between gap-3">
              <div className="min-w-0">
                <div
                  className="font-display text-[24px] font-semibold text-daun break-words"
                  style={{ fontVariantNumeric: 'tabular-nums' }}
                >
                  {formatCurrency(periodReturn.received)}
                </div>
                <div className="text-[11px] text-ink-mute mt-0.5">
                  {periodReturn.receivedCount} pembayaran diterima
                </div>
              </div>
              <div className="text-right flex-shrink-0">
                <div className="text-[11px] text-ink-mute uppercase tracking-[0.3px] font-semibold">
                  Belum cair
                </div>
                <div
                  className={`font-num text-[15px] font-semibold mt-0.5 ${
                    periodReturn.pending > 0 ? 'text-emas' : 'text-ink-mute'
                  }`}
                  style={{ fontVariantNumeric: 'tabular-nums' }}
                >
                  {formatCurrency(periodReturn.pending)}
                </div>
              </div>
            </div>
          </Card>
        </>
      )}

      {list.length > 0 && (
        <div className="flex items-center gap-2 mb-3">
          <div className="relative flex-1">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-mute pointer-events-none">
              <IcSearch size={16} sw={2} />
            </span>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari project…"
              className="w-full bg-paper border border-line rounded-xl pl-9 pr-3 py-2.5 text-[14px] text-ink placeholder-ink-mute focus:outline-none focus:border-indigo focus:ring-2 focus:ring-indigo-soft"
            />
          </div>
          <button
            type="button"
            onClick={() => setSortOpen(true)}
            aria-label="Urutkan project"
            className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl bg-paper border border-line text-ink-soft active:bg-cream-deep flex-shrink-0"
          >
            <IcSort size={16} sw={2} />
            <span className="text-[13px] font-medium">Urut</span>
          </button>
        </div>
      )}

      {list.length === 0 ? (
        <div className="py-16 px-5 text-center">
          <div className="text-4xl mb-3">💼</div>
          <h3 className="font-display text-[18px] font-semibold text-ink">
            {tab === 'active' ? 'Belum ada project aktif' : 'Belum ada riwayat project'}
          </h3>
          <p className="text-sm text-ink-mute mt-2 max-w-xs mx-auto">
            {tab === 'active'
              ? 'Catat investasi project bisnis dengan jadwal pembayaran terstruktur.'
              : 'Project yang sudah selesai atau macet akan tampil di sini.'}
          </p>
          {tab === 'active' && (
            <button
              type="button"
              onClick={() => setFormOpen(true)}
              className="mt-5 px-5 py-3 rounded-xl bg-indigo text-cream font-semibold text-sm active:bg-indigo-deep"
            >
              Tambah Project
            </button>
          )}
        </div>
      ) : displayList.length === 0 ? (
        <div className="py-12 px-5 text-center text-[14px] text-ink-mute">
          Tidak ada project cocok dengan “{search}”.
        </div>
      ) : (
        <div className="space-y-3">
          {search.trim() && (
            <div className="text-[12px] text-ink-mute px-1">
              {displayList.length} hasil · urut: {activeSortLabel}
            </div>
          )}
          {displayList.map((p, i) => (
            <ProjectCard key={p.id} project={p} index={i + 1} />
          ))}
        </div>
      )}

      <ProjectForm
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSubmit={addProject}
        accounts={accounts}
      />
      <ExportSheet
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        onExportExcel={(filter) => exportProjectsToExcel(projects, accounts, filter)}
        onExportPdf={(mode, filter) => exportProjectsToPdf(projects, accounts, mode, filter)}
        counts={{ active: active.length, archive: archived.length, total: projects.length }}
      />
      <PeriodPickerSheet
        open={periodOpen}
        onClose={() => setPeriodOpen(false)}
        value={period}
        onChange={setPeriod}
      />
      <Modal open={sortOpen} onClose={() => setSortOpen(false)} title="Urutkan Project">
        <div className="space-y-1">
          {SORT_OPTIONS.map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={() => {
                setSort(o.id);
                setSortOpen(false);
              }}
              className="w-full flex items-center justify-between px-3 py-3 rounded-xl text-left active:bg-cream-deep"
            >
              <span className={`text-[15px] ${sort === o.id ? 'font-semibold text-indigo' : 'text-ink'}`}>
                {o.label}
              </span>
              {sort === o.id && <IcCheck size={18} stroke="#3F5C8A" sw={2.2} />}
            </button>
          ))}
        </div>
      </Modal>
    </div>
  );
}
