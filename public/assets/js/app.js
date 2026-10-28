// Shared layout, data helpers, cart and UI primitives for every Zarea page.
export const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------- formatting ----------
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const pkr = (n) => (n == null ? '—' : `Rs ${Math.round(Number(n)).toLocaleString('en-PK')}`);
export const compact = (n) => (n >= 1e7 ? `${(n / 1e7).toFixed(2)} Cr` : n >= 1e5 ? `${(n / 1e5).toFixed(1)} Lac` : Number(n).toLocaleString('en-PK'));
export const chg = (v) => `<span class="chg ${v > 0 ? 'up' : v < 0 ? 'down' : 'flat'}">${v > 0 ? '▲' : v < 0 ? '▼' : '•'} ${Math.abs(v ?? 0).toFixed(1)}%</span>`;
export const catName = (slug) => slug.replace(/-and-/g, ' & ').replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
export const qs = (k) => new URLSearchParams(location.search).get(k);

// ---------- api ----------
export async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(path, {
    method, credentials: 'same-origin',
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || `Request failed (${res.status})`), { status: res.status });
  return data;
}
let mePromise;
export const me = () => (mePromise ||= api('/api/me').catch(() => ({ anonymous: true })));

// ---------- icons ----------
const I = {
  cement: '<path d="M4 20h16M6 20V9l6-5 6 5v11"/><path d="M9 20v-5h6v5"/>',
  steel: '<path d="M3 7h18M3 12h18M3 17h18"/><circle cx="6" cy="7" r="1"/><circle cx="6" cy="12" r="1"/><circle cx="6" cy="17" r="1"/>',
  'building-and-finishing': '<rect x="3" y="11" width="8" height="5"/><rect x="13" y="11" width="8" height="5"/><rect x="8" y="5" width="8" height="5"/><path d="M3 20h18"/>',
  'agriculture-biomass': '<path d="M12 21V9M12 9c0-3 2-6 6-6 0 4-3 6-6 6zM12 13c0-3-2-6-6-6 0 4 3 6 6 6z"/>',
  'grains-and-pulses': '<path d="M12 3c2 3 2 6 0 9-2-3-2-6 0-9zM7 8c2 2 3 5 5 7M17 8c-2 2-3 5-5 7M12 15v6"/>',
  sugar: '<rect x="5" y="5" width="6" height="6" rx="1"/><rect x="13" y="5" width="6" height="6" rx="1"/><rect x="9" y="13" width="6" height="6" rx="1"/>',
  fertilizer: '<path d="M7 3h10l-1 5H8z"/><path d="M8 8l-2 13h12L16 8"/><path d="M10 14h4"/>',
  coal: '<path d="M4 17l4-7 4 3 3-6 5 10z"/><path d="M3 21h18"/>',
  chemicals: '<path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3"/><path d="M7 15h10"/>',
  'cotton-and-yarn': '<circle cx="12" cy="12" r="8"/><path d="M5 9c4 1 10 1 14 0M5 15c4-1 10-1 14 0M12 4c-2 4-2 12 0 16"/>',
  'energy-and-petroleum': '<path d="M12 3c3 5 6 8 6 12a6 6 0 0 1-12 0c0-4 3-7 6-12z"/>',
  solar: '<rect x="3" y="8" width="18" height="10" rx="1"/><path d="M3 13h18M9 8v10M15 8v10M12 3v3"/>',
  seed: '<path d="M12 21c-5-3-7-8-5-14 6 0 9 4 9 9"/><path d="M12 21c0-5 2-9 7-11"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
  cart: '<circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M3 4h2l2.5 11h11.5l2-8H7"/>',
  truck: '<rect x="1" y="6" width="14" height="10"/><path d="M15 9h4l3 3v4h-7"/><circle cx="6" cy="18" r="2"/><circle cx="18" cy="18" r="2"/>',
  credit: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20M6 15h4"/>',
  chart: '<path d="M3 3v18h18"/><path d="M7 15l4-5 3 3 5-7"/>',
  ai: '<path d="M12 3l1.8 4.7L18 9l-4.2 1.3L12 15l-1.8-4.7L6 9l4.2-1.3z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>',
  shield: '<path d="M12 2l8 4v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6z"/><path d="M8.5 12l2.5 2.5 4.5-5"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>',
  doc: '<path d="M6 2h9l5 5v15H6z"/><path d="M14 2v6h6M9 13h8M9 17h8"/>',
  calc: '<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M8 6h8M8 11h2M14 11h2M8 15h2M14 15h2M8 19h2M14 19h2"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10 21a2 2 0 0 0 4 0"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4-6 8-6s7 2 8 6"/>',
  menu: '<path d="M3 6h18M3 12h18M3 18h18"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  box: '<path d="M3 7l9-4 9 4-9 4z"/><path d="M3 7v10l9 4 9-4V7M12 11v10"/>',
  handshake: '<path d="M2 12l5-5 5 3 5-3 5 5-5 5-5-3-5 3z"/>',
};
export const icon = (name, size = 22) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${I[name] || I.box}</svg>`;
const TONES = { cement: '#eef1f5', steel: '#e8eef6', coal: '#ececec', sugar: '#f6f3ee', fertilizer: '#eaf4ec', solar: '#e9f1fb', 'agriculture-biomass': '#f3f1e3', 'grains-and-pulses': '#f7f0df', seed: '#eaf4e3', chemicals: '#eef0fb', 'cotton-and-yarn': '#f5eff6', 'energy-and-petroleum': '#fbefe6', 'building-and-finishing': '#f6ece7' };

// ---------- charts ----------
export function sparkline(values, { w = 96, h = 28, stroke } = {}) {
  if (!values?.length) return '';
  const min = Math.min(...values), max = Math.max(...values), span = max - min || 1;
  const pts = values.map((v, i) => `${((i / (values.length - 1)) * w).toFixed(1)},${(h - 2 - ((v - min) / span) * (h - 4)).toFixed(1)}`).join(' ');
  const up = values[values.length - 1] >= values[0];
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true"><polyline fill="none" stroke="${stroke || (up ? '#12a150' : '#d93636')}" stroke-width="1.6" points="${pts}"/></svg>`;
}

