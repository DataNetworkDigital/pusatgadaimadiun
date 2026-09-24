import { Timestamp } from 'firebase/firestore';
import { toDate } from './formatDate';
import { calcMonthlyInterest, pickPaymentDate } from './projectSchedule';
import { rowDue, rowReceived, rowRemaining } from './paymentStatus';
import { normalizeProject } from './normalizeProject';

/**
 * Moving a pelunasan later (spec 7.1, 7.2), decided as data; DataContext
 * writes it.
 * - Mundur X bulan: a pelunasan nobody has paid toward is replaced by
 *   `months` bagi hasil on its base and a new pelunasan after them.
 * - Diperpanjang: what is left of a partly paid pelunasan becomes the base of
 *   `months` bagi hasil and a pelunasan of that remainder, added after it;
 *   the old pelunasan is closed by the extension.
 * No money moves. Each extension is recorded on the project, and the latest
 * one can be undone while none of its tagihan has been touched.
 */

const byNo = (a, b) => (Number(a.no) || 0) - (Number(b.no) || 0);

// Due date `k` months into an extension: counted from the pelunasan's month
// ('today') or the month after ('nextMonth'), on the payment day.
export function extensionDue(anchorDue, paymentDay, startMode, k = 0) {
  const anchor = toDate(anchorDue);
  if (!anchor) return null;
  const day = Number(paymentDay) || anchor.getDate();
  const offset = startMode === 'nextMonth' ? 1 : 0;
  return pickPaymentDate(anchor.getFullYear(), anchor.getMonth() + offset + k, day);
}

/**
 * The rows an extension adds: `months` monthly bagi hasil of
 * round(baseAmount × ratePct / 100), then the pelunasan of `baseAmount` one
 * month after the last of them.
 */
export function buildExtensionRows({
  firstNo, anchorDue, paymentDay, months, ratePct, baseAmount, startMode, extensionId,
}) {
  const count = Number(months);
  const rate = Number(ratePct);
  const base = Math.round(Number(baseAmount) || 0);
  if (!extensionId) throw new Error('Id perpanjangan wajib ada');
  if (!toDate(anchorDue)) throw new Error('Tanggal jatuh tempo pelunasan tidak diketahui.');
  if (!Number.isInteger(count) || count < 1 || count > 60) throw new Error('Jumlah bulan harus 1 sampai 60.');
  if (!Number.isFinite(rate) || rate < 0 || rate > 100) throw new Error('Persen bagi hasil tidak valid.');
  if (base <= 0) throw new Error('Nilai yang diperpanjang harus lebih dari 0.');

  const due = (k) => Timestamp.fromDate(extensionDue(anchorDue, paymentDay, startMode, k));
  const blank = { receivedAmount: null, receivedDate: null, transactionId: null, accountId: null };
  const rows = [];
  for (let k = 0; k < count; k++) {
    rows.push({
      no: firstNo + k,
      dueDate: due(k),
      type: 'interest',
      expectedAmount: calcMonthlyInterest(base, rate),
      ratePct: rate,
      baseAmount: base,
      extensionId,
      ...blank,
    });
  }
  rows.push({
    no: firstNo + count,
    dueDate: due(count),
    type: 'final',
    expectedAmount: base,
    ratePct: null,
    baseAmount: base,
    extensionId,
    ...blank,
  });
  return rows;
}

// The pelunasan the schedule ends with now. Diperpanjang leaves the old one
// in place, closed, with the new one after it.
export function currentFinal(project) {
  return (project?.payments || [])
    .filter((r) => r.type === 'final')
    .reduce((last, r) => (!last || (Number(r.no) || 0) > (Number(last.no) || 0) ? r : last), null);
}

const refuse = (why) => ({ ok: false, why });
const allow = { ok: true, why: null };

/**
 * What can be done to the pelunasan now: Mundur while nobody has paid toward
 * it, Diperpanjang while it is partly paid. `remainder` is what is left on it.
 */
export function extensionOptions(project) {
  const p = normalizeProject(project);
  const final = currentFinal(p);
  if (p?.status !== 'active') {
    const why = 'Jadwal hanya bisa diubah di project yang masih aktif.';
    return { mundur: refuse(why), sisa: refuse(why), final, remainder: 0 };
  }
  if (!final) {
    const why = 'Project ini tidak punya pelunasan.';
    return { mundur: refuse(why), sisa: refuse(why), final, remainder: 0 };
  }
  const received = rowReceived(p, final);
  const remainder = rowRemaining(p, final);
  let mundur = allow;
  let sisa = allow;
  if (final.closure) {
    mundur = sisa = refuse('Pelunasan ini sudah ditutup.');
  } else if (remainder <= 0) {
    mundur = sisa = refuse('Pelunasan sudah lunas.');
  } else if (received > 0) {
    mundur = refuse('Pelunasan sudah dibayar sebagian. Atur sisanya lewat "Atur sisa pelunasan".');
  } else {
    sisa = refuse('Pelunasan belum dibayar sama sekali. Pakai "Mundurkan pelunasan".');
  }
  return { mundur, sisa, final, remainder };
}

