import { useMemo, useState } from 'react';
import { useData } from '../../contexts/DataContext';
import PageHeader from '../common/PageHeader';
import IconButton from '../common/IconButton';
import Card from '../common/Card';
import ProjectCard from './ProjectCard';
import ProjectForm from './ProjectForm';
import ExportSheet from './ExportSheet';
import { formatCurrency } from '../../utils/formatCurrency';
import { projectSummary } from '../../utils/projectSchedule';
import { exportProjectsToExcel, exportProjectsToPdf } from '../../utils/projectExport';
import { startOfMonth, endOfMonth, toDate } from '../../utils/formatDate';
import { IcPlus, IcDownload } from '../common/icons';

export default function ProjectList() {
  const { projects, accounts, addProject } = useData();
  const [tab, setTab] = useState('active');
  const [formOpen, setFormOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);

  const active = useMemo(() => projects.filter((p) => p.status === 'active'), [projects]);
  const archived = useMemo(
    () => projects.filter((p) => p.status === 'completed' || p.status === 'default'),
    [projects]
  );
  const list = tab === 'active' ? active : archived;

  const totals = useMemo(() => {
    let modal = 0;
    let expectedRemaining = 0;
    active.forEach((p) => {
      modal += Number(p.disbursedAmount) || 0;
      expectedRemaining += projectSummary(p).expectedRemaining;
    });
    return { modal, expectedRemaining };
  }, [active]);

  const monthlyReturn = useMemo(() => {
    const now = new Date();
    const mStart = startOfMonth(now);
    const mEnd = endOfMonth(now);
    let received = 0;
    let dueThisMonth = 0;
    let pendingThisMonth = 0;
    projects.forEach((p) => {
      (p.payments || []).forEach((pay) => {
        const due = toDate(pay.dueDate);
        const recv = toDate(pay.receivedDate);
        if (recv && recv >= mStart && recv <= mEnd) {
          received += pay.receivedAmount || 0;
        }
        if (due && due >= mStart && due <= mEnd) {
          dueThisMonth += pay.expectedAmount || 0;
          if (pay.receivedAmount == null) {
            pendingThisMonth += pay.expectedAmount || 0;
          }
        }
      });
    });
    return { received, dueThisMonth, pendingThisMonth };
  }, [projects]);

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
            <div className="flex items-baseline justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[12px] text-daun uppercase tracking-[0.3px] font-semibold">
                  Return Bulan Ini
                </div>
                <div
                  className="font-display text-[24px] font-semibold text-daun mt-0.5 break-words"
                  style={{ fontVariantNumeric: 'tabular-nums' }}
                >
                  {formatCurrency(monthlyReturn.received)}
                </div>
              </div>
              <div className="text-right flex-shrink-0">
                <div className="text-[11px] text-ink-mute uppercase tracking-[0.3px] font-semibold">
                  Belum cair bulan ini
                </div>
                <div
                  className={`font-num text-[15px] font-semibold mt-0.5 ${
                    monthlyReturn.pendingThisMonth > 0 ? 'text-emas' : 'text-ink-mute'
                  }`}
                  style={{ fontVariantNumeric: 'tabular-nums' }}
                >
                  {formatCurrency(monthlyReturn.pendingThisMonth)}
                </div>
              </div>
            </div>
          </Card>
        </>
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
      ) : (
        <div className="space-y-3">
          {list.map((p) => (
            <ProjectCard key={p.id} project={p} />
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
        onExportExcel={() => exportProjectsToExcel(projects, accounts)}
        onExportPdf={(mode) => exportProjectsToPdf(projects, accounts, mode)}
        counts={{ active: active.length, archive: archived.length, total: projects.length }}
      />
    </div>
  );
}
