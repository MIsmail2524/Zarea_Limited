import { api, esc, pkr, chg, icon, sparkline, catName, reveal } from './app.js';

document.querySelectorAll('[data-i]').forEach((el) => { el.innerHTML = icon(el.dataset.i, 24); });

// Animated supply network across Pakistan's trade cities (projected lon/lat).
const NODES = { Karachi: [67.0, 24.86], Hyderabad: [68.37, 25.4], Sukkur: [68.86, 27.71], Quetta: [66.98, 30.18], Multan: [71.52, 30.16],
  Bahawalpur: [71.68, 29.4], Faisalabad: [73.08, 31.42], Lahore: [74.36, 31.52], Sialkot: [74.53, 32.49], Gujranwala: [74.19, 32.16],
  Sargodha: [72.67, 32.08], Islamabad: [73.05, 33.68], Peshawar: [71.58, 34.01] };
const P = ([lon, lat]) => [((lon - 64.5) / (76 - 64.5)) * 440 + 30, ((35.5 - lat) / (35.5 - 23.8)) * 470 + 25];
const EDGES = [['Karachi', 'Hyderabad'], ['Hyderabad', 'Sukkur'], ['Sukkur', 'Multan'], ['Sukkur', 'Quetta'], ['Multan', 'Bahawalpur'], ['Multan', 'Faisalabad'],
  ['Faisalabad', 'Lahore'], ['Lahore', 'Gujranwala'], ['Gujranwala', 'Sialkot'], ['Lahore', 'Islamabad'], ['Sargodha', 'Islamabad'], ['Faisalabad', 'Sargodha'],
  ['Islamabad', 'Peshawar'], ['Karachi', 'Quetta'], ['Multan', 'Lahore']];
const net = document.getElementById('net');
let svg = '';
EDGES.forEach(([a, b], i) => {
  const [x1, y1] = P(NODES[a]), [x2, y2] = P(NODES[b]);
  const mx = (x1 + x2) / 2 + (y2 - y1) * 0.12, my = (y1 + y2) / 2 - (x2 - x1) * 0.12;
  const d = `M${x1},${y1} Q${mx},${my} ${x2},${y2}`;
  svg += `<path class="route" d="${d}"/><path class="flow" d="${d}" style="animation-delay:${-i * 0.37}s;animation-duration:${3 + (i % 4)}s"/>`;
});
Object.entries(NODES).forEach(([name, ll], i) => {
  const [x, y] = P(ll); const hub = ['Karachi', 'Lahore', 'Islamabad', 'Multan'].includes(name);
  svg += `${hub ? `<circle class="node-ring" cx="${x}" cy="${y}" r="6" style="animation-delay:${i * 0.3}s"/>` : ''}<circle class="node" cx="${x}" cy="${y}" r="${hub ? 5.5 : 3.5}"/>
    <text x="${x + 9}" y="${y + 4}">${name}</text>`;
});
net.innerHTML = svg;

const [meta, prices, rfqs] = await Promise.all([api('/api/meta'), api('/api/prices'), api('/api/rfqs/open')]);

document.getElementById('hero-city').insertAdjacentHTML('beforeend', meta.cities.map((c) => `<option>${esc(c)}</option>`).join(''));
document.getElementById('cats').innerHTML = meta.categories.map((c) => `
  <a class="cat-card" href="/marketplace?category=${c.slug}" data-reveal><div class="ico">${icon(c.slug, 24)}</div><b>${esc(c.name)}</b><span>${c.count} products · ${esc(c.unit)}</span></a>`).join('');

const lucky = prices.find((p) => p.slug === 'lucky-cement-opc');
if (lucky) { document.getElementById('fc-price').textContent = `${pkr(lucky.price)} / bag`; document.getElementById('fc-chg').innerHTML = `7 days ${chg(lucky.d7)}`; }

const movers = [...prices].sort((a, b) => Math.abs(b.d7) - Math.abs(a.d7)).slice(0, 8);
document.getElementById('movers').innerHTML = movers.map((p) => `<tr>
  <td><a href="/product?slug=${encodeURIComponent(p.slug)}"><b>${esc(p.name)}</b></a><div class="small muted">${catName(p.category)} · per ${esc(p.unit)}</div></td>
  <td>${esc(p.city)}</td><td class="r num"><b>${pkr(p.price)}</b></td><td class="r">${chg(p.d1)}</td><td class="r">${chg(p.d7)}</td><td class="r">${chg(p.d30)}</td><td>${sparkline(p.spark)}</td></tr>`).join('');

document.getElementById('open-rfqs').innerHTML = rfqs.length ? rfqs.slice(0, 6).map((r) => `
  <div class="card" data-reveal><div class="row between"><span class="badge badge--orange">${esc(catName(r.category))}</span><span class="small muted">${r.bids} bid${r.bids === 1 ? '' : 's'}</span></div>
  <h3 style="margin-top:12px">${esc(r.title)}</h3><p>${r.qty.toLocaleString()} ${esc(r.unit)} · ${esc(r.city)}${r.needed_by ? ` · by ${esc(r.needed_by)}` : ''}</p></div>`).join('')
  : '<div class="card"><p>No open RFQs right now.</p></div>';
reveal();
