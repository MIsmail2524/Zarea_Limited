import { api, esc, qs } from './app.js';

const $ = (id) => document.getElementById(id);
let role = qs('role') === 'supplier' ? 'supplier' : 'buyer';
const meta = await api('/api/meta');
$('rcity').innerHTML = meta.cities.map((c) => `<option>${esc(c)}</option>`).join('');
const go = (r) => {
  const next = qs('next');
  location.href = next && next.startsWith('/') && !next.startsWith('//') ? next : r === 'admin' ? '/admin' : r === 'supplier' ? '/supplier' : '/account';
};
document.querySelectorAll('[data-t]').forEach((b) => b.onclick = () => {
  document.querySelectorAll('[data-t]').forEach((x) => x.classList.toggle('on', x === b));
  $('in').classList.toggle('hidden', b.dataset.t !== 'in'); $('up').classList.toggle('hidden', b.dataset.t !== 'up');
});
document.querySelectorAll('[data-r]').forEach((b) => { b.classList.toggle('on', b.dataset.r === role); b.onclick = () => { role = b.dataset.r; document.querySelectorAll('[data-r]').forEach((x) => x.classList.toggle('on', x === b)); }; });
if (qs('mode') === 'register') document.querySelector('[data-t=up]').click();

async function submit(form, path, extra = {}) {
  const st = form.querySelector('.status'); st.className = 'status'; st.textContent = '…';
  try { const r = await api(path, { method: 'POST', body: { ...Object.fromEntries(new FormData(form)), ...extra } }); go(r.role); }
  catch (e) { st.className = 'status err'; st.textContent = e.message; }
}
$('in').onsubmit = (e) => { e.preventDefault(); submit(e.target, '/api/login'); };
$('up').onsubmit = (e) => { e.preventDefault(); submit(e.target, '/api/register', { role }); };
