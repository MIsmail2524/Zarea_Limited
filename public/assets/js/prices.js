import { api, esc, pkr, chg, sparkline, catName, qs } from './app.js';

const rows = await api('/api/prices');
const cats = [...new Set(rows.map((r) => r.category))];
let cat = qs('category') || '', q = '', sortK = '', dir = 1;
const $ = (id) => document.getElementById(id);

$('chips').innerHTML = [`<button class="chip" data-c="">All</button>`, ...cats.map((c) => `<button class="chip" data-c="${c}">${esc(catName(c))}</button>`)].join('');
function view() {
  let list = rows.filter((r) => (!cat || r.category === cat) && (!q || `${r.name} ${r.brand || ''} ${r.city}`.toLowerCase().includes(q)));
  if (sortK) list = [...list].sort((a, b) => (typeof a[sortK] === 'string' ? a[sortK].localeCompare(b[sortK]) : a[sortK] - b[sortK]) * dir);
  document.querySelectorAll('[data-c]').forEach((b) => b.classList.toggle('on', b.dataset.c === cat));
  $('rows').innerHTML = list.map((r) => `<tr>
    <td><a href="/product?slug=${encodeURIComponent(r.slug)}"><b>${esc(r.name)}</b></a>${r.brand ? `<div class="small muted">${esc(r.brand)}</div>` : ''}</td>
    <td class="small">${esc(r.unit)}</td><td>${esc(r.city)}</td><td class="r num"><b>${pkr(r.price).replace('Rs ', '')}</b></td>
    <td class="r">${chg(r.d1)}</td><td class="r">${chg(r.d7)}</td><td class="r">${chg(r.d30)}</td><td>${sparkline(r.spark)}</td>
    <td>${r.price_source.startsWith('zarea.com') ? '<span class="badge badge--info">Live board</span>' : r.price_source === 'supplier' ? '<span class="badge badge--ok">Supplier</span>' : '<span class="badge">Illustrative</span>'}</td>
    <td><a class="btn btn--ghost btn--sm" href="/product?slug=${encodeURIComponent(r.slug)}">Buy</a></td></tr>`).join('') || '<tr><td colspan="10" class="empty">No matching prices.</td></tr>';
  view.list = list;
}
$('chips').onclick = (e) => { const b = e.target.closest('[data-c]'); if (!b) return; cat = b.dataset.c; history.replaceState(null, '', cat ? `?category=${cat}` : location.pathname); view(); };
$('q').oninput = (e) => { q = e.target.value.toLowerCase().trim(); view(); };
document.querySelectorAll('th.sortable').forEach((th) => th.onclick = () => { dir = sortK === th.dataset.k ? -dir : 1; sortK = th.dataset.k; view(); });
$('csv').onclick = () => {
  const cell = (v) => { let t = String(v ?? ''); if (/^[=+\-@]/.test(t)) t = `'${t}`; return `"${t.replace(/"/g, '""')}"`; };
  const csv = [['Commodity', 'Brand', 'Unit', 'City', 'Price PKR', '1d %', '7d %', '30d %'], ...view.list.map((r) => [r.name, r.brand, r.unit, r.city, r.price, r.d1, r.d7, r.d30])].map((r) => r.map(cell).join(',')).join('\r\n');
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv' })), download: `zarea-prices-${new Date().toISOString().slice(0, 10)}.csv` });
  a.click(); URL.revokeObjectURL(a.href);
};
view();
