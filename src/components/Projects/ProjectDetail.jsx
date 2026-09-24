import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useData } from '../../contexts/DataContext';
import { useToast } from '../../contexts/ToastContext';
import { useDemo } from '../../contexts/DemoContext';
import Card from '../common/Card';
import SectionTitle from '../common/SectionTitle';
import Pill from '../common/Pill';
import ConfirmDialog from '../common/ConfirmDialog';
import ReceiptManageSheet from './ReceiptManageSheet';
import RemainderSheet from './RemainderSheet';
import ReceiptSheet from './ReceiptSheet';
import ExtensionSheet from './ExtensionSheet';
import PelunasanRestSheet from './PelunasanRestSheet';
import CloseProjectSheet from './CloseProjectSheet';
import SettleProjectSheet from './SettleProjectSheet';
import ProjectForm from './ProjectForm';
import { formatCurrency } from '../../utils/formatCurrency';
import { formatDate, daysBetween, toDate } from '../../utils/formatDate';
import { projectSummary } from '../../utils/projectSchedule';
import { isSettled, isShort, rowCarriedIn, rowDue, rowReceived, rowRemaining, rowState } from '../../utils/paymentStatus';
import { applyReopenRemainder } from '../../utils/remainderOps';
import { extensionOptions, undoCheck } from '../../utils/extension';
import { rolloverSource } from '../../utils/rollover';
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

