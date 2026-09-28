# Diambil Anak Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mark a project, or part of it, as taken by the son; show it in purple, and show in the calendar how much to transfer to him (his share of bagi hasil less Mas Hena's 0,5%, and his share of principal).

**Architecture:** A pure `anakShare.js` computes the son's share of any arrival of money or of a tagihan still owed, from `project.anak = { amount, feePct }`. A small writer stores the setting; the project list, project page and calendar read the pure functions. A Kontrak baru keeps the son's percentage.

**Tech Stack:** React 19, Vite 8, Tailwind, Firebase Firestore, Vitest 5. Spec: `docs/superpowers/specs/2026-09-29-diambil-anak-design.md`. Branch `feat/diambil-anak`.

---

### Task 1: The calculation

**Files:** Create `src/utils/anakShare.js`, `src/utils/anakShare.test.js`

- [ ] **Step 1: Tests**

```js
import { describe, it, expect } from 'vitest';
import { anakBagiHasil, anakFromReceipt, anakFromRow, anakRatio, anakSummary, cleanAnak } from './anakShare';

const due = (month) => new Date(2026, month, 5);
// Nilai 100jt, 5,5% for months 1-3 and 6,5% after; the son took 50jt.
const project = (over = {}) => ({
  principalAmount: 100_000_000,
  monthlyReturnPct: 5.5,
  returnPctTier1: 5.5,
  returnPctTier2: 6.5,
  anak: { amount: 50_000_000, feePct: 0.5 },
  payments: [
    { no: 1, type: 'interest', dueDate: due(6), expectedAmount: 5_500_000, ratePct: 5.5 },
    { no: 2, type: 'interest', dueDate: due(7), expectedAmount: 5_500_000, ratePct: 5.5 },
    { no: 3, type: 'interest', dueDate: due(8), expectedAmount: 6_500_000, ratePct: 6.5 },
    { no: 4, type: 'final', dueDate: due(9), expectedAmount: 100_000_000, ratePct: null },
  ],
  receipts: [],
  ...over,
});
const receipt = (id, allocations) => ({
  id,
  amount: allocations.reduce((s, a) => s + a.amount, 0),
  date: due(6),
  accountId: 'bca',
  transactionId: id,
  allocations,
});

describe('anakRatio', () => {
  it('is the part of Nilai Project the son took', () => {
    expect(anakRatio(project())).toBe(0.5);
    expect(anakRatio(project({ anak: null }))).toBe(0);
    expect(anakRatio(project({ anak: { amount: 150_000_000, feePct: 0.5 } }))).toBe(1);
  });
});

describe('anakBagiHasil', () => {
  it('gives the son his part less Mas Hena 0,5% of it a month (Gde, 28-29 Sep 2026)', () => {
    const p = project();
    expect(anakBagiHasil(p, p.payments[0], 5_500_000)).toEqual({ net: 2_500_000, fee: 250_000 });
    expect(anakBagiHasil(p, p.payments[2], 6_500_000)).toEqual({ net: 3_000_000, fee: 250_000 });
  });

  it('keeps the proportion on a partial payment', () => {
    const p = project();
    expect(anakBagiHasil(p, p.payments[0], 2_750_000)).toEqual({ net: 1_250_000, fee: 125_000 });
  });

  it('reads the rate an old row implies', () => {
    const p = project({ principalAmount: 60_000_000, anak: { amount: 60_000_000, feePct: 0.5 } });
    const old = { no: 1, type: 'interest', expectedAmount: 3_000_000, ratePct: null };
    expect(anakBagiHasil(p, old, 3_000_000)).toEqual({ net: 2_700_000, fee: 300_000 });
  });
});

describe('anakFromReceipt', () => {
  it('splits one arrival over bagi hasil and the pelunasan', () => {
    const p = project();
    const r = receipt('r1', [{ no: 3, amount: 6_500_000 }, { no: 4, amount: 100_000_000 }]);
    expect(anakFromReceipt({ ...p, receipts: [r] }, r)).toEqual({
      bagiHasil: 3_000_000, fee: 250_000, pokok: 50_000_000, total: 53_000_000,
    });
  });

  it('counts a tunggakan carried onto the pelunasan as bagi hasil, paid first', () => {
    const p = project();
    p.payments[2] = { ...p.payments[2], closure: { kind: 'carry', amount: 6_500_000, toNo: 4 } };
    const first = receipt('a', [{ no: 4, amount: 5_000_000 }]);
    const second = receipt('b', [{ no: 4, amount: 101_500_000 }]);
    const q = { ...p, receipts: [first, second] };
    expect(anakFromReceipt(q, first)).toEqual({ bagiHasil: 2_272_727, fee: 227_273, pokok: 0, total: 2_272_727 });
    expect(anakFromReceipt(q, second)).toEqual({
      bagiHasil: 681_818, fee: 68_182, pokok: 50_000_000, total: 50_681_818,
    });
  });

  it('gives the son his part of principal paid back early, without fee', () => {
    const p = project({ principalPayments: [{ id: 'pk', amount: 20_000_000, fromNo: 3, at: due(7) }] });
    const r = receipt('pk', [{ no: 4, amount: 20_000_000 }]);
    expect(anakFromReceipt({ ...p, receipts: [r] }, r)).toEqual({ bagiHasil: 0, fee: 0, pokok: 10_000_000, total: 10_000_000 });
  });

  it('gives nothing on a project not taken by the son', () => {
    const p = project({ anak: null });
    const r = receipt('r1', [{ no: 1, amount: 5_500_000 }]);
    expect(anakFromReceipt({ ...p, receipts: [r] }, r).total).toBe(0);
  });
});

describe('anakFromRow', () => {
  it('plans the son part of what is still owed', () => {
    const p = project({ receipts: [receipt('r1', [{ no: 1, amount: 2_750_000 }])] });
    expect(anakFromRow(p, p.payments[0])).toEqual({ bagiHasil: 1_250_000, fee: 125_000, pokok: 0, total: 1_250_000 });
    expect(anakFromRow(p, p.payments[3]).pokok).toBe(50_000_000);
  });
});

describe('cleanAnak', () => {
  it('keeps a valid part and refuses the rest', () => {
    expect(cleanAnak(project(), { amount: 50_000_000.4, feePct: 0.5 })).toEqual({ amount: 50_000_000, feePct: 0.5 });
    expect(cleanAnak(project(), null)).toBe(null);
    expect(() => cleanAnak(project(), { amount: 0, feePct: 0.5 })).toThrow('lebih dari 0');
    expect(() => cleanAnak(project(), { amount: 120_000_000, feePct: 0.5 })).toThrow('nilai project');
    expect(() => cleanAnak(project(), { amount: 50_000_000, feePct: NaN })).toThrow('Fee Mas Hena');
  });
});

describe('anakSummary', () => {
  it('shows a month at each rate and the principal share', () => {
    expect(anakSummary(project())).toEqual({
      ratio: 0.5,
      first: { net: 2_500_000, fee: 250_000 },
      later: { net: 3_000_000, fee: 250_000 },
      pokok: 50_000_000,
    });
  });
});
```