/**
 * Mundur (`kind: 'mundur'`) or Diperpanjang (`kind: 'sisa'`).
 * `at` is when it is recorded, in the shape stored; `id` names the extension
 * and is made before the write, so a rerun recognises its own extension.
 * @returns {{ update, extension }}
 */
export function applyExtension(project, { kind, months, ratePct, startMode, note = '', at, id }) {
  const p = normalizeProject(project);
  if (!id) throw new Error('Id perpanjangan wajib ada');
  if (!at) throw new Error('Tanggal wajib diisi');
  if (startMode !== 'today' && startMode !== 'nextMonth') {
    throw new Error('Pilih mulai hari itu atau mulai bulan depan.');
  }
  const opts = extensionOptions(p);
  const check = kind === 'mundur' ? opts.mundur : kind === 'sisa' ? opts.sisa : null;
  if (!check) throw new Error('Pilihan tidak dikenal');
  if (!check.ok) throw new Error(check.why);

  const final = opts.final;
  const lastNo = Math.max(...p.payments.map((r) => Number(r.no) || 0));
  const common = {
    anchorDue: final.dueDate,
    paymentDay: p.paymentDayOfMonth,
    months: Number(months),
    ratePct: Number(ratePct),
    startMode,
    extensionId: id,
  };

  let payments;
  let extension;
  if (kind === 'mundur') {
    // The pelunasan's own base: the project value, or the remainder an
    // earlier Diperpanjang carried forward.
    const baseAmount = Number(final.baseAmount ?? p.principalAmount) || rowDue(final);
    const rows = buildExtensionRows({ ...common, firstNo: final.no, baseAmount });
    payments = [...p.payments.filter((r) => r.no !== final.no), ...rows];
    extension = {
      id, at, kind, months: common.months, ratePct: common.ratePct, startMode,
      baseAmount, firstNo: final.no, replacedRows: [final],
    };
  } else {
    const baseAmount = opts.remainder;
    const rows = buildExtensionRows({ ...common, firstNo: lastNo + 1, baseAmount });
    const closure = { kind: 'extend', amount: baseAmount, extensionId: id, at };
    payments = [...p.payments.map((r) => (r.no === final.no ? { ...r, closure } : r)), ...rows];
    extension = {
      id, at, kind, months: common.months, ratePct: common.ratePct, startMode,
      baseAmount, firstNo: lastNo + 1, replacedRows: [],
    };
  }
  if (note) extension.note = note;
  payments.sort(byNo);
  return { update: { payments, extensions: [...(p.extensions || []), extension] }, extension };
}

/**
 * Undo the latest extension while none of its months has money or a
 * closure: its rows go, a Mundur's pelunasan comes back, a Diperpanjang's
 * pelunasan opens again. `extensionId` is the one the owner saw, so a
 * repeated tap never undoes an earlier one.
 * @returns {{ update, extension }}
 */
export function applyUndoExtension(project, extensionId = null) {
  const p = normalizeProject(project);
  const list = p.extensions || [];
  const ext = list[list.length - 1];
  if (!ext) throw new Error('Tidak ada perpanjangan untuk dibatalkan.');
  if (extensionId && ext.id !== extensionId) throw new Error('Hanya perpanjangan terakhir yang bisa dibatalkan.');
  if (p.status !== 'active') throw new Error('Perpanjangan hanya bisa dibatalkan di project yang masih aktif.');

  const mine = new Set(p.payments.filter((r) => r.extensionId === ext.id).map((r) => r.no));
  const touched = p.payments.find((r) => mine.has(r.no) && (rowReceived(p, r) > 0 || r.closure));
  if (touched) {
    throw new Error(`Bulan ${touched.no} dari perpanjangan ini sudah dibayar atau ditutup. Batalkan itu dulu.`);
  }
  // A tunggakan carried onto one of its months would lose its month. A
  // Mundur's first month has the old pelunasan's number, which comes back.
  const keep = ext.kind === 'mundur' ? ext.firstNo : null;
  const carried = p.payments.find(
    (r) => r.closure?.kind === 'carry' && mine.has(r.closure.toNo) && r.closure.toNo !== keep
  );
  if (carried) {
    throw new Error(`Tunggakan bulan ${carried.no} digabung ke bulan ${carried.closure.toNo}. Buka dulu penggabungannya.`);
  }

  let payments = p.payments.filter((r) => !mine.has(r.no));
  if (ext.kind === 'mundur') {
    payments = [...payments, ...(ext.replacedRows || [])];
  } else {
    payments = payments.map((r) => {
      if (r.closure?.kind !== 'extend' || r.closure.extensionId !== ext.id) return r;
      const next = { ...r };
      delete next.closure;
      return next;
    });
  }
  payments.sort(byNo);
  return { update: { payments, extensions: list.slice(0, -1) }, extension: ext };
}

/** Whether the latest extension can be undone now, and why not. */
export function undoCheck(project) {
  try {
    applyUndoExtension(project);
    return allow;
  } catch (e) {
    return refuse(e.message);
  }
}
