import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useData } from '../../contexts/DataContext';
import { useDemo } from '../../contexts/DemoContext';
import Card from '../common/Card';
import SectionTitle from '../common/SectionTitle';
import Pill from '../common/Pill';
import ConfirmDialog from '../common/ConfirmDialog';
import PaymentConfirmSheet from './PaymentConfirmSheet';
import CloseProjectSheet from './CloseProjectSheet';
import ProjectForm from './ProjectForm';
import { formatCurrency } from '../../utils/formatCurrency';
import { formatDate, daysBetween, toDate } from '../../utils/formatDate';
import { projectSummary } from '../../utils/projectSchedule';
import {
  IcChevronLeft,
  IcCalendar,
  IcCheck,
  IcArrowDown,
  IcArrowUp,
  IcInfo,
  IcTrash,
  IcEdit,
} from '../common/icons';

function StatRow({ label, value, valueClass = 'text-ink', isLast }) {
  return (
    <div
      className={`flex justify-between items-baseline py-2.5 ${
        isLast ? '' : 'border-b border-line-soft'
      }`}
    >
      <span className="text-[13px] text-ink-soft">{label}</span>
      <span
        className={`font-num font-semibold text-[15px] ${valueClass}`}
        style={{ fontVariantNumeric: 'tabular-nums' }}
      >
        {value}
      </span>
    </div>
  );
}

