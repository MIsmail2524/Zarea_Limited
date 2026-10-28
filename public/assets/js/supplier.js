import { api, esc, pkr, chg, sparkline, requireUser, catName, modal } from './app.js';
import { shell, act, timeline, payBadge } from './dash.js';

const u = await requireUser('supplier');
const head = (t, sub, right = '') => `<div class="row between" style="margin-bottom:18px;align-items:end"><div><h1 class="h3">${t}</h1>${sub ? `<p class="muted" style="margin:4px 0 0">${sub}</p>` : ''}</div>${right}</div>`;
const notVerified = u.kyc_status !== 'verified' ? '<div class="notice" style="margin-bottom:16px">Your business is pending verification. Listing new products and bidding open once Zarea verifies your NTN and incorporation documents.</div>' : '';

const views = {
  async overview(p) {
    const [orders, rfqs, products] = await Promise.all([api('/api/orders/mine'), api('/api/supplier/rfqs'), api('/api/supplier/products')]);
    const todo = orders.filter((o) => ['placed', 'confirmed', 'dispatched'].includes(o.status));
    const openR = rfqs.filter((r) => !r.my_price);
    ui.badge('orders', todo.length); ui.badge('rfqs', openR.length);
    p.innerHTML = notVerified + head(esc(u.company.replace(/ \(demo\)$/, '')), `Supplier dashboard · ${u.rating ? `★ ${u.rating} rating` : 'no ratings yet'}`) + `
      <div class="kpis">
        <div class="kpi"><span>Orders to fulfil</span><b>${todo.length}</b></div>
        <div class="kpi"><span>Delivered revenue</span><b class="num">${pkr(orders.filter((o) => o.status === 'delivered').reduce((s, o) => s + o.total, 0))}</b></div>
        <div class="kpi"><span>RFQs awaiting your bid</span><b>${openR.length}</b></div>
        <div class="kpi"><span>Live listings</span><b>${products.filter((x) => x.status === 'active').length}</b></div>
      </div>
      <h2 class="h4" style="margin:24px 0 12px">Next actions</h2>
      ${todo.map((o) => `<div class="order"><div class="row between"><b>${esc(o.ref)} · ${esc(o.buyer.replace(/ \(demo\)$/, ''))}</b><span class="badge badge--orange">${o.status}</span></div>${timeline(o)}</div>`).join('') || '<div class="panel empty">All caught up.</div>'}`;
  },

  async listings(p) {
    const items = await api('/api/supplier/products');
    const meta = await api('/api/meta');
    p.innerHTML = notVerified + head('Listings & prices', 'Price changes update the national price board and trigger buyer alerts.', '<button class="btn btn--orange btn--sm" id="new">Add product</button>') + `
      <div class="table-wrap"><table><thead><tr><th>Product</th><th class="r">Price (Rs)</th><th class="r">MOQ</th><th class="r">Lead (d)</th><th>30d</th><th>Status</th><th></th></tr></thead><tbody>
      ${items.map((x) => `<tr data-id="${x.id}"><td><b>${esc(x.name)}</b><div class="small muted">${esc(catName(x.category))} · per ${esc(x.unit)} · ${esc(x.city)}</div></td>
        <td class="r"><input class="input num" name="price" value="${x.price ?? ''}" placeholder="On request" style="width:120px;height:36px;text-align:right"></td>
        <td class="r"><input class="input num" name="moq" value="${x.moq}" style="width:80px;height:36px;text-align:right"></td>
        <td class="r"><input class="input num" name="lead_days" value="${x.lead_days}" style="width:64px;height:36px;text-align:right"></td>
        <td>${x.stats ? `${sparkline(x.stats.spark, { w: 70, h: 22 })}${chg(x.stats.d30)}` : '—'}</td>
        <td><select class="input" name="status" style="height:36px;width:auto"><option ${x.status === 'active' ? 'selected' : ''}>active</option><option ${x.status === 'paused' ? 'selected' : ''}>paused</option></select></td>
        <td><button class="btn btn--sm" data-save="${x.id}">Save</button></td></tr>`).join('')}</tbody></table></div>`;
    p.onclick = async (e) => {
      const b = e.target.closest('[data-save]');
      if (b) {
        const tr = b.closest('tr'); const v = (n) => tr.querySelector(`[name=${n}]`).value.trim();
        await act(() => api(`/api/supplier/products/${b.dataset.save}`, { method: 'PATCH', body: { price: v('price') === '' ? null : Number(v('price')), moq: Number(v('moq')), lead_days: Number(v('lead_days')), status: v('status') } }), 'Listing updated');
      }
      if (e.target.id === 'new') {
        const m = modal(`<h2 class="h4">New product</h2><form class="form" style="margin-top:12px">
          <div class="field field--full"><label>Name</label><input name="name" required></div>
          <div class="field"><label>Category</label><select name="category">${meta.categories.map((c) => `<option value="${c.slug}">${esc(c.name)}</option>`).join('')}</select></div>
          <div class="field"><label>Brand</label><input name="brand"></div>
          <div class="field"><label>Unit</label><input name="unit" required placeholder="Bag (50 kg)"></div>
          <div class="field"><label>Price (Rs)</label><input name="price" inputmode="numeric" placeholder="blank = on request"></div>
          <div class="field"><label>MOQ</label><input name="moq" inputmode="numeric" value="1"></div>
          <div class="field"><label>Lead days</label><input name="lead_days" inputmode="numeric" value="2"></div>
          <div class="field field--full"><label>Ships from</label><select name="city">${meta.cities.map((c) => `<option ${c === u.city ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></div>
          <div class="field field--full"><label>Description</label><textarea name="description"></textarea></div>
          <div class="row field--full"><button class="btn btn--orange" type="submit">Publish</button><button class="btn btn--ghost" type="button" data-close>Cancel</button></div></form>`);
        m.el.querySelector('form').onsubmit = async (ev) => { ev.preventDefault(); if (await act(() => api('/api/supplier/products', { method: 'POST', body: Object.fromEntries(new FormData(ev.target)) }), 'Product published')) { m.close(); views.listings(p); } };
      }
    };
  },

  async rfqs(p) {
    const rfqs = await api('/api/supplier/rfqs');
    p.innerHTML = notVerified + head('RFQ inbox', 'Bid with a delivered unit price. You can revise until the buyer awards.') + (rfqs.length ? rfqs.map((r) => `
      <div class="order"><div class="row between"><div><b>${esc(r.title)}</b><div class="small muted">${esc(r.ref)} · ${esc(catName(r.category))} · ${r.qty.toLocaleString()} ${esc(r.unit)} → ${esc(r.city)}${r.needed_by ? ` · by ${esc(r.needed_by)}` : ''} · ${r.bids} bid${r.bids === 1 ? '' : 's'}</div></div>
        ${r.my_status ? `<span class="badge ${r.my_status === 'accepted' ? 'badge--ok' : r.my_status === 'rejected' ? 'badge--bad' : 'badge--info'}">Your bid: ${pkr(r.my_price)} · ${r.my_status}</span>` : '<span class="badge badge--orange">New</span>'}</div>
        ${r.notes ? `<p class="small" style="margin:8px 0 0">${esc(r.notes)}</p>` : ''}${r.target_price ? `<p class="small muted" style="margin:4px 0 0">Buyer target: ${pkr(r.target_price)} / ${esc(r.unit)}</p>` : ''}
        ${!r.my_status || r.my_status === 'pending' ? `<form class="row" data-bid="${r.id}" style="margin-top:12px"><input class="input num" name="unit_price" inputmode="numeric" placeholder="Unit price (delivered)" value="${r.my_price || ''}" required style="width:190px"><input class="input num" name="lead_days" inputmode="numeric" placeholder="Lead days" value="${r.my_lead ?? ''}" required style="width:110px"><input class="input" name="notes" placeholder="Brand, certificates, terms" style="flex:1;min-width:160px"><button class="btn btn--orange btn--sm">${r.my_price ? 'Update bid' : 'Submit bid'}</button></form>` : ''}
      </div>`).join('') : '<div class="panel empty">No open RFQs right now.</div>');
    p.onsubmit = async (e) => { e.preventDefault(); const f = e.target.closest('[data-bid]'); if (f && await act(() => api(`/api/supplier/rfqs/${f.dataset.bid}/bid`, { method: 'POST', body: Object.fromEntries(new FormData(f)) }), 'Bid submitted')) views.rfqs(p); };
  },

  async orders(p) {
    const orders = await api('/api/orders/mine');
    const NEXT = { placed: 'Confirm order', confirmed: 'Mark dispatched', dispatched: 'Mark delivered' };
    p.innerHTML = head('Orders', 'Move each order through confirmation, dispatch and delivery.') + (orders.length ? orders.map((o) => `
      <div class="order"><div class="row between"><div><b>${esc(o.ref)}</b> <span class="small muted">· ${esc(o.buyer.replace(/ \(demo\)$/, ''))} · ${esc(o.delivery_city)}${o.address ? `, ${esc(o.address)}` : ''}</span></div><div class="row">${payBadge(o.payment_status)}<b class="num">${pkr(o.total)}</b></div></div>
      <div class="small muted" style="margin-top:4px">${o.items.map((i) => `${i.qty.toLocaleString()} × ${esc(i.description)}`).join(' · ')}${o.vehicle ? ` · 🚚 ${esc(o.vehicle)}` : ''}</div>
      ${timeline(o)}
      <div class="row" style="margin-top:12px">${NEXT[o.status] ? `<button class="btn btn--orange btn--sm" data-adv="${o.id}" data-s="${o.status}">${NEXT[o.status]}</button>` : ''}${['placed', 'confirmed'].includes(o.status) ? `<button class="btn btn--ghost btn--sm" data-cancel="${o.id}">Decline</button>` : ''}</div></div>`).join('') : '<div class="panel empty">No orders yet.</div>');
    p.onclick = async (e) => {
      const a = e.target.closest('[data-adv]'); const c = e.target.closest('[data-cancel]');
      if (a) {
        let vehicle = '';
        if (a.dataset.s === 'confirmed') { vehicle = prompt('Vehicle number and type (e.g. LES-1234 · Mazda 6T)') || ''; if (!vehicle.trim()) return; }
        if (await act(() => api(`/api/supplier/orders/${a.dataset.adv}/advance`, { method: 'POST', body: { vehicle } }), 'Order updated')) views.orders(p);
      }
      if (c && confirm('Decline and cancel this order?') && await act(() => api(`/api/orders/${c.dataset.cancel}/cancel`, { method: 'POST', body: {} }), 'Order cancelled')) views.orders(p);
    };
  },
};
const ui = shell([['overview', 'Overview', 'chart'], ['orders', 'Orders', 'box'], ['rfqs', 'RFQ inbox', 'handshake'], ['listings', 'Listings & prices', 'doc']], views);