- [ ] **Step 2: Run, see it fail** — `npx vitest run src/utils/anakShare.test.js` fails (module missing).

- [ ] **Step 3: Implement `src/utils/anakShare.js`**

```js
import { rowCarriedIn, rowDue, rowReceived, rowRemaining } from './paymentStatus';
import { normalizeProject } from './normalizeProject';
import { principalPaidBefore } from './principalPayment';
import { calcMonthlyInterest, resolveTiers } from './projectSchedule';

/**
 * Diambil anak (spec 2026-09-29): part of a project, or all of it, belongs to
 * the owner's son. Of every bagi hasil he gets that part, less Mas Hena's fee
 * of `feePct` % a month on it; of every rupiah of principal that comes back,
 * that part. Pure: it only says how much; the transfer happens outside the app.
 */

export const DEFAULT_ANAK_FEE_PCT = 0.5;

/** The son's part as a fraction of Nilai Project; 0 when the project is not his. */
export function anakRatio(project) {
  const amount = Number(project?.anak?.amount) || 0;
  const principal = Number(project?.principalAmount) || 0;
  if (amount <= 0 || principal <= 0) return 0;
  return Math.min(1, amount / principal);
}

function feePctOf(project) {
  const fee = Number(project?.anak?.feePct);
  return Number.isFinite(fee) && fee >= 0 ? fee : DEFAULT_ANAK_FEE_PCT;
}

// The monthly rate a bagi hasil is asked at, in percent of its principal. A
// tunggakan carried onto a pelunasan was the bagi hasil of a normal month.
function rateOf(project, row) {
  if (row?.type === 'final') return resolveTiers(project).tier1;
  const stored = Number(row?.ratePct);
  if (row?.ratePct != null && Number.isFinite(stored)) return stored;
  const base =
    row?.baseAmount ?? (Number(project?.principalAmount) || 0) - principalPaidBefore(project, row?.no ?? 0);
  return base > 0 ? (rowDue(row) * 100) / base : 0;
}

/** The son's part of `amount` of bagi hasil on `row`, and Mas Hena's fee taken from it. */
export function anakBagiHasil(project, row, amount) {
  const gross = Math.round((Number(amount) || 0) * anakRatio(project));
  if (gross <= 0) return { net: 0, fee: 0 };
  const rate = rateOf(project, row);
  const fee = rate > 0 ? Math.min(gross, Math.round((gross * feePctOf(project)) / rate)) : gross;
  return { net: gross - fee, fee };
}

const empty = () => ({ bagiHasil: 0, fee: 0, pokok: 0, total: 0 });

// Adds the son's part of `amount` on `row` to `out`. On a pelunasan the first
// `tunggakanLeft` rupiah pay a tunggakan carried onto it and are bagi hasil.
function addShare(p, row, amount, tunggakanLeft, out) {
  if (row.type === 'final') {
    const tunggakan = Math.max(0, Math.min(amount, tunggakanLeft));
    const bh = anakBagiHasil(p, row, tunggakan);
    out.bagiHasil += bh.net;
    out.fee += bh.fee;
    out.pokok += Math.round((amount - tunggakan) * anakRatio(p));
  } else {
    const bh = anakBagiHasil(p, row, amount);
    out.bagiHasil += bh.net;
    out.fee += bh.fee;
  }
}

/**
 * What goes to the son from one arrival of money: his part of the bagi hasil
 * it paid (less the fee) and of the principal it brought back.
 * @returns {{ bagiHasil, fee, pokok, total }}
 */
export function anakFromReceipt(project, receipt) {
  const p = normalizeProject(project);
  const out = empty();
  if (!anakRatio(p) || !receipt) return out;
  // Money already on each tagihan before this arrival, in the order recorded.
  const before = new Map();
  for (const r of p.receipts || []) {
    if (r.id === receipt.id) break;
    for (const a of r.allocations || []) before.set(a.no, (before.get(a.no) || 0) + (Number(a.amount) || 0));
  }
  for (const a of receipt.allocations || []) {
    const row = (p.payments || []).find((r) => r.no === a.no);
    if (!row) continue;
    const tunggakanLeft = row.type === 'final' ? rowCarriedIn(p, row) - (before.get(a.no) || 0) : 0;
    addShare(p, row, Number(a.amount) || 0, tunggakanLeft, out);
  }
  out.total = out.bagiHasil + out.pokok;
  return out;
}

/** What the son is due from what is still owed on `row` (the calendar's plan). */
export function anakFromRow(project, row) {
  const p = normalizeProject(project);
  const out = empty();
  if (!anakRatio(p) || !row) return out;
  const tunggakanLeft = row.type === 'final' ? rowCarriedIn(p, row) - rowReceived(p, row) : 0;
  addShare(p, row, rowRemaining(p, row), tunggakanLeft, out);
  out.total = out.bagiHasil + out.pokok;
  return out;
}

/** The son's part checked for saving, or null to stop marking the project. */
export function cleanAnak(project, anak) {
  if (!anak) return null;
  const principal = Number(project?.principalAmount) || 0;
  const amount = Math.round(Number(anak.amount) || 0);
  const feePct = Number(anak.feePct);
  if (amount <= 0) throw new Error('Bagian anak harus lebih dari 0');
  if (amount > principal) throw new Error('Bagian anak tidak boleh lebih dari nilai project');
  if (!Number.isFinite(feePct) || feePct < 0 || feePct >= 100) {
    throw new Error('Fee Mas Hena harus 0 sampai di bawah 100%');
  }
  return { amount, feePct };
}

/**
 * For the project page: the son's part, a month at each rate (on the
 * principal the bagi hasil follow now) and his share of the principal still
 * to come back. Null when the project is not his.
 */
export function anakSummary(project, anak = project?.anak) {
  const withAnak = { ...project, anak };
  const ratio = anakRatio(withAnak);
  if (!ratio) return null;
  const { tier1, tier2 } = resolveTiers(project);
  const principal = Number(project.principalAmount) || 0;
  const base = principal - principalPaidBefore(project, Infinity);
  const month = (rate) => anakBagiHasil(withAnak, { type: 'interest', ratePct: rate }, calcMonthlyInterest(base, rate));
  const paidBack = (project.principalPayments || []).reduce((s, x) => s + (Number(x.amount) || 0), 0);
  return {
    ratio,
    first: month(tier1),
    later: tier2 !== tier1 ? month(tier2) : null,
    pokok: Math.round((principal - paidBack) * ratio),
  };
}
```

