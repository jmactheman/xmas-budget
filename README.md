# Christmas 2026 Budget

Tiny phone-first web app for tracking Christmas purchases against the budget.
Vanilla HTML/CSS/JS, no build step, hosted on GitHub Pages.

**Live:** https://jmactheman.github.io/xmas-budget/

## How it works
- Data lives in Supabase (the existing Peptide Tracker project) in tables `budget` and `purchases`,
  matching the CFO data contract.
- The tables are **not** readable with the public key. The app only calls PIN-checked functions:
  `xmas_status`, `xmas_set_pin` (works once, only while no PIN exists), `xmas_get`, `xmas_add`, `xmas_delete`.
  The PIN is stored bcrypt-hashed; 20 wrong PINs in 15 minutes locks everything for 15 minutes.
- `xmas_add` rejects card names containing 4+ digits (no card numbers).
- `purchases.item` (text, optional) is an extra column beyond the CFO contract: what was bought, e.g. "Art easel".

## Admin (Supabase SQL editor)
Change the PIN:
```sql
delete from public.xmas_pin;   -- then open the app and set a new one right away
```
Change budget amounts:
```sql
update public.budget set budget = 800 where person = 'Ella' and season = '2026';
```

## CFO read access
Role `cfo_xmas` exists (migration `xmas_cfo_reader_role`): SELECT on `budget` and `purchases`, UPDATE on
`purchases.quicken_txn_id` only, nothing else (no insert/delete, no other columns, no other tables, no PIN
table, no RPCs). Connection limit 3, 30s statement timeout. It was created without login; see below.

To turn it on, run once in the Supabase SQL editor with a password you choose, and store that password in
the CFO's secret store (never in the vault or this repo):
```sql
alter role cfo_xmas with login password '<choose-a-strong-password>';
```
Connect via the **Session pooler** (Dashboard → Connect) as user `cfo_xmas.mxcpjsdvdqhgutdzzggo`, database `postgres`.

To revoke: `alter role cfo_xmas nologin;`

Login is **on** (2026-11-11). The CFO's nightly sync (`CFO/automation/xmas_sync.py` in the Family Command
Center, launchd `com.mcniel.cfo.xmas` at 02:30) reads its password from the macOS Keychain item `xmas-cfo-db`,
connects over TLS pinned to Supabase's root CA, and writes Quicken matches into `quicken_txn_id`.
