// Christmas 2026 budget tracker — vanilla JS, talks to Supabase only via PIN-checked RPCs.
const SUPABASE_URL = 'https://mxcpjsdvdqhgutdzzggo.supabase.co';
const SUPABASE_KEY = 'sb_publishable_pouH8Pbp8THffNLTjavPdA_3RzW0NCf'; // public by design; tables are locked, RPCs check the PIN
const SEASON = '2026';
const PIN_KEY = 'xb_pin';

const BUCKET_LABELS = {
  girls: 'Chloe & Ella',
  extended: 'Extended family, coaches, teachers',
  extras: 'Stockings, wrapping, decor, extras',
};
const hasName = (text, name) => new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(text);
const GROUP_WORDS = /\b(both|girls|kids)\b|&| and /i;

let state = { budget: [], purchases: [] };
let pin = localStorage.getItem(PIN_KEY) || '';

const $ = (id) => document.getElementById(id);
const money = (n, cents = false) => {
  const v = Math.abs(n) < 0.005 ? 0 : n;
  return (v < 0 ? '-$' : '$') + Math.abs(v).toLocaleString('en-US', {
    minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0 });
};
const smartMoney = (n) => money(n, Math.round(n) !== Math.round(n * 100) / 100);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const today = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };

/* ?demo — in-memory sample data, never touches the server. */
const DEMO = new URLSearchParams(location.search).has('demo');
const demoDb = DEMO && {
  budget: [['girls', 'Chloe', 750], ['girls', 'Ella', 750], ['extended', null, 600], ['extras', null, 400]]
    .map(([bucket, person, budget], i) => ({ id: 'b' + i, bucket, person, budget, season: SEASON })),
  purchases: [
    ['2026-11-27', 129.99, 'Target', 'Ella', 'girls', 'Lego Friends treehouse'], ['2026-11-27', 64.5, 'Amazon', 'Chloe', 'girls', 'Art kit'],
    ['2026-11-28', 45, 'Amazon', 'Grandma', 'extended'], ['2026-11-28', 89, 'Costco', 'Both girls', 'girls'],
    ['2026-11-29', 32.4, 'Michaels', 'Stockings', 'extras'], ['2026-11-30', 25, 'Starbucks', 'Coach Dan', 'extended'],
  ].map(([date, amount, merchant, recipient, bucket, item], i) => ({ id: 'p' + i, date, amount, merchant, recipient, bucket, item: item || null,
    card: 'Citi Platinum', entered_by: 'Meghan', note: null, created_at: `${date}T12:00:0${i}Z` })),
};
function demoRpc(fn, a) {
  if (fn === 'xmas_status') return { pin_set: true };
  if (fn === 'xmas_get') return { budget: demoDb.budget, purchases: [...demoDb.purchases].sort((x, y) => y.date.localeCompare(x.date)) };
  if (fn === 'xmas_add') {
    const r = { id: 'p' + Date.now(), date: a.p_date, amount: a.p_amount, merchant: a.p_merchant, recipient: a.p_recipient,
      bucket: a.p_bucket, card: a.p_card, entered_by: a.p_entered_by, note: a.p_note || null, item: a.p_item || null, created_at: new Date().toISOString() };
    demoDb.purchases.push(r); return r;
  }
  if (fn === 'xmas_delete') { demoDb.purchases = demoDb.purchases.filter((p) => p.id !== a.p_id); return { ok: true }; }
  return null;
}

async function rpc(fn, args = {}) {
  if (DEMO) return demoRpc(fn, args);
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(body?.message || `Request failed (${res.status})`);
  if (body && typeof body === 'object' && body.error) throw new Error(body.error);
  return body;
}