- [ ] **Step 4: Run, see it pass** — `npx vitest run src/utils/anakShare.test.js`.
- [ ] **Step 5: Commit** — `git add src/utils/anakShare.js src/utils/anakShare.test.js && git commit -m "feat: the son's share of a project's money, less Mas Hena's fee"`

### Task 2: Writer and Kontrak baru

**Files:** Modify `src/contexts/DataContext.jsx`

- [ ] **Step 1: Import** after the principalPayment import:

```js
import { DEFAULT_ANAK_FEE_PCT, anakRatio, cleanAnak } from '../utils/anakShare';
```

- [ ] **Step 2: Writer**, inserted after `correctCapital`:

```js

  // Diambil anak (spec 2026-09-29): which part of a project is the son's. No
  // money moves; the calendar shows what to transfer to him.
  async function setProjectAnak(projectId, { anak, seenWriteId } = {}) {
    const on = await inProjectTransaction(projectId, (t, project, ref, writeId) => {
      const cleaned = cleanAnak(project, anak);
      t.update(ref, { anak: cleaned, lastWriteId: writeId });
      return !!cleaned;
    }, { seenWriteId });
    toast(on ? 'Ditandai diambil anak' : 'Tanda diambil anak dilepas');
  }
```

- [ ] **Step 3: Kontrak baru keeps the son's part.** In `rolloverProject`, in the object given to `t.set(newRef, {`, after `rolledFromProjectId: oldProjectId,` add:

