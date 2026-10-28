import { api, esc, productCard, productCache, reveal, qs, catName } from './app.js';

const state = { category: qs('category') || '', brand: qs('brand') || '', city: qs('city') || '', q: qs('q') || '', verified: qs('verified') === '1', sort: qs('sort') || '' };
const meta = await api('/api/meta');
const $ = (id) => document.getElementById(id);

$('f-city').insertAdjacentHTML('beforeend', meta.cities.map((c) => `<option>${esc(c)}</option>`).join(''));
$('f-cat').innerHTML = `<label class="check"><input type="radio" name="cat" value=""> All categories</label>` +
  meta.categories.map((c) => `<label class="check"><input type="radio" name="cat" value="${c.slug}"> ${esc(c.name)} <span class="n">${c.count}</span></label>`).join('');

function sync() {
  $('f-q').value = state.q; $('f-city').value = state.city; $('f-verified').checked = state.verified; $('sort').value = state.sort;
  document.querySelectorAll('input[name=cat]').forEach((r) => { r.checked = r.value === state.category; });
  const cat = meta.categories.find((c) => c.slug === state.category);
  $('mk-title').textContent = cat ? cat.name : state.q ? `Results for “${state.q}”` : 'Marketplace';
  document.title = `${cat ? `Buy ${cat.name} Online` : 'Marketplace'} — Zarea`;
}

let timer;
async function load() {
  sync();
  const params = new URLSearchParams(Object.entries({ ...state, verified: state.verified ? '1' : '' }).filter(([, v]) => v));
  history.replaceState(null, '', `/marketplace${params.size ? `?${params}` : ''}`);
  $('grid').innerHTML = Array.from({ length: 6 }, () => '<div class="skeleton" style="height:320px"></div>').join('');
  const { items, brands } = await api(`/api/products?${params}`);
  items.forEach((p) => productCache.set(p.id, p));
  $('f-brand').innerHTML = brands.length ? [`<label class="check"><input type="radio" name="brand" value="" ${!state.brand ? 'checked' : ''}> Any brand</label>`,
    ...brands.map((b) => `<label class="check"><input type="radio" name="brand" value="${esc(b)}" ${state.brand === b ? 'checked' : ''}> ${esc(b)}</label>`)].join('') : '<span class="small muted">No brands</span>';
  $('count').textContent = `${items.length} product${items.length === 1 ? '' : 's'}${state.category ? ` in ${catName(state.category)}` : ''}`;
  $('grid').innerHTML = items.length ? items.map(productCard).join('') : '<div class="panel empty" style="grid-column:1/-1">No products match these filters.</div>';
  reveal($('grid'));
}

document.querySelector('.filters').addEventListener('change', (e) => {
  if (e.target.name === 'cat') { state.category = e.target.value; state.brand = ''; }
  if (e.target.name === 'brand') state.brand = e.target.value;
  if (e.target.id === 'f-city') state.city = e.target.value;
  if (e.target.id === 'f-verified') state.verified = e.target.checked;
  load();
});
$('f-q').addEventListener('input', (e) => { clearTimeout(timer); timer = setTimeout(() => { state.q = e.target.value.trim(); load(); }, 300); });
$('sort').addEventListener('change', (e) => { state.sort = e.target.value; load(); });
$('f-reset').onclick = () => { Object.assign(state, { category: '', brand: '', city: '', q: '', verified: false, sort: '' }); load(); };
load();