export function lineChart(el, data, { unit = '' } = {}) {
  const W = 720, H = 240, P = { l: 56, r: 12, t: 12, b: 26 };
  const vals = data.map((d) => d.price); const min = Math.min(...vals), max = Math.max(...vals);
  const pad = (max - min) * 0.15 || max * 0.02; const lo = min - pad, hi = max + pad;
  const x = (i) => P.l + (i / (data.length - 1)) * (W - P.l - P.r);
  const y = (v) => P.t + (1 - (v - lo) / (hi - lo)) * (H - P.t - P.b);
  const path = data.map((d, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(d.price).toFixed(1)}`).join('');
  const grid = [0, 0.5, 1].map((t) => { const v = lo + t * (hi - lo); return `<line class="grid-l" x1="${P.l}" x2="${W - P.r}" y1="${y(v)}" y2="${y(v)}"/><text x="${P.l - 8}" y="${y(v) + 4}" text-anchor="end">${Math.round(v).toLocaleString()}</text>`; }).join('');
  const ticks = [0, Math.floor(data.length / 2), data.length - 1].map((i) => `<text x="${x(i)}" y="${H - 6}" text-anchor="middle">${data[i].day.slice(5)}</text>`).join('');
  el.style.position = 'relative';
  el.innerHTML = `<svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Price history">
    <defs><linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f46600" stop-opacity=".22"/><stop offset="1" stop-color="#f46600" stop-opacity="0"/></linearGradient></defs>
    ${grid}${ticks}<path class="area" d="${path}L${x(data.length - 1)},${H - P.b}L${P.l},${H - P.b}Z"/>
    <path class="line" d="${path}" style="--len:3000"/><line class="hover-line" y1="${P.t}" y2="${H - P.b}" x1="-10" x2="-10"/></svg><div class="tip"></div>`;
  const svg = el.querySelector('svg'), tip = el.querySelector('.tip'), hl = el.querySelector('.hover-line');
  svg.addEventListener('mousemove', (e) => {
    const r = svg.getBoundingClientRect(); const rx = ((e.clientX - r.left) / r.width) * W;
    const i = Math.max(0, Math.min(data.length - 1, Math.round(((rx - P.l) / (W - P.l - P.r)) * (data.length - 1))));
    hl.setAttribute('x1', x(i)); hl.setAttribute('x2', x(i));
    tip.textContent = `${data[i].day} · ${pkr(data[i].price)}${unit ? ` / ${unit}` : ''}`;
    tip.style.left = `${(x(i) / W) * r.width}px`; tip.style.top = `${(y(data[i].price) / H) * r.height}px`; tip.style.opacity = 1;
  });
  svg.addEventListener('mouseleave', () => { tip.style.opacity = 0; });
}

// ---------- product card ----------
export function productCard(p) {
  const s = p.stats;
  return `<article class="p-card" data-reveal>
    <a href="/product?slug=${encodeURIComponent(p.slug)}" class="p-art" style="--tone:${TONES[p.category] || '#eef2f6'}">
      <div class="badges">${p.verified ? '<span class="badge badge--ok">✓ Verified</span>' : ''}${p.price_source?.startsWith('zarea.com') ? '<span class="badge badge--info">Live rate</span>' : ''}</div>
      ${icon(p.category, 56)}
    </a>
    <div class="p-body">
      <a class="p-name" href="/product?slug=${encodeURIComponent(p.slug)}">${esc(p.name)}</a>
      <div class="p-meta">${esc(p.supplier?.replace(/ \(demo\)$/, '') || '')} · ${esc(p.city)}${p.supplier_rating ? ` · <span class="stars">★</span> ${p.supplier_rating}` : ''}</div>
      ${p.price != null ? `<div class="row between"><div class="p-price num">${pkr(p.price)} <small>/ ${esc(p.unit)}</small></div>${s ? sparkline(s.spark, { w: 70, h: 24 }) : ''}</div>
        <div class="row small muted">MOQ ${p.moq.toLocaleString()} · ${p.lead_days}d lead ${s ? `· 7d ${chg(s.d7)}` : ''}</div>` : `<div class="p-price" style="font-size:16px">Price on request</div><div class="small muted">MOQ ${p.moq} ${esc(p.unit)}</div>`}
      <div class="p-foot">
        ${p.price != null ? `<button class="btn btn--orange btn--sm" data-add="${p.id}">${icon('cart', 16)} Add</button>` : `<a class="btn btn--sm" href="/rfq?category=${p.category}&title=${encodeURIComponent(p.name)}">Get quote</a>`}
        <a class="btn btn--ghost btn--sm" href="/product?slug=${encodeURIComponent(p.slug)}">Details</a>
      </div>
    </div></article>`;
}

// ---------- cart (per-browser convenience; orders are created server-side) ----------
const CART_KEY = 'zarea.cart.v1';
export const cart = {
  read() { try { return JSON.parse(localStorage.getItem(CART_KEY)) || []; } catch { return []; } },
  write(lines) { try { localStorage.setItem(CART_KEY, JSON.stringify(lines)); } catch { /* storage unavailable */ } renderCart(); },
  add(p, qty) {
    const lines = cart.read(); const ex = lines.find((l) => l.id === p.id);
    const q = Math.max(p.moq, qty || p.moq);
    if (ex) ex.qty += q; else lines.push({ id: p.id, slug: p.slug, name: p.name, unit: p.unit, price: p.price, moq: p.moq, city: p.city, category: p.category, qty: q });
    cart.write(lines); openCart(); toast(`${p.name} added`);
  },
  set(id, qty) { const lines = cart.read(); const l = lines.find((x) => x.id === id); if (!l) return; l.qty = Math.max(1, qty); cart.write(lines); },
  remove(id) { cart.write(cart.read().filter((l) => l.id !== id)); },
  clear() { cart.write([]); },
  total() { return cart.read().reduce((s, l) => s + l.price * l.qty, 0); },
};
export const productCache = new Map();
document.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-add]'); if (!b) return;
  const id = Number(b.dataset.add); let p = productCache.get(id);
  if (!p) return toast('Open the product to add it');
  cart.add(p, Number(b.dataset.qty) || p.moq);
});

function renderCart() {
  const lines = cart.read();
  document.querySelectorAll('[data-cart-count]').forEach((el) => { el.textContent = lines.length; el.classList.toggle('hidden', !lines.length); });
  const body = document.querySelector('.cart-body'); if (!body) return;
  body.innerHTML = lines.length ? lines.map((l) => `
    <div class="cart-line">
      <div><b style="font-size:14.5px">${esc(l.name)}</b><div class="small muted">${pkr(l.price)} / ${esc(l.unit)} · MOQ ${l.moq}</div></div>
      <button class="btn btn--ghost btn--sm" data-rm="${l.id}" aria-label="Remove">${icon('x', 14)}</button>
      <div class="qty"><button data-dq="${l.id}" aria-label="Less">−</button><input class="num" data-q="${l.id}" value="${l.qty}" inputmode="numeric" aria-label="Quantity"><button data-iq="${l.id}" aria-label="More">+</button></div>
      <b class="num" style="align-self:center">${pkr(l.price * l.qty)}</b>
      ${l.qty < l.moq ? `<span class="small" style="color:var(--red);grid-column:1/-1">Below MOQ (${l.moq})</span>` : ''}
    </div>`).join('') : `<div class="empty">${icon('cart', 36)}<p>Your cart is empty.</p><a class="btn btn--orange btn--sm" href="/marketplace">Browse marketplace</a></div>`;
  document.querySelector('.cart-total').textContent = pkr(cart.total());
  document.querySelector('.cart-foot .btn--orange').classList.toggle('hidden', !lines.length);
}
export function openCart() { document.body.classList.add('cart-open'); }

// ---------- layout ----------
const NAV = [['/marketplace', 'Marketplace'], ['/prices', 'Daily Prices'], ['/rfq', 'RFQ'], ['/credit', 'Credit'], ['/logistics', 'Logistics'], ['/boq', 'Project Estimator'], ['/ai', 'Zarea AI'], ['/investors', 'Investors']];
const brandMark = `<svg class="brand-mark" viewBox="0 0 40 40" aria-hidden="true"><rect width="40" height="40" rx="10" fill="#000911"/><path d="M11 12h18L13 28h16" fill="none" stroke="#f46600" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

function layout() {
  const path = location.pathname.replace(/\.html$/, '') || '/';
  const top = document.createElement('div');
  top.innerHTML = `
  <div class="topbar"><div class="container">
    <div class="ticker" aria-label="Live prices"><div class="ticker-track" id="ticker"><span class="ticker-item">Loading live prices…</span></div></div>
    <div class="row links" style="gap:16px;flex-wrap:nowrap"><a href="/suppliers">Sell on Zarea</a><a href="/about">Help</a><a href="https://wa.me/923000000000" rel="noopener" target="_blank">WhatsApp</a></div>
  </div></div>
  <header class="site-header"><div class="container nav">
    <a class="brand" href="/" aria-label="Zarea home">${brandMark}Zarea</a>
    <ul class="nav-links">${NAV.map(([h, l]) => `<li><a href="${h}" ${path === h ? 'aria-current="page"' : ''}>${l}</a></li>`).join('')}</ul>
    <form class="nav-search" action="/marketplace" role="search">${icon('search', 18)}<input name="q" placeholder="Search cement, steel, urea…" aria-label="Search products"></form>
    <div class="nav-actions">
      <span id="user-slot"><a class="btn btn--ghost btn--sm hide-sm" href="/login">Sign in</a></span>
      <button class="icon-btn" id="cart-btn" aria-label="Open cart">${icon('cart', 20)}<span class="dot hidden" data-cart-count>0</span></button>
      <button class="icon-btn menu-btn" id="menu-btn" aria-label="Open menu">${icon('menu', 20)}</button>
    </div>
  </div></header>
  <nav class="drawer-nav" aria-label="Mobile"><div class="row between" style="margin-bottom:10px"><a class="brand" href="/" style="border:0">${brandMark}Zarea</a><button class="icon-btn" id="menu-close" aria-label="Close menu">${icon('x', 18)}</button></div>
    ${NAV.map(([h, l]) => `<a href="${h}">${l}</a>`).join('')}<a href="/suppliers">Sell on Zarea</a><a href="/about">About &amp; contact</a><a href="/login" id="drawer-login">Sign in / Register</a></nav>
  <aside class="cart" aria-label="Cart"><div class="cart-head row between"><h3 class="h4">Your cart</h3><button class="icon-btn" id="cart-close" aria-label="Close cart">${icon('x', 18)}</button></div>
    <div class="cart-body"></div>
    <div class="cart-foot stack" style="--gap:12px"><div class="row between"><span class="muted">Subtotal (excl. freight)</span><b class="cart-total num">Rs 0</b></div>
    <a class="btn btn--orange btn--block" href="/checkout">Checkout</a><span class="small muted">Freight is calculated per supplier at checkout.</span></div></aside>
  <div class="scrim"></div>`;
  document.body.prepend(...top.children);

  const foot = document.createElement('footer');
  foot.className = 'site-footer';
  foot.innerHTML = `<div class="container">
    <div class="foot-grid">
      <div><a class="brand" href="/" style="color:#fff">${brandMark}Zarea</a><p style="max-width:34ch;margin-top:14px">Pakistan's B2B commodity marketplace — sourcing, credit, logistics and price intelligence in one place. Listed on PSX (ZAL).</p></div>
      <div><h5>Buy</h5><ul><li><a href="/marketplace">Marketplace</a></li><li><a href="/prices">Daily prices</a></li><li><a href="/rfq">Request for quote</a></li><li><a href="/boq">Project estimator</a></li></ul></div>
      <div><h5>Services</h5><ul><li><a href="/credit">Zarea Credit</a></li><li><a href="/logistics">Logistics &amp; tracking</a></li><li><a href="/ai">Zarea AI</a></li><li><a href="/about#import-export">Import / export</a></li></ul></div>
      <div><h5>Company</h5><ul><li><a href="/about">About</a></li><li><a href="/investors">Investor relations</a></li><li><a href="/suppliers">Become a supplier</a></li><li><a href="/about#contact">Contact</a></li></ul></div>
      <div><h5>Account</h5><ul><li><a href="/login">Sign in</a></li><li><a href="/account">Buyer dashboard</a></li><li><a href="/supplier">Supplier dashboard</a></li></ul></div>
    </div>
    <div class="foot-bottom"><span>© ${new Date().getFullYear()} Zarea Limited · PSX: ZAL</span><span>Concept platform proposal · prices marked "illustrative" are demo data</span></div>
  </div>`;
  document.body.append(foot);

  const header = document.querySelector('.site-header');
  addEventListener('scroll', () => header.classList.toggle('scrolled', scrollY > 10), { passive: true });
  const close = () => document.body.classList.remove('nav-open', 'cart-open');
  document.getElementById('menu-btn').onclick = () => document.body.classList.add('nav-open');
  document.getElementById('menu-close').onclick = close;
  document.getElementById('cart-btn').onclick = openCart;
  document.getElementById('cart-close').onclick = close;
  document.querySelector('.scrim').onclick = close;
  addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  document.querySelector('.cart-body').addEventListener('click', (e) => {
    const t = e.target.closest('button'); if (!t) return;
    const l = (id) => cart.read().find((x) => x.id === Number(id));
    if (t.dataset.rm) cart.remove(Number(t.dataset.rm));
    if (t.dataset.iq) cart.set(Number(t.dataset.iq), l(t.dataset.iq).qty + Math.max(1, Math.round(l(t.dataset.iq).moq / 10)));
    if (t.dataset.dq) cart.set(Number(t.dataset.dq), l(t.dataset.dq).qty - Math.max(1, Math.round(l(t.dataset.dq).moq / 10)));
  });
  document.querySelector('.cart-body').addEventListener('change', (e) => { if (e.target.dataset.q) cart.set(Number(e.target.dataset.q), Math.floor(Number(e.target.value)) || 1); });
  renderCart();

  me().then((u) => {
    if (u.anonymous) return;
    const home = u.role === 'admin' ? '/admin' : u.role === 'supplier' ? '/supplier' : '/account';
    document.getElementById('user-slot').innerHTML = `<a class="user-chip" href="${home}"><span class="avatar">${esc(u.name[0])}</span><span class="hide-sm">${esc(u.name.split(' ')[0])}</span></a>`;
    document.getElementById('drawer-login').outerHTML = `<a href="${home}">My dashboard</a>`;
  });

  api('/api/prices').then((rows) => {
    const pick = rows.filter((r) => r.price_source?.startsWith('zarea.com') || ['steel', 'fertilizer', 'coal'].includes(r.category)).slice(0, 24);
    const item = (r) => `<a class="ticker-item" href="/product?slug=${encodeURIComponent(r.slug)}">${esc(r.name)} <b class="num">${pkr(r.price)}</b> ${chg(r.d1)}</a>`;
    document.getElementById('ticker').innerHTML = pick.map(item).join('') + pick.map(item).join('');
  }).catch(() => {});
}

// ---------- motion ----------
export function reveal(root = document) {
  const els = root.querySelectorAll('[data-reveal]:not(.in)');
  if (reduceMotion || !('IntersectionObserver' in window)) { els.forEach((e) => e.classList.add('in')); return; }
  const io = new IntersectionObserver((en) => en.forEach((x) => { if (x.isIntersecting) { x.target.classList.add('in'); io.unobserve(x.target); } }), { rootMargin: '0px 0px -30px 0px', threshold: 0.08 });
  els.forEach((e, i) => { e.style.setProperty('--d', `${Math.min(i % 8, 7) * 0.05}s`); io.observe(e); });
  // safety net: never leave content hidden if the observer does not fire (e.g. hidden tab)
  setTimeout(() => els.forEach((e) => e.classList.add('in')), 2500);
}
export function countUp(root = document) {
  root.querySelectorAll('[data-count]').forEach((el) => {
    const target = Number(el.dataset.count), dec = Number(el.dataset.dec || 0), pre = el.dataset.pre || '', suf = el.dataset.suf || '';
    const fmt = (v) => pre + v.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec }) + suf;
    if (reduceMotion) { el.textContent = fmt(target); return; }
    const io = new IntersectionObserver(([x]) => {
      if (!x.isIntersecting) return; io.disconnect();
      const t0 = performance.now();
      const tick = (t) => { const p = Math.min(1, (t - t0) / 1600); el.textContent = fmt(target * (1 - (1 - p) ** 4)); if (p < 1) requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
    });
    io.observe(el);
    setTimeout(() => { if (!el.textContent.trim() || el.textContent === '0') el.textContent = fmt(target); }, 2500);
  });
}

// ---------- ui ----------
export function toast(msg) {
  let t = document.querySelector('.toast');
  if (!t) { t = document.createElement('div'); t.className = 'toast'; t.setAttribute('role', 'status'); document.body.append(t); }
  t.textContent = msg; t.classList.add('show'); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), 3200);
}
export function bindForm(form, endpoint, done, extra = () => ({})) {
  const st = form.querySelector('.status');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = form.querySelector('[type=submit]'); btn.disabled = true; st.className = 'status'; st.textContent = 'Sending…';
    try {
      const out = await api(endpoint, { method: 'POST', body: { ...Object.fromEntries(new FormData(form)), ...extra() } });
      st.classList.add('ok'); st.textContent = done ? done(out, form) : 'Thank you — our team will contact you shortly.';
    } catch (err) { st.classList.add('err'); st.textContent = err.message; } finally { btn.disabled = false; }
  });
}
export async function requireUser(role) {
  const u = await me();
  if (u.anonymous || (role && u.role !== role)) { location.href = `/login?next=${encodeURIComponent(location.pathname + location.search)}${role ? `&role=${role}` : ''}`; return new Promise(() => {}); }
  return u;
}
export function modal(html) {
  const m = document.createElement('div'); m.className = 'modal'; m.innerHTML = `<div class="panel" role="dialog" aria-modal="true">${html}</div>`;
  document.body.append(m); requestAnimationFrame(() => m.classList.add('open'));
  const close = () => { m.classList.remove('open'); setTimeout(() => m.remove(), 250); };
  m.addEventListener('click', (e) => { if (e.target === m || e.target.closest('[data-close]')) close(); });
  return { el: m, close };
}

layout();
reveal();
countUp();
