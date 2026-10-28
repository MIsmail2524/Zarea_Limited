import { api, esc, icon, bindForm } from './app.js';

document.querySelectorAll('[data-i]').forEach((el) => { el.innerHTML = icon(el.dataset.i, 24); });
const meta = await api('/api/meta');
document.getElementById('c').innerHTML = meta.cities.map((c) => `<option>${esc(c)}</option>`).join('');
document.getElementById('m').innerHTML = meta.categories.map((c) => `<option value="${c.slug}">${esc(c.name)}</option>`).join('');
bindForm(document.getElementById('sup'), '/api/supplier-applications', (_, f) => { f.reset(); return 'Application received — our onboarding team will call you within one business day.'; });