function toast(msg) {
  const t = $('toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), 2200);
}

/* ---------- Lock screen ---------- */
let creatingPin = false;
let firstPin = '';

async function showLock(msg) {
  $('app').classList.add('hidden');
  $('lock').classList.remove('hidden');
  $('lockErr').textContent = msg || '';
  try {
    const s = await rpc('xmas_status');
    creatingPin = !s.pin_set;
  } catch (e) { $('lockErr').textContent = 'Can’t reach the server. Check your connection.'; }
  firstPin = '';
  $('lockMsg').textContent = creatingPin ? 'Create a PIN (4–8 digits) for you and Meghan' : 'Enter your PIN';
  $('pinBtn').textContent = creatingPin ? 'Next' : 'Unlock';
  $('pinInput').value = ''; $('pinInput').focus();
}

async function submitPin() {
  const p = $('pinInput').value.trim();
  $('lockErr').textContent = '';
  if (!/^\d{4,8}$/.test(p)) { $('lockErr').textContent = 'PIN must be 4–8 digits.'; return; }
  $('pinBtn').disabled = true;
  try {
    if (creatingPin) {
      if (!firstPin) {
        firstPin = p; $('pinInput').value = '';
        $('lockMsg').textContent = 'Type the same PIN again';
        $('pinBtn').textContent = 'Set PIN';
        return;
      }
      if (p !== firstPin) { firstPin = ''; $('pinInput').value = ''; $('pinBtn').textContent = 'Next';
        $('lockMsg').textContent = 'Create a PIN (4–8 digits) for you and Meghan';
        throw new Error('PINs didn’t match — start again.'); }
      await rpc('xmas_set_pin', { p_pin: p });
    }
    pin = p;
    await load();
    localStorage.setItem(PIN_KEY, pin);
    $('lock').classList.add('hidden');
    $('app').classList.remove('hidden');
  } catch (e) {
    pin = '';
    $('lockErr').textContent = /bad pin/i.test(e.message) ? 'Wrong PIN.' : e.message;
  } finally { $('pinBtn').disabled = false; }
}

/* ---------- Data ---------- */
async function load() {
  const data = await rpc('xmas_get', { p_pin: pin, p_season: SEASON });
  state = { budget: data.budget || [], purchases: data.purchases || [] };
  render();
}

async function refresh() {
  try { await load(); }
  catch (e) {
    if (/bad pin|locked/i.test(e.message)) { localStorage.removeItem(PIN_KEY); pin = ''; showLock(/locked/i.test(e.message) ? e.message : 'PIN changed — enter it again.'); }
    else toast('Offline — showing last data');
  }
}

/* Work out spent per budget row. Person rows in a bucket share purchases by recipient;
   group gifts ("Both girls") or unmatched recipients in that bucket split evenly. */
function computeBudget() {
  const rows = state.budget.map((b) => ({ ...b, budget: Number(b.budget), spent: 0 }));
  const byBucket = {};
  rows.forEach((r) => (byBucket[r.bucket] ||= []).push(r));
  let unbudgeted = 0;

  for (const p of state.purchases) {
    const amt = Number(p.amount);
    const group = byBucket[p.bucket];
    if (!group) { unbudgeted += amt; continue; }
    const people = group.filter((r) => r.person);
    if (!people.length) { group[0].spent += amt; continue; }
    const who = (p.recipient || '').toLowerCase();
    const named = people.filter((r) => hasName(who, r.person));
    const exact = people.find((r) => r.person.toLowerCase() === who.trim());
    const targets = exact ? [exact] : named.length && (named.length > 1 || !GROUP_WORDS.test(who)) ? named : people;
    targets.forEach((r) => (r.spent += amt / targets.length));
  }
  return { rows, unbudgeted };
}

/* ---------- Render ---------- */
function meterClass(spent, budget) {
  const pct = budget > 0 ? spent / budget : 0;
  return pct > 1 ? 'over' : pct >= 0.8 ? 'warn' : '';
}
function meterHtml(spent, budget) {
  const pct = budget > 0 ? Math.min(100, (spent / budget) * 100) : 0;
  return `<div class="meter sm"><div class="meter-fill ${meterClass(spent, budget)}" style="width:${pct}%"></div></div>`;
}

function render() {
  const { rows, unbudgeted } = computeBudget();
  const total = rows.reduce((s, r) => s + r.budget, 0);
  const spent = state.purchases.reduce((s, p) => s + Number(p.amount), 0);
  const left = total - spent;

  $('heroLeft').textContent = left < 0 ? `${smartMoney(-left)} over` : smartMoney(left);
  $('heroLeft').classList.toggle('over', left < 0);
  $('heroSpent').textContent = smartMoney(spent);
  $('heroTotal').textContent = money(total);
  const fill = $('heroFill');
  fill.style.width = `${total > 0 ? Math.min(100, (spent / total) * 100) : 0}%`;
  fill.className = `meter-fill ${meterClass(spent, total)}`;

  // Buckets
  const order = ['girls', 'extended', 'extras'];
  rows.sort((a, b) => ((order.indexOf(a.bucket) + 1 || 99) - (order.indexOf(b.bucket) + 1 || 99)) || String(a.person).localeCompare(String(b.person)));
  let html = rows.map((r) => {
    const l = r.budget - r.spent;
    const name = r.person || BUCKET_LABELS[r.bucket] || r.bucket;
    return `<div class="row">
      <div class="row-top">
        <div><div class="row-name">${esc(name)}</div>${r.person ? '' : ''}</div>
        <div class="row-amt">${smartMoney(r.spent)} / ${money(r.budget)}
          <span class="left ${l < 0 ? 'over' : ''}">${l < 0 ? money(-l) + ' over' : money(l) + ' left'}</span></div>
      </div>${meterHtml(r.spent, r.budget)}</div>`;
  }).join('');
  if (Math.abs(unbudgeted) > 0.004) html += `<div class="row"><div class="row-top"><div class="row-name">Unbudgeted</div><div class="row-amt">${smartMoney(unbudgeted)}</div></div></div>`;
  $('buckets').innerHTML = html;

  // People
  const per = {};
  for (const p of state.purchases) {
    const k = (p.recipient || '—').trim();
    per[k] = (per[k] || 0) + Number(p.amount);
  }
  const ppl = Object.entries(per).sort((a, b) => b[1] - a[1]);
  $('people').innerHTML = ppl.length
    ? ppl.map(([n, v]) => `<div class="person"><span>${esc(n)}</span><span>${smartMoney(v)}</span></div>`).join('')
    : '<div class="empty">Nothing yet</div>';

  // Purchases
  $('purchaseCount').textContent = state.purchases.length ? `· ${state.purchases.length}` : '';
  $('purchases').innerHTML = state.purchases.length
    ? state.purchases.map((p) => {
        const d = new Date(p.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        const amt = Number(p.amount);
        return `<div class="purchase">
          <div class="p-main">
            <div class="p-title">${esc(p.merchant)} · ${esc(p.recipient)}</div>
            ${p.item ? `<div class="p-item">${esc(p.item)}</div>` : ''}
            <div class="p-sub">${d} · ${esc(BUCKET_LABELS[p.bucket] ? p.bucket : p.bucket)}${p.entered_by ? ' · ' + esc(p.entered_by) : ''}${p.note ? ' · ' + esc(p.note) : ''}</div>
          </div>
          <div class="p-amt ${amt < 0 ? 'neg' : ''}">${money(amt, true)}</div>
          <button class="del" data-id="${esc(p.id)}" aria-label="Delete">✕</button>
        </div>`;
      }).join('')
    : '<div class="empty">No purchases logged yet</div>';
}

/* ---------- Log purchase sheet ---------- */
const form = { recipient: '', bucket: '', by: localStorage.getItem('xb_by') || 'Meghan' };

function chip(label, on, data) {
  return `<button type="button" class="chip ${on ? 'on' : ''}" data-v="${esc(data ?? label)}">${esc(label)}</button>`;
}

function personRows() { return state.budget.filter((b) => b.person); }

function autoBucket(recipient) {
  const who = recipient.toLowerCase().trim();
  if (!who) return form.bucket;
  const match = personRows().find((r) => hasName(who, r.person));
  if (match) return match.bucket;
  if (/^(both|both girls|the girls|girls)$/.test(who)) return personRows()[0]?.bucket || form.bucket;
  // Recipient used before? reuse the bucket they were logged under last.
  const prev = state.purchases.find((p) => (p.recipient || '').toLowerCase().trim() === who);
  if (prev) return prev.bucket;
  return form.bucket && !personRows().some((r) => r.bucket === form.bucket) ? form.bucket : 'extended';
}

function renderChips() {
  const people = personRows().map((r) => r.person);
  const recent = [];
  for (const p of state.purchases) {
    const n = (p.recipient || '').trim();
    if (n && !people.includes(n) && !/^both/i.test(n) && !recent.includes(n)) recent.push(n);
  }
  const whos = [...people, ...(people.length > 1 ? ['Both girls'] : []), ...recent.slice(0, 8)];
  $('whoChips').innerHTML = whos.map((w) => chip(w, w === form.recipient)).join('');

  const buckets = [...new Set(state.budget.map((b) => b.bucket))];
  $('bucketChips').innerHTML = buckets.map((b) => chip(b === 'girls' ? 'Girls' : b === 'extended' ? 'Extended' : b === 'extras' ? 'Extras' : b, b === form.bucket, b)).join('');
  $('byChips').innerHTML = ['Meghan', 'Shea'].map((n) => chip(n, n === form.by)).join('');
}

function openSheet() {
  form.recipient = ''; form.bucket = 'extended';
  $('form').reset();
  $('fDate').value = today();
  $('fCard').value = localStorage.getItem('xb_card') || 'Citi Platinum';
  $('formErr').textContent = '';
  const merchants = [...new Set(['Target', 'Amazon', 'Walmart', 'Costco', ...state.purchases.map((p) => p.merchant)])];
  $('merchantList').innerHTML = merchants.map((m) => `<option value="${esc(m)}">`).join('');
  const cards = [...new Set(['Citi Platinum', ...state.purchases.map((p) => p.card).filter(Boolean)])];
  $('cardList').innerHTML = cards.map((m) => `<option value="${esc(m)}">`).join('');
  renderChips();
  $('sheet').classList.add('active');
  $('fAmount').focus(); // synchronous, inside the tap, so iOS opens the keyboard
}
function closeSheet() { $('sheet').classList.remove('active'); }

async function save(e) {
  e.preventDefault();
  const raw = $('fAmount').value.replace(/[$,\s]/g, '');
  let amount = Number(raw);
  const merchant = $('fMerchant').value.trim();
  const recipient = $('fRecipient').value.trim();
  const card = $('fCard').value.trim();
  $('formErr').textContent = '';
  if (!raw || !isFinite(amount) || amount <= 0) return ($('formErr').textContent = 'Enter an amount.');
  if (!merchant) return ($('formErr').textContent = 'Where was it bought?');
  if (!recipient) return ($('formErr').textContent = 'Who is it for?');
  if (/\d{4}/.test(card)) return ($('formErr').textContent = 'Card name only — no card numbers.');
  if ($('fReturn').checked) amount = -amount;
  amount = Math.round(amount * 100) / 100;

  $('saveBtn').disabled = true;
  try {
    const row = await rpc('xmas_add', {
      p_pin: pin, p_date: $('fDate').value || today(), p_amount: amount, p_merchant: merchant,
      p_recipient: recipient, p_bucket: form.bucket || autoBucket(recipient), p_card: card,
      p_entered_by: form.by, p_note: $('fNote').value.trim(), p_item: $('fItem').value.trim(),
    });
    localStorage.setItem('xb_card', card);
    localStorage.setItem('xb_by', form.by);
    state.purchases.unshift(row);
    state.purchases.sort((a, b) => b.date.localeCompare(a.date) || b.created_at.localeCompare(a.created_at));
    render();
    closeSheet();
    toast(`${money(amount, true)} at ${merchant} logged`);
  } catch (err) {
    $('formErr').textContent = err.message;
  } finally { $('saveBtn').disabled = false; }
}

async function del(id) {
  const p = state.purchases.find((x) => x.id === id);
  if (!p || !confirm(`Delete ${money(Number(p.amount), true)} at ${p.merchant} for ${p.recipient}?`)) return;
  try {
    await rpc('xmas_delete', { p_pin: pin, p_id: id });
    state.purchases = state.purchases.filter((x) => x.id !== id);
    render();
    toast('Deleted');
  } catch (e) { toast(e.message); }
}

/* ---------- Wire up ---------- */
$('pinBtn').addEventListener('click', submitPin);
$('pinInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') submitPin(); });
$('logBtn').addEventListener('click', openSheet);
$('closeSheet').addEventListener('click', closeSheet);
$('sheet').addEventListener('click', (e) => { if (e.target.id === 'sheet') closeSheet(); });
$('form').addEventListener('submit', save);
$('refreshBtn').addEventListener('click', async () => { await refresh(); toast('Up to date'); });
$('purchases').addEventListener('click', (e) => { const b = e.target.closest('.del'); if (b) del(b.dataset.id); });

