import { api, esc, pkr, me, icon, bindForm } from './app.js';

const $ = (id) => document.getElementById(id);
const DOCS = [['Tax registration (NTN)', 'Confirms your business operates within the tax framework.'], ['Incorporation certificate', 'Verifies your legal entity.'],
  ['12-month bank statement', 'Used to assess cash flow and turnover.'], ['Post-dated cheque', 'Secures the repayment cycle.'], ['Request on letterhead', 'States the amount and purpose.'], ['CNIC of directors', 'Identity check for signatories.']];
$('docs').innerHTML = DOCS.map(([t, d]) => `<div class="card"><div class="ico">${icon('doc')}</div><h3>${t}</h3><p>${d}</p></div>`).join('');

let t;
async function score() {
  $('yrs-v').textContent = $('yrs').value;
  const body = Object.fromEntries(new FormData(Object.assign(document.createElement('form'), {})));
  ['ct', 'yrs', 'to', 'amt'].forEach((id) => { const el = $(id); body[el.name] = el.value.replace(/[^\d]/g, '') || el.value; });
  const r = await api('/api/credit/eligibility', { method: 'POST', body });
  $('sc').textContent = r.score; $('band').textContent = r.band; $('lim').textContent = pkr(r.suggested);
  $('sc-bar').style.width = `${r.score}%`;
}
$('calc').addEventListener('input', () => { clearTimeout(t); t = setTimeout(score, 200); });
score();

const meta = await api('/api/meta');
$('a-com').innerHTML = meta.categories.map((c) => `<option value="${c.slug}">${esc(c.name)}</option>`).join('');
const u = await me();
const form = $('apply');
if (u.anonymous || u.role !== 'buyer') {
  form.querySelector('[type=submit]').outerHTML = `<a class="btn btn--orange" href="/login?next=/credit">Sign in as a buyer to apply</a>`;
} else {
  $('apply-note').textContent = u.kyc_status === 'verified' ? 'Your business is verified — this improves your score.' : 'Tip: complete KYC verification to improve your score.';
  bindForm(form, '/api/credit/apply', (r) => `Application ${r.ref} received · score ${r.score} (${r.band}). Indicative limit ${pkr(r.suggested)}. Track it in your dashboard.`);
}
