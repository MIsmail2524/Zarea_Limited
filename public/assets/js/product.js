import { api, esc, pkr, chg, lineChart, productCache, cart, me, toast, catName, qs, reveal, icon } from './app.js';

const slug = qs('slug');
const $ = (id) => document.getElementById(id);
let p;
try { p = await api(`/api/products/${encodeURIComponent(slug || '')}`); }
catch { $('name').textContent = 'Product not found'; $('desc').innerHTML = '<a class="btn btn--orange" href="/marketplace">Back to marketplace</a>'; throw new Error('not found'); }
productCache.set(p.id, p);
const KG = [[/bag \(50/i, 50], [/bag \(45/i, 45.36], [/bag \(10/i, 10], [/^ton/i, 1000], [/maund/i, 40], [/^kg/i, 1], [/cubic foot/i, 45], [/cubic metre/i, 2400], [/1,000 bricks/i, 3000], [/litre/i, 0.85], [/panel/i, 28], [/unit/i, 40]];
const kgPer = (KG.find(([re]) => re.test(p.unit)) || [0, 50])[1];
document.title = `${p.name} Price in Pakistan — Zarea`;

$('crumbs').insertAdjacentHTML('beforeend', ` / <a href="/marketplace?category=${p.category}">${esc(catName(p.category))}</a>`);
$('name').textContent = p.name;
$('desc').textContent = p.description || '';
$('badges').innerHTML = `${p.verified ? '<span class="badge badge--ok">✓ Verified supplier</span>' : ''}<span class="badge">${esc(catName(p.category))}</span>${p.brand ? `<span class="badge">${esc(p.brand)}</span>` : ''}`;

if (p.price != null) {
  $('price').textContent = pkr(p.price);
  $('unit').textContent = `per ${p.unit} · ex-${p.city}`;
  $('changes').innerHTML = `<span class="small muted">1d</span>${chg(p.stats.d1)}<span class="small muted">7d</span>${chg(p.stats.d7)}<span class="small muted">30d</span>${chg(p.stats.d30)}`;
  lineChart($('chart'), p.history, { unit: p.unit });
  $('src').textContent = p.price_source.startsWith('zarea.com') ? `Today's price from the ${p.price_source} price board; earlier history is simulated for this demo.` : p.price_source === 'supplier' ? 'Price set by supplier.' : 'Illustrative demo price and history.';
  $('buy-controls').innerHTML = `<label class="small muted" for="qty">Quantity (${esc(p.unit)})</label>
    <div class="row" style="margin-top:6px"><div class="qty"><button type="button" id="dec" aria-label="Less">−</button><input id="qty" class="num" inputmode="numeric" value="${p.moq}"><button type="button" id="inc" aria-label="More">+</button></div>
    <span class="small muted">MOQ ${p.moq.toLocaleString()}</span></div>
    <div class="row between" style="margin-top:12px"><span class="muted">Subtotal</span><b class="num" id="sub"></b></div>
    <div class="row" style="margin-top:12px"><button class="btn btn--orange" id="add" style="flex:1">${icon('cart', 18)} Add to cart</button><button class="btn" id="buy">Buy now</button></div>`;
  const step = Math.max(1, Math.round(p.moq / 10));
  const q = () => Math.max(1, Math.floor(Number($('qty').value)) || p.moq);
  const upd = () => { $('sub').textContent = pkr(q() * p.price); if ($('to').options.length) updateLanded(); };
  $('inc').onclick = () => { $('qty').value = q() + step; upd(); };
  $('dec').onclick = () => { $('qty').value = Math.max(p.moq, q() - step); upd(); };
  $('qty').oninput = upd;
  $('add').onclick = () => { if (q() < p.moq) return toast(`Minimum order is ${p.moq}`); cart.add(p, q()); };
  $('buy').onclick = () => { if (q() < p.moq) return toast(`Minimum order is ${p.moq}`); cart.add(p, q()); location.href = '/checkout'; };
  $('bulk').innerHTML = `Buying more than <b>${(p.moq * 20).toLocaleString()}</b> ${esc(p.unit)}? <a href="/rfq?category=${p.category}&title=${encodeURIComponent(p.name)}" style="font-weight:700;text-decoration:underline">Post an RFQ</a> for volume pricing from multiple suppliers.`;
  $('sub').textContent = pkr(q() * p.price);
} else {
  $('price').textContent = 'Price on request';
  $('unit').textContent = `per ${p.unit}`;
  $('chart').innerHTML = '<div class="empty">This product is priced per order. Request a quote to receive supplier bids.</div>';
  $('buy-controls').innerHTML = `<a class="btn btn--orange btn--block" href="/rfq?category=${p.category}&title=${encodeURIComponent(p.name)}">Request a quote</a>`;
  $('bulk').textContent = 'Quotes typically arrive within 24 hours.';
  document.querySelector('#alert-form').closest('.panel').classList.add('hidden');
}

$('specs').innerHTML = [['Category', catName(p.category)], ['Brand', p.brand || '—'], ['Unit', p.unit], ['Minimum order', `${p.moq.toLocaleString()} ${p.unit}`],
  ['Lead time', `${p.lead_days} day${p.lead_days === 1 ? '' : 's'}`], ['Ships from', p.city], ['Last updated', p.updated_at.slice(0, 10)]]
  .map(([k, v]) => `<tr><td class="muted">${k}</td><td><b>${esc(v)}</b></td></tr>`).join('');
$('supplier').innerHTML = `<div class="row"><span class="avatar" style="width:44px;height:44px;font-size:16px">${esc(p.supplier[0])}</span><div><b>${esc(p.supplier.replace(/ \(demo\)$/, ''))}</b>
  <div class="small muted">${esc(p.city)} · ${p.supplier_rating ? `<span class="stars">★</span> ${p.supplier_rating}/5` : 'New supplier'}</div></div></div>
  <ul class="small muted" style="margin:14px 0 0;padding-left:18px"><li>${p.verified ? 'NTN and incorporation verified by Zarea' : 'Verification pending'}</li><li>Payments protected by escrow option</li><li>Dispatch with vehicle number &amp; proof of delivery</li></ul>`;
$('reviews').innerHTML = p.reviews.length ? p.reviews.map((r) => `<div style="padding:10px 0;border-bottom:1px solid var(--line)"><span class="stars">${'★'.repeat(r.rating)}${'☆'.repeat(5 - r.rating)}</span> <b class="small">${esc(r.company)}</b><p class="small" style="margin:4px 0 0">${esc(r.comment || '')}</p></div>`).join('') : '<p class="muted small">No reviews yet for this supplier.</p>';
$('similar').innerHTML = p.similar.map((s) => `<a class="card card--hover" href="/product?slug=${encodeURIComponent(s.slug)}" data-reveal><b style="font-size:14px">${esc(s.name)}</b><div class="p-price num" style="font-size:17px;margin-top:6px">${s.price != null ? pkr(s.price) : 'On request'}</div><span class="small muted">${esc(s.unit)} · ${esc(s.city)}</span></a>`).join('');
reveal();

// delivered cost
const meta = await api('/api/meta');
const u = await me();
$('to').innerHTML = meta.cities.map((c) => `<option ${c === (u.city || 'Lahore') ? 'selected' : ''}>${esc(c)}</option>`).join('');
async function updateLanded() {
  if (p.price == null) { $('landed').textContent = 'Freight is included in supplier quotes.'; return; }
  const qty = Math.max(1, Math.floor(Number($('qty')?.value)) || p.moq);
  const f = await api(`/api/freight?from=${encodeURIComponent(p.city)}&to=${encodeURIComponent($('to').value)}&kg=${Math.round(qty * kgPer)}`);
  const landed = qty * p.price + f.best.cost;
  $('landed').innerHTML = `<div class="tier"><span>${f.km} km · ${f.best.trucks} × ${esc(f.best.name)}</span><b class="num">${pkr(f.best.cost)}</b></div>
    <div class="tier"><span>Delivered total</span><b class="num">${pkr(landed)}</b></div><div class="tier" style="border:0"><span>Delivered per ${esc(p.unit)}</span><b class="num accent">${pkr(landed / qty)}</b></div>`;
}
$('to').onchange = updateLanded; updateLanded();

$('alert-form').onsubmit = async (e) => {
  e.preventDefault();
  if (u.anonymous) return (location.href = `/login?next=${encodeURIComponent(location.pathname + location.search)}`);
  try { await api('/api/alerts', { method: 'POST', body: { product_id: p.id, direction: e.target.direction.value, target: Number(e.target.target.value) } }); toast('Price alert saved'); e.target.reset(); }
  catch (err) { toast(err.message); }
};
