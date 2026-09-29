# PGM: Diambil Anak — Design

Date: 2026-09-29
Status: Rules decided by Gde in chat (28-29 Sep 2026: "toggle diambil anak, warna beda, munculkan di kalender berapa yang harus ditransfer ke anak"; "bisa dicustom misal diambil anak sebagian, misal 50jt … yang dibagi ke anak ya bagi hasil sesuai persentase … jangan lupa ada fee mas hena"; "1. ya" = the fee is 0,5% a month of the son's part, taken off before the transfer, and the son's part of the principal is transferred at pelunasan). Gde cannot open .md files; this file records the design for the implementation.
Repo: DataNetworkDigital/pusatgadaimadiun (deploys to GitHub Pages on every push to `main`)

## 1. Rules

- A project, or part of it, can be marked as taken by the son (Gde). The part is typed in rupiah (e.g. 50.000.000 of a 100.000.000 project = 50%); default is the whole Nilai Project.
- Of every bagi hasil that arrives, the son gets his percentage, less Mas Hena's fee: `feePct` % a month of the son's part (default 0,5%). Example: part 50jt, bagi hasil 5,5% → 2.750.000, fee 250.000, transfer 2.500.000. In a 6,5% month: 3.250.000 − 250.000 = 3.000.000. A partial payment gives the same proportion.
- Of every rupiah of principal that comes back (the pelunasan, a pelunasan dipercepat, a Bayar sebagian pokok), the son gets his percentage, with no fee.
- Money on a pelunasan pays a tunggakan carried onto it first (as the pelunasan dipercepat suggestion counts it); that part is bagi hasil.
- Mas Hena's fee is shared in proportion: the son bears it only on his part (Gde, 29 Sep 2026: "fee mas hena dibagi proporsional").
- A pelunasan dipercepat brings back, as principal, at most the principal that was left on the pelunasan (a tunggakan carried onto it left out). Whatever it asked above that, a tunggakan it closed or a later month's higher rate, is bagi hasil and carries the fee. Example: 100jt, 50jt the son's, 5,5%; bulan 2 paid 3,3jt with the 2,2jt short carried onto bulan 3, then settled early for 102,2jt: 50jt principal and 1,1jt bagi hasil less a 100rb fee go to the son, 51jt in all.
- The app only shows the amounts; the transfer itself happens outside the app and is not recorded.
- A Kontrak baru made from a project taken by the son keeps the same percentage and fee on the new Nilai Project.

## 2. Data

`project.anak = { amount, feePct }`, or absent/null when the project is not taken by the son. A pelunasan dipercepat row stores `principalLeft`, the principal left on the pelunasan just before it (`principalLeftOf`, the number the suggestion uses); a row recorded before 29 Sep 2026 has none and counts as principal only. `0 < amount ≤ principalAmount`, `0 ≤ feePct < 100`. Written by a new writer `setProjectAnak(projectId, { anak, seenWriteId })` through `inProjectTransaction`; no money moves.

## 3. Calculation (`src/utils/anakShare.js`, pure)

- `anakRatio(project)` = `min(1, anak.amount / principalAmount)`, 0 when not taken.
- `anakBagiHasil(project, row, amount)` → `{ net, fee }`: gross = amount × ratio; the fee is the part `feePct / rate` of it, where `rate` is the row's `ratePct`, or the rate its amount implies on its base (`baseAmount` for an extension row, principal minus earlier principal payments otherwise); on a pelunasan (a carried tunggakan, or a pelunasan dipercepat's amount above `principalLeft`) the project's first-tier rate. On a pelunasan that bagi hasil is paid before the principal.
- `anakFromReceipt(project, receipt)` → `{ bagiHasil, fee, pokok, total }` for one arrival of money.
- `anakFromRow(project, row)` → the same for what is still owed on a tagihan (the calendar's plan).

## 4. Screens

- Project list: a project taken by the son has a purple card and an "Anak" label.
- Project page: "Anak" label in the header; a "Diambil anak" card showing the part, its percentage, the fee, the monthly transfer (first-tier month) and the principal share, with "Ubah"; for a project not taken, a "Tandai diambil anak" button. The sheet has an on/off switch, the part (Rp), the fee (% a month) and a preview.
- Calendar: a purple dot on days with money for the son (due or arrived). The day's detail starts with "Transfer ke anak": what came in that day for him (per project) and what is due that day (if paid); tagihan of such projects are purple with "ke anak Rp X".

## 5. Out of scope

Recording the transfers; exports; the dashboard; the up-front month (potongan di muka), which is taken at disbursement and never arrives as money.
