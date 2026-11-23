// Registre des artistes - serveur sans dépendance : site statique + API de registre partagé.
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = path.join(__dirname, 'public');
const DATA_DIR = process.env.DATA_DIR || process.env.RAILWAY_VOLUME_MOUNT_PATH || path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'registre.json');
const ADMIN = process.env.ADMIN_PASSWORD || '';
const PERSISTENT = !(process.env.RAILWAY_ENVIRONMENT && !process.env.DATA_DIR && !process.env.RAILWAY_VOLUME_MOUNT_PATH);
const MAX_BODY = 5 * 1024 * 1024;

const types = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json',
  '.mp3': 'audio/mpeg', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.webp': 'image/webp'
};

// ---------- Données ----------
let db = { artistes: [], oeuvres: [], rev: 0 };
fs.mkdirSync(DATA_DIR, { recursive: true });
try {
  const d = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  db = { artistes: Array.isArray(d.artistes) ? d.artistes : [], oeuvres: Array.isArray(d.oeuvres) ? d.oeuvres : [], rev: Number(d.rev) || 0 };
} catch (e) { /* premier démarrage */ }

function persist() {
  const tmp = DATA_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db));
  fs.renameSync(tmp, DATA_FILE);
}

const str = (v, n) => String(v == null ? '' : v).slice(0, n);
function clean(b) {
  if (!b || !Array.isArray(b.artistes) || !Array.isArray(b.oeuvres)) return null;
  if (b.artistes.length > 5000 || b.oeuvres.length > 20000) return null;
  const artistes = b.artistes.map(p => {
    p = p || {};
    return {
      id: str(p.id, 40), name: str(p.name, 60), field: str(p.field, 60),
      points: Math.max(0, Math.min(1e7, parseInt(p.points, 10) || 0)),
      history: (Array.isArray(p.history) ? p.history : []).slice(-2000).map(e => {
        e = e || {};
        return { t: Number(e.t) || 0, d: parseInt(e.d, 10) || 0, c: str(e.c, 1000), after: parseInt(e.after, 10) || 0, g: str(e.g, 200) };
      })
    };
  }).filter(p => p.id && p.name);
  const oeuvres = b.oeuvres.map(o => {
    o = o || {};
    return { id: str(o.id, 40), t: Number(o.t) || 0, title: str(o.title, 100), artist: str(o.artist, 60), type: str(o.type, 30), date: str(o.date, 10), desc: str(o.desc, 3000) };
  }).filter(o => o.id && o.title);
  return { artistes, oeuvres };
}

// ---------- Authentification gardien ----------
const sha = s => crypto.createHash('sha256').update(String(s)).digest();
const okKey = k => !!ADMIN && crypto.timingSafeEqual(sha(k || ''), sha(ADMIN));
const fails = new Map();
const ipOf = req => (String(req.headers['x-forwarded-for'] || '').split(',')[0].trim()) || req.socket.remoteAddress || '?';
function blocked(ip) { const f = fails.get(ip); return !!f && f.n >= 10 && Date.now() - f.t < 600000; }
function fail(ip) { const f = fails.get(ip); if (!f || Date.now() - f.t >= 600000) fails.set(ip, { n: 1, t: Date.now() }); else f.n++; }

