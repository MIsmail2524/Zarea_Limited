// Zarea marketplace platform — zero-dependency Node server: static site + JSON API + SQLite.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, normalize, sep } from 'node:path';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { openDb, verifyPassword, hashPassword, CATEGORIES, CITIES } from './db.js';
import { answer } from './ai.js';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const PUBLIC = join(ROOT, 'public');
const PORT = Number(process.env.PORT) || 3100;
const PROD = process.env.NODE_ENV === 'production';
const db = openDb(process.env.DB_PATH || join(ROOT, 'data', 'zarea.db'), { reset: process.argv.includes('--reset-db') });
const COOKIE = PROD ? '__Host-zsid' : 'zsid';

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml; charset=utf-8',
};

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Content-Security-Policy': [
    "default-src 'self'", "script-src 'self'", "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com", "img-src 'self' data:", "connect-src 'self'",
    "frame-ancestors 'none'", "base-uri 'self'", "form-action 'self'", "object-src 'none'",
  ].join('; '),
  ...(PROD ? { 'Strict-Transport-Security': 'max-age=31536000; includeSubDomains' } : {}),
};

// ---------------- core helpers ----------------
const err = (status, message) => Object.assign(new Error(message), { status });
const SENT = Symbol('sent');

function send(res, status, body, headers = {}) {
  const isObj = typeof body === 'object' && !Buffer.isBuffer(body);
  res.writeHead(status, {
    'Content-Type': isObj ? 'application/json; charset=utf-8' : 'text/plain; charset=utf-8',
    ...SECURITY_HEADERS, ...(isObj ? { 'Cache-Control': 'no-store' } : {}), ...headers,
  });
  res.end(isObj ? JSON.stringify(body) : body);
}

async function readJson(req, limit = 64 * 1024) {
  if (!/^application\/json\b/i.test(req.headers['content-type'] || '')) throw err(415, 'Content-Type must be application/json');
  let size = 0; const chunks = [];
  for await (const c of req) { size += c.length; if (size > limit) throw err(413, 'Payload too large'); chunks.push(c); }
  if (!chunks.length) return {};
  try { const v = JSON.parse(Buffer.concat(chunks).toString('utf8')); return v && typeof v === 'object' ? v : {}; }
  catch { throw err(400, 'Invalid JSON'); }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const str = (v, max = 500) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const int = (v, min = 0, max = 1e12) => { const n = Math.floor(Number(v)); return Number.isFinite(n) && n >= min && n <= max ? n : null; };
function required(obj, fields) {
  const missing = fields.filter((f) => !str(String(obj[f] ?? '')));
  if (missing.length) throw err(422, `Missing: ${missing.join(', ')}`);
}
const makeRef = (p) => `${p}-${Date.now().toString(36).slice(-5).toUpperCase()}${randomBytes(2).toString('hex').toUpperCase()}`;
const today = () => new Date().toISOString().slice(0, 10);
const addDays = (d) => new Date(Date.now() + d * 864e5).toISOString().slice(0, 10);

// sessions, rate limits, lockouts
const sessions = new Map();
const SESSION_MS = 8 * 60 * 60 * 1000;
const hits = new Map();
const failures = new Map();
const DUMMY_HASH = hashPassword(randomBytes(12).toString('hex'));
setInterval(() => {
  const now = Date.now();
  for (const [k, s] of sessions) if (s.expires < now) sessions.delete(k);
  for (const [k, l] of hits) if (!l.length || now - l[l.length - 1] > 3.6e6) hits.delete(k);
  for (const [k, f] of failures) if (f.until && f.until < now) failures.delete(k);
}, 6e5).unref();

function limit(req, bucket, max, windowMs = 6e5) {
  const key = `${bucket}:${req.socket.remoteAddress || 'x'}`; const now = Date.now();
  const l = (hits.get(key) || []).filter((t) => now - t < windowMs); l.push(now); hits.set(key, l);
  if (l.length > max) throw err(429, 'Too many requests — please slow down');
}

function getSid(req) {
  for (const part of (req.headers.cookie || '').split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === COOKIE) { const val = v.join('='); return /^[a-f0-9]{48}$/.test(val) ? val : null; }
  }
  return null;
}
function currentUser(req) {
  const sid = getSid(req); const s = sid && sessions.get(sid);
  if (!s || s.expires < Date.now()) { if (sid) sessions.delete(sid); return null; }
  return db.prepare('SELECT id, email, name, company, phone, city, role, kyc_status, credit_limit, rating FROM users WHERE id = ?').get(s.userId) || null;
}
function auth(req, ...roles) {
  const u = currentUser(req);
  if (!u) throw err(401, 'Please sign in');
  if (roles.length && !roles.includes(u.role)) throw err(403, 'Forbidden');
  return u;
}
function sameOrigin(req) {
  const o = req.headers.origin; if (!o) return true;
  try { return new URL(o).host === req.headers.host; } catch { return false; }
}
function startSession(req, res, userId) {
  const old = getSid(req); if (old) sessions.delete(old);
  const sid = randomBytes(24).toString('hex');
  sessions.set(sid, { userId, expires: Date.now() + SESSION_MS });
  res.setHeader('Set-Cookie', `${COOKIE}=${sid}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_MS / 1000}${PROD ? '; Secure' : ''}`);
}

