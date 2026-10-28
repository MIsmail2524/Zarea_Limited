import { api, esc, pkr, requireUser, catName, modal, reveal } from './app.js';
import { shell, act, timeline, payBadge } from './dash.js';

const u = await requireUser('buyer');
const head = (t, sub, right = '') => `<div class="row between" style="margin-bottom:18px;align-items:end"><div><h1 class="h3">${t}</h1>${sub ? `<p class="muted" style="margin:4px 0 0">${sub}</p>` : ''}</div>${right}</div>`;

const views = {
  async overview(p) {
    const [orders, rfqs, credit, alerts] = await Promise.all([api('/api/orders/mine'), api('/api/rfqs/mine'), api('/api/credit/mine'), api('/api/alerts')]);
    const open = orders.filter((o) => !['delivered', 'cancelled'].includes(o.status));
    const avail = credit.limit - credit.used; const fired = alerts.filter((a) => a.triggered_at);
    ui.badge('alerts', fired.length); ui.badge('rfqs', rfqs.reduce((n, r) => n + (r.status === 'open' ? r.bids.length : 0), 0));
    p.innerHTML = head(`Welcome back, ${esc(u.name.split(' ')[0])}`, `${esc(u.company)} · ${u.kyc_status === 'verified' ? '<span class="badge badge--ok">✓ Verified business</span>' : '<span class="badge badge--warn">Verification pending</span>'}`,
      '<div class="row"><a class="btn btn--ghost btn--sm" href="/rfq">Post RFQ</a><a class="btn btn--orange btn--sm" href="/marketplace">Shop</a></div>') + `
      <div class="kpis">
        <div class="kpi"><span>Open orders</span><b>${open.length}</b></div>
        <div class="kpi"><span>Total purchased</span><b class="num">${pkr(orders.filter((o) => o.status !== 'cancelled').reduce((s, o) => s + o.total, 0))}</b></div>
        <div class="kpi"><span>Credit available</span><b class="num">${pkr(avail)}</b><div class="meter"><i style="width:${credit.limit ? (credit.used / credit.limit) * 100 : 0}%"></i></div></div>
        <div class="kpi"><span>Price alerts triggered</span><b>${fired.length}</b></div>
      </div>
      ${fired.length ? `<div class="notice" style="margin-top:16px">🔔 ${fired.map((a) => `<a href="/product?slug=${encodeURIComponent(a.slug)}"><b>${esc(a.name)}</b></a> is now ${pkr(a.price)} (${a.direction} ${pkr(a.target)})`).join(' · ')}</div>` : ''}
      <h2 class="h4" style="margin:26px 0 12px">Active orders</h2>
      ${open.length ? open.map((o) => `<div class="order"><div class="row between"><b>${esc(o.ref)}</b><span class="small muted">${esc(o.supplier.replace(/ \(demo\)$/, ''))} · ${pkr(o.total)}</span></div>${timeline(o)}</div>`).join('') : '<div class="panel empty">No active orders.</div>'}`;
  },

  async orders(p) {
    const orders = await api('/api/orders/mine');
    p.innerHTML = head('Orders', `${orders.length} orders`) + (orders.length ? orders.map((o) => `
      <div class="order" data-reveal>
        <div class="row between"><div><b>${esc(o.ref)}</b> <span class="small muted">· ${esc(o.created_at.slice(0, 10))}</span></div><div class="row">${payBadge(o.payment_status)}<span class="badge badge--dark">${esc(o.payment_method)}</span></div></div>
        <div class="small muted" style="margin-top:4px">${esc(o.supplier.replace(/ \(demo\)$/, ''))} → ${esc(o.delivery_city)}${o.vehicle ? ` · 🚚 ${esc(o.vehicle)}` : ''}${o.due_date && o.payment_status === 'due' ? ` · due ${esc(o.due_date)}` : ''}</div>
        ${timeline(o)}
        <div class="table-wrap" style="margin-top:14px"><table><tbody>${o.items.map((i) => `<tr><td>${esc(i.description)}</td><td class="r">${i.qty.toLocaleString()} ${esc(i.unit)}</td><td class="r num">${pkr(i.unit_price * i.qty)}</td></tr>`).join('')}
          <tr><td colspan="2" class="muted">Freight</td><td class="r num">${pkr(o.freight)}</td></tr><tr><td colspan="2"><b>Total</b></td><td class="r num"><b>${pkr(o.total)}</b></td></tr></tbody></table></div>
        <div class="row" style="margin-top:12px">
          ${['placed', 'confirmed'].includes(o.status) ? `<button class="btn btn--ghost btn--sm" data-cancel="${o.id}">Cancel order</button>` : ''}
          ${o.status === 'delivered' ? (o.my_rating ? `<span class="small">Your rating: <span class="stars">${'★'.repeat(o.my_rating)}</span></span>` : `<button class="btn btn--sm btn--orange" data-review="${o.id}">Rate supplier</button>`) : ''}
          <a class="btn btn--ghost btn--sm" href="/logistics?track=${esc(o.ref)}">Tracking page</a>
        </div>
      </div>`).join('') : '<div class="panel empty">No orders yet. <a class="accent" href="/marketplace">Start shopping →</a></div>');
    reveal(p);
    p.onclick = async (e) => {
      const c = e.target.closest('[data-cancel]'); const r = e.target.closest('[data-review]');
      if (c && confirm('Cancel this order?')) { if (await act(() => api(`/api/orders/${c.dataset.cancel}/cancel`, { method: 'POST', body: {} }), 'Order cancelled')) views.orders(p); }
      if (r) {
        const m = modal(`<h2 class="h4">Rate this delivery</h2><form class="stack" style="--gap:12px;margin-top:12px"><div class="seg" id="stars">${[1, 2, 3, 4, 5].map((n) => `<button type="button" data-n="${n}">${'★'.repeat(n)}</button>`).join('')}</div>
          <textarea class="input" name="comment" style="height:90px;padding:10px" placeholder="Quality, timeliness, communication…"></textarea><div class="row"><button class="btn btn--orange" type="submit">Submit</button><button class="btn btn--ghost" type="button" data-close>Cancel</button></div></form>`);
        let rating = 5; m.el.querySelectorAll('[data-n]').forEach((b) => { b.classList.toggle('on', b.dataset.n === '5'); b.onclick = () => { rating = Number(b.dataset.n); m.el.querySelectorAll('[data-n]').forEach((x) => x.classList.toggle('on', x === b)); }; });
        m.el.querySelector('form').onsubmit = async (ev) => { ev.preventDefault(); if (await act(() => api(`/api/orders/${r.dataset.review}/review`, { method: 'POST', body: { rating, comment: ev.target.comment.value } }), 'Thanks for your review')) { m.close(); views.orders(p); } };
      }
    };
  },

  async rfqs(p) {
    const rfqs = await api('/api/rfqs/mine');
    p.innerHTML = head('My RFQs', 'Compare bids and award the best offer.', '<a class="btn btn--orange btn--sm" href="/rfq">New RFQ</a>') + (rfqs.length ? rfqs.map((r) => `
      <div class="order"><div class="row between"><div><b>${esc(r.title)}</b><div class="small muted">${esc(r.ref)} · ${esc(catName(r.category))} · ${r.qty.toLocaleString()} ${esc(r.unit)} · ${esc(r.city)}${r.target_price ? ` · target ${pkr(r.target_price)}` : ''}</div></div>
        <span class="badge ${r.status === 'open' ? 'badge--orange' : r.status === 'awarded' ? 'badge--ok' : ''}">${r.status}</span></div>
        ${r.bids.length ? `<div class="table-wrap" style="margin-top:12px"><table><thead><tr><th>Supplier</th><th class="r">Unit price</th><th class="r">Total</th><th class="r">Lead</th><th>Notes</th><th></th></tr></thead><tbody>
          ${r.bids.map((b, i) => `<tr ${i === 0 && r.status === 'open' ? 'style="background:var(--green-100)"' : ''}><td><b>${esc(b.supplier.replace(/ \(demo\)$/, ''))}</b> ${b.verified ? '<span class="badge badge--ok">✓</span>' : ''}<div class="small muted">${b.rating ? `★ ${b.rating}` : 'New'}</div></td>
          <td class="r num"><b>${pkr(b.unit_price)}</b>${i === 0 && r.bids.length > 1 ? '<div class="small" style="color:var(--green)">Lowest</div>' : ''}</td><td class="r num">${pkr(b.unit_price * r.qty)}</td><td class="r">${b.lead_days}d</td><td class="small">${esc(b.notes || '')}</td>
          <td>${r.status === 'open' ? `<button class="btn btn--orange btn--sm" data-accept="${b.id}" data-total="${b.unit_price * r.qty}">Award</button>` : `<span class="badge ${b.status === 'accepted' ? 'badge--ok' : ''}">${b.status}</span>`}</td></tr>`).join('')}</tbody></table></div>`
          : '<p class="small muted" style="margin:10px 0 0">Waiting for supplier bids…</p>'}</div>`).join('') : '<div class="panel empty">No RFQs yet.</div>');
    p.onclick = (e) => {
      const b = e.target.closest('[data-accept]'); if (!b) return;
      const m = modal(`<h2 class="h4">Award bid · ${pkr(b.dataset.total)}</h2><p class="small muted">Choose how you'll pay. Other bids will be declined.</p>
        <form class="stack" style="--gap:12px"><select class="input" name="pm"><option value="escrow">Escrow (recommended)</option><option value="credit">Zarea Credit · 30 days</option><option value="advance">Advance transfer</option><option value="cod">Cash on delivery</option></select>
        <div class="row"><button class="btn btn--orange" type="submit">Confirm award</button><button class="btn btn--ghost" type="button" data-close>Cancel</button></div></form>`);
      m.el.querySelector('form').onsubmit = async (ev) => { ev.preventDefault(); if (await act(() => api(`/api/bids/${b.dataset.accept}/accept`, { method: 'POST', body: { payment_method: ev.target.pm.value } }), 'Bid awarded — order created')) { m.close(); views.rfqs(p); } };
    };
  },

  async credit(p) {
    const c = await api('/api/credit/mine');
    p.innerHTML = head('Zarea Credit', c.limit ? 'Your revolving trade credit line.' : 'Not yet activated.', '<a class="btn btn--orange btn--sm" href="/credit#apply">Apply / increase</a>') + `
      <div class="kpis" style="grid-template-columns:repeat(3,minmax(0,1fr))"><div class="kpi"><span>Limit</span><b class="num">${pkr(c.limit)}</b></div><div class="kpi"><span>Used</span><b class="num">${pkr(c.used)}</b></div><div class="kpi"><span>Available</span><b class="num accent">${pkr(c.limit - c.used)}</b><div class="meter"><i style="width:${c.limit ? (c.used / c.limit) * 100 : 0}%"></i></div></div></div>
      <h2 class="h4" style="margin:24px 0 10px">Upcoming dues</h2>
      <div class="table-wrap"><table><thead><tr><th>Order</th><th class="r">Amount</th><th>Due</th></tr></thead><tbody>${c.due.map((d) => `<tr><td>${esc(d.ref)}</td><td class="r num">${pkr(d.total)}</td><td>${esc(d.due_date || '')}</td></tr>`).join('') || '<tr><td colspan="3" class="empty">Nothing due.</td></tr>'}</tbody></table></div>
      <h2 class="h4" style="margin:24px 0 10px">Applications</h2>
      <div class="table-wrap"><table><thead><tr><th>Ref</th><th class="r">Requested</th><th>Term</th><th class="r">Score</th><th>Status</th><th class="r">Approved</th></tr></thead><tbody>${c.applications.map((a) => `<tr><td>${esc(a.ref)}</td><td class="r num">${pkr(a.amount)}</td><td>${a.term_days} days</td><td class="r">${a.score}</td><td><span class="badge ${a.status === 'approved' ? 'badge--ok' : a.status === 'rejected' ? 'badge--bad' : 'badge--warn'}">${a.status}</span></td><td class="r num">${a.approved_limit ? pkr(a.approved_limit) : '—'}</td></tr>`).join('') || '<tr><td colspan="6" class="empty">No applications.</td></tr>'}</tbody></table></div>`;
  },

  async alerts(p) {
    const a = await api('/api/alerts');
    p.innerHTML = head('Price alerts', 'Set alerts from any product page.') + `<div class="table-wrap"><table><thead><tr><th>Product</th><th>Condition</th><th class="r">Current</th><th>Status</th><th></th></tr></thead><tbody>
      ${a.map((x) => `<tr><td><a href="/product?slug=${encodeURIComponent(x.slug)}"><b>${esc(x.name)}</b></a></td><td>${x.direction} ${pkr(x.target)}</td><td class="r num">${pkr(x.price)}</td><td>${x.triggered_at ? `<span class="badge badge--ok">Triggered ${esc(x.triggered_at.slice(0, 10))}</span>` : '<span class="badge">Watching</span>'}</td><td><button class="btn btn--ghost btn--sm" data-del="${x.id}">Remove</button></td></tr>`).join('') || '<tr><td colspan="5" class="empty">No alerts yet.</td></tr>'}</tbody></table></div>`;
    p.onclick = async (e) => { const b = e.target.closest('[data-del]'); if (b && await act(() => api(`/api/alerts/${b.dataset.del}`, { method: 'DELETE' }), 'Alert removed')) views.alerts(p); };
  },

  async profile(p) {
    p.innerHTML = head('Business profile', '') + `<div class="panel"><table><tbody>
      ${[['Business', u.company], ['Contact', u.name], ['Email', u.email], ['Phone', u.phone || '—'], ['City', u.city]].map(([k, v]) => `<tr><td class="muted">${k}</td><td><b>${esc(v)}</b></td></tr>`).join('')}
      <tr><td class="muted">Verification</td><td>${u.kyc_status === 'verified' ? '<span class="badge badge--ok">✓ Verified</span>' : '<span class="badge badge--warn">Pending — our team will contact you for NTN and incorporation documents</span>'}</td></tr></tbody></table></div>`;
  },
};
const ui = shell([['overview', 'Overview', 'chart'], ['orders', 'Orders', 'box'], ['rfqs', 'RFQs & bids', 'handshake'], ['credit', 'Credit', 'credit'], ['alerts', 'Price alerts', 'bell'], ['profile', 'Profile', 'user']], views);