function json(res, code, obj) {
  const b = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Length': Buffer.byteLength(b) });
  res.end(b);
}
function readBody(req, res, cb) {
  let size = 0; const chunks = [];
  req.on('data', c => {
    size += c.length;
    if (size > MAX_BODY) { json(res, 413, { error: 'trop_gros' }); req.destroy(); return; }
    chunks.push(c);
  });
  req.on('end', () => { try { cb(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch (e) { json(res, 400, { error: 'json_invalide' }); } });
}

function api(req, res, p) {
  const ip = ipOf(req);
  if (p === '/api/data' && req.method === 'GET') {
    return json(res, 200, { artistes: db.artistes, oeuvres: db.oeuvres, rev: db.rev, persistent: PERSISTENT });
  }
  if (p === '/api/login' && req.method === 'POST') {
    if (!ADMIN) return json(res, 503, { error: 'pas_de_mot_de_passe' });
    if (blocked(ip)) return json(res, 429, { error: 'trop_de_tentatives' });
    return readBody(req, res, b => {
      if (okKey(b && b.password)) return json(res, 200, { ok: true });
      fail(ip); json(res, 401, { error: 'mot_de_passe_incorrect' });
    });
  }
  if (p === '/api/data' && req.method === 'PUT') {
    if (!ADMIN) return json(res, 503, { error: 'pas_de_mot_de_passe' });
    if (blocked(ip)) return json(res, 429, { error: 'trop_de_tentatives' });
    if (!okKey(req.headers['x-admin-key'])) { fail(ip); return json(res, 401, { error: 'non_autorise' }); }
    return readBody(req, res, b => {
      if (!b || typeof b.rev !== 'number' || b.rev !== db.rev) return json(res, 409, { error: 'conflit', rev: db.rev });
      const c = clean(b);
      if (!c) return json(res, 400, { error: 'donnees_invalides' });
      db = { artistes: c.artistes, oeuvres: c.oeuvres, rev: db.rev + 1 };
      try { persist(); } catch (e) { console.error('Ecriture impossible :', e.message); return json(res, 500, { error: 'ecriture' }); }
      json(res, 200, { rev: db.rev });
    });
  }
  json(res, 404, { error: 'introuvable' });
}

// ---------- Fichiers statiques ----------
function serveStatic(req, res, p) {
  if (p.endsWith('/')) p += 'index.html';
  const f = path.normalize(path.join(root, p));
  if (!f.startsWith(root + path.sep)) { res.writeHead(403); return res.end('Interdit'); }
  fs.stat(f, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('Introuvable'); }
    const ext = path.extname(f).toLowerCase();
    const h = {
      'Content-Type': types[ext] || 'application/octet-stream',
      'Accept-Ranges': 'bytes',
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=300'
    };
    // Les requêtes Range sont nécessaires à la lecture audio sur Safari/iOS.
    const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
    if (m && (m[1] || m[2])) {
      let s, e;
      if (m[1] === '') { s = Math.max(0, st.size - parseInt(m[2], 10)); e = st.size - 1; }
      else { s = parseInt(m[1], 10); e = m[2] === '' ? st.size - 1 : Math.min(parseInt(m[2], 10), st.size - 1); }
      if (s > e || s >= st.size) { res.writeHead(416, { 'Content-Range': 'bytes */' + st.size }); return res.end(); }
      res.writeHead(206, Object.assign(h, { 'Content-Range': `bytes ${s}-${e}/${st.size}`, 'Content-Length': e - s + 1 }));
      return fs.createReadStream(f, { start: s, end: e }).pipe(res);
    }
    res.writeHead(200, Object.assign(h, { 'Content-Length': st.size }));
    fs.createReadStream(f).pipe(res);
  });
}

http.createServer((req, res) => {
  let p;
  try { p = decodeURIComponent(new URL(req.url, 'http://x').pathname); }
  catch (e) { res.writeHead(400); return res.end(); }
  if (p === '/health') { res.writeHead(200, { 'Content-Type': 'text/plain' }); return res.end('ok'); }
  if (p.startsWith('/api/')) return api(req, res, p);
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
  serveStatic(req, res, p);
}).listen(process.env.PORT || 3000, '0.0.0.0', () => {
  console.log('Registre des artistes en ligne. Données :', DATA_FILE);
  if (!ADMIN) console.warn('ATTENTION : ADMIN_PASSWORD n\'est pas défini, personne ne pourra modifier le registre.');
  if (!PERSISTENT) console.warn('ATTENTION : aucun volume Railway détecté, les données seront perdues à chaque déploiement.');
});
