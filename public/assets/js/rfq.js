import { api, esc, me, qs, catName, bindForm } from './app.js';

const $ = (id) => document.getElementById(id);
const [meta, open, u] = await Promise.all([api('/api/meta'), api('/api/rfqs/open'), me()]);
$('cat').innerHTML = meta.categories.map((c) => `<option value="${c.slug}" ${c.slug === qs('category') ? 'selected' : ''}>${esc(c.name)}</option>`).join('');
$('city').innerHTML = meta.cities.map((c) => `<option ${c === u.city ? 'selected' : ''}>${esc(c)}</option>`).join('');
if (qs('title')) $('title').value = qs('title');
const setUnit = () => { $('unit').value = meta.categories.find((c) => c.slug === $('cat').value)?.unit.replace('Various', '') || ''; };
$('cat').onchange = setUnit; setUnit();
$('need').min = new Date().toISOString().slice(0, 10);
$('open').innerHTML = open.length ? open.slice(0, 8).map((r) => `<div class="tier"><span><b>${esc(r.title)}</b><br><span class="small muted">${esc(catName(r.category))} · ${r.qty.toLocaleString()} ${esc(r.unit)} · ${esc(r.city)}</span></span><span class="badge">${r.bids} bids</span></div>`).join('') : '<p class="small muted">No open RFQs.</p>';

const form = $('rfq-form');
if (u.anonymous || u.role !== 'buyer') {
  form.querySelector('[type=submit]').outerHTML = `<a class="btn btn--orange" href="/login?next=${encodeURIComponent(location.pathname + location.search)}">Sign in as a buyer to publish</a>`;
} else {
  bindForm(form, '/api/rfqs', (r) => { setTimeout(() => (location.href = '/account#rfqs'), 1400); return `Published ${r.ref}. Suppliers are being notified — opening your dashboard…`; });
}
