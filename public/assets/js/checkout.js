import { api, esc, pkr, cart, requireUser, toast } from './app.js';

const u = await requireUser('buyer');
const $ = (id) => document.getElementById(id);
const lines = cart.read();
if (!lines.length) { $('wrap').innerHTML = '<div class="panel empty" style="grid-column:1/-1">Your cart is empty. <a class="btn btn--orange" href="/marketplace">Browse marketplace</a></div>'; throw new Error('empty'); }

const meta = await api('/api/meta');
$('city').innerHTML = meta.cities.map((c) => `<option ${c === u.city ? 'selected' : ''}>${esc(c)}</option>`).join('');
$('date').min = new Date(Date.now() + 864e5).toISOString().slice(0, 10);
const avail = u.credit_limit - (u.credit_used || 0);
const METHODS = [
  ['escrow', 'Escrow', 'Pay now; released to supplier on delivery.'],
  ['credit', 'Zarea Credit · 30 days', u.credit_limit ? `Available ${pkr(avail)}` : 'Not activated — apply on the Credit page'],
  ['advance', 'Bank transfer (advance)', 'Pay supplier before dispatch.'],
  ['cod', 'Cash on delivery', 'Pay at site on delivery.'],
];
$('pay').innerHTML = METHODS.map(([v, t, d], i) => `<label class="card card--hover" style="cursor:pointer;padding:16px"><div class="row"><input type="radio" name="payment_method" value="${v}" ${i === 0 ? 'checked' : ''} ${v === 'credit' && (!u.credit_limit || u.kyc_status !== 'verified') ? 'disabled' : ''} style="accent-color:var(--orange)"><b>${t}</b></div><p class="small" style="margin-top:6px">${esc(d)}</p></label>`).join('');

const KG = [[/bag \(50/i, 50], [/bag \(45/i, 45.36], [/bag \(10/i, 10], [/^ton/i, 1000], [/maund/i, 40], [/^kg/i, 1], [/cubic foot/i, 45], [/cubic metre/i, 2400], [/1,000 bricks/i, 3000], [/litre/i, 0.85], [/panel/i, 28], [/unit/i, 40]];
const kg = (unit) => (KG.find(([re]) => re.test(unit)) || [0, 50])[1];
// group by ship-from city as a proxy for supplier in the preview; server splits by actual supplier
const groups = Object.values(lines.reduce((g, l) => ((g[l.city] ||= { city: l.city, lines: [] }).lines.push(l), g), {}));

async function render() {
  let sub = 0, fr = 0;
  const html = await Promise.all(groups.map(async (g) => {
    const s = g.lines.reduce((a, l) => a + l.price * l.qty, 0);
    const f = await api(`/api/freight?from=${encodeURIComponent(g.city)}&to=${encodeURIComponent($('city').value)}&kg=${Math.max(1, Math.round(g.lines.reduce((a, l) => a + kg(l.unit) * l.qty, 0)))}`);
    sub += s; fr += f.best.cost;
    return `<div class="order"><div class="row between"><b>Ships from ${esc(g.city)}</b><span class="small muted">${f.km} km · ${f.best.trucks} × ${esc(f.best.name)}</span></div>
      ${g.lines.map((l) => `<div class="tier"><span>${l.qty.toLocaleString()} × ${esc(l.name)} ${l.qty < l.moq ? `<span class="badge badge--bad">below MOQ ${l.moq}</span>` : ''}</span><b class="num">${pkr(l.price * l.qty)}</b></div>`).join('')}
      <div class="tier" style="border:0"><span class="muted">Freight</span><b class="num">${pkr(f.best.cost)}</b></div></div>`;
  }));
  $('groups').innerHTML = html.join('');
  $('s-sub').textContent = pkr(sub); $('s-fr').textContent = pkr(fr); $('s-tot').textContent = pkr(sub + fr);
}
$('city').onchange = render; render();

$('co').onsubmit = async (e) => {
  e.preventDefault();
  const fd = Object.fromEntries(new FormData(e.target));
  $('place').disabled = true; $('st').className = 'status'; $('st').textContent = 'Placing order…';
  try {
    const r = await api('/api/orders', { method: 'POST', body: { ...fd, items: lines.map((l) => ({ product_id: l.id, qty: l.qty })) } });
    cart.clear();
    $('wrap').innerHTML = `<div class="panel center" style="grid-column:1/-1;padding:48px"><span class="badge badge--ok">Order placed</span><h2 class="h2" style="margin:14px 0">Thank you, ${esc(u.name.split(' ')[0])}!</h2>
      <p class="lead" style="margin:0 auto">${r.refs.length} order${r.refs.length > 1 ? 's' : ''} created · total ${pkr(r.total)}</p>
      <div class="row" style="justify-content:center;margin-top:20px">${r.refs.map((x) => `<a class="btn btn--ghost" href="/logistics?track=${x}">Track ${x}</a>`).join('')}<a class="btn btn--orange" href="/account">Go to dashboard</a></div></div>`;
  } catch (err) { $('st').classList.add('err'); $('st').textContent = err.message; toast(err.message); }
  finally { const b = $('place'); if (b) b.disabled = false; }
};
