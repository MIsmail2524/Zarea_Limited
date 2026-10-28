// End-to-end + security tests. Run: npm test
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { request } from 'node:http';

const PORT = 3190 + Math.floor(Math.random() * 300);
const dir = mkdtempSync(join(tmpdir(), 'zarea-test-'));
let srv;

function http(method, path, { body, headers = {}, raw } = {}) {
  return new Promise((resolve, reject) => {
    const data = raw ?? (body ? JSON.stringify(body) : null);
    const req = request({ host: '127.0.0.1', port: PORT, method, path, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers } }, (res) => {
      let b = ''; res.on('data', (c) => (b += c)); res.on('end', () => {
        let json; try { json = JSON.parse(b); } catch { /* not json */ }
        resolve({ status: res.statusCode, headers: res.headers, body: b, json });
      });
    });
    req.on('error', reject); if (data) req.write(data); req.end();
  });
}
async function login(email, password = 'demo1234') {
  const r = await http('POST', '/api/login', { body: { email, password } });
  assert.equal(r.status, 200, r.body);
  return r.headers['set-cookie'][0].split(';')[0];
}

before(async () => {
  srv = spawn(process.execPath, ['server.js'], { env: { ...process.env, PORT, DB_PATH: join(dir, 't.db') }, stdio: 'pipe' });
  await new Promise((res) => srv.stdout.on('data', (d) => String(d).includes('running') && res()));
});
after(() => { srv.kill(); rmSync(dir, { recursive: true, force: true }); });

// ---------- functional ----------
test('catalogue, prices and freight', async () => {
  const meta = await http('GET', '/api/meta');
  assert.equal(meta.json.categories.length, 13);
  const prices = await http('GET', '/api/prices');
  assert.ok(prices.json.length > 30);
  assert.ok(prices.json.every((p) => Array.isArray(p.spark)));
  const f = await http('GET', '/api/freight?from=Karachi&to=Lahore&kg=20000');
  assert.ok(f.json.km > 1000 && f.json.best.cost > 0);
});

test('AI understands Roman Urdu and BOQ', async () => {
  const a = await http('POST', '/api/ai', { body: { message: 'sarya ka rate' } });
  assert.match(JSON.stringify(a.json), /Steel/);
  const b = await http('POST', '/api/ai', { body: { message: 'material for 1500 sqft' } });
  assert.match(b.json.text, /1,500 sq ft/);
});

test('buyer checkout splits by supplier and respects MOQ and credit', async () => {
  const c = await login('buyer@demo.test');
  const bad = await http('POST', '/api/orders', { headers: { cookie: c }, body: { items: [{ product_id: 1, qty: 5 }], payment_method: 'escrow', delivery_city: 'Lahore' } });
  assert.equal(bad.status, 422); // below MOQ 100
  const ok = await http('POST', '/api/orders', { headers: { cookie: c }, body: { items: [{ product_id: 1, qty: 100 }, { product_id: 15, qty: 250 }], payment_method: 'credit', delivery_city: 'Lahore', address: 'Site' } });
  assert.equal(ok.status, 200, ok.body);
  assert.equal(ok.json.refs.length, 2);
  const huge = await http('POST', '/api/orders', { headers: { cookie: c }, body: { items: [{ product_id: 23, qty: 500 }], payment_method: 'credit', delivery_city: 'Lahore' } });
  assert.equal(huge.status, 422); // exceeds credit
});

test('RFQ → bid → award → supplier fulfils → buyer reviews', async () => {
  const b = await login('buyer@demo.test');
  const r = await http('POST', '/api/rfqs', { headers: { cookie: b }, body: { category: 'coal', title: 'Duki coal for kiln', qty: 50, unit: 'Ton', city: 'Lahore' } });
  assert.equal(r.status, 200);
  const s = await login('seaport@demo.test');
  const inbox = await http('GET', '/api/supplier/rfqs', { headers: { cookie: s } });
  const rfq = inbox.json.find((x) => x.ref === r.json.ref);
  assert.equal((await http('POST', `/api/supplier/rfqs/${rfq.id}/bid`, { headers: { cookie: s }, body: { unit_price: 47000, lead_days: 4 } })).status, 200);
  const mine = await http('GET', '/api/rfqs/mine', { headers: { cookie: b } });
  const bid = mine.json.find((x) => x.ref === r.json.ref).bids[0];
  const award = await http('POST', `/api/bids/${bid.id}/accept`, { headers: { cookie: b }, body: { payment_method: 'escrow' } });
  assert.equal(award.status, 200);
  const orders = await http('GET', '/api/orders/mine', { headers: { cookie: s } });
  const o = orders.json.find((x) => x.ref === award.json.ref);
  assert.equal((await http('POST', `/api/supplier/orders/${o.id}/advance`, { headers: { cookie: s }, body: {} })).json.status, 'confirmed');
  assert.equal((await http('POST', `/api/supplier/orders/${o.id}/advance`, { headers: { cookie: s }, body: {} })).status, 422); // vehicle required
  assert.equal((await http('POST', `/api/supplier/orders/${o.id}/advance`, { headers: { cookie: s }, body: { vehicle: 'LES-1 · Mazda' } })).json.status, 'dispatched');
  assert.equal((await http('POST', `/api/supplier/orders/${o.id}/advance`, { headers: { cookie: s }, body: {} })).json.status, 'delivered');
  const after = (await http('GET', '/api/orders/mine', { headers: { cookie: b } })).json.find((x) => x.id === o.id);
  assert.equal(after.payment_status, 'paid'); // escrow released
  assert.equal((await http('POST', `/api/orders/${o.id}/review`, { headers: { cookie: b }, body: { rating: 5 } })).status, 200);
});

