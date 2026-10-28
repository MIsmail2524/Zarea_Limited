import { api, esc, pkr, qs } from './app.js';

const $ = (id) => document.getElementById(id);
const meta = await api('/api/meta');
const opts = (sel) => meta.cities.map((c) => `<option ${c === sel ? 'selected' : ''}>${esc(c)}</option>`).join('');
$('from').innerHTML = opts(qs('from') || 'Karachi'); $('to').innerHTML = opts(qs('to') || 'Lahore');
if (qs('kg')) $('kg').value = Number(qs('kg')) / 1000;

let t;
async function quote() {
  const kg = Math.round(Math.max(0.1, Number($('kg').value) || 1) * 1000);
  const q = await api(`/api/freight?from=${encodeURIComponent($('from').value)}&to=${encodeURIComponent($('to').value)}&kg=${kg}`);
  $('fq').innerHTML = `<div class="grid g3"><div class="kpi"><span>Distance</span><b>${q.km.toLocaleString()} km</b></div><div class="kpi"><span>Transit</span><b>~${q.hours} h</b></div><div class="kpi"><span>Best price</span><b class="accent num">${pkr(q.best.cost)}</b></div></div>
    <div class="table-wrap" style="margin-top:14px"><table><thead><tr><th>Truck</th><th class="r">Capacity</th><th class="r">Trucks</th><th class="r">Estimate</th><th class="r">Per tonne</th></tr></thead><tbody>
    ${q.options.map((o) => `<tr ${o.id === q.best.id ? 'style="background:var(--orange-50)"' : ''}><td><b>${esc(o.name)}</b> ${o.id === q.best.id ? '<span class="badge badge--orange">Best</span>' : ''}</td><td class="r">${o.capacityKg / 1000} t</td><td class="r">${o.trucks}</td><td class="r num"><b>${pkr(o.cost)}</b></td><td class="r num">${pkr(o.cost / (kg / 1000))}</td></tr>`).join('')}
    </tbody></table></div>`;
}
$('fc').addEventListener('input', () => { clearTimeout(t); t = setTimeout(quote, 250); });
quote();

const STAGES = ['placed', 'confirmed', 'dispatched', 'delivered'];
async function track(ref) {
  $('tr').innerHTML = '<div class="skeleton" style="height:60px"></div>';
  try {
    const o = await api(`/api/track/${encodeURIComponent(ref.toUpperCase().trim())}`);
    const done = new Set(o.events.map((e) => e.status));
    $('tr').innerHTML = `<div class="row between"><b>${esc(o.ref)}</b><span class="badge ${o.status === 'delivered' ? 'badge--ok' : o.status === 'cancelled' ? 'badge--bad' : 'badge--orange'}">${esc(o.status)}</span></div>
      <p class="small muted" style="margin:4px 0 0">To ${esc(o.delivery_city)}${o.delivery_date ? ` · planned ${esc(o.delivery_date)}` : ''}</p>
      <ol class="timeline">${STAGES.map((s) => `<li class="${done.has(s) ? 'done' : ''} ${o.status === s && s !== 'delivered' ? 'now' : ''}">${s}<br><span class="small">${esc(o.events.find((e) => e.status === s)?.at.slice(5, 16) || '')}</span></li>`).join('')}</ol>`;
  } catch (e) { $('tr').innerHTML = `<p class="small" style="color:var(--red)">${esc(e.message)}</p>`; }
}
$('track').onsubmit = (e) => { e.preventDefault(); track(e.target.ref.value); };
if (qs('track')) { $('track').ref.value = qs('track'); track(qs('track')); }
