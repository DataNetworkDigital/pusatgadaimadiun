# PGM: Batalkan Pelunasan, Koreksi Modal, Bayar Sebagian Pokok — Design

Date: 2026-09-28
Status: Approved in chat by Gde ("setuju", 28 Sep 2026). Gde cannot open .md files; the design was reviewed as chat text and this file records it for the implementation.
Repo: DataNetworkDigital/pusatgadaimadiun (deploys to GitHub Pages on every push to `main`)

## 1. Goal

| # | Request | Part |
|---|---|---|
| 1 | A pelunasan dipercepat pressed by mistake must be undoable | Part 1 |
| 2 | A modal typed wrong must be correctable after payments exist | Part 2 |
| 3 | Pelunasan bertahap: part of the principal paid mid-contract (e.g. 20% in month 2), later bagi hasil follow the new principal | Part 3 |

"Diambil anak" (a project, or part of it, belongs to Gde; the calendar shows what to transfer to him after Mas Hena's fee) gets its own spec once Gde answers the fee and principal questions.

## 2. Decisions made with Gde

| Topic | Decision |
|---|---|
| Undo pelunasan | A button on a project closed by pelunasan dipercepat. Money is pulled back from its account, the tagihan the pelunasan removed come back, remainders it closed are billed again, the project is active again. Works on the settlement already in production (SAWAH KOTA SISWATI 2, 25 Sep, Rp 282.000.000). |
| Koreksi modal entry | A separate "Koreksi modal" sheet with a preview, not unlocked fields in Edit Project. |
| Fields corrected | Nilai Project, Modal Keluar, Rekening Sumber. Tanggal mulai stays locked. |
| Nilai Project corrected | Every tagihan is recomputed from the right value, paid months included. Money already received never changes. Payments recorded since 24 Sep are re-spread from the same month; older payments stay on their month and stay settled. |
| Modal Keluar / Rekening Sumber corrected | The funding transaction follows; the difference goes back to or comes out of the account. |
| Bayar sebagian pokok | One button: amount, date, account, and the month from which bagi hasil follow the new principal (default: the next untouched month after the payment). The money lands on the pelunasan, which then asks only for the rest. Repeatable; the latest one can be undone while later months are untouched. |
| Build order | Part 1, Part 2, Diambil anak, Part 3. Each part ships as soon as its review is clean. |

## 3. Part 1: Batalkan pelunasan dipercepat

### 3.1 What a settlement records from now on (`applySettlement`)

- The settlement row stores `dropped`: the rows the pelunasan removed, exactly as they were stored.
- A carry that pointed at a dropped row and is turned into a settlement waive keeps the carry: `closure: { kind: 'waive', reason: 'settlement', amount, at, replaced: <the carry closure> }`. Waives on rows that had no closure get no `replaced`.

Firestore allows these shapes (an array inside a map inside an array); `extensions[].replacedRows` already uses one in production.

### 3.2 Undo as data (`applySettlementUndo(project)` in `settlement.js`)

1. Refused unless `settledEarly` is true and `status` is `'completed'`.
2. The settlement row is the row with `settledEarly: true`; refused if missing.
3. Settlement receipts: every receipt with an allocation on that row. Refused if there is none, or if one of them also pays another row.
4. Dropped rows: `settleRow.dropped` when stored. Otherwise (a settlement recorded before this change) they are rebuilt from the contract with `generateProjectSchedule`, only for a project without extensions and without a contract-day row (`leadCharge`); the rebuilt rows whose `no` is not among the rows left are the dropped ones. Otherwise refused: the schedule cannot be rebuilt.
5. Rows left (without the settlement row): every `reason: 'settlement'` waive is removed. One with `replaced` gets that carry back, its amount re-measured to what the row lacks now (`rowDue + rowCarriedIn − rowReceived`); a carry with nothing to carry is dropped.
6. Receipts: the settlement receipts are removed. Row fields are re-derived (`deriveRowFields`).
7. Status: `'active'` with `closedAt: null`, or `'completed'` keeping `closedAt` if every row is settled without the pelunasan. `settledEarly: false`.

Returns `{ update, removed }` (`removed` = the settlement receipts).

`settlementUndoPreview(project)` returns `{ ok, why, amount, accountId, restored: [{ no, type, amount }], reopened: [{ no, amount }] }` for the confirmation text; it never throws.

### 3.3 Writer (`undoSettlement` in DataContext)

Inside `inProjectTransaction` with `seenWriteId` and `alreadyDone: (p) => !p.settledEarly`:
- decide with `applySettlementUndo`;
- reads first: each removed receipt's transaction, then each account a reversal touches;
- each transaction is reversed as it stands now (`reversalOf`) and deleted; an account that no longer exists is skipped;
- the project is written with `lastWriteId`.

Toast: "Pelunasan dipercepat dibatalkan, project aktif lagi", plus ". Saldo tidak diubah karena transaksi atau rekeningnya sudah tidak ada" when no balance moved.

### 3.4 Screen

On a completed project with `settledEarly`, ProjectDetail shows the button "Batalkan pelunasan dipercepat". A ConfirmDialog explains, from the preview:
"Uang pelunasan Rp X ditarik lagi dari REKENING. Tagihan yang terhapus waktu pelunasan muncul lagi: bulan 2 (Rp 17.600.000). Sisa bulan 3 (Rp 282.000.000) ditagih lagi. Project aktif lagi."
When the preview refuses, the dialog shows why and the confirm button is disabled.

### 3.5 Tests

Round trip on a plain project, a project with a partly paid month, and one with a converted carry (rows after undo equal rows before settlement, apart from derived fields); rebuild of a legacy settlement shaped like SAWAH KOTA SISWATI 2 (rows 1 and 3 left, row 2 rebuilt at Rp 17.600.000 due 17/9, row 3 billed Rp 282.000.000); an edited settlement receipt is still removed whole; refusals (not settled, legacy settlement with extensions, receipt paying two rows).

## 4. Part 2: Koreksi modal

### 4.1 Rules (`capitalCorrectionRules(project)` in `capitalCorrection.js`)

The whole correction is refused on a project that is macet, rolled over into a new contract, a new contract itself (`fundingMode: 'rollover'`), or closed by pelunasan dipercepat ("Batalkan dulu pelunasannya, lalu koreksi modal.").
A change of Nilai Project is refused as well while the project has an extension ("Batalkan dulu perpanjangannya…") or a month closed by anything other than an old-shortfall waiver ("Bulan N sudah digabung atau dianggap lunas. Buka lagi dulu…"). Modal Keluar and Rekening Sumber can still be corrected then, because the schedule does not change.

### 4.2 Nilai Project as data (`applyCapitalCorrection`)

- Interest rows: `calcMonthlyInterest(newPrincipal, row.ratePct)` when the row stores `ratePct`; otherwise `round(row.expectedAmount × newPrincipal / oldPrincipal)`, which keeps the row's own rate (89 production rows have no `ratePct`; 4 of them do not match principal × tier).
- The pelunasan row asks for `newPrincipal`.
- Old-shortfall waivers are removed and measured again during the replay.
- Receipts are replayed in stored order. An old confirmation (`legacy-`, not moved, not reopened) keeps its allocation whatever the amount, and a gap on its row becomes the old-shortfall waiver again. Any other receipt is re-allocated with `allocateReceipt` from its first row, or from the first open row after it when that row is already covered. A receipt that no longer fits refuses the whole correction and names the payment.
- Row fields are re-derived and `statusChange` applies (a completed project whose tagihan open again becomes active; an active one whose tagihan all close is completed).

Returns `{ update, rows }`: `rows` pairs each row's amount and state before and after for the preview.

### 4.3 Money (`correctCapital` in DataContext)

Inside `inProjectTransaction` with `seenWriteId`:
- Modal Keluar or Rekening Sumber changed: the funding transaction must exist ("Transaksi pendanaan project ini tidak ditemukan…" otherwise). Balance deltas per account: the funding transaction reversed as it stands (`reversalOf`), then `newDisbursed` out of the new account. The new account must exist. The funding transaction gets the new amount and account.
- Nilai Project changed: receipts whose months changed get a new `description` and `paymentNo` on their transaction (read first; a missing one is skipped), as `moveReceipt` does.
- Toast: "Modal dikoreksi".

### 4.4 Screen

- ProjectDetail: "Koreksi modal" link under the Detail card when Edit Project locks the capital (a receipt or a closure exists), on active and completed projects, never on macet, new-contract or rolled-over projects. On a project closed by pelunasan dipercepat the sheet opens and explains.
- `CapitalCorrectionSheet.jsx`: Nilai Project, Modal Keluar, Rekening Sumber; a hint with the usual Modal Keluar (Nilai − bagi hasil bulan 1); a preview listing each month whose amount or state changes ("Bulan 2: Rp 2.750.000 → Rp 2.200.000, jadi Lunas") and each account's balance change; errors inline; "Simpan koreksi" disabled when nothing changes or the preview refuses; `seenWriteId` from the project it showed.
- ProjectForm lock note: Nilai project, modal keluar and rekening sumber are corrected through Koreksi modal on the project page; tanggal mulai cannot change.

### 4.5 Tests

Rules; Nilai down with old confirmations (stay settled, waivers re-measured, ALFRIDO-like overpayment stays on its month); Nilai up (paid months become Kurang); replay moves a spilled overpayment back onto its month; a receipt that no longer fits is refused; rows without `ratePct` scale; Modal Keluar alone leaves the schedule untouched; closures and extensions block Nilai but not Modal Keluar; a completed project reopens.

## 5. Part 3: Bayar sebagian pokok

### 5.1 Data

- `principalPayments[]` on the project: `{ id, at, amount, fromNo }`; `id` is the receipt id.
- The money is a normal receipt on the pelunasan row (`allocations: [{ no: final.no, amount }]`) with its income transaction ("Bayar sebagian pokok project: NAMA").
- The base of an interest row is `principalAmount − Σ amount` of the steps whose `fromNo ≤ row.no`; its tagihan is `calcMonthlyInterest(base, rate)`. A row without `ratePct` gets one fixed from its old amount and base the first time it is recomputed.

### 5.2 Rules

Allowed on an active project, not closed by pelunasan dipercepat, not rolled over, without extensions, whose pelunasan has no closure and more left than the amount (paying everything is Tutup: Pelunasan). The months that can follow the new principal are the untouched interest rows (no receipt, no closure) that only untouched rows follow; the default is the first of them due after the payment date. With none left, only the pelunasan shrinks.

### 5.3 Writer and undo

- `recordPrincipalPayment`: receipt + transaction + balance credit (Tunai allowed), rows from `fromNo` recomputed, the step appended; the pelunasan-remainder sheet does not open.
- "Batalkan bayar pokok" on the latest step: allowed while its rows are still untouched and the pelunasan has no closure; the receipt is cancelled as `cancelReceipt` does (transaction reversed as it stands, deleted), the step removed, rows recomputed from the remaining steps.
- Corrections (Edit / Pindah / Batalkan) on a step's receipt are refused: "Ini pembayaran sebagian pokok. Kalau salah, batalkan lewat Batalkan bayar pokok."
- Mundur stays refused once the pelunasan has money (existing message points to Atur sisa pelunasan); Diperpanjang works on the rest.
- Koreksi modal: interest rows use `newPrincipal − steps` as their base; refused when the new Nilai Project is not above the steps' total.

### 5.4 Screen

Detail: "Bayar sebagian pokok" next to the pelunasan actions; a "Pembayaran pokok" list with the latest step's undo. Sheet: amount (with its percent of the principal), date, account, month to start from, preview of the recomputed months and "Pelunasan tinggal Rp X".

## 6. Out of scope

Correcting tanggal mulai; correcting a macet recovery; sending corrections to DanaTrack (Edit Project does not either); Bayar sebagian pokok on an extended project.
