// Taitech Market server: zero dependencies. Run with: node server.js
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const PORT = process.env.PORT || 3000;
const DB_FILE = process.env.DB_FILE || path.join(__dirname, 'data', 'db.json');
const TOWNS = { Juba: 3000, Wau: 6000, Malakal: 7000, Yei: 4500, Bor: 5000, Torit: 5500, Yambio: 6500, Rumbek: 6000, Aweil: 7000, Bentiu: 8000 };

const ensureDbDir = () => {
  const dir = path.dirname(DB_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
};

let db;
try { ensureDbDir(); db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); }
catch { ensureDbDir(); db = { secret: crypto.randomBytes(32).toString('hex'), users: [], orders: [], products: JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'seed.json'), 'utf8')) }; save(); }
function save() { ensureDbDir(); fs.writeFileSync(DB_FILE + '.tmp', JSON.stringify(db)); fs.renameSync(DB_FILE + '.tmp', DB_FILE); }

const hash = (pw, salt) => crypto.scryptSync(pw, salt, 32).toString('hex');
const sign = s => crypto.createHmac('sha256', db.secret).update(s).digest('hex');
const makeToken = id => { const b = id + '.' + (Date.now() + 30 * 864e5); return b + '.' + sign(b); };
function auth(req) {
  const [id, exp, sig] = (req.headers.authorization || '').replace('Bearer ', '').split('.');
  if (!sig || sig !== sign(id + '.' + exp) || Date.now() > +exp) return null;
  return db.users.find(u => u.id === id) || null;
}
const pub = u => ({ id: u.id, name: u.name, phone: u.phone, business: u.business });
const fail = (code, msg) => Object.assign(new Error(msg), { code });
const clean = (s, n = 80) => String(s || '').trim().slice(0, n);

// Payment hook: replace with the MTN MoMo "requestToPay" / Digicash merchant API call.
async function requestPayment(order) { return { status: order.pm === 'Cash on delivery' ? 'cod' : 'pending' }; }

const routes = {
  'POST /api/register': async (b) => {
    const phone = String(b.phone || '').replace(/[^\d+]/g, '');
    if (phone.replace(/\D/g, '').length < 9 || String(b.password || '').length < 6 || !clean(b.name)) throw fail(400, 'Name, phone (9+ digits) and password (6+ characters) are required');
    if (db.users.some(u => u.phone === phone)) throw fail(409, 'Phone number already registered');
    const salt = crypto.randomBytes(16).toString('hex');
    const u = { id: 'u' + crypto.randomBytes(5).toString('hex'), name: clean(b.name), phone, business: clean(b.business), salt, hash: hash(b.password, salt) };
    db.users.push(u); save();
    return { token: makeToken(u.id), user: pub(u) };
  },
  'POST /api/login': async (b) => {
    const phone = String(b.phone || '').replace(/[^\d+]/g, '');
    const u = db.users.find(x => x.phone === phone);
    if (!u || hash(String(b.password || ''), u.salt) !== u.hash) throw fail(401, 'Wrong phone or password');
    return { token: makeToken(u.id), user: pub(u) };
  },
  'GET /api/products': async () => db.products,
  'POST /api/products': async (b, u) => {
    if (!u) throw fail(401, 'Sign in first');
    if (!u.business) throw fail(403, 'Add a business name to your account to sell');
    const price = +b.price, bp = +b.bulkPrice || 0, bm = +b.bulkMin || 0;
    if (!clean(b.name) || !(price > 0) || !(+b.stock >= 0)) throw fail(400, 'Name, price and stock are required');
    if (bp && (bp >= price || bm < 2)) throw fail(400, 'Bulk price must be lower than the normal price and bulk quantity at least 2');
    db.products.push({ id: 'c' + Date.now(), name: clean(b.name), cat: clean(b.cat, 30), icon: 'ðŸ“¦', price, bulkPrice: bp, bulkMin: bp ? bm : 0, supplier: u.business, stock: Math.floor(+b.stock) });
    save(); return { ok: true };
  },
  'POST /api/stock/:id': async (b, u, p) => {
    const pr = db.products.find(x => x.id === p.id);
    if (!u || !pr || pr.supplier !== u.business) throw fail(403, 'Not your product');
    pr.stock = Math.max(0, Math.floor(+b.n || 0)); save(); return { ok: true };
  },
  'GET /api/orders': async (b, u) => {
    if (!u) throw fail(401, 'Sign in first');
    return db.orders.filter(o => o.buyer === u.id || (u.business && o.items.some(i => i.s === u.business))).sort((a, c) => c.placed - a.placed);
  },
  'POST /api/orders': async (b, u) => {
    if (!u) throw fail(401, 'Sign in first');
    if (!(b.town in TOWNS) || !clean(b.nm) || !clean(b.ad) || !Array.isArray(b.items) || !b.items.length) throw fail(400, 'Missing order details');
    let sub = 0; const items = [];
    for (const it of b.items) {
      const p = db.products.find(x => x.id === it.id), q = Math.floor(+it.q);
      if (!p || !(q > 0)) throw fail(400, 'Unknown item');
      if (q > p.stock) throw fail(409, 'Not enough stock: ' + p.name);
      sub += (p.bulkMin && q >= p.bulkMin ? p.bulkPrice : p.price) * q;
      items.push({ id: p.id, n: p.name, q, s: p.supplier });
    }
    items.forEach(i => { db.products.find(x => x.id === i.id).stock -= i.q; });
    const o = { id: 'TM' + Date.now().toString().slice(-7), buyer: u.id, date: new Date().toLocaleDateString('en-GB'), placed: Date.now(), status: 0, town: b.town, nm: clean(b.nm), ph: clean(b.ph, 20), ad: clean(b.ad, 120), pm: clean(b.pm, 30), tx: clean(b.tx, 40), total: sub + TOWNS[b.town], items };
    o.payment = (await requestPayment(o)).status;
    db.orders.push(o); save(); return { id: o.id, total: o.total };
  },
  'POST /api/orders/:id/status': async (b, u, p) => {
    const o = db.orders.find(x => x.id === p.id);
    if (!u || !o || !u.business || !o.items.some(i => i.s === u.business)) throw fail(403, 'Not your order');
    o.status = Math.min(3, Math.max(0, +b.status || 0)); save(); return { ok: true };
  }
};

function match(method, url) {
  for (const key in routes) {
    const [m, pattern] = key.split(' ');
    if (m !== method) continue;
    const a = pattern.split('/'), b = url.split('/');
    if (a.length !== b.length) continue;
    const params = {};
    if (a.every((seg, i) => seg[0] === ':' ? (params[seg.slice(1)] = decodeURIComponent(b[i]), true) : seg === b[i])) return { fn: routes[key], params };
  }
}
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.css': 'text/css' };

http.createServer(async (req, res) => {
  const url = req.url.split('?')[0];
  if (url.startsWith('/api/')) {
    const m = match(req.method, url), send = (c, d) => { res.writeHead(c, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(d)); };
    if (!m) return send(404, { error: 'Not found' });
    let raw = ''; for await (const ch of req) { raw += ch; if (raw.length > 1e5) return send(413, { error: 'Too large' }); }
    try { send(200, await m.fn(raw ? JSON.parse(raw) : {}, auth(req), m.params)); }
    catch (e) { send(e.code || 400, { error: e.code ? e.message : 'Bad request' }); }
    return;
  }
  const file = path.join(__dirname, 'public', url === '/' ? 'index.html' : url);
  if (!file.startsWith(path.join(__dirname, 'public'))) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' }); res.end(data);
  });
}).listen(PORT, () => console.log('Taitech Market running at http://localhost:' + PORT));