```js
          // The son's part carries over with the remainder (spec 2026-09-29).
          ...(anakRatio(old) > 0
            ? {
                anak: {
                  amount: Math.round(anakRatio(old) * principalAmount),
                  feePct: old.anak.feePct ?? DEFAULT_ANAK_FEE_PCT,
                },
              }
            : {}),
```

- [ ] **Step 4: Export** — add `setProjectAnak,` after `correctCapital,` in `value`.
- [ ] **Step 5: Build and commit** — `npx vite build`; `git commit -m "feat: setProjectAnak, and a Kontrak baru keeps the son's part"`

### Task 3: Purple, the project page and the sheet

**Files:** Modify `tailwind.config.js`, `src/components/common/Pill.jsx`, `src/components/Projects/ProjectCard.jsx`, `src/components/Projects/ProjectDetail.jsx`; create `src/components/Projects/AnakSheet.jsx`

- [ ] **Step 1: Color.** In `tailwind.config.js` after the `emas` line add `anak: { DEFAULT: '#7A5AA6', soft: '#F1EBF8' },`; in `Pill.jsx` add the tone `anak: 'bg-anak-soft text-anak',`.

- [ ] **Step 2: Project card.** In `ProjectCard.jsx` import `anakRatio` from `../../utils/anakShare`, add `const isAnak = anakRatio(project) > 0;`, change the Link's `bg-paper` to `${isAnak ? 'bg-anak-soft' : 'bg-paper'}` and after the Macet pill add `{isAnak && <Pill tone="anak">Anak</Pill>}`.

