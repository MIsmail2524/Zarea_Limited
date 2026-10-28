// Shared dashboard shell: sidebar sections with hash routing.
import { icon, api, toast } from './app.js';

export function shell(sections, views) {
  const side = document.getElementById('side'); const pane = document.getElementById('pane');
  side.innerHTML = sections.map(([k, label, ic]) => `<button data-k="${k}">${icon(ic, 18)} ${label}<span class="count hidden" data-c="${k}"></span></button>`).join('') +
    `<button data-logout>${icon('x', 18)} Sign out</button>`;
  const go = async (k) => {
    if (!views[k]) k = sections[0][0];
    side.querySelectorAll('[data-k]').forEach((b) => b.classList.toggle('on', b.dataset.k === k));
    history.replaceState(null, '', `#${k}`);
    pane.innerHTML = '<div class="skeleton" style="height:300px"></div>';
    try { await views[k](pane); } catch (e) { pane.innerHTML = `<div class="panel empty">${e.message}</div>`; }
  };
  side.onclick = async (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.hasAttribute('data-logout')) { await api('/api/logout', { method: 'POST' }); location.href = '/'; return; }
    go(b.dataset.k);
  };
  addEventListener('hashchange', () => go(location.hash.slice(1)));
  go(location.hash.slice(1));
  return { go, badge: (k, n) => { const el = side.querySelector(`[data-c="${k}"]`); el.textContent = n; el.classList.toggle('hidden', !n); } };
}

export async function act(fn, ok) { try { await fn(); if (ok) toast(ok); return true; } catch (e) { toast(e.message); return false; } }
export const STAGES = ['placed', 'confirmed', 'dispatched', 'delivered'];
export const timeline = (o) => {
  const done = new Set(o.events.map((e) => e.status));
  if (o.status === 'cancelled') return '<p class="small" style="color:var(--red);margin:8px 0 0">Cancelled</p>';
  return `<ol class="timeline">${STAGES.map((s) => `<li class="${done.has(s) ? 'done' : ''} ${o.status === s && s !== 'delivered' ? 'now' : ''}">${s}<br><span>${(o.events.find((e) => e.status === s)?.at || '').slice(5, 16)}</span></li>`).join('')}</ol>`;
};
export const payBadge = (s) => `<span class="badge ${{ paid: 'badge--ok', held: 'badge--info', due: 'badge--warn', pending: '', refunded: 'badge--bad' }[s] || ''}">${s}</span>`;