$('whoChips').addEventListener('click', (e) => {
  const c = e.target.closest('.chip'); if (!c) return;
  form.recipient = c.dataset.v; $('fRecipient').value = form.recipient;
  form.bucket = autoBucket(form.recipient); renderChips();
});
$('fRecipient').addEventListener('input', () => {
  form.recipient = $('fRecipient').value; form.bucket = autoBucket(form.recipient); renderChips();
});
$('bucketChips').addEventListener('click', (e) => {
  const c = e.target.closest('.chip'); if (!c) return; form.bucket = c.dataset.v; renderChips();
});
$('byChips').addEventListener('click', (e) => {
  const c = e.target.closest('.chip'); if (!c) return; form.by = c.dataset.v; renderChips();
});
document.addEventListener('visibilitychange', () => { if (!document.hidden && pin) refresh(); });

(async function init() {
  if (DEMO) { pin = 'demo'; $('demoBanner').classList.remove('hidden'); }
  if (!pin) return showLock();
  try {
    await load();
    $('app').classList.remove('hidden');
  } catch (e) {
    if (/bad pin|locked/i.test(e.message)) { localStorage.removeItem(PIN_KEY); pin = ''; showLock(); }
    else { showLock('Can’t reach the server. Check your connection.'); }
  }
})();