- [ ] **Step 3: The sheet** `src/components/Projects/AnakSheet.jsx`:

```jsx
import { useMemo, useState } from 'react';
import Modal from '../common/Modal';
import CurrencyInput from '../common/CurrencyInput';
import { formatCurrency } from '../../utils/formatCurrency';
import { DEFAULT_ANAK_FEE_PCT, anakSummary, cleanAnak } from '../../utils/anakShare';

const pct = (ratio) => `${Math.round(ratio * 1000) / 10}%`;

// Diambil anak (spec 2026-09-29): which part of the project is the son's, and
// Mas Hena's fee on it. The preview shows what he gets each month and when the
// principal comes back.
export default function AnakSheet({ open, onClose, project, onSubmit }) {
  if (!open || !project) return null;
  return <AnakForm key={project.id} onClose={onClose} project={project} onSubmit={onSubmit} />;
}

function AnakForm({ onClose, project, onSubmit }) {
  const [on, setOn] = useState(!!project.anak);
  const [amount, setAmount] = useState(Number(project.anak?.amount) || Number(project.principalAmount) || 0);
  const [feePct, setFeePct] = useState(String(project.anak?.feePct ?? DEFAULT_ANAK_FEE_PCT));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [seenWriteId] = useState(() => project.lastWriteId ?? null);

  const checked = useMemo(() => {
    if (!on) return { anak: null };
    try {
      return { anak: cleanAnak(project, { amount, feePct: feePct === '' ? NaN : Number(feePct) }) };
    } catch (e) {
      return { error: e.message };
    }
  }, [project, on, amount, feePct]);
  const summary = checked.anak ? anakSummary(project, checked.anak) : null;
  const unchanged = JSON.stringify(checked.anak ?? null) === JSON.stringify(project.anak ?? null);

  async function submit() {
    setError('');
    setSubmitting(true);
    try {
      await onSubmit({ anak: checked.anak, seenWriteId });
      onClose();
    } catch (e) {
      setError(e.message || 'Gagal menyimpan');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Diambil anak"
      subtitle={project.name}
      footer={
        <button
          type="button"
          className="btn-primary w-full"
          disabled={submitting || !!checked.error || unchanged}
          onClick={submit}
        >
          {submitting ? 'Menyimpan…' : 'Simpan'}
        </button>
      }
    >
      <div className="space-y-4">
        <label className="flex items-center justify-between gap-3 rounded-xl border border-line bg-paper p-3">
          <span className="text-[14px] font-semibold text-ink">Project ini diambil anak</span>
          <input
            type="checkbox"
            className="w-5 h-5 accent-anak"
            checked={on}
            onChange={(e) => setOn(e.target.checked)}
          />
        </label>
        {on && (
          <>
            <div>
              <label className="label-text">Bagian anak (dari nilai project {formatCurrency(project.principalAmount)})</label>
              <CurrencyInput value={amount} onChange={setAmount} />
            </div>
            <div>
              <label className="label-text">Fee Mas Hena (% per bulan dari bagian anak)</label>
              <input
                type="number"
                step="0.1"
                min="0"
                className="input-field"
                value={feePct}
                onChange={(e) => setFeePct(e.target.value)}
              />
            </div>
          </>
        )}
        {checked.error && <p className="text-[13px] text-terra">{checked.error}</p>}
        {summary && (
          <div className="bg-anak-soft rounded-xl p-3 text-[13px] text-ink-soft space-y-1 leading-snug">
            <div>Bagian anak {pct(summary.ratio)} dari nilai project.</div>
            <div>
              Bagi hasil ke anak {formatCurrency(summary.first.net)} per bulan, setelah fee Mas Hena{' '}
              {formatCurrency(summary.first.fee)}
              {summary.later ? `. Mulai bulan 4: ${formatCurrency(summary.later.net)}` : ''}.
            </div>
            <div>Saat pelunasan, pokok ke anak {formatCurrency(summary.pokok)}.</div>
          </div>
        )}
        {!on && project.anak && (
          <p className="text-[13px] text-ink-soft">Tanda diambil anak akan dilepas dari project ini.</p>
        )}
        {error && <p className="text-[13px] text-terra">{error}</p>}
      </div>
    </Modal>
  );
}
```

