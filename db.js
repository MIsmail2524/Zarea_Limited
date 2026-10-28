// Schema + seed for the Zarea commodity marketplace. Built-in node:sqlite, no npm install.
import { DatabaseSync } from 'node:sqlite';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname } from 'node:path';

export function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
}
export function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(':');
  const a = scryptSync(password, salt, 64); const b = Buffer.from(hash, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

export const CATEGORIES = [
  ['cement', 'Cement', 'Bag (50 kg)'],
  ['steel', 'Steel', 'Ton'],
  ['building-and-finishing', 'Building & Finishing', 'Various'],
  ['agriculture-biomass', 'Agriculture Biomass', 'Maund (40 kg)'],
  ['grains-and-pulses', 'Grains & Pulses', 'Kg'],
  ['sugar', 'Sugar', 'Bag (50 kg)'],
  ['fertilizer', 'Fertilizer', 'Bag (50 kg)'],
  ['coal', 'Coal', 'Ton'],
  ['chemicals', 'Chemicals', 'Kg'],
  ['cotton-and-yarn', 'Cotton & Yarn', 'Maund / Bag'],
  ['energy-and-petroleum', 'Energy & Petroleum', 'Litre / Ton'],
  ['solar', 'Solar', 'Unit'],
  ['seed', 'Seed', 'Bag'],
];

// City coordinates for freight estimation (approximate city centres).
export const CITIES = {
  Lahore: [31.52, 74.36], Karachi: [24.86, 67.0], Islamabad: [33.68, 73.05], Rawalpindi: [33.6, 73.04],
  Faisalabad: [31.42, 73.08], Multan: [30.16, 71.52], Peshawar: [34.01, 71.58], Quetta: [30.18, 66.98],
  Sialkot: [32.49, 74.53], Gujranwala: [32.16, 74.19], Hyderabad: [25.4, 68.37], Sargodha: [32.08, 72.67],
  Bahawalpur: [29.4, 71.68], Sukkur: [27.71, 68.86],
};

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  company TEXT NOT NULL,
  phone TEXT,
  city TEXT,
  role TEXT NOT NULL CHECK (role IN ('buyer','supplier','admin')),
  kyc_status TEXT NOT NULL DEFAULT 'pending' CHECK (kyc_status IN ('pending','verified','rejected')),
  ntn TEXT,
  credit_limit INTEGER NOT NULL DEFAULT 0,
  rating REAL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  brand TEXT,
  unit TEXT NOT NULL,
  price INTEGER,                         -- PKR per unit; NULL = quote only
  moq INTEGER NOT NULL DEFAULT 1,
  lead_days INTEGER NOT NULL DEFAULT 2,
  city TEXT NOT NULL,
  supplier_id INTEGER NOT NULL REFERENCES users(id),
  description TEXT,
  price_source TEXT NOT NULL DEFAULT 'illustrative',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_products_cat ON products(category);
CREATE TABLE IF NOT EXISTS price_history (
  product_id INTEGER NOT NULL REFERENCES products(id),
  day TEXT NOT NULL,
  price INTEGER NOT NULL,
  PRIMARY KEY (product_id, day)
);
CREATE TABLE IF NOT EXISTS alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  product_id INTEGER NOT NULL REFERENCES products(id),
  direction TEXT NOT NULL CHECK (direction IN ('below','above')),
  target INTEGER NOT NULL,
  triggered_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS rfqs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ref TEXT UNIQUE NOT NULL,
  buyer_id INTEGER NOT NULL REFERENCES users(id),
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  qty INTEGER NOT NULL,
  unit TEXT NOT NULL,
  city TEXT NOT NULL,
  needed_by TEXT,
  target_price INTEGER,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','awarded','closed')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS bids (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  rfq_id INTEGER NOT NULL REFERENCES rfqs(id),
  supplier_id INTEGER NOT NULL REFERENCES users(id),
  unit_price INTEGER NOT NULL,
  lead_days INTEGER NOT NULL,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','rejected')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (rfq_id, supplier_id)
);
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ref TEXT UNIQUE NOT NULL,
  buyer_id INTEGER NOT NULL REFERENCES users(id),
  supplier_id INTEGER NOT NULL REFERENCES users(id),
  rfq_id INTEGER REFERENCES rfqs(id),
  subtotal INTEGER NOT NULL,
  freight INTEGER NOT NULL DEFAULT 0,
  total INTEGER NOT NULL,
  payment_method TEXT NOT NULL CHECK (payment_method IN ('advance','cod','credit','escrow')),
  payment_status TEXT NOT NULL DEFAULT 'pending' CHECK (payment_status IN ('pending','held','paid','due','refunded')),
  status TEXT NOT NULL DEFAULT 'placed' CHECK (status IN ('placed','confirmed','dispatched','delivered','cancelled')),
  delivery_city TEXT NOT NULL,
  address TEXT,
  delivery_date TEXT,
  vehicle TEXT,
  due_date TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id),
  product_id INTEGER REFERENCES products(id),
  description TEXT NOT NULL,
  qty INTEGER NOT NULL,
  unit TEXT NOT NULL,
  unit_price INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS order_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id),
  status TEXT NOT NULL,
  note TEXT,
  at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS reviews (
  order_id INTEGER PRIMARY KEY REFERENCES orders(id),
  supplier_id INTEGER NOT NULL REFERENCES users(id),
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS credit_applications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ref TEXT UNIQUE NOT NULL,
  user_id INTEGER NOT NULL REFERENCES users(id),
  company_type TEXT NOT NULL,
  industry TEXT NOT NULL,
  commodity TEXT NOT NULL,
  amount INTEGER NOT NULL,
  term_days INTEGER NOT NULL,
  monthly_turnover INTEGER NOT NULL,
  years_in_business INTEGER NOT NULL,
  score INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  approved_limit INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS supplier_applications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL, supplier_type TEXT NOT NULL, phone TEXT NOT NULL, email TEXT NOT NULL,
  city TEXT NOT NULL, commodity TEXT NOT NULL, brand TEXT, ntn TEXT,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','contacted','onboarded','rejected')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS leads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,
  name TEXT NOT NULL, phone TEXT, email TEXT NOT NULL,
  product TEXT, qty TEXT, city TEXT, message TEXT,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','contacted','closed')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

// Deterministic PRNG so the demo price history is stable across resets.
function mulberry32(a) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

function seed(db) {
  const prod = process.env.NODE_ENV === 'production';
  const insUser = db.prepare(`INSERT INTO users (email, password_hash, name, company, phone, city, role, kyc_status, ntn, credit_limit, rating)
                              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const adminPw = process.env.SEED_ADMIN_PASSWORD || (prod ? randomBytes(12).toString('base64url') : 'admin123');
  if (prod && !process.env.SEED_ADMIN_PASSWORD) console.log(`[seed] generated admin password: ${adminPw}`);
  insUser.run('admin@demo.test', hashPassword(adminPw), 'Ops Admin', 'Zarea (demo)', null, 'Lahore', 'admin', 'verified', null, 0, null);

  // Demo suppliers are fictional businesses. Product brands are manufacturers' names as listed on zarea.com.
  const pw = hashPassword('demo1234');
  const S = {};
  [
    ['punjab@demo.test', 'Punjab Building Supplies', 'Lahore', 4.7],
    ['indus@demo.test', 'Indus Agri Traders', 'Multan', 4.5],
    ['margalla@demo.test', 'Margalla Steel & Metals', 'Islamabad', 4.6],
    ['seaport@demo.test', 'Seaport Commodities', 'Karachi', 4.3],
    ['greenfield@demo.test', 'Greenfield Agro Inputs', 'Faisalabad', 4.4],
    ['sunline@demo.test', 'Sunline Energy Solutions', 'Lahore', 4.8],
  ].forEach(([email, company, city, rating], i) => {
    S[email.split('@')[0]] = insUser.run(email, pw, `${company.split(' ')[0]} Manager`, `${company} (demo)`, `+92 300 000 00${10 + i}`,
      city, 'supplier', 'verified', `NTN-DEMO-${100 + i}`, 0, rating).lastInsertRowid;
  });
  if (!prod) {
    insUser.run('buyer@demo.test', pw, 'Ahmed Khan', 'Khan Builders (demo)', '+92 321 000 0001', 'Lahore', 'buyer', 'verified', 'NTN-DEMO-900', 2_500_000, null);
    insUser.run('newbuyer@demo.test', pw, 'Sara Ali', 'Ali Textiles (demo)', '+92 333 000 0002', 'Faisalabad', 'buyer', 'pending', null, 0, null);
  }

  const Z = 'zarea.com 28 Oct 2026';
  const insP = db.prepare(`INSERT INTO products (slug, name, category, brand, unit, price, moq, lead_days, city, supplier_id, description, price_source)
                           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const products = [
    // Cement — prices from zarea.com daily price board, 28 Oct 2026
    ['Bestway Cement (OPC)', 'cement', 'Bestway', 'Bag (50 kg)', 1635, 100, 2, 'Lahore', 'punjab', 'Ordinary Portland Cement for general construction.', Z],
    ['Bestway Cement (SRC)', 'cement', 'Bestway', 'Bag (50 kg)', 1690, 100, 2, 'Lahore', 'punjab', 'Sulphate-resistant cement for foundations and saline soils.', Z],
    ['Cherat Cement (OPC)', 'cement', 'Cherat', 'Bag (50 kg)', 1640, 100, 3, 'Islamabad', 'margalla', 'OPC from Cherat Cement Company.', Z],
    ['DG Khan Cement (OPC)', 'cement', 'DG Khan', 'Bag (50 kg)', 1665, 100, 2, 'Multan', 'indus', 'OPC from D.G. Khan Cement.', Z],
    ['Fauji Cement (OPC)', 'cement', 'Fauji', 'Bag (50 kg)', 1635, 100, 2, 'Rawalpindi', 'margalla', 'OPC from Fauji Cement Company.', Z],
    ['Flying Cement (OPC)', 'cement', 'Flying', 'Bag (50 kg)', 1565, 100, 2, 'Lahore', 'punjab', 'Value OPC for block work and plaster.', Z],
    ['Gharibwal/Paidar Cement (OPC)', 'cement', 'Gharibwal', 'Bag (50 kg)', 1630, 100, 2, 'Lahore', 'punjab', 'OPC from Gharibwal Cement.', Z],
    ['Kohat Cement (OPC)', 'cement', 'Kohat', 'Bag (50 kg)', 1635, 100, 3, 'Peshawar', 'margalla', 'OPC from Kohat Cement.', Z],
    ['Kohat Cement (White)', 'cement', 'Kohat', 'Bag (50 kg)', 2350, 20, 3, 'Peshawar', 'margalla', 'White cement for finishing and tile grout.', Z],
    ['Lucky Cement (OPC)', 'cement', 'Lucky', 'Bag (50 kg)', 1625, 100, 2, 'Karachi', 'seaport', 'OPC from Lucky Cement.', Z],
    ['Maple Leaf Cement (OPC)', 'cement', 'Maple Leaf', 'Bag (50 kg)', 1690, 100, 2, 'Lahore', 'punjab', 'OPC from Maple Leaf Cement.', Z],
    ['Pioneer Cement (OPC)', 'cement', 'Pioneer', 'Bag (50 kg)', 1625, 100, 2, 'Lahore', 'punjab', 'OPC from Pioneer Cement.', Z],
    ['Ready Mix Concrete 3000 PSI', 'cement', null, 'Cubic metre', null, 10, 1, 'Lahore', 'punjab', 'Batched concrete delivered by transit mixer. Quote per site.', 'quote'],
    ['Ready Mix Concrete 4000 PSI', 'cement', null, 'Cubic metre', null, 10, 1, 'Lahore', 'punjab', 'High-strength batched concrete. Quote per site.', 'quote'],
    // Agri biomass — zarea.com 28 Oct 2026
    ['Rice Husk', 'agriculture-biomass', null, 'Maund (40 kg)', 1130, 250, 3, 'Multan', 'indus', 'Boiler fuel for textile, paper and food processors.', Z],
    ['Wheat Straw', 'agriculture-biomass', null, 'Maund (40 kg)', 1240, 250, 3, 'Multan', 'indus', 'Baled wheat straw for boilers and fodder.', Z],
    ['Corn Cob (crushed)', 'agriculture-biomass', null, 'Maund (40 kg)', 980, 250, 4, 'Faisalabad', 'greenfield', 'Crushed cob for biomass boilers.', 'illustrative'],
    // Grains & sugar — zarea.com 28 Oct 2026
    ['Maize (Corn)', 'grains-and-pulses', null, 'Kg', 325, 1000, 3, 'Faisalabad', 'greenfield', 'Yellow maize for feed mills and starch.', Z],
    ['Rice', 'grains-and-pulses', null, 'Kg', 390, 1000, 3, 'Lahore', 'indus', 'Milled rice, bulk.', Z],
    ['Wheat', 'grains-and-pulses', null, 'Kg', 480, 1000, 3, 'Multan', 'indus', 'Milling wheat, bulk.', Z],
    ['Masoor Dal (Red Lentil)', 'grains-and-pulses', null, 'Kg', 310, 500, 4, 'Karachi', 'seaport', 'Imported red lentil, cleaned.', 'illustrative'],
    ['Refined Sugar White', 'sugar', null, 'Bag (50 kg)', 8000, 50, 2, 'Faisalabad', 'greenfield', 'Refined white sugar, ICUMSA grade.', Z],
    // Illustrative demo prices below — replace with live supplier feeds
    ['Grade 60 Steel Bar (12 mm)', 'steel', 'Kamran Steel', 'Ton', 248000, 2, 3, 'Lahore', 'margalla', 'Deformed Grade 60 rebar, 12 mm.', 'illustrative'],
    ['Grade 60 Steel Bar (16 mm)', 'steel', 'Amreli', 'Ton', 252000, 2, 3, 'Karachi', 'seaport', 'Deformed Grade 60 rebar, 16 mm.', 'illustrative'],
    ['Grade 60 Steel Bar (10 mm)', 'steel', 'Mughal', 'Ton', 250500, 2, 3, 'Lahore', 'margalla', 'Deformed Grade 60 rebar, 10 mm.', 'illustrative'],
    ['Steel Girder (I-beam)', 'steel', null, 'Ton', 265000, 1, 5, 'Lahore', 'margalla', 'Structural I-beam, assorted sizes.', 'illustrative'],
    ['Duki Coal', 'coal', null, 'Ton', 47500, 25, 4, 'Quetta', 'seaport', 'Local bituminous coal for kilns and boilers.', 'illustrative'],
    ['Afghan Coal', 'coal', null, 'Ton', 52000, 25, 5, 'Peshawar', 'margalla', 'Imported via Torkham; high GCV.', 'illustrative'],
    ['South African Coal (RB1)', 'coal', null, 'Ton', 61000, 50, 7, 'Karachi', 'seaport', 'Imported thermal coal, 6000 NAR.', 'illustrative'],
    ['Urea (Sona)', 'fertilizer', 'Fauji Fertilizer', 'Bag (50 kg)', 4520, 100, 2, 'Faisalabad', 'greenfield', 'Nitrogen fertilizer, 46% N.', 'illustrative'],
    ['DAP', 'fertilizer', 'Fauji Fertilizer', 'Bag (50 kg)', 12450, 50, 2, 'Faisalabad', 'greenfield', 'Diammonium phosphate, 18-46-0.', 'illustrative'],
    ['Engro Urea', 'fertilizer', 'Engro', 'Bag (50 kg)', 4500, 100, 2, 'Multan', 'indus', 'Nitrogen fertilizer, 46% N.', 'illustrative'],
    ['Caustic Soda Flakes', 'chemicals', null, 'Kg', 165, 500, 3, 'Karachi', 'seaport', '98% NaOH flakes, 25 kg bags.', 'illustrative'],
    ['Soda Ash (Light)', 'chemicals', null, 'Bag (50 kg)', 6600, 40, 3, 'Karachi', 'seaport', 'Sodium carbonate for glass and detergents.', 'illustrative'],
    ['Cotton Lint (Phutti)', 'cotton-and-yarn', null, 'Maund (40 kg)', 8600, 50, 3, 'Multan', 'indus', 'Seed cotton, current crop.', 'illustrative'],
    ['Polyester Yarn 30s', 'cotton-and-yarn', null, 'Bag (45.36 kg)', 31000, 20, 5, 'Faisalabad', 'greenfield', 'Ring-spun polyester yarn.', 'illustrative'],
    ['High Speed Diesel', 'energy-and-petroleum', null, 'Litre', 266, 5000, 1, 'Karachi', 'seaport', 'Bulk HSD for fleets and gensets.', 'illustrative'],
    ['Furnace Oil', 'energy-and-petroleum', null, 'Ton', 168000, 20, 3, 'Karachi', 'seaport', 'HSFO for industrial boilers.', 'illustrative'],
    ['Mono PERC Solar Panel 585 W', 'solar', 'Longi', 'Panel', 16900, 10, 3, 'Lahore', 'sunline', 'Tier-1 mono PERC module, 585 W.', 'illustrative'],
    ['Hybrid Inverter 10 kW', 'solar', 'Inverex', 'Unit', 335000, 1, 4, 'Lahore', 'sunline', 'On/off-grid hybrid inverter.', 'illustrative'],
    ['Lithium Battery 5 kWh', 'solar', null, 'Unit', 255000, 1, 4, 'Lahore', 'sunline', 'LiFePO4 wall-mount battery.', 'illustrative'],
    ['Wheat Seed (certified)', 'seed', null, 'Bag (50 kg)', 6900, 20, 3, 'Faisalabad', 'greenfield', 'Certified wheat seed for Rabi sowing.', 'illustrative'],
    ['Hybrid Corn Seed', 'seed', null, 'Bag (10 kg)', 9200, 10, 3, 'Faisalabad', 'greenfield', 'High-yield hybrid maize seed.', 'illustrative'],
    ['Red Bricks (Awal)', 'building-and-finishing', null, '1,000 bricks', 17500, 5, 2, 'Lahore', 'punjab', 'First-class kiln bricks.', 'illustrative'],
    ['Ravi Sand', 'building-and-finishing', null, 'Cubic foot', 75, 500, 1, 'Lahore', 'punjab', 'Fine sand for plaster and masonry.', 'illustrative'],
    ['Chenab Sand', 'building-and-finishing', null, 'Cubic foot', 105, 500, 1, 'Lahore', 'punjab', 'Coarse sand for concrete.', 'illustrative'],
    ['Margalla Crush', 'building-and-finishing', null, 'Cubic foot', 150, 500, 1, 'Islamabad', 'margalla', 'Crushed stone aggregate.', 'illustrative'],
    ['Sargodha Crush', 'building-and-finishing', null, 'Cubic foot', 140, 500, 1, 'Lahore', 'punjab', 'Crushed stone aggregate.', 'illustrative'],
  ];
  const insH = db.prepare('INSERT INTO price_history (product_id, day, price) VALUES (?, ?, ?)');
  const today = new Date(); today.setUTCHours(0, 0, 0, 0);
  products.forEach(([name, cat, brand, unit, price, moq, lead, city, sup, desc, src], i) => {
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const id = insP.run(slug, name, cat, brand, unit, price, moq, lead, city, S[sup], desc, src).lastInsertRowid;
    if (price == null) return;
    // 90-day simulated history ending at today's price (for charts/trends in the demo)
    const rnd = mulberry32(1000 + i); let p = price; const vol = cat === 'cement' ? 0.004 : 0.009;
    for (let d = 0; d <= 90; d++) {
      const day = new Date(today - d * 864e5).toISOString().slice(0, 10);
      insH.run(id, day, Math.round(p));
      p = p * (1 - (rnd() - 0.48) * vol * 2);
    }
  });

  if (prod) return;
  // Demo transactions
  const buyer = db.prepare("SELECT id FROM users WHERE email='buyer@demo.test'").get().id;
  const rfq = db.prepare(`INSERT INTO rfqs (ref, buyer_id, category, title, qty, unit, city, needed_by, target_price, notes)
                          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run('RFQ-DEMO1', buyer, 'steel', 'Grade 60 rebar 12–16 mm for 4-storey plaza', 40, 'Ton', 'Lahore', '2026-11-15', 247000, 'Mill test certificate required.').lastInsertRowid;
  const insB = db.prepare('INSERT INTO bids (rfq_id, supplier_id, unit_price, lead_days, notes) VALUES (?, ?, ?, ?, ?)');
  insB.run(rfq, S.margalla, 246500, 4, 'Kamran Grade 60, MTC included, delivery in 2 lots.');
  insB.run(rfq, S.seaport, 249000, 6, 'Amreli 16 mm, rail + road from Karachi.');

  const insO = db.prepare(`INSERT INTO orders (ref, buyer_id, supplier_id, subtotal, freight, total, payment_method, payment_status, status, delivery_city, address, delivery_date, vehicle, due_date)
                           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const insI = db.prepare('INSERT INTO order_items (order_id, product_id, description, qty, unit, unit_price) VALUES (?, ?, ?, ?, ?, ?)');
  const insE = db.prepare('INSERT INTO order_events (order_id, status, note, at) VALUES (?, ?, ?, ?)');
  const o1 = insO.run('ZR-DEMO01', buyer, S.punjab, 500 * 1635, 18000, 500 * 1635 + 18000, 'credit', 'due', 'dispatched', 'Lahore', 'Plot 21, DHA Phase 9', '2026-10-30', 'LES-4471 · Mazda 6T', '2026-11-28').lastInsertRowid;
  insI.run(o1, 1, 'Bestway Cement (OPC)', 500, 'Bag (50 kg)', 1635);
  insE.run(o1, 'placed', 'Order placed on Zarea Credit (30 days)', '2026-10-26 10:12:00');
  insE.run(o1, 'confirmed', 'Supplier confirmed stock', '2026-10-26 11:40:00');
  insE.run(o1, 'dispatched', 'Loaded on LES-4471 · driver +92 300 0000000', '2026-10-28 08:05:00');
  const o2 = insO.run('ZR-DEMO02', buyer, S.indus, 300 * 1130, 9000, 300 * 1130 + 9000, 'escrow', 'paid', 'delivered', 'Lahore', 'Sundar Industrial Estate', '2026-10-20', 'MNA-882 · 10-wheeler', null).lastInsertRowid;
  insI.run(o2, 15, 'Rice Husk', 300, 'Maund (40 kg)', 1130);
  insE.run(o2, 'placed', 'Paid into escrow', '2026-10-17 09:00:00');
  insE.run(o2, 'confirmed', null, '2026-10-17 12:00:00');
  insE.run(o2, 'dispatched', 'Loaded MNA-882', '2026-10-19 07:30:00');
  insE.run(o2, 'delivered', 'POD signed; escrow released to supplier', '2026-10-20 15:20:00');
  db.prepare('INSERT INTO reviews (order_id, supplier_id, rating, comment) VALUES (?, ?, ?, ?)').run(o2, S.indus, 5, 'Dry husk, on time.');

  db.prepare(`INSERT INTO credit_applications (ref, user_id, company_type, industry, commodity, amount, term_days, monthly_turnover, years_in_business, score, status, approved_limit)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run('CR-DEMO1', buyer, 'Private Limited Company', 'Construction', 'cement', 2500000, 30, 12000000, 6, 78, 'approved', 2500000);
  db.prepare("INSERT INTO supplier_applications (name, supplier_type, phone, email, city, commodity, brand) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run('Chakwal Crush Co (demo)', 'Traders', '+92 300 0000099', 'crush@example.com', 'Chakwal', 'building-and-finishing', null);
  db.prepare("INSERT INTO leads (kind, name, phone, email, product, qty, city, message) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .run('quote', 'Bilal (demo)', '+92 300 0000098', 'bilal@example.com', 'Ready Mix Concrete 4000 PSI', '60 m³', 'Lahore', 'Pour on 5 Nov, pump required.');
}

export function openDb(path, { reset = false } = {}) {
  if (reset && existsSync(path)) rmSync(path);
  mkdirSync(dirname(path), { recursive: true });
  const fresh = !existsSync(path);
  const db = new DatabaseSync(path);
  db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');
  db.exec(SCHEMA);
  if (fresh) seed(db);
  return db;
}
