import { icon, bindForm } from './app.js';
document.querySelectorAll('[data-i]').forEach((el) => { el.innerHTML = icon(el.dataset.i, 24); });
if (location.hash === '#import-export') document.getElementById('k').value = 'import-export';
bindForm(document.getElementById('contact-form'), '/api/leads', (_, f) => { f.reset(); return 'Thanks — our team will reply within one business day.'; });
