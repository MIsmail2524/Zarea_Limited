import { api, esc } from './app.js';

const log = document.getElementById('log');
const SUG = ['Cement price in Lahore', 'Compare Lucky vs Maple Leaf', 'sarya ka rate', 'Cheapest coal', 'Freight Karachi to Lahore 20 tons', 'Material for 2000 sqft house', 'Credit requirements', 'Track ZR-DEMO01', 'Wheat trend'];
const bold = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');

function add(role, html) {
  const d = document.createElement('div'); d.className = `msg ${role}`; d.innerHTML = html; log.append(d); log.scrollTop = log.scrollHeight; return d;
}
function render(r) {
  let h = `<div>${bold(r.text)}</div>`;
  if (r.table) h += `<div class="table-wrap"><table><thead><tr>${r.table.cols.map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${r.table.rows.map((row) => `<tr>${row.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  if (r.links?.length) h += `<div class="links">${r.links.filter((l) => l.href.startsWith('/')).map((l) => `<a class="btn btn--sm btn--ghost" href="${esc(l.href)}">${esc(l.label)} →</a>`).join('')}</div>`;
  if (r.suggestions?.length) h += `<div class="suggest" style="margin-top:10px">${r.suggestions.map((s) => `<button type="button" data-s="${esc(s)}">${esc(s)}</button>`).join('')}</div>`;
  return h;
}
async function ask(q) {
  add('me', esc(q));
  const t = add('bot', '<span class="typing"><span></span><span></span><span></span></span>');
  try { const r = await api('/api/ai', { method: 'POST', body: { message: q } }); await new Promise((x) => setTimeout(x, 350)); t.innerHTML = render(r); }
  catch (e) { t.textContent = e.message; }
  log.scrollTop = log.scrollHeight;
}
add('bot', render({ text: "Assalam o alaikum! I'm **Zarea AI**. Ask me about prices, brands, freight, building estimates, credit or your order.", suggestions: SUG.slice(0, 4) }));
document.getElementById('sug').innerHTML = SUG.map((s) => `<button type="button" data-s="${esc(s)}">${esc(s)}</button>`).join('');
document.addEventListener('click', (e) => { const b = e.target.closest('[data-s]'); if (b) ask(b.dataset.s); });
document.getElementById('ask').onsubmit = (e) => { e.preventDefault(); const v = e.target.q.value.trim(); if (v) { e.target.q.value = ''; ask(v); } };
const q0 = new URLSearchParams(location.search).get('q'); if (q0) ask(q0);
