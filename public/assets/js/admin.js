import { api, esc, pkr, requireUser, catName } from './app.js';
import { shell, act, payBadge } from './dash.js';

await requireUser('admin');
const head = (t, sub, right = '') => `<div class="row between" style="margin-bottom:18px;align-items:end"><div><h1 class="h3">${t}</h1>${sub ? `<p class="muted" style="margin:4px 0 0">${sub}</p>` : ''}</div>${right}</div>`;
const sel = (name, opts, v, attrs) => `<select class="input" style="height:34px;width:auto" ${attrs}>${opts.map((o) => `<option ${o === v ? 'selected' : ''}>${o}</option>`).join('')}</select>`;

const views = {
  async overview(p) {
    const s = await api('/api/admin/overview');
    ui.badge('kyc', s.pendingKyc); ui.badge('credit', s.pendingCredit); ui.badge('leads', s.newLeads);
    const max = Math.max(1, ...s.byCategory.map((c) => c.total));
    p.innerHTML = head('Operations overview', 'Marketplace health at a glance.', `<div class="row"><a class="btn btn--ghost btn--sm" href="/api/admin/export/orders.csv" download>Orders CSV</a><a class="btn btn--ghost btn--sm" href="/api/admin/export/leads.csv" download>Leads CSV</a><a class="btn btn--ghost btn--sm" href="/api/admin/export/users.csv" download>Users CSV</a></div>`) + `
      <div class="kpis"><div class="kpi"><span>GMV</span><b class="num">${pkr(s.gmv)}</b></div><div class="kpi"><span>Orders</span><b>${s.orders}</b></div><div class="kpi"><span>Open RFQs</span><b>${s.openRfqs}</b></div><div class="kpi"><span>Credit outstanding</span><b class="num">${pkr(s.creditOutstanding)}</b></div></div>
      <div class="grid g2" style="margin-top:18px">
        <div class="panel"><h2 class="h4">GMV by category</h2>${s.byCategory.map((c) => `<div class="bar-row"><span>${esc(catName(c.category))}</span><div class="meter" style="margin:0"><i style="width:${(c.total / max) * 100}%"></i></div><b class="num small">${pkr(c.total)}</b></div>`).join('') || '<p class="muted">No sales yet.</p>'}</div>
        <div class="panel"><h2 class="h4">Queues</h2><div class="tier"><span>KYC pending</span><b>${s.pendingKyc}</b></div><div class="tier"><span>Credit applications</span><b>${s.pendingCredit}</b></div><div class="tier"><span>New leads &amp; supplier applications</span><b>${s.newLeads}</b></div>
          <h2 class="h4" style="margin-top:16px">Orders by status</h2>${s.byStatus.map((x) => `<div class="tier"><span>${esc(x.status)}</span><b>${x.n}</b></div>`).join('')}</div>
      </div>`;
  },
  async kyc(p) {
    const users = await api('/api/admin/users');
    p.innerHTML = head('Users & KYC', 'Verify businesses to unlock credit, listings and bidding.') + `<div class="table-wrap"><table><thead><tr><th>Business</th><th>Role</th><th>Contact</th><th>NTN</th><th>City</th><th>KYC</th></tr></thead><tbody>
      ${users.map((x) => `<tr><td><b>${esc(x.company)}</b><div class="small muted">${esc(x.created_at.slice(0, 10))}</div></td><td><span class="badge">${x.role}</span></td><td class="small">${esc(x.name)}<br>${esc(x.email)}</td><td>${esc(x.ntn || '—')}</td><td>${esc(x.city || '')}</td>
      <td>${sel('kyc', ['pending', 'verified', 'rejected'], x.kyc_status, `data-user="${x.id}"`)}</td></tr>`).join('')}</tbody></table></div>`;
    p.onchange = (e) => { const s = e.target.closest('[data-user]'); if (s) act(() => api(`/api/admin/users/${s.dataset.user}`, { method: 'PATCH', body: { kyc_status: s.value } }), 'KYC updated'); };
  },
  async credit(p) {
    const apps = await api('/api/admin/credit');
    p.innerHTML = head('Credit applications', 'Score is indicative; set the approved limit.') + `<div class="table-wrap"><table><thead><tr><th>Ref</th><th>Business</th><th class="r">Requested</th><th class="r">Turnover / mo</th><th>Years</th><th class="r">Score</th><th>Decision</th></tr></thead><tbody>
      ${apps.map((a) => `<tr><td>${esc(a.ref)}</td><td><b>${esc(a.company)}</b><div class="small muted">${esc(a.industry)} · ${esc(a.company_type)} · KYC ${esc(a.kyc_status)}</div></td><td class="r num">${pkr(a.amount)}<div class="small muted">${a.term_days}d</div></td><td class="r num">${pkr(a.monthly_turnover)}</td><td>${a.years_in_business}</td><td class="r"><b>${a.score}</b></td>
      <td>${a.status === 'pending' ? `<div class="row"><input class="input num" data-lim="${a.id}" value="${Math.min(a.amount, Math.round(a.monthly_turnover * 0.5))}" style="width:130px;height:34px"><button class="btn btn--sm btn--orange" data-ok="${a.id}">Approve</button><button class="btn btn--sm btn--ghost" data-no="${a.id}">Reject</button></div>` : `<span class="badge ${a.status === 'approved' ? 'badge--ok' : 'badge--bad'}">${a.status}${a.approved_limit ? ` · ${pkr(a.approved_limit)}` : ''}</span>`}</td></tr>`).join('') || '<tr><td colspan="7" class="empty">No applications.</td></tr>'}</tbody></table></div>`;
    p.onclick = async (e) => {
      const ok = e.target.closest('[data-ok]'), no = e.target.closest('[data-no]');
      if (ok && await act(() => api(`/api/admin/credit/${ok.dataset.ok}`, { method: 'PATCH', body: { status: 'approved', approved_limit: Number(p.querySelector(`[data-lim="${ok.dataset.ok}"]`).value) } }), 'Credit approved')) views.credit(p);
      if (no && await act(() => api(`/api/admin/credit/${no.dataset.no}`, { method: 'PATCH', body: { status: 'rejected' } }), 'Application rejected')) views.credit(p);
    };
  },
  async orders(p) {
    const orders = await api('/api/admin/orders');
    p.innerHTML = head('All orders', 'Reconcile payments and escrow.') + `<div class="table-wrap"><table><thead><tr><th>Ref</th><th>Buyer → Supplier</th><th>City</th><th class="r">Total</th><th>Method</th><th>Status</th><th>Payment</th></tr></thead><tbody>
      ${orders.map((o) => `<tr><td><b>${esc(o.ref)}</b><div class="small muted">${esc(o.created_at.slice(0, 10))}</div></td><td class="small">${esc(o.buyer)}<br>→ ${esc(o.supplier)}</td><td>${esc(o.delivery_city)}</td><td class="r num">${pkr(o.total)}</td><td>${esc(o.payment_method)}</td><td><span class="badge">${esc(o.status)}</span></td>
      <td>${sel('pay', ['pending', 'held', 'paid', 'due', 'refunded'], o.payment_status, `data-order="${o.id}"`)}</td></tr>`).join('')}</tbody></table></div>`;
    p.onchange = (e) => { const s = e.target.closest('[data-order]'); if (s) act(() => api(`/api/admin/orders/${s.dataset.order}`, { method: 'PATCH', body: { payment_status: s.value } }), 'Payment status updated'); };
  },
  async leads(p) {
    const { leads, suppliers } = await api('/api/admin/leads');
    p.innerHTML = head('Leads & supplier applications', '') + `<h2 class="h4" style="margin-bottom:10px">Supplier applications</h2><div class="table-wrap"><table><thead><tr><th>Business</th><th>Type</th><th>Commodity</th><th>Contact</th><th>City</th><th>Status</th></tr></thead><tbody>
      ${suppliers.map((s) => `<tr><td><b>${esc(s.name)}</b>${s.brand ? `<div class="small muted">${esc(s.brand)}</div>` : ''}</td><td>${esc(s.supplier_type)}</td><td>${esc(catName(s.commodity))}</td><td class="small">${esc(s.phone)}<br>${esc(s.email)}</td><td>${esc(s.city)}</td><td>${sel('s', ['new', 'contacted', 'onboarded', 'rejected'], s.status, `data-t="supplier_applications" data-id="${s.id}"`)}</td></tr>`).join('') || '<tr><td colspan="6" class="empty">None.</td></tr>'}</tbody></table></div>
      <h2 class="h4" style="margin:24px 0 10px">Enquiries</h2><div class="table-wrap"><table><thead><tr><th>Type</th><th>From</th><th>Need</th><th>Message</th><th>Status</th></tr></thead><tbody>
      ${leads.map((l) => `<tr><td><span class="badge badge--info">${esc(l.kind)}</span></td><td class="small"><b>${esc(l.name)}</b><br>${esc(l.email)}${l.phone ? `<br>${esc(l.phone)}` : ''}</td><td class="small">${esc(l.product || '')} ${esc(l.qty || '')} ${esc(l.city || '')}</td><td class="small" style="max-width:300px">${esc(l.message || '')}</td><td>${sel('l', ['new', 'contacted', 'closed'], l.status, `data-t="leads" data-id="${l.id}"`)}</td></tr>`).join('') || '<tr><td colspan="5" class="empty">None.</td></tr>'}</tbody></table></div>`;
    p.onchange = (e) => { const s = e.target.closest('[data-t]'); if (s) act(() => api(`/api/admin/${s.dataset.t}/${s.dataset.id}`, { method: 'PATCH', body: { status: s.value } }), 'Updated'); };
  },
};
const ui = shell([['overview', 'Overview', 'chart'], ['kyc', 'Users & KYC', 'shield'], ['credit', 'Credit', 'credit'], ['orders', 'Orders', 'box'], ['leads', 'Leads', 'bell']], views);
