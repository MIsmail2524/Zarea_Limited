import { api, esc, pkr, cart, productCache, qs, toast } from './app.js';

const $ = (id) => document.getElementById(id);
if (qs('sqft')) $('sqft').value = qs('sqft');
const [cement, steel, build] = await Promise.all(['cement', 'steel', 'building-and-finishing'].map((c) => api(`/api/products?category=${c}&sort=price_asc`).then((r) => r.items.filter((p) => p.price != null))));
[...cement, ...steel, ...build].forEach((p) => productCache.set(p.id, p));
const opt = (list) => list.map((p) => `<option value="${p.id}">${esc(p.name)} — ${pkr(p.price)} / ${esc(p.unit)}</option>`).join('');
$('cem').innerHTML = opt(cement.filter((p) => /OPC/.test(p.name)));
$('stl').innerHTML = opt(steel.filter((p) => /Grade 60/.test(p.name)));
$('snd').innerHTML = opt(build.filter((p) => /Sand/.test(p.name)));
$('crs').innerHTML = opt(build.filter((p) => /Crush/.test(p.name)));
const bricks = build.find((p) => /Bricks/.test(p.name));

let lines = [];
function calc() {
  const a = Math.max(0, Number($('sqft').value) || 0) * Number($('type').value);
  const P = (id) => productCache.get(Number($(id).value));
  lines = [
    [P('cem'), Math.ceil(a * 0.4), (q) => `${q.toLocaleString()} bags`],
    [P('stl'), Math.ceil(a * 0.0035 * 10) / 10, (q) => `${q} t`],
    [bricks, Math.ceil((a * 22) / 1000), (q) => `${(q * 1000).toLocaleString()} bricks`],
    [P('snd'), Math.ceil(a * 1.8), (q) => `${q.toLocaleString()} cft`],
    [P('crs'), Math.ceil(a * 1.35), (q) => `${q.toLocaleString()} cft`],
  ].filter(([p]) => p);
  let total = 0;
  $('out').innerHTML = lines.map(([p, q, f]) => { const c = p.price * q; total += c; return `<tr><td><b>${esc(p.name)}</b></td><td class="r">${f(q)}</td><td class="r num">${pkr(p.price)}</td><td class="r num">${pkr(c)}</td></tr>`; }).join('');
  $('tot').textContent = pkr(total);
  $('rfq').href = `/rfq?category=cement&title=${encodeURIComponent(`Grey structure materials for ${Math.round(a)} sq ft`)}`;
}
$('in').addEventListener('input', calc); calc();
$('add').onclick = () => {
  const ok = lines.filter(([p, q]) => q >= 1);
  ok.forEach(([p, q]) => { const l = cart.read(); const ex = l.find((x) => x.id === p.id); if (ex) ex.qty = Math.max(p.moq, Math.ceil(q)); else l.push({ id: p.id, slug: p.slug, name: p.name, unit: p.unit, price: p.price, moq: p.moq, city: p.city, category: p.category, qty: Math.max(p.moq, Math.ceil(q)) }); cart.write(l); });
  toast(`${ok.length} materials added (quantities rounded up to MOQ)`); document.body.classList.add('cart-open');
};
$('print').onclick = () => window.print();