function PaymentRow({
  project,
  payment,
  onReceive,
  onManage,
  onRemainder,
  onReopen,
  onSettleFinal,
  canReceive,
  editable,
  accountName,
  isLast,
}) {
  const due = toDate(payment.dueDate);
  const recv = toDate(payment.receivedDate);
  const isPaid = isSettled(project, payment);
  const isFinal = payment.type === 'final';
  const days = due ? daysBetween(new Date(), due) : 0;
  const overdue = !isPaid && days < 0;
  const dueSoon = !isPaid && days >= 0 && days <= 7;
  const state = rowState(project, payment);
  const short = rowRemaining(project, payment);
  const received = rowReceived(project, payment);
  // A remainder closed without money, as the owner reads it. An old
  // shortfall (reason 'legacy') still reads as plain Lunas and is reopened
  // from its payment instead.
  const closure = payment.closure;
  const closedBy = ['carry', 'extend', 'rollover'].includes(closure?.kind)
    ? closure.kind
    : closure?.kind === 'waive' && closure.reason !== 'legacy'
      ? 'waive'
      : null;
  const reopenable =
    editable && (closure?.kind === 'carry' || (closure?.kind === 'waive' && closure.reason === 'manual'));
  // Earlier months carried onto this one ("+ tunggakan bulan k").
  const carriedIn = (project.payments || [])
    .filter((r) => r.closure?.kind === 'carry' && r.closure.toNo === payment.no)
    .map((r) => ({ no: r.no, amount: Number(r.closure.amount) || 0 }));
  const totalDue = rowDue(payment) + rowCarriedIn(project, payment);
  const arrivals = (project.receipts || [])
    .map((r) => ({ r, part: (r.allocations || []).find((a) => a.no === payment.no) }))
    .filter((x) => x.part);
  // What is left on a bagi hasil that is due or already partly paid can be
  // carried or forgiven. The pelunasan gets its own options in Part C.
  const canSettleRest = canReceive && !isPaid && !isFinal && (received > 0 || days <= 0);
  // A pelunasan paid in part: what happens to the rest (spec 7.2).
  const canSettleFinal = canReceive && isFinal && !isPaid && received > 0;
  // A settled tagihan paid in one arrival shows it on its own line and opens
  // it from Edit. Otherwise, and on a closed row, every arrival is listed.
  const showArrivals = arrivals.length > 1 || (arrivals.length === 1 && (!isPaid || !!closedBy));

  let subtitle;
  if (closedBy === 'carry') {
    subtitle = `Sisa ${formatCurrency(closure.amount, false)} dipindah ke bulan ${closure.toNo}`;
  } else if (closedBy === 'waive') {
    subtitle =
      received > 0
        ? `Diterima ${recv ? formatDate(recv, { short: true }) : '—'} · sisa ${formatCurrency(closure.amount, false)} tidak ditagih`
        : `${formatCurrency(closure.amount, false)} tidak ditagih lagi`;
  } else if (closedBy === 'extend') {
    subtitle = `Diterima ${recv ? formatDate(recv, { short: true }) : '—'} · sisa ${formatCurrency(closure.amount, false)} diperpanjang`;
  } else if (closedBy === 'rollover') {
    subtitle = `Diterima ${recv ? formatDate(recv, { short: true }) : '—'} · sisa ${formatCurrency(closure.amount, false)} jadi kontrak baru`;
  } else if (isPaid) {
    subtitle = `Diterima ${recv ? formatDate(recv, { short: true }) : '—'}`;
  } else {
    subtitle = `Jatuh tempo ${due ? formatDate(due, { short: true }) : '—'}`;
  }

  // The row's own border-b lives on this outer wrapper, not on the flex row
  // below, so it falls after the arrivals list instead of cutting between a
  // row and its own arrivals.
  return (
    <div className={isLast ? '' : 'border-b border-line-soft'}>
      <div className="flex items-center gap-3 py-3">
        <div
          className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
            isPaid && !closedBy
              ? 'bg-daun text-cream'
              : isFinal
                ? 'bg-indigo text-cream'
                : 'bg-cream-deep text-ink-soft'
          }`}
        >
          {isPaid && !closedBy ? (
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
            {state === 'kurang' &&
              (isShort(project, payment) ? (
                <Pill tone="emas">Kurang {formatCurrency(short, false)}</Pill>
              ) : (
                <Pill tone="neutral">Sisa {formatCurrency(short, false)}</Pill>
              ))}
            {closedBy === 'carry' && <Pill tone="neutral">Digabung ke bulan {closure.toNo}</Pill>}
            {closedBy === 'waive' && <Pill tone="neutral">Dianggap lunas</Pill>}
            {closedBy === 'extend' && <Pill tone="neutral">Diperpanjang</Pill>}
            {closedBy === 'rollover' && <Pill tone="neutral">Kontrak baru</Pill>}
          </div>
          <div className="text-[12px] text-ink-mute mt-0.5">{subtitle}</div>
          {carriedIn.map((c) => (
            <div key={c.no} className="text-[12px] text-emas mt-0.5">
              + tunggakan bulan {c.no} {formatCurrency(c.amount, false)}
            </div>
          ))}
        </div>
        <div className="text-right">
          <div
            className={`font-num text-[15px] font-semibold ${
              isPaid && !closedBy ? 'text-daun' : 'text-ink'
            }`}
            style={{ fontVariantNumeric: 'tabular-nums' }}
          >
            {formatCurrency(isPaid ? received : totalDue, false)}
          </div>
          {!isPaid && canReceive && (
            <button
              type="button"
              onClick={() => onReceive(payment)}
              className="mt-1 text-[12px] font-semibold text-indigo active:opacity-70 block ml-auto"
            >
              Konfirmasi →
            </button>
          )}
          {canSettleRest && (
            <button
              type="button"
              onClick={() => onRemainder(payment.no)}
              className="mt-1 text-[12px] font-semibold text-ink-soft active:opacity-70 block ml-auto"
            >
              Atur sisa →
            </button>
          )}
          {canSettleFinal && (
            <button
              type="button"
              onClick={onSettleFinal}
              className="mt-1 text-[12px] font-semibold text-ink-soft active:opacity-70 block ml-auto"
            >
              Atur sisa pelunasan →
            </button>
          )}
          {isPaid && reopenable && (
            <button
              type="button"
              onClick={() => onReopen(payment.no)}
              className="mt-1 text-[12px] font-semibold text-indigo active:opacity-70 block ml-auto"
            >
              Buka lagi →
            </button>
          )}
          {isPaid && editable && !closedBy && arrivals.length === 1 && (
            <button
              type="button"
              onClick={() => onManage(arrivals[0].r.id)}
              className="mt-1 text-[12px] font-semibold text-indigo active:opacity-70 block ml-auto"
            >
              Edit →
            </button>
          )}
        </div>
      </div>
      {showArrivals && (
        <div className="pb-2 pl-12 space-y-0.5">
          {arrivals.map(({ r, part }) => {
            const split = (r.allocations || []).length > 1;
            const line = (
              <>
                <span>
                  {formatDate(r.date, { short: true })} · {accountName(r.accountId)}
                </span>
                <span className="font-num">
                  {formatCurrency(part.amount, false)}
                  {split && ` · sebagian dari ${formatCurrency(r.amount, false)}`}
                  {editable && <span className="text-indigo"> ›</span>}
                </span>
              </>
            );
            return editable ? (
              <button
                key={r.id}
                type="button"
                onClick={() => onManage(r.id)}
                className="w-full flex justify-between gap-3 text-left text-[12px] text-ink-mute active:opacity-70"
              >
                {line}
              </button>
            ) : (
              <div key={r.id} className="flex justify-between gap-3 text-[12px] text-ink-mute">
                {line}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// What reopening bulan `no` does, or why it cannot be done yet, in the
// owner's words, before he taps.
function reopenPreview(project, no) {
  const c = (project?.payments || []).find((r) => r.no === no)?.closure;
  if (!c) return { ok: false, message: '' };
  let update;
  try {
    ({ update } = applyReopenRemainder(project, no));
  } catch (e) {
    return { ok: false, message: `Belum bisa dibuka. ${e.message}` };
  }
  const active = update.status === 'active' ? ' Project ini aktif lagi.' : '';
  if (c.kind === 'carry') {
    return {
      ok: true,
      message: `Sisa ${formatCurrency(c.amount)} kembali ditagih di bulan ${no}, dan tunggakan di bulan ${c.toNo} dihapus.${active}`,
    };
  }
  return { ok: true, message: `Sisa ${formatCurrency(c.amount)} kembali ditagih di bulan ${no}.${active}` };
}

// One schedule change, in the owner's words.
function extensionLabel(e) {
  const on = e.at ? ` pada ${formatDate(e.at)}` : '';
  return e.kind === 'mundur'
    ? `Pelunasan dimundurkan ${e.months} bulan${on}`
    : `Sisa pelunasan ${formatCurrency(e.baseAmount)} diperpanjang ${e.months} bulan${on}`;
}

// What undoing the latest schedule change does.
function undoMessage(e) {
  if (!e) return '';
  return e.kind === 'mundur'
    ? 'Bulan-bulan tambahan dihapus dan pelunasan kembali ke jatuh tempo semula.'
    : `Bulan-bulan tambahan dihapus dan sisa pelunasan ${formatCurrency(e.baseAmount)} kembali ditagih di pelunasan lama.`;
}

export default function ProjectDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isDemo } = useDemo();
  const { projects, accounts, recordReceipt, updateReceipt, moveReceipt, cancelReceipt, closeRemainder, reopenRemainder, extendProject, undoExtension, rolloverProject, closeProjectAsDefault, settleProjectEarly, deleteProject, updateProject } =
    useData();
  const [managing, setManaging] = useState(null); // a receipt id, or null when closed
  const [remainderNo, setRemainderNo] = useState(null); // a tagihan number, or null when closed
  const [reopenNo, setReopenNo] = useState(null); // a tagihan number, or null when closed
  const { showToast } = useToast();
  const [receiving, setReceiving] = useState(null); // the tagihan number, or null when closed
  const [closing, setClosing] = useState(false);
  const [settling, setSettling] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [editing, setEditing] = useState(false);
  const [extending, setExtending] = useState(null); // 'mundur' | 'sisa', or null when closed
  const [restOpen, setRestOpen] = useState(false);
  const [askRestFor, setAskRestFor] = useState(null); // a receipt that left the pelunasan partly paid
  const [rollingOver, setRollingOver] = useState(false);
  const [undoingExtension, setUndoingExtension] = useState(null); // an extension id, or null

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
  const reopen = reopenNo !== null ? reopenPreview(project, reopenNo) : { ok: false, message: '' };
  const isActive = project.status === 'active';
  const isCompleted = project.status === 'completed';
  const isDefault = project.status === 'default';
  const totalReturnExpected = project.payments.reduce(
    (s, p) => s + p.expectedAmount,
    0
  ); // received side
  const totalReturnReceived = summary.receivedSoFar;
  // Received, plus what went into a new contract, minus modal (spec 7.4).
  const profit = summary.netCashChange;
  const extOptions = extensionOptions(project);
  const extensions = project.extensions || [];
  const latestExtension = extensions[extensions.length - 1] || null;
  const canUndoExtension = isActive && !!latestExtension && undoCheck(project).ok;
  const rollover = rolloverSource(project);
  // Asked once the screen shows the payment that left the pelunasan partly
  // paid (spec 7.2).
  const askRest = askRestFor != null && (project.receipts || []).some((r) => r.id === askRestFor);
  const isRolloverProject = project.fundingMode === 'rollover';
  const nextContract = project.rolledOverToProjectId
    ? projects.find((p) => p.id === project.rolledOverToProjectId)
    : null;
  const prevContract = project.rolledFromProjectId
    ? projects.find((p) => p.id === project.rolledFromProjectId)
    : null;
  // Return rate display: tiered projects show both rates, else the single rate.
  const rTier1 = project.returnPctTier1 != null ? project.returnPctTier1 : project.monthlyReturnPct;
  const rTier2 = project.returnPctTier2 != null ? project.returnPctTier2 : rTier1;
  const isTieredRate = rTier2 !== rTier1 && (project.durationMonths || 0) > 3;
  const returnRateLabel = isTieredRate
    ? `${rTier1}% (bln 1-3) / ${rTier2}% (bln 4+)`
    : `${rTier1}% · ${formatCurrency((project.principalAmount * rTier1) / 100)}`;

  async function handleReceipt(data) {
    const out = await recordReceipt(project.id, data);
    if (out?.finalShort) setAskRestFor(out.receiptId);
  }

  async function handleClose(data) {
    await closeProjectAsDefault(project.id, data);
  }

  async function handleSettle(data) {
    await settleProjectEarly(project.id, data);
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
          {summary.rolledOut > 0 && ` · ${formatCurrency(summary.rolledOut)} dialihkan ke kontrak baru`}
        </div>
      </Card>

      <SectionTitle>Detail</SectionTitle>
      <Card className="mb-3.5 !py-1">
        {project.ownerName && (
          <StatRow label="Pemilik" value={project.ownerName} />
        )}
        {project.phone && (
          <StatRow label="No. HP" value={project.phone} />
        )}
        {project.nik && (
          <StatRow label="NIK" value={project.nik} />
        )}
        {project.address && (
          <StatRow label="Alamat" value={project.address} />
        )}
        {project.collateral && (
          <StatRow label="Agunan" value={project.collateral} />
        )}
        {project.contractNumber && (
          <StatRow label="No. Kontrak" value={project.contractNumber} />
        )}
        <StatRow
          label="Nilai Project"
          value={formatCurrency(project.principalAmount)}
        />
        <StatRow
          label={isRolloverProject ? 'Modal Dialihkan' : 'Modal Keluar'}
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
        <StatRow label="Return / Bulan" value={returnRateLabel} />
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
          value={isRolloverProject ? 'Tidak ada (dialihkan)' : accountName(project.sourceAccountId)}
        />
        <StatRow
          label="Total Diterima"
          value={formatCurrency(totalReturnReceived)}
          valueClass="text-daun"
        />
        <StatRow
          label={profit >= 0 ? 'Laba (s/d sekarang)' : 'Piutang (s/d sekarang)'}
          value={profit >= 0 ? `+${formatCurrency(profit)}` : formatCurrency(Math.abs(profit))}
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
      {project.rolledOverToProjectId && (
        <Link
          to={`${base}/project/${project.rolledOverToProjectId}`}
          className="flex items-center gap-2 px-4 py-3 mb-3.5 bg-paper border border-line rounded-2xl text-[13px] text-indigo font-semibold active:bg-cream-deep"
        >
          <IcInfo size={16} sw={1.9} />
          <span className="flex-1 truncate">Dilanjutkan ke kontrak baru: {nextContract?.name || 'project baru'}</span>
          <span>→</span>
        </Link>
      )}
      {project.rolledFromProjectId && (
        <Link
          to={`${base}/project/${project.rolledFromProjectId}`}
          className="flex items-center gap-2 px-4 py-3 mb-3.5 bg-paper border border-line rounded-2xl text-[13px] text-indigo font-semibold active:bg-cream-deep"
        >
          <IcInfo size={16} sw={1.9} />
          <span className="flex-1 truncate">Lanjutan dari: {prevContract?.name || 'project lama'}</span>
          <span>→</span>
        </Link>
      )}

      <SectionTitle>Jadwal Pembayaran</SectionTitle>
      <Card className="mb-3.5 !px-4 !py-1">
        {project.payments.map((p, i) => (
          <PaymentRow
            key={p.no}
            project={project}
            payment={p}
            onReceive={(pay) => setReceiving(pay.no)}
            onManage={(receiptId) => setManaging(receiptId)}
            onRemainder={(no) => setRemainderNo(no)}
            onReopen={(no) => setReopenNo(no)}
            onSettleFinal={() => setRestOpen(true)}
            canReceive={isActive}
            editable={isActive || isCompleted}
            accountName={accountName}
            isLast={i === project.payments.length - 1}
          />
        ))}
      </Card>
      {extensions.length > 0 && (
        <>
          <SectionTitle>Perubahan Jadwal</SectionTitle>
          <Card className="mb-3.5 !px-4 !py-1">
            {extensions.map((e, i) => (
              <div key={e.id} className={`py-2.5 ${i < extensions.length - 1 ? 'border-b border-line-soft' : ''}`}>
                <div className="text-[13px] text-ink">{extensionLabel(e)}</div>
                {e.note && <div className="text-[12px] text-ink-mute mt-0.5">{e.note}</div>}
                {e === latestExtension && canUndoExtension && (
                  <button
                    type="button"
                    onClick={() => setUndoingExtension(e.id)}
                    className="mt-1 text-[12px] font-semibold text-terra active:opacity-70"
                  >
                    Batalkan perpanjangan
                  </button>
                )}
              </div>
            ))}
          </Card>
        </>
      )}

      {isActive && (
        <div className="space-y-2 mb-3.5">
          <div className="flex gap-2">
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
              onClick={() => setDeleting(true)}
              className="w-12 h-12 rounded-xl bg-terra-soft text-terra flex items-center justify-center active:opacity-80 flex-shrink-0"
              aria-label="Batalkan project"
            >
              <IcTrash size={18} sw={1.9} />
            </button>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setSettling(true)}
              className="flex-1 py-3 rounded-xl bg-daun-soft text-daun font-semibold text-[14px] active:opacity-80"
            >
              Tutup: Pelunasan
            </button>
            <button
              type="button"
              onClick={() => setClosing(true)}
              className="flex-1 py-3 rounded-xl bg-terra-soft text-terra font-semibold text-[14px] active:opacity-80"
            >
              Tutup: Macet
            </button>
          </div>
          {extOptions.mundur.ok && (
            <button
              type="button"
              onClick={() => setExtending('mundur')}
              className="w-full py-3 rounded-xl bg-emas-soft text-ink font-semibold text-[14px] active:opacity-80"
            >
              Mundurkan pelunasan
            </button>
          )}
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
      <ReceiptManageSheet
        open={managing !== null}
        onClose={() => setManaging(null)}
        project={project}
        receiptId={managing}
        accounts={accounts}
        onEdit={(data) => updateReceipt(project.id, managing, data)}
        onMove={(startNo, opts) => moveReceipt(project.id, managing, startNo, opts)}
        onCancel={(opts) => cancelReceipt(project.id, managing, opts)}
        onReopenLegacy={(no, opts) => reopenRemainder(project.id, no, opts)}
      />
      <RemainderSheet
        open={remainderNo !== null}
        onClose={() => setRemainderNo(null)}
        project={project}
        no={remainderNo}
        onCarry={(opts) => closeRemainder(project.id, remainderNo, { kind: 'carry', ...opts })}
        onWaive={(opts) => closeRemainder(project.id, remainderNo, { kind: 'waive', ...opts })}
      />
      <ConfirmDialog
        open={reopenNo !== null}
        onClose={() => setReopenNo(null)}
        onConfirm={async () => {
          try {
            await reopenRemainder(project.id, reopenNo, { seenWriteId: project.lastWriteId ?? null });
          } catch (e) {
            showToast(e.message || 'Gagal membuka lagi');
          }
        }}
        title={`Buka lagi sisa bulan ${reopenNo}?`}
        message={reopen.message}
        confirmLabel="Buka lagi"
        confirmVariant="primary"
        confirmDisabled={!reopen.ok}
      />
      <ReceiptSheet
        open={receiving !== null}
        onClose={() => setReceiving(null)}
        project={project}
        accounts={accounts}
        defaultNo={receiving}
        onSubmit={handleReceipt}
      />
      <CloseProjectSheet
        open={closing}
        onClose={() => setClosing(false)}
        project={project}
        accounts={accounts}
        onConfirm={handleClose}
      />
      <SettleProjectSheet
        open={settling}
        onClose={() => setSettling(false)}
        project={project}
        accounts={accounts}
        onConfirm={handleSettle}
      />
      <PelunasanRestSheet
        open={restOpen || askRest}
        onClose={() => {
          setRestOpen(false);
          setAskRestFor(null);
        }}
        project={project}
        onExtend={() => {
          setRestOpen(false);
          setAskRestFor(null);
          setExtending('sisa');
        }}
        onRollover={() => {
          setRestOpen(false);
          setAskRestFor(null);
          setRollingOver(true);
        }}
      />
      <ExtensionSheet
        open={extending !== null}
        onClose={() => setExtending(null)}
        project={project}
        kind={extending}
        onSubmit={(data) => extendProject(project.id, data)}
      />
      <ConfirmDialog
        open={undoingExtension !== null}
        onClose={() => setUndoingExtension(null)}
        onConfirm={async () => {
          try {
            await undoExtension(project.id, {
              extensionId: undoingExtension,
              seenWriteId: project.lastWriteId ?? null,
            });
          } catch (e) {
            showToast(e.message || 'Gagal membatalkan perpanjangan');
          }
        }}
        title="Batalkan perpanjangan?"
        message={undoMessage(latestExtension)}
        confirmLabel="Ya, batalkan"
      />
      {rollover.ok && (
        <ProjectForm
          key={`rollover-${project.id}`}
          open={rollingOver}
          onClose={() => setRollingOver(false)}
          onSubmit={async (data) => {
            const newId = await rolloverProject(project.id, data, { seenWriteId: project.lastWriteId ?? null });
            setRollingOver(false);
            if (newId) navigate(`${base}/project/${newId}`);
          }}
          accounts={accounts}
          rollover={{ from: project, amount: rollover.amount, startDate: rollover.startDate }}
        />
      )}
      <ConfirmDialog
        open={deleting}
        onClose={() => setDeleting(false)}
        onConfirm={handleDelete}
        title="Batalkan Project?"
        message={
          isRolloverProject
            ? `Kontrak lanjutan ini dihapus dan sisa pelunasan ${formatCurrency(project.disbursedAmount)} kembali ditagih di ${
                prevContract?.name || 'project lama'
              }.${
                totalReturnReceived > 0
                  ? ` Pembayaran ${formatCurrency(totalReturnReceived)} yang sudah masuk ditarik kembali dari rekening.`
                  : ''
              } Transaksi terkait dihapus permanen.`
            : totalReturnReceived > 0
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