- [ ] **Step 4: Project page.** In `ProjectDetail.jsx`:
  - import `AnakSheet from './AnakSheet'` and `{ anakRatio, anakSummary } from '../../utils/anakShare'`;
  - add `setProjectAnak` to the `useData()` destructuring and `const [editingAnak, setEditingAnak] = useState(false);`;
  - after `const pelunasanLeft = …;` add `const anakInfo = anakSummary(project);`;
  - after the Macet pill in the header add `{anakRatio(project) > 0 && <Pill tone="anak">Anak</Pill>}`;
  - right before `{project.proofUrl && (` add:

```jsx
      {anakInfo ? (
        <button
          type="button"
          onClick={() => setEditingAnak(true)}
          className="w-full text-left mb-3.5 rounded-2xl border border-anak/30 bg-anak-soft px-4 py-3 active:opacity-80"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-[13px] font-semibold text-anak">
              Diambil anak · {formatCurrency(project.anak.amount)} ({Math.round(anakInfo.ratio * 1000) / 10}%)
            </span>
            <span className="text-[12px] font-semibold text-anak">Ubah →</span>
          </div>
          <div className="text-[12px] text-ink-soft mt-1 leading-snug">
            Bagi hasil ke anak {formatCurrency(anakInfo.first.net)} per bulan setelah fee Mas Hena{' '}
            {formatCurrency(anakInfo.first.fee)}
            {anakInfo.later ? `, mulai bulan 4 ${formatCurrency(anakInfo.later.net)}` : ''}. Saat pelunasan, pokok ke
            anak {formatCurrency(anakInfo.pokok)}.
          </div>
        </button>
      ) : (
        !isDefault && (
          <button
            type="button"
            onClick={() => setEditingAnak(true)}
            className="flex items-center gap-2 w-full px-4 py-3 mb-3.5 bg-paper border border-line rounded-2xl text-[13px] text-anak font-semibold active:bg-cream-deep"
          >
            <span className="flex-1 text-left">Tandai diambil anak</span>
            <span>→</span>
          </button>
        )
      )}
```

  - after the `<PrincipalPaymentSheet … />` element add:

```jsx
      <AnakSheet
        open={editingAnak}
        onClose={() => setEditingAnak(false)}
        project={project}
        onSubmit={(data) => setProjectAnak(project.id, data)}
      />
```

- [ ] **Step 5: Build, lint, commit** — `git commit -m "feat: Diambil anak in purple on the project list and page, with its sheet"`

