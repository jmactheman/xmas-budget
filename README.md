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

## CFO read access (run when the CFO wiring is approved)
Read on both tables plus update on `quicken_txn_id` only. Pick the password yourself and store it in
the CFO's secret store, never in the vault or this repo.
```sql
create role cfo_xmas login password '<choose-a-strong-password>';
grant usage on schema public to cfo_xmas;
grant select on public.budget, public.purchases to cfo_xmas;
grant update (quicken_txn_id) on public.purchases to cfo_xmas;
create policy cfo_read_budget on public.budget for select to cfo_xmas using (true);
create policy cfo_read_purchases on public.purchases for select to cfo_xmas using (true);
create policy cfo_match_purchases on public.purchases for update to cfo_xmas using (true) with check (true);
```
Connect via the Supabase pooler as user `cfo_xmas.mxcpjsdvdqhgutdzzggo`.