test('supplier price change records history and fires alerts', async () => {
  const b = await login('buyer@demo.test');
  await http('POST', '/api/alerts', { headers: { cookie: b }, body: { product_id: 10, direction: 'below', target: 1600 } });
  const s = await login('seaport@demo.test');
  assert.equal((await http('PATCH', '/api/supplier/products/10', { headers: { cookie: s }, body: { price: 1590 } })).status, 200);
  const alerts = await http('GET', '/api/alerts', { headers: { cookie: b } });
  assert.ok(alerts.json.some((a) => a.product_id === 10 && a.triggered_at));
});

// ---------- security ----------
test('malformed URL and cookie do not crash the server', async () => {
  assert.equal((await http('GET', '/%E0%A4%A')).status, 400);
  assert.equal((await http('GET', '/api/me', { headers: { cookie: 'zsid=%E0%A4%A' } })).status, 200);
  assert.equal((await http('GET', '/')).status, 200);
});

test('path traversal is blocked', async () => {
  for (const p of ['/..%2fserver.js', '/%2e%2e/db.js', '/..%5cserver.js', '/x%00.html']) {
    const r = await http('GET', p);
    assert.ok([400, 403, 404].includes(r.status), `${p} → ${r.status}`);
    assert.doesNotMatch(r.body, /createServer|DatabaseSync/);
  }
});

test('CSRF: non-JSON and cross-origin writes are rejected', async () => {
  assert.equal((await http('POST', '/api/leads', { raw: '{"name":"x","email":"a@b.co"}', headers: { 'Content-Type': 'text/plain' } })).status, 415);
  assert.equal((await http('POST', '/api/leads', { body: { name: 'x', email: 'a@b.co' }, headers: { Origin: 'https://evil.example' } })).status, 403);
});

test('security headers present', async () => {
  const r = await http('GET', '/');
  assert.match(r.headers['content-security-policy'], /frame-ancestors 'none'/);
  assert.equal(r.headers['x-frame-options'], 'DENY');
  assert.equal(r.headers['x-content-type-options'], 'nosniff');
});

test('role and ownership checks (IDOR)', async () => {
  const s = await login('punjab@demo.test');
  assert.equal((await http('GET', '/api/admin/overview', { headers: { cookie: s } })).status, 403);
  // supplier cannot edit another supplier's product (product 10 belongs to seaport)
  assert.equal((await http('PATCH', '/api/supplier/products/10', { headers: { cookie: s }, body: { price: 1 } })).status, 404);
  // supplier cannot advance another supplier's order
  const b = await login('newbuyer@demo.test');
  assert.equal((await http('POST', '/api/orders/1/review', { headers: { cookie: b }, body: { rating: 1 } })).status, 404);
  assert.equal((await http('POST', '/api/orders/1/cancel', { headers: { cookie: b }, body: {} })).status, 404);
  // unverified buyer cannot use credit
  const r = await http('POST', '/api/orders', { headers: { cookie: b }, body: { items: [{ product_id: 1, qty: 100 }], payment_method: 'credit', delivery_city: 'Lahore' } });
  assert.equal(r.status, 403);
});

test('public tracking leaks no private data', async () => {
  const r = await http('GET', '/api/track/ZR-DEMO01');
  assert.equal(r.status, 200);
  assert.doesNotMatch(r.body, /total|vehicle|phone|buyer|supplier|address/i);
});

test('register enforces password policy and no duplicate emails', async () => {
  const base = { name: 'T', company: 'T Co', role: 'buyer', city: 'Lahore' };
  assert.equal((await http('POST', '/api/register', { body: { ...base, email: 'weak@x.test', password: 'short' } })).status, 422);
  assert.equal((await http('POST', '/api/register', { body: { ...base, email: 'buyer@demo.test', password: 'Longenough123' } })).status, 409);
  assert.equal((await http('POST', '/api/register', { body: { ...base, role: 'admin', email: 'evil@x.test', password: 'Longenough123' } })).status, 422);
});

test('login: no user enumeration, lockout after 5 failures', async () => {
  const a = await http('POST', '/api/login', { body: { email: 'nobody@x.test', password: 'x' } });
  const b = await http('POST', '/api/login', { body: { email: 'indus@demo.test', password: 'x' } });
  assert.equal(a.json.error, b.json.error);
  for (let i = 0; i < 4; i++) await http('POST', '/api/login', { body: { email: 'indus@demo.test', password: 'x' } });
  const locked = await http('POST', '/api/login', { body: { email: 'indus@demo.test', password: 'demo1234' } });
  assert.equal(locked.status, 429);
});

test('stored XSS payloads are returned as data, not rendered server-side', async () => {
  const r = await http('POST', '/api/leads', { body: { name: '<img src=x onerror=alert(1)>', email: 'x@y.co', message: '<script>alert(1)</script>' } });
  assert.equal(r.status, 200);
  assert.equal(r.headers['content-type'], 'application/json; charset=utf-8');
});

test('oversized body rejected', async () => {
  const r = await http('POST', '/api/leads', { raw: JSON.stringify({ name: 'x'.repeat(70000), email: 'a@b.co' }), headers: { 'Content-Type': 'application/json' } });
  assert.equal(r.status, 413);
});

test('CSV export neutralises formula injection', async () => {
  await http('POST', '/api/leads', { body: { name: '=HYPERLINK("http://evil")', email: 'f@x.co' } });
  const a = await login('admin@demo.test', 'admin123');
  const csv = await http('GET', '/api/admin/export/leads.csv', { headers: { cookie: a } });
  assert.match(csv.body, /"'=HYPERLINK/);
});