### Task 4: Calendar

**Files:** Modify `src/components/Calendar/CalendarGrid.jsx`, `src/components/Calendar/DayDetail.jsx`

- [ ] **Step 1: Grid dot.** Import `{ anakFromReceipt, anakFromRow, anakRatio }`; in `indicators` add `let hasAnak = false;` and, inside the projects loop before its `status !== 'active'` return:

```js
      if (anakRatio(p) > 0) {
        const due = p.status === 'active' && (p.payments || []).some(
          (pay) => !isSettled(p, pay) && isSameDay(toDate(pay.dueDate), date) && anakFromRow(p, pay).total > 0
        );
        const arrived = (p.receipts || []).some(
          (r) => isSameDay(toDate(r.date), date) && anakFromReceipt(p, r).total > 0
        );
        if (due || arrived) hasAnak = true;
      }
```

  return `hasAnak`, render `{ind.hasAnak && <span className={`${dotBase} ${dotColor('bg-anak')}`} />}` after the project dot, and add a legend item "Ke anak" with `bg-anak`.

- [ ] **Step 2: Day detail.** Import `{ anakFromReceipt, anakFromRow, anakRatio }`; after `dayProjectPayments` is built add:

```js
  // Diambil anak: what came in today for the son, and his part of what is due today.
  const anakIn = [];
  projects.forEach((p) => {
    if (!anakRatio(p)) return;
    const total = (p.receipts || [])
      .filter((r) => isSameDay(toDate(r.date), date))
      .reduce((s, r) => s + anakFromReceipt(p, r).total, 0);
    if (total > 0) anakIn.push({ project: p, total });
  });
  const anakDue = dayProjectPayments.reduce((s, { project, payment }) => s + anakFromRow(project, payment).total, 0);
```

  right after `<SectionTitle>{formatDate(date)}</SectionTitle>` add:

```jsx
      {(anakIn.length > 0 || anakDue > 0) && (
        <div className="mb-2 rounded-2xl border border-anak/30 bg-anak-soft px-4 py-3 text-[13px] text-ink-soft space-y-1">
          <div className="font-semibold text-anak">Transfer ke anak</div>
          {anakIn.map(({ project, total }) => (
            <div key={project.id} className="flex justify-between gap-2">
              <span className="truncate">Uang masuk · {project.name}</span>
              <span className="font-num font-semibold text-ink whitespace-nowrap">{formatCurrency(total)}</span>
            </div>
          ))}
          {anakDue > 0 && (
            <div className="flex justify-between gap-2">
              <span>Dari tagihan hari ini, kalau dibayar</span>
              <span className="font-num font-semibold text-ink whitespace-nowrap">{formatCurrency(anakDue)}</span>
            </div>
          )}
        </div>
      )}
```

  and in the project payment row, make the icon box `${anakRatio(project) > 0 ? 'bg-anak-soft text-anak' : 'bg-indigo-soft text-indigo'}` and add after the "termasuk tunggakan" part:

```jsx
                {anakRatio(project) > 0 && (
                  <span className="text-anak font-semibold"> · ke anak {formatCurrency(anakFromRow(project, payment).total)}</span>
                )}
```

- [ ] **Step 3: Build, lint, commit** — `git commit -m "feat: the calendar shows what to transfer to the son"`

### Task 5: Verify

- [ ] Full suite passes; build succeeds; no new lint errors.
- [ ] Demo: mark Pak Budi (10jt, 4,5%) as taken 5jt (50%), fee 0,5%: the card turns purple with "Anak"; the page card says bagi hasil ke anak Rp 200.000 per bulan after fee Rp 25.000, pelunasan pokok Rp 5.000.000. Calendar: the next due day has a purple dot and "Transfer ke anak · Dari tagihan hari ini, kalau dibayar Rp 200.000"; pay that month and the day of payment shows "Uang masuk · … Rp 200.000". Turn it off; the purple goes. Restore the demo data.