// ---------------- domain helpers ----------------
const UNIT_KG = [
  [/bag \(50/i, 50], [/bag \(45/i, 45.36], [/bag \(10/i, 10], [/^ton/i, 1000], [/maund/i, 40], [/^kg/i, 1],
  [/cubic foot/i, 45], [/cubic metre/i, 2400], [/1,000 bricks/i, 3000], [/litre/i, 0.85], [/panel/i, 28], [/unit/i, 40],
];
export const unitKg = (unit) => (UNIT_KG.find(([re]) => re.test(unit)) || [null, 50])[1];

export const TRUCKS = [
  { id: 'shehzore', name: 'Shehzore pickup', capacityKg: 2000, perKm: 70, min: 3500 },
  { id: 'mazda', name: 'Mazda 6-ton', capacityKg: 6000, perKm: 110, min: 6000 },
  { id: 'ten', name: '10-wheeler (16 t)', capacityKg: 16000, perKm: 165, min: 12000 },
  { id: 'twentytwo', name: '22-wheeler (30 t)', capacityKg: 30000, perKm: 230, min: 18000 },
];
export function distanceKm(a, b) {
  const A = CITIES[a], B = CITIES[b]; if (!A || !B) return null;
  if (a === b) return 25;
  const R = 6371, r = Math.PI / 180;
  const h = Math.sin(((B[0] - A[0]) * r) / 2) ** 2 + Math.cos(A[0] * r) * Math.cos(B[0] * r) * Math.sin(((B[1] - A[1]) * r) / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)) * 1.3); // road factor
}
export function freightQuote(from, to, kg) {
  const km = distanceKm(from, to); if (km == null) return null;
  const options = TRUCKS.map((t) => {
    const trucks = Math.max(1, Math.ceil(kg / t.capacityKg));
    return { ...t, trucks, cost: trucks * Math.max(t.min, Math.round(t.perKm * km)) };
  });
  const best = options.reduce((a, b) => (b.cost < a.cost ? b : a));
  return { from, to, km, kg: Math.round(kg), hours: Math.round(km / 45 + 2), best, options };
}

function creditScore({ company_type, monthly_turnover, amount, years_in_business }, kycVerified) {
  let s = 35;
  s += Math.min(20, years_in_business * 3);
  s += Math.min(25, Math.round((monthly_turnover / Math.max(amount, 1)) * 6));
  s += { 'Public Limited Company': 12, 'Private Limited Company': 10, 'SMC-Private': 6, 'Sole Proprietorship': 3 }[company_type] || 0;
  if (kycVerified) s += 5;
  s = Math.max(0, Math.min(95, s));
  const suggested = Math.round((Math.min(amount, monthly_turnover * 0.5) * s) / 100 / 10000) * 10000;
  return { score: s, band: s >= 75 ? 'Strong' : s >= 55 ? 'Good' : s >= 40 ? 'Fair' : 'Weak', suggested };
}

function creditUsed(userId) {
  return db.prepare("SELECT COALESCE(SUM(total),0) s FROM orders WHERE buyer_id = ? AND payment_method = 'credit' AND payment_status = 'due' AND status != 'cancelled'").get(userId).s;
}

function priceStats(productId) {
  const rows = db.prepare('SELECT day, price FROM price_history WHERE product_id = ? ORDER BY day DESC LIMIT 91').all(productId);
  if (!rows.length) return null;
  const at = (n) => rows[Math.min(n, rows.length - 1)].price;
  const pct = (a, b) => (b ? Math.round(((a - b) / b) * 1000) / 10 : 0);
  const p = rows[0].price;
  return { d1: pct(p, at(1)), d7: pct(p, at(7)), d30: pct(p, at(30)), spark: rows.slice(0, 30).reverse().map((r) => r.price) };
}

function recordPrice(productId, price) {
  db.prepare('INSERT INTO price_history (product_id, day, price) VALUES (?, ?, ?) ON CONFLICT(product_id, day) DO UPDATE SET price = excluded.price')
    .run(productId, today(), price);
  db.prepare(`UPDATE alerts SET triggered_at = datetime('now') WHERE product_id = ? AND triggered_at IS NULL
              AND ((direction = 'below' AND ? <= target) OR (direction = 'above' AND ? >= target))`).run(productId, price, price);
}

function refreshSupplierRating(supplierId) {
  const r = db.prepare('SELECT AVG(rating) a FROM reviews WHERE supplier_id = ?').get(supplierId).a;
  if (r != null) db.prepare('UPDATE users SET rating = ? WHERE id = ?').run(Math.round(r * 10) / 10, supplierId);
}

const PRODUCT_COLS = `p.id, p.slug, p.name, p.category, p.brand, p.unit, p.price, p.moq, p.lead_days, p.city, p.description,
  p.price_source, p.status, p.updated_at, u.company AS supplier, u.rating AS supplier_rating, u.kyc_status = 'verified' AS verified`;

// ---------------- routes ----------------
const routes = [];
const route = (method, pattern, handler) => routes.push({ method, re: new RegExp(`^${pattern}$`), handler });

route('GET', '/api/meta', () => ({
  categories: CATEGORIES.map(([slug, name, unit]) => ({
    slug, name, unit, count: db.prepare("SELECT COUNT(*) n FROM products WHERE category = ? AND status = 'active'").get(slug).n,
  })),
  cities: Object.keys(CITIES), trucks: TRUCKS.map(({ id, name, capacityKg }) => ({ id, name, capacityKg })),
}));

route('GET', '/api/stats', () => {
  const one = (sql) => db.prepare(sql).get().n;
  return {
    products: one("SELECT COUNT(*) n FROM products WHERE status='active'"),
    suppliers: one("SELECT COUNT(*) n FROM users WHERE role='supplier' AND kyc_status='verified'"),
    cities: Object.keys(CITIES).length,
    categories: CATEGORIES.length,
    // Company figures — FY26 audited results (year ended 30 June 2026)
    fy26: { revenue_m: 2774.78, gross_profit_m: 887.23, net_profit_m: 1394.43, eps: 5.31, total_assets_m: 4792 },
  };
});

route('GET', '/api/products', (req, _m, _r, url) => {
  const q = url.searchParams; const where = ["p.status = 'active'"]; const args = [];
  const cat = str(q.get('category'), 40); if (cat) { where.push('p.category = ?'); args.push(cat); }
  const brand = str(q.get('brand'), 60); if (brand) { where.push('p.brand = ?'); args.push(brand); }
  const city = str(q.get('city'), 40); if (city) { where.push('p.city = ?'); args.push(city); }
  const s = str(q.get('q'), 60); if (s) { where.push('(p.name LIKE ? OR p.brand LIKE ? OR p.category LIKE ?)'); args.push(`%${s}%`, `%${s}%`, `%${s}%`); }
  if (q.get('verified') === '1') where.push("u.kyc_status = 'verified'");
  const sort = { price_asc: 'p.price IS NULL, p.price ASC', price_desc: 'p.price DESC', name: 'p.name', rating: 'u.rating DESC' }[q.get('sort')] || 'p.category, p.price IS NULL, p.price';
  const rows = db.prepare(`SELECT ${PRODUCT_COLS} FROM products p JOIN users u ON u.id = p.supplier_id WHERE ${where.join(' AND ')} ORDER BY ${sort} LIMIT 200`).all(...args);
  const brands = db.prepare(`SELECT DISTINCT brand FROM products WHERE brand IS NOT NULL ${cat ? 'AND category = ?' : ''} ORDER BY brand`).all(...(cat ? [cat] : [])).map((r) => r.brand);
  return { items: rows.map((r) => ({ ...r, verified: !!r.verified, stats: r.price != null ? priceStats(r.id) : null })), brands };
});

route('GET', '/api/products/([a-z0-9-]{1,80})', (req, [slug]) => {
  const p = db.prepare(`SELECT ${PRODUCT_COLS}, p.supplier_id FROM products p JOIN users u ON u.id = p.supplier_id WHERE p.slug = ?`).get(slug);
  if (!p) throw err(404, 'Product not found');
  const history = db.prepare('SELECT day, price FROM price_history WHERE product_id = ? ORDER BY day DESC LIMIT 91').all(p.id).reverse();
  const reviews = db.prepare(`SELECT r.rating, r.comment, r.created_at, b.company FROM reviews r JOIN orders o ON o.id = r.order_id
                              JOIN users b ON b.id = o.buyer_id WHERE r.supplier_id = ? ORDER BY r.created_at DESC LIMIT 5`).all(p.supplier_id);
  const similar = db.prepare(`SELECT slug, name, price, unit, city FROM products WHERE category = ? AND id != ? AND status='active' ORDER BY price IS NULL, price LIMIT 4`).all(p.category, p.id);
  const { supplier_id, ...pub } = p;
  return { ...pub, verified: !!p.verified, stats: p.price != null ? priceStats(p.id) : null, history, reviews: reviews.map((r) => ({ ...r, company: r.company.replace(/ \(demo\)$/, '').replace(/^(.{3}).*$/, '$1***') })), similar };
});

route('GET', '/api/prices', () => {
  const rows = db.prepare(`SELECT id, slug, name, category, brand, unit, price, city, price_source, updated_at FROM products
                           WHERE price IS NOT NULL AND status='active' ORDER BY category, name`).all();
  return rows.map((r) => ({ ...r, ...priceStats(r.id) }));
});

route('GET', '/api/freight', (req, _m, _r, url) => {
  const from = str(url.searchParams.get('from'), 30), to = str(url.searchParams.get('to'), 30);
  const kg = int(url.searchParams.get('kg'), 1, 5_000_000);
  if (!kg) throw err(422, 'Weight required');
  const q = freightQuote(from, to, kg); if (!q) throw err(422, 'Unknown city');
  return q;
});

route('GET', '/api/track/(ZR-[A-Z0-9]{4,16})', (req, [ref]) => {
  limit(req, 'track', 60);
  const o = db.prepare('SELECT id, ref, status, delivery_city, delivery_date, created_at FROM orders WHERE ref = ?').get(ref);
  if (!o) throw err(404, 'Order not found');
  const events = db.prepare('SELECT status, at FROM order_events WHERE order_id = ? ORDER BY at').all(o.id);
  const { id, ...pub } = o;
  return { ...pub, events }; // deliberately no prices, names, phone numbers or vehicle details
});

route('GET', '/api/rfqs/open', () => db.prepare(`SELECT r.ref, r.category, r.title, r.qty, r.unit, r.city, r.needed_by, r.created_at,
  (SELECT COUNT(*) FROM bids b WHERE b.rfq_id = r.id) AS bids FROM rfqs r WHERE r.status = 'open' ORDER BY r.id DESC LIMIT 50`).all());

route('POST', '/api/leads', async (req) => {
  limit(req, 'public', 20);
  const b = await readJson(req);
  if (str(b.website)) return { ok: true };
  required(b, ['name', 'email']);
  if (!EMAIL_RE.test(str(b.email))) throw err(422, 'Invalid email');
  const kind = ['quote', 'contact', 'logistics', 'import-export'].includes(b.kind) ? b.kind : 'contact';
  db.prepare('INSERT INTO leads (kind, name, phone, email, product, qty, city, message) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(kind, str(b.name, 100), str(b.phone, 30) || null, str(b.email, 160), str(b.product, 120) || null, str(b.qty, 60) || null, str(b.city, 40) || null, str(b.message, 2000) || null);
  return { ok: true };
});

route('POST', '/api/supplier-applications', async (req) => {
  limit(req, 'public', 20);
  const b = await readJson(req);
  if (str(b.website)) return { ok: true };
  required(b, ['name', 'supplier_type', 'phone', 'email', 'city', 'commodity']);
  if (!EMAIL_RE.test(str(b.email))) throw err(422, 'Invalid email');
  if (!CATEGORIES.some(([s]) => s === b.commodity)) throw err(422, 'Unknown commodity');
  db.prepare('INSERT INTO supplier_applications (name, supplier_type, phone, email, city, commodity, brand, ntn) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(str(b.name, 120), str(b.supplier_type, 40), str(b.phone, 30), str(b.email, 160), str(b.city, 40), b.commodity, str(b.brand, 60) || null, str(b.ntn, 30) || null);
  return { ok: true };
});

route('POST', '/api/credit/eligibility', async (req) => {
  limit(req, 'public', 60);
  const b = await readJson(req);
  const input = {
    company_type: str(b.company_type, 40), monthly_turnover: int(b.monthly_turnover, 0, 1e11) || 0,
    amount: int(b.amount, 1, 1e10) || 1, years_in_business: int(b.years_in_business, 0, 100) || 0,
  };
  return creditScore(input, false);
});

route('POST', '/api/ai', async (req) => {
  limit(req, 'ai', 40);
  const b = await readJson(req);
  const msg = str(b.message, 400);
  if (!msg) throw err(422, 'Ask a question');
  return answer(msg, { db, priceStats, freightQuote, unitKg, CITIES, CATEGORIES, user: currentUser(req) });
});

// ---- auth ----
route('POST', '/api/register', async (req, _m, res) => {
  limit(req, 'register', 10);
  const b = await readJson(req);
  required(b, ['email', 'password', 'name', 'company', 'role', 'city']);
  const email = str(b.email, 160).toLowerCase();
  if (!EMAIL_RE.test(email)) throw err(422, 'Invalid email');
  const pw = typeof b.password === 'string' ? b.password : '';
  if (pw.length < 10 || !/[A-Za-z]/.test(pw) || !/\d/.test(pw)) throw err(422, 'Password needs 10+ characters with letters and numbers');
  if (!['buyer', 'supplier'].includes(b.role)) throw err(422, 'Invalid role');
  if (!CITIES[b.city]) throw err(422, 'Unknown city');
  if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) throw err(409, 'An account with this email already exists');
  const id = db.prepare('INSERT INTO users (email, password_hash, name, company, phone, city, role, ntn) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(email, hashPassword(pw), str(b.name, 100), str(b.company, 120), str(b.phone, 30) || null, b.city, b.role, str(b.ntn, 30) || null).lastInsertRowid;
  startSession(req, res, id);
  return { ok: true, role: b.role };
});

route('POST', '/api/login', async (req, _m, res) => {
  limit(req, 'login', 30);
  const b = await readJson(req);
  const email = str(b.email, 160).toLowerCase();
  const f = failures.get(email);
  if (f?.until > Date.now()) throw err(429, 'Account temporarily locked. Try again in 15 minutes.');
  const row = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  const ok = verifyPassword(typeof b.password === 'string' ? b.password.slice(0, 200) : '', row ? row.password_hash : DUMMY_HASH) && !!row;
  if (!ok) {
    const n = (f?.n || 0) + 1; failures.set(email, { n, until: n >= 5 ? Date.now() + 9e5 : 0 });
    throw err(401, 'Wrong email or password');
  }
  failures.delete(email);
  startSession(req, res, row.id);
  return { ok: true, role: row.role };
});

route('POST', '/api/logout', (req, _m, res) => {
  const sid = getSid(req); if (sid) sessions.delete(sid);
  res.setHeader('Set-Cookie', `${COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${PROD ? '; Secure' : ''}`);
  return { ok: true };
});

route('GET', '/api/me', (req) => {
  const u = currentUser(req); if (!u) return { anonymous: true };
  return u.role === 'buyer' ? { ...u, credit_used: creditUsed(u.id) } : u;
});

// ---- buyer ----
route('POST', '/api/orders', async (req) => {
  const u = auth(req, 'buyer');
  limit(req, 'orders', 30);
  const b = await readJson(req);
  const items = Array.isArray(b.items) ? b.items.slice(0, 50) : [];
  if (!items.length) throw err(422, 'Cart is empty');
  const method = b.payment_method;
  if (!['advance', 'cod', 'credit', 'escrow'].includes(method)) throw err(422, 'Choose a payment method');
  const city = str(b.delivery_city, 30); if (!CITIES[city]) throw err(422, 'Choose a delivery city');
  const date = str(b.delivery_date, 10); if (date && (!DATE_RE.test(date) || date < today())) throw err(422, 'Invalid delivery date');
  if (method === 'credit' && u.kyc_status !== 'verified') throw err(403, 'Zarea Credit needs a verified business profile');

  const getP = db.prepare("SELECT * FROM products WHERE id = ? AND status = 'active'");
  const groups = new Map();
  for (const l of items) {
    const p = getP.get(int(l.product_id, 1));
    const qty = int(l.qty, 1, 1_000_000);
    if (!p || !qty) throw err(422, 'Invalid item in cart');
    if (p.price == null) throw err(422, `${p.name} is quote-only — request a quote instead`);
    if (qty < p.moq) throw err(422, `${p.name}: minimum order is ${p.moq} × ${p.unit}`);
    if (!groups.has(p.supplier_id)) groups.set(p.supplier_id, []);
    groups.get(p.supplier_id).push({ p, qty });
  }
  const plan = [...groups].map(([sid, lines]) => {
    const subtotal = lines.reduce((s, { p, qty }) => s + p.price * qty, 0);
    const kg = lines.reduce((s, { p, qty }) => s + unitKg(p.unit) * qty, 0);
    const freight = freightQuote(lines[0].p.city, city, kg)?.best.cost || 0;
    return { sid, lines, subtotal, freight, total: subtotal + freight };
  });
  const grand = plan.reduce((s, o) => s + o.total, 0);
  if (method === 'credit' && grand > u.credit_limit - creditUsed(u.id)) throw err(422, 'Order exceeds available credit');

  const payStatus = { advance: 'pending', cod: 'pending', credit: 'due', escrow: 'held' }[method];
  const refs = [];
  db.exec('BEGIN');
  try {
    for (const o of plan) {
      const ref = makeRef('ZR');
      const id = db.prepare(`INSERT INTO orders (ref, buyer_id, supplier_id, subtotal, freight, total, payment_method, payment_status, delivery_city, address, delivery_date, due_date)
                             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(ref, u.id, o.sid, o.subtotal, o.freight, o.total, method, payStatus, city, str(b.address, 200) || null, date || null, method === 'credit' ? addDays(30) : null).lastInsertRowid;
      const ins = db.prepare('INSERT INTO order_items (order_id, product_id, description, qty, unit, unit_price) VALUES (?, ?, ?, ?, ?, ?)');
      for (const { p, qty } of o.lines) ins.run(id, p.id, p.name, qty, p.unit, p.price);
      db.prepare('INSERT INTO order_events (order_id, status, note) VALUES (?, ?, ?)').run(id, 'placed', `Payment: ${method}`);
      refs.push(ref);
    }
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
  return { ok: true, refs, total: grand };
});

route('GET', '/api/orders/mine', (req) => {
  const u = auth(req, 'buyer', 'supplier');
  const col = u.role === 'buyer' ? 'o.buyer_id' : 'o.supplier_id';
  const orders = db.prepare(`SELECT o.*, s.company AS supplier, b.company AS buyer, b.phone AS buyer_phone,
    (SELECT rating FROM reviews r WHERE r.order_id = o.id) AS my_rating
    FROM orders o JOIN users s ON s.id = o.supplier_id JOIN users b ON b.id = o.buyer_id WHERE ${col} = ? ORDER BY o.id DESC`).all(u.id);
  const items = db.prepare('SELECT description, qty, unit, unit_price FROM order_items WHERE order_id = ?');
  const events = db.prepare('SELECT status, note, at FROM order_events WHERE order_id = ? ORDER BY at, id');
  return orders.map((o) => ({ ...o, items: items.all(o.id), events: events.all(o.id) }));
});

route('POST', '/api/orders/(\\d+)/review', async (req, [id]) => {
  const u = auth(req, 'buyer');
  const o = db.prepare('SELECT * FROM orders WHERE id = ? AND buyer_id = ?').get(Number(id), u.id);
  if (!o) throw err(404, 'Order not found');
  if (o.status !== 'delivered') throw err(422, 'You can review after delivery');
  const b = await readJson(req);
  const rating = int(b.rating, 1, 5); if (!rating) throw err(422, 'Rating 1–5 required');
  db.prepare('INSERT INTO reviews (order_id, supplier_id, rating, comment) VALUES (?, ?, ?, ?) ON CONFLICT(order_id) DO UPDATE SET rating = excluded.rating, comment = excluded.comment')
    .run(o.id, o.supplier_id, rating, str(b.comment, 500) || null);
  refreshSupplierRating(o.supplier_id);
  return { ok: true };
});

route('POST', '/api/orders/(\\d+)/cancel', (req, [id]) => {
  const u = auth(req, 'buyer', 'supplier');
  const o = db.prepare(`SELECT * FROM orders WHERE id = ? AND ${u.role === 'buyer' ? 'buyer_id' : 'supplier_id'} = ?`).get(Number(id), u.id);
  if (!o) throw err(404, 'Order not found');
  if (!['placed', 'confirmed'].includes(o.status)) throw err(422, 'Orders can only be cancelled before dispatch');
  db.prepare("UPDATE orders SET status = 'cancelled', payment_status = CASE WHEN payment_status IN ('held','paid') THEN 'refunded' ELSE payment_status END WHERE id = ?").run(o.id);
  db.prepare('INSERT INTO order_events (order_id, status, note) VALUES (?, ?, ?)').run(o.id, 'cancelled', `Cancelled by ${u.role}`);
  return { ok: true };
});

route('POST', '/api/rfqs', async (req) => {
  const u = auth(req, 'buyer');
  limit(req, 'rfq', 20);
  const b = await readJson(req);
  required(b, ['category', 'title', 'qty', 'unit', 'city']);
  if (!CATEGORIES.some(([s]) => s === b.category)) throw err(422, 'Unknown category');
  if (!CITIES[b.city]) throw err(422, 'Unknown city');
  const qty = int(b.qty, 1, 1e9); if (!qty) throw err(422, 'Invalid quantity');
  const need = str(b.needed_by, 10); if (need && !DATE_RE.test(need)) throw err(422, 'Invalid date');
  const ref = makeRef('RFQ');
  db.prepare('INSERT INTO rfqs (ref, buyer_id, category, title, qty, unit, city, needed_by, target_price, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(ref, u.id, b.category, str(b.title, 140), qty, str(b.unit, 30), b.city, need || null, int(b.target_price, 1, 1e10), str(b.notes, 1000) || null);
  return { ok: true, ref };
});

route('GET', '/api/rfqs/mine', (req) => {
  const u = auth(req, 'buyer');
  const rfqs = db.prepare('SELECT * FROM rfqs WHERE buyer_id = ? ORDER BY id DESC').all(u.id);
  const bids = db.prepare(`SELECT b.id, b.unit_price, b.lead_days, b.notes, b.status, b.created_at, s.company AS supplier, s.rating, s.kyc_status = 'verified' AS verified
                           FROM bids b JOIN users s ON s.id = b.supplier_id WHERE b.rfq_id = ? ORDER BY b.unit_price`);
  return rfqs.map((r) => ({ ...r, bids: bids.all(r.id).map((x) => ({ ...x, verified: !!x.verified })) }));
});

route('POST', '/api/bids/(\\d+)/accept', async (req, [id]) => {
  const u = auth(req, 'buyer');
  const b = await readJson(req);
  const bid = db.prepare('SELECT b.*, r.buyer_id, r.status AS rfq_status, r.qty, r.unit, r.city, r.title, r.needed_by FROM bids b JOIN rfqs r ON r.id = b.rfq_id WHERE b.id = ?').get(Number(id));
  if (!bid || bid.buyer_id !== u.id) throw err(404, 'Bid not found');
  if (bid.rfq_status !== 'open') throw err(422, 'This RFQ is already closed');
  const method = ['advance', 'cod', 'escrow', 'credit'].includes(b.payment_method) ? b.payment_method : 'escrow';
  const total = bid.unit_price * bid.qty;
  if (method === 'credit' && (u.kyc_status !== 'verified' || total > u.credit_limit - creditUsed(u.id))) throw err(422, 'Not enough available credit');
  const ref = makeRef('ZR');
  db.exec('BEGIN');
  try {
    const oid = db.prepare(`INSERT INTO orders (ref, buyer_id, supplier_id, rfq_id, subtotal, freight, total, payment_method, payment_status, delivery_city, delivery_date, due_date)
                            VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?)`)
      .run(ref, u.id, bid.supplier_id, bid.rfq_id, total, total, method, { advance: 'pending', cod: 'pending', credit: 'due', escrow: 'held' }[method],
        bid.city, bid.needed_by, method === 'credit' ? addDays(30) : null).lastInsertRowid;
    db.prepare('INSERT INTO order_items (order_id, product_id, description, qty, unit, unit_price) VALUES (?, NULL, ?, ?, ?, ?)').run(oid, bid.title, bid.qty, bid.unit, bid.unit_price);
    db.prepare('INSERT INTO order_events (order_id, status, note) VALUES (?, ?, ?)').run(oid, 'placed', 'Awarded from RFQ (delivered price)');
    db.prepare("UPDATE bids SET status = CASE WHEN id = ? THEN 'accepted' ELSE 'rejected' END WHERE rfq_id = ?").run(bid.id, bid.rfq_id);
    db.prepare("UPDATE rfqs SET status = 'awarded' WHERE id = ?").run(bid.rfq_id);
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
  return { ok: true, ref };
});

route('GET', '/api/alerts', (req) => {
  const u = auth(req, 'buyer');
  return db.prepare('SELECT a.*, p.name, p.slug, p.price, p.unit FROM alerts a JOIN products p ON p.id = a.product_id WHERE a.user_id = ? ORDER BY a.id DESC').all(u.id);
});
route('POST', '/api/alerts', async (req) => {
  const u = auth(req, 'buyer');
  const b = await readJson(req);
  const p = db.prepare('SELECT id, price FROM products WHERE id = ?').get(int(b.product_id, 1));
  const target = int(b.target, 1, 1e10);
  if (!p || !target || !['below', 'above'].includes(b.direction)) throw err(422, 'Invalid alert');
  if (db.prepare('SELECT COUNT(*) n FROM alerts WHERE user_id = ?').get(u.id).n >= 50) throw err(422, 'Alert limit reached');
  db.prepare('INSERT INTO alerts (user_id, product_id, direction, target) VALUES (?, ?, ?, ?)').run(u.id, p.id, b.direction, target);
  return { ok: true };
});
route('DELETE', '/api/alerts/(\\d+)', (req, [id]) => {
  const u = auth(req, 'buyer');
  const r = db.prepare('DELETE FROM alerts WHERE id = ? AND user_id = ?').run(Number(id), u.id);
  if (!r.changes) throw err(404, 'Not found');
  return { ok: true };
});

route('POST', '/api/credit/apply', async (req) => {
  const u = auth(req, 'buyer');
  limit(req, 'credit', 10);
  const b = await readJson(req);
  required(b, ['company_type', 'industry', 'commodity', 'amount', 'term_days', 'monthly_turnover', 'years_in_business']);
  const input = {
    company_type: str(b.company_type, 40), monthly_turnover: int(b.monthly_turnover, 0, 1e11),
    amount: int(b.amount, 50000, 1e10), years_in_business: int(b.years_in_business, 0, 100),
  };
  const term = int(b.term_days, 7, 180);
  if (input.amount == null || input.monthly_turnover == null || input.years_in_business == null || !term) throw err(422, 'Check the numbers you entered');
  if (db.prepare("SELECT 1 FROM credit_applications WHERE user_id = ? AND status = 'pending'").get(u.id)) throw err(409, 'You already have an application under review');
  const sc = creditScore(input, u.kyc_status === 'verified');
  const ref = makeRef('CR');
  db.prepare(`INSERT INTO credit_applications (ref, user_id, company_type, industry, commodity, amount, term_days, monthly_turnover, years_in_business, score)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(ref, u.id, input.company_type, str(b.industry, 60), str(b.commodity, 40), input.amount, term, input.monthly_turnover, input.years_in_business, sc.score);
  return { ok: true, ref, ...sc };
});
route('GET', '/api/credit/mine', (req) => {
  const u = auth(req, 'buyer');
  return {
    limit: u.credit_limit, used: creditUsed(u.id),
    applications: db.prepare('SELECT ref, amount, term_days, score, status, approved_limit, created_at FROM credit_applications WHERE user_id = ? ORDER BY id DESC').all(u.id),
    due: db.prepare("SELECT ref, total, due_date FROM orders WHERE buyer_id = ? AND payment_method='credit' AND payment_status='due' AND status != 'cancelled' ORDER BY due_date").all(u.id),
  };
});

// ---- supplier ----
route('GET', '/api/supplier/products', (req) => {
  const u = auth(req, 'supplier');
  return db.prepare('SELECT * FROM products WHERE supplier_id = ? ORDER BY category, name').all(u.id).map((p) => ({ ...p, stats: p.price != null ? priceStats(p.id) : null }));
});
route('PATCH', '/api/supplier/products/(\\d+)', async (req, [id]) => {
  const u = auth(req, 'supplier');
  const p = db.prepare('SELECT * FROM products WHERE id = ? AND supplier_id = ?').get(Number(id), u.id);
  if (!p) throw err(404, 'Product not found');
  const b = await readJson(req);
  const price = b.price === null || b.price === '' ? null : int(b.price, 1, 1e10);
  if (b.price !== undefined && b.price !== null && b.price !== '' && price == null) throw err(422, 'Invalid price');
  const moq = b.moq !== undefined ? int(b.moq, 1, 1e7) : p.moq;
  const lead = b.lead_days !== undefined ? int(b.lead_days, 0, 120) : p.lead_days;
  const status = ['active', 'paused'].includes(b.status) ? b.status : p.status;
  if (moq == null || lead == null) throw err(422, 'Invalid MOQ or lead time');
  const newPrice = b.price !== undefined ? price : p.price;
  db.prepare("UPDATE products SET price = ?, moq = ?, lead_days = ?, status = ?, price_source = CASE WHEN ? != COALESCE(price,-1) THEN 'supplier' ELSE price_source END, updated_at = datetime('now') WHERE id = ?")
    .run(newPrice, moq, lead, status, newPrice ?? -1, p.id);
  if (newPrice != null && newPrice !== p.price) recordPrice(p.id, newPrice);
  return { ok: true };
});
route('POST', '/api/supplier/products', async (req) => {
  const u = auth(req, 'supplier');
  if (u.kyc_status !== 'verified') throw err(403, 'Listings go live after your business is verified');
  const b = await readJson(req);
  required(b, ['name', 'category', 'unit', 'city']);
  if (!CATEGORIES.some(([s]) => s === b.category)) throw err(422, 'Unknown category');
  if (!CITIES[b.city]) throw err(422, 'Unknown city');
  const name = str(b.name, 100);
  const slug = `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-${randomBytes(2).toString('hex')}`;
  const price = b.price ? int(b.price, 1, 1e10) : null;
  const id = db.prepare(`INSERT INTO products (slug, name, category, brand, unit, price, moq, lead_days, city, supplier_id, description, price_source)
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'supplier')`)
    .run(slug, name, b.category, str(b.brand, 60) || null, str(b.unit, 30), price, int(b.moq, 1, 1e7) || 1, int(b.lead_days, 0, 120) ?? 2, b.city, u.id, str(b.description, 600) || null).lastInsertRowid;
  if (price) recordPrice(id, price);
  return { ok: true, slug };
});
route('GET', '/api/supplier/rfqs', (req) => {
  const u = auth(req, 'supplier');
  return db.prepare(`SELECT r.id, r.ref, r.category, r.title, r.qty, r.unit, r.city, r.needed_by, r.target_price, r.notes, r.created_at,
    (SELECT COUNT(*) FROM bids x WHERE x.rfq_id = r.id) AS bids,
    mb.unit_price AS my_price, mb.lead_days AS my_lead, mb.status AS my_status
    FROM rfqs r LEFT JOIN bids mb ON mb.rfq_id = r.id AND mb.supplier_id = ?
    WHERE r.status = 'open' OR mb.id IS NOT NULL ORDER BY r.id DESC LIMIT 100`).all(u.id);
});
route('POST', '/api/supplier/rfqs/(\\d+)/bid', async (req, [id]) => {
  const u = auth(req, 'supplier');
  if (u.kyc_status !== 'verified') throw err(403, 'Bidding opens after verification');
  const r = db.prepare("SELECT * FROM rfqs WHERE id = ? AND status = 'open'").get(Number(id));
  if (!r) throw err(404, 'RFQ not open');
  const b = await readJson(req);
  const price = int(b.unit_price, 1, 1e10), lead = int(b.lead_days, 0, 120);
  if (!price || lead == null) throw err(422, 'Price and lead time required');
  db.prepare(`INSERT INTO bids (rfq_id, supplier_id, unit_price, lead_days, notes) VALUES (?, ?, ?, ?, ?)
              ON CONFLICT(rfq_id, supplier_id) DO UPDATE SET unit_price = excluded.unit_price, lead_days = excluded.lead_days, notes = excluded.notes, created_at = datetime('now')`)
    .run(r.id, u.id, price, lead, str(b.notes, 500) || null);
  return { ok: true };
});
const NEXT = { placed: 'confirmed', confirmed: 'dispatched', dispatched: 'delivered' };
route('POST', '/api/supplier/orders/(\\d+)/advance', async (req, [id]) => {
  const u = auth(req, 'supplier');
  const o = db.prepare('SELECT * FROM orders WHERE id = ? AND supplier_id = ?').get(Number(id), u.id);
  if (!o) throw err(404, 'Order not found');
  const next = NEXT[o.status]; if (!next) throw err(422, 'Order cannot move further');
  const b = await readJson(req);
  const vehicle = str(b.vehicle, 60);
  if (next === 'dispatched' && !vehicle) throw err(422, 'Vehicle number required to dispatch');
  const pay = next === 'delivered' ? ({ escrow: 'paid', cod: 'paid' }[o.payment_method] || o.payment_status) : o.payment_status;
  db.prepare('UPDATE orders SET status = ?, vehicle = COALESCE(?, vehicle), payment_status = ? WHERE id = ?').run(next, vehicle || null, pay, o.id);
  const note = next === 'dispatched' ? `Loaded on ${vehicle}` : next === 'delivered' ? (o.payment_method === 'escrow' ? 'Delivered — escrow released' : 'Delivered') : str(b.note, 200) || null;
  db.prepare('INSERT INTO order_events (order_id, status, note) VALUES (?, ?, ?)').run(o.id, next, note);
  return { ok: true, status: next };
});

// ---- admin ----
route('GET', '/api/admin/overview', (req) => {
  auth(req, 'admin');
  const one = (sql) => db.prepare(sql).get();
  return {
    gmv: one("SELECT COALESCE(SUM(total),0) s FROM orders WHERE status != 'cancelled'").s,
    orders: one('SELECT COUNT(*) n FROM orders').n,
    openRfqs: one("SELECT COUNT(*) n FROM rfqs WHERE status='open'").n,
    pendingKyc: one("SELECT COUNT(*) n FROM users WHERE kyc_status='pending'").n,
    pendingCredit: one("SELECT COUNT(*) n FROM credit_applications WHERE status='pending'").n,
    creditOutstanding: one("SELECT COALESCE(SUM(total),0) s FROM orders WHERE payment_method='credit' AND payment_status='due' AND status!='cancelled'").s,
    newLeads: one("SELECT COUNT(*) n FROM leads WHERE status='new'").n + one("SELECT COUNT(*) n FROM supplier_applications WHERE status='new'").n,
    byCategory: db.prepare(`SELECT p.category, SUM(oi.qty * oi.unit_price) total FROM order_items oi JOIN orders o ON o.id = oi.order_id
                            JOIN products p ON p.id = oi.product_id WHERE o.status != 'cancelled' GROUP BY p.category ORDER BY total DESC`).all(),
    byStatus: db.prepare('SELECT status, COUNT(*) n FROM orders GROUP BY status').all(),
  };
});
route('GET', '/api/admin/users', (req) => { auth(req, 'admin'); return db.prepare("SELECT id, email, name, company, phone, city, role, kyc_status, ntn, credit_limit, rating, created_at FROM users WHERE role != 'admin' ORDER BY kyc_status = 'pending' DESC, id DESC").all(); });
route('GET', '/api/admin/orders', (req) => { auth(req, 'admin'); return db.prepare('SELECT o.*, b.company buyer, s.company supplier FROM orders o JOIN users b ON b.id=o.buyer_id JOIN users s ON s.id=o.supplier_id ORDER BY o.id DESC LIMIT 300').all(); });
route('GET', '/api/admin/credit', (req) => { auth(req, 'admin'); return db.prepare('SELECT c.*, u.company, u.kyc_status FROM credit_applications c JOIN users u ON u.id = c.user_id ORDER BY c.status = \'pending\' DESC, c.id DESC').all(); });
route('GET', '/api/admin/leads', (req) => {
  auth(req, 'admin');
  return { leads: db.prepare('SELECT * FROM leads ORDER BY id DESC LIMIT 300').all(), suppliers: db.prepare('SELECT * FROM supplier_applications ORDER BY id DESC LIMIT 300').all() };
});
route('PATCH', '/api/admin/users/(\\d+)', async (req, [id]) => {
  auth(req, 'admin');
  const b = await readJson(req);
  if (!['pending', 'verified', 'rejected'].includes(b.kyc_status)) throw err(422, 'Invalid status');
  const r = db.prepare("UPDATE users SET kyc_status = ? WHERE id = ? AND role != 'admin'").run(b.kyc_status, Number(id));
  if (!r.changes) throw err(404, 'Not found');
  return { ok: true };
});
route('PATCH', '/api/admin/credit/(\\d+)', async (req, [id]) => {
  auth(req, 'admin');
  const b = await readJson(req);
  const c = db.prepare('SELECT * FROM credit_applications WHERE id = ?').get(Number(id));
  if (!c) throw err(404, 'Not found');
  if (b.status === 'approved') {
    const lim = int(b.approved_limit, 10000, 1e10); if (!lim) throw err(422, 'Approved limit required');
    db.prepare("UPDATE credit_applications SET status='approved', approved_limit=? WHERE id=?").run(lim, c.id);
    db.prepare('UPDATE users SET credit_limit = ? WHERE id = ?').run(lim, c.user_id);
  } else if (b.status === 'rejected') {
    db.prepare("UPDATE credit_applications SET status='rejected' WHERE id=?").run(c.id);
  } else throw err(422, 'Invalid status');
  return { ok: true };
});
route('PATCH', '/api/admin/orders/(\\d+)', async (req, [id]) => {
  auth(req, 'admin');
  const b = await readJson(req);
  if (!['pending', 'held', 'paid', 'due', 'refunded'].includes(b.payment_status)) throw err(422, 'Invalid payment status');
  const r = db.prepare('UPDATE orders SET payment_status = ? WHERE id = ?').run(b.payment_status, Number(id));
  if (!r.changes) throw err(404, 'Not found');
  return { ok: true };
});
route('PATCH', '/api/admin/(leads|supplier_applications)/(\\d+)', async (req, [table, id]) => {
  auth(req, 'admin');
  const b = await readJson(req);
  const ok = table === 'leads' ? ['new', 'contacted', 'closed'] : ['new', 'contacted', 'onboarded', 'rejected'];
  if (!ok.includes(b.status)) throw err(422, 'Invalid status');
  const r = db.prepare(`UPDATE ${table} SET status = ? WHERE id = ?`).run(b.status, Number(id));
  if (!r.changes) throw err(404, 'Not found');
  return { ok: true };
});
function toCsv(rows) {
  if (!rows.length) return '';
  const cols = Object.keys(rows[0]);
  const cell = (v) => { let t = v == null ? '' : String(v); if (/^[=+\-@\t\r]/.test(t)) t = `'${t}`; return `"${t.replace(/"/g, '""')}"`; };
  return [cols.join(','), ...rows.map((r) => cols.map((c) => cell(r[c])).join(','))].join('\r\n');
}
route('GET', '/api/admin/export/(orders|leads|users)\\.csv', (req, [t], res) => {
  auth(req, 'admin');
  const sql = {
    orders: 'SELECT o.ref, b.company buyer, s.company supplier, o.total, o.payment_method, o.payment_status, o.status, o.delivery_city, o.created_at FROM orders o JOIN users b ON b.id=o.buyer_id JOIN users s ON s.id=o.supplier_id ORDER BY o.id DESC',
    leads: 'SELECT kind, name, phone, email, product, qty, city, message, status, created_at FROM leads ORDER BY id DESC',
    users: "SELECT email, name, company, phone, city, role, kyc_status, credit_limit, created_at FROM users WHERE role != 'admin'",
  }[t];
  res.writeHead(200, { ...SECURITY_HEADERS, 'Content-Type': 'text/csv; charset=utf-8', 'Cache-Control': 'no-store',
    'Content-Disposition': `attachment; filename="zarea-${t}-${today()}.csv"` });
  res.end('﻿' + toCsv(db.prepare(sql).all()));
  return SENT;
});

// ---------------- static ----------------
async function serveStatic(req, res, pathname) {
  let rel;
  try { rel = decodeURIComponent(pathname); } catch { return send(res, 400, 'Bad request'); }
  if (rel.includes('\0')) return send(res, 400, 'Bad request');
  if (rel.endsWith('/')) rel += 'index.html';
  let file = normalize(join(PUBLIC, rel));
  if (file !== PUBLIC && !file.startsWith(PUBLIC + sep)) return send(res, 403, 'Forbidden');
  let s = await stat(file).catch(() => null);
  if (!s && !extname(file)) { file += '.html'; s = await stat(file).catch(() => null); }
  if (!s || !s.isFile()) return send(res, 404, await readFile(join(PUBLIC, '404.html')), { 'Content-Type': MIME['.html'] });
  const ext = extname(file);
  send(res, 200, await readFile(file), {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Cache-Control': PROD && ext !== '.html' ? 'public, max-age=3600' : 'no-cache',
  });
}

async function handle(req, res) {
  let url;
  try { url = new URL(req.url, 'http://localhost'); } catch { return send(res, 400, 'Bad request'); }
  if (url.pathname.startsWith('/api/')) {
    const r = routes.find((x) => x.method === req.method && x.re.test(url.pathname));
    if (!r) return send(res, 404, { error: 'Not found' });
    if (req.method !== 'GET' && !sameOrigin(req)) return send(res, 403, { error: 'Cross-origin request blocked' });
    try {
      const out = await r.handler(req, url.pathname.match(r.re).slice(1), res, url);
      if (out !== SENT) send(res, 200, out);
    } catch (e) {
      if (!e.status) console.error(e);
      send(res, e.status || 500, { error: e.status ? e.message : 'Server error' });
    }
    return;
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed');
  return serveStatic(req, res, url.pathname);
}

const server = createServer((req, res) => {
  handle(req, res).catch((e) => { console.error(e); if (!res.headersSent) send(res, 500, { error: 'Server error' }); else res.destroy(); });
});
server.headersTimeout = 20_000;
server.requestTimeout = 30_000;
server.listen(PORT, () => console.log(`Zarea platform running → http://localhost:${PORT}`));