function PaymentRow({ payment, onConfirm, onEdit, editable, isLast }) {
  const due = toDate(payment.dueDate);
  const recv = toDate(payment.receivedDate);
  const isPaid = payment.receivedAmount != null;
  const isFinal = payment.type === 'final';
  const days = due ? daysBetween(new Date(), due) : 0;
  const overdue = !isPaid && days < 0;
  const dueSoon = !isPaid && days >= 0 && days <= 7;

  return (
    <div
      className={`flex items-center gap-3 py-3 ${isLast ? '' : 'border-b border-line-soft'}`}
    >
      <div
        className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
          isPaid ? 'bg-daun text-cream' : isFinal ? 'bg-indigo text-cream' : 'bg-cream-deep text-ink-soft'
        }`}
      >
        {isPaid ? (
          <IcCheck size={18} sw={2.4} />
        ) : (
          <span className="text-[13px] font-display font-semibold">{payment.no}</span>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[14px] font-semibold text-ink">
            Pembayaran {payment.no}
          </span>
          {isFinal && <Pill tone="indigo">Pelunasan</Pill>}
          {overdue && <Pill tone="terra">Telat</Pill>}
          {dueSoon && !overdue && <Pill tone="emas">Segera</Pill>}
        </div>
        <div className="text-[12px] text-ink-mute mt-0.5">
          {isPaid
            ? `Diterima ${recv ? formatDate(recv, { short: true }) : '—'}`
            : `Jatuh tempo ${due ? formatDate(due, { short: true }) : '—'}`}
        </div>
      </div>
      <div className="text-right">
        <div
          className={`font-num text-[15px] font-semibold ${
            isPaid ? 'text-daun' : 'text-ink'
          }`}
          style={{ fontVariantNumeric: 'tabular-nums' }}
        >
          {formatCurrency(isPaid ? payment.receivedAmount : payment.expectedAmount, false)}
        </div>
        {!isPaid && (
          <button
            type="button"
            onClick={() => onConfirm(payment)}
            className="mt-1 text-[12px] font-semibold text-indigo active:opacity-70"
          >
            Konfirmasi →
          </button>
        )}
        {isPaid && editable && (
          <button
            type="button"
            onClick={() => onEdit(payment)}
            className="mt-1 text-[12px] font-semibold text-indigo active:opacity-70"
          >
            Edit →
          </button>
        )}
      </div>
    </div>
  );
}

export default function ProjectDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isDemo } = useDemo();
  const { projects, accounts, recordProjectPayment, updateProjectPayment, closeProjectAsDefault, deleteProject, updateProject } =
    useData();
  const [paying, setPaying] = useState(null);
  const [closing, setClosing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [editing, setEditing] = useState(false);

  const base = isDemo ? '/demo' : '';
  const project = projects.find((p) => p.id === id);
  const accountName = (aid) => accounts.find((a) => a.id === aid)?.name || '—';

  if (!project) {
    return (
      <div className="py-16 text-center text-ink-mute text-sm">
        <p>Project tidak ditemukan.</p>
        <Link to={`${base}/project`} className="text-indigo font-semibold mt-3 inline-block">
          ← Kembali ke daftar
        </Link>
      </div>
    );
  }

  const summary = projectSummary(project);
  const isActive = project.status === 'active';
  const isCompleted = project.status === 'completed';
  const isDefault = project.status === 'default';
  const totalReturnExpected = project.payments.reduce(
    (s, p) => s + p.expectedAmount,
    0
  ); // received side
  const totalReturnReceived = summary.receivedSoFar;
  const profit = totalReturnReceived - (project.disbursedAmount || 0);

  async function handleConfirmPayment(data) {
    if (!paying) return;
    if (paying.receivedAmount != null) {
      await updateProjectPayment(project.id, paying.no, data);
    } else {
      await recordProjectPayment(project.id, paying.no, data);
    }
  }

  async function handleClose(data) {
    await closeProjectAsDefault(project.id, data);
  }

  async function handleDelete() {
    try {
      await deleteProject(project.id);
      navigate(`${base}/project`);
    } catch (e) {
      // toast already shows; fallback
      alert(e.message || 'Gagal hapus project');
    }
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <button
          type="button"
          onClick={() => navigate(`${base}/project`)}
          aria-label="Kembali"
          className="w-10 h-10 rounded-xl bg-paper border border-line text-ink flex items-center justify-center active:bg-cream-deep flex-shrink-0"
        >
          <IcChevronLeft size={18} sw={1.9} />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="font-display text-[22px] font-semibold text-ink leading-tight truncate">
              {project.name}
            </h1>
            {isActive && <Pill tone="indigo">Aktif</Pill>}
            {isCompleted && <Pill tone="daun">Selesai</Pill>}
            {isDefault && <Pill tone="terra">Macet</Pill>}
          </div>
          {project.description && (
            <p className="text-[13px] text-ink-soft mt-1 leading-snug">
              {project.description}
            </p>
          )}
        </div>
      </div>

      <Card className="mb-3.5">
        <div className="text-[12px] text-ink-mute uppercase tracking-[0.3px] font-medium">
          Posisi Kas Bersih
        </div>
        <div
          className={`font-display text-[28px] font-semibold mt-0.5 ${
            summary.netCashChange >= 0 ? 'text-daun' : 'text-terra'
          }`}
          style={{ fontVariantNumeric: 'tabular-nums' }}
        >
          {summary.netCashChange >= 0 ? '+' : ''}
          {formatCurrency(summary.netCashChange)}
        </div>
        <div className="text-[12px] text-ink-soft mt-1">
          Sudah terima {formatCurrency(summary.receivedSoFar)} dari modal{' '}
          {formatCurrency(project.disbursedAmount)}
        </div>
      </Card>

      <SectionTitle>Detail</SectionTitle>
      <Card className="mb-3.5 !py-1">
        {project.ownerName && (
          <StatRow label="Pemilik" value={project.ownerName} />
        )}
        {project.contractNumber && (
          <StatRow label="No. Kontrak" value={project.contractNumber} />
        )}
        <StatRow
          label="Nilai Project"
          value={formatCurrency(project.principalAmount)}
        />
        <StatRow
          label="Modal Keluar"
          value={formatCurrency(project.disbursedAmount)}
        />
        {project.principalAmount !== project.disbursedAmount && (
          <StatRow
            label="Potongan di Muka"
            value={formatCurrency(project.principalAmount - project.disbursedAmount)}
            valueClass={
              project.principalAmount - project.disbursedAmount > 0 ? 'text-daun' : 'text-terra'
            }
          />
        )}
        <StatRow
          label="Return / Bulan"
          value={`${project.monthlyReturnPct}% · ${formatCurrency(
            (project.principalAmount * project.monthlyReturnPct) / 100
          )}`}
        />
        <StatRow
          label="Durasi"
          value={`${project.durationMonths} bulan`}
        />
        <StatRow
          label="Mulai"
          value={project.startDate ? formatDate(project.startDate) : '—'}
        />
        <StatRow
          label="Rekening Sumber"
          value={accountName(project.sourceAccountId)}
        />
        <StatRow
          label="Total Diterima"
          value={formatCurrency(totalReturnReceived)}
          valueClass="text-daun"
        />
        <StatRow
          label={profit >= 0 ? 'Laba (s/d sekarang)' : 'Rugi (s/d sekarang)'}
          value={`${profit >= 0 ? '+' : ''}${formatCurrency(profit)}`}
          valueClass={profit >= 0 ? 'text-daun' : 'text-terra'}
          isLast={!isDefault || project.lossAmount == null}
        />
        {isDefault && project.lossAmount != null && (
          <StatRow
            label="Kerugian Final"
            value={formatCurrency(project.lossAmount)}
            valueClass="text-terra"
            isLast
          />
        )}
      </Card>

      {project.proofUrl && (
        <a
          href={project.proofUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 px-4 py-3 mb-3.5 bg-paper border border-line rounded-2xl text-[13px] text-indigo font-semibold active:bg-cream-deep"
        >
          <IcInfo size={16} sw={1.9} />
          <span className="flex-1 truncate">
            {project.proofFileName ? `Lihat ${project.proofFileName}` : 'Lihat bukti / kontrak'}
          </span>
          <span>→</span>
        </a>
      )}

      <SectionTitle>Jadwal Pembayaran</SectionTitle>
      <Card className="mb-3.5 !px-4 !py-1">
        {project.payments.map((p, i) => (
          <PaymentRow
            key={p.no}
            payment={p}
            onConfirm={(pay) => isActive && setPaying(pay)}
            onEdit={(pay) => (isActive || isCompleted) && setPaying(pay)}
            editable={isActive || isCompleted}
            isLast={i === project.payments.length - 1}
          />
        ))}
      </Card>

      {isActive && (
        <div className="flex gap-2 mb-3.5">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="flex-1 py-3 rounded-xl bg-indigo-soft text-indigo font-semibold text-[14px] active:opacity-80 flex items-center justify-center gap-1.5"
          >
            <IcEdit size={16} sw={2} />
            Edit Project
          </button>
          <button
            type="button"
            onClick={() => setClosing(true)}
            className="flex-1 py-3 rounded-xl bg-terra-soft text-terra font-semibold text-[14px] active:opacity-80"
          >
            Tutup sebagai Macet
          </button>
          <button
            type="button"
            onClick={() => setDeleting(true)}
            className="w-12 h-12 rounded-xl bg-terra-soft text-terra flex items-center justify-center active:opacity-80 flex-shrink-0"
            aria-label="Hapus project"
          >
            <IcTrash size={18} sw={1.9} />
          </button>
        </div>
      )}

      <ProjectForm
        key={`edit-${project.id}`}
        open={editing}
        onClose={() => setEditing(false)}
        onSubmit={(data) => updateProject(project.id, data)}
        accounts={accounts}
        initial={project}
      />
      <PaymentConfirmSheet
        open={!!paying}
        onClose={() => setPaying(null)}
        project={project}
        payment={paying}
        accounts={accounts}
        onConfirm={handleConfirmPayment}
      />
      <CloseProjectSheet
        open={closing}
        onClose={() => setClosing(false)}
        project={project}
        accounts={accounts}
        onConfirm={handleClose}
      />
      <ConfirmDialog
        open={deleting}
        onClose={() => setDeleting(false)}
        onConfirm={handleDelete}
        title="Batalkan Project?"
        message={
          totalReturnReceived > 0
            ? `Modal ${formatCurrency(project.disbursedAmount)} dikembalikan ke ${accountName(
                project.sourceAccountId
              )}, dan return ${formatCurrency(
                totalReturnReceived
              )} yang sudah diterima ditarik kembali dari rekening. Project & semua transaksi terkait dihapus permanen.`
            : `Modal ${formatCurrency(project.disbursedAmount)} dikembalikan ke ${accountName(
                project.sourceAccountId
              )}. Project & semua transaksi terkait dihapus permanen.`
        }
        confirmLabel="Ya, Batalkan"
      />
    </div>
  );
}
