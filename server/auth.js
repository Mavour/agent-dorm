import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const COOKIE = 'dorm_session';
const REMEMBER_MS = 30 * 86400000;
const SESSION_MS = 8 * 3600000;
const PUBLIC_FILES = new Set(['/login', '/login.html', '/css/login.css', '/js/login.js', '/assets/background.jpg', '/assets/sprites/boss/bos.png', '/assets/sprites/exit-bot.png', '/assets/sprites/lp-watcher.png', '/assets/sprites/bot-alert.png', '/assets/sprites/pengelola-porto.png']);
const digest = (value) => createHash('sha256').update(value).digest('hex');

/** Persistent opaque sessions. Only hashes reach disk; credentials stay in .env. */
export function registerAuth(app, config, { sessionFile = path.resolve('.data/auth-sessions.json'), now = Date.now } = {}) {
  const enabled = !!(config.basicUser && config.basicPass);
  const sessions = new Map();
  const tickets = new Map();
  const failures = new Map();
  const logoutListeners = new Set();
  app.decorateRequest('dormSessionId', null);
  let salt;
  let credentialTag;

  function save() {
    const current = now();
    for (const [id, expires] of sessions) if (expires <= current) sessions.delete(id);
    try {
      mkdirSync(path.dirname(sessionFile), { recursive: true, mode: 0o700 });
      const temp = `${sessionFile}.${randomBytes(6).toString('hex')}.tmp`;
      writeFileSync(temp, JSON.stringify({ version: 1, salt, credentialTag, sessions: [...sessions].map(([id, expires]) => ({ id, expires })) }), { mode: 0o600, flag: 'wx' });
      renameSync(temp, sessionFile);
    } catch {
      throw new Error('Sesi login belum bisa disimpan. Periksa izin folder .data.');
    }
  }

  if (enabled) {
    let saved = null;
    if (existsSync(sessionFile)) {
      try {
        saved = JSON.parse(readFileSync(sessionFile, 'utf8'));
        if (saved.version !== 1 || !/^[a-f0-9]{32}$/.test(saved.salt) || !Array.isArray(saved.sessions)) throw new Error();
      } catch { throw new Error('Penyimpanan sesi login rusak; akses tetap terkunci.'); }
    }
    salt = saved?.salt || randomBytes(16).toString('hex');
    credentialTag = scryptSync(`${config.basicUser}\0${config.basicPass}`, salt, 32).toString('hex');
    if (saved?.credentialTag === credentialTag) {
      for (const row of saved.sessions.slice(-256)) {
        if (/^[a-f0-9]{64}$/.test(row.id) && Number.isSafeInteger(row.expires) && row.expires > now() && row.expires <= now() + REMEMBER_MS) sessions.set(row.id, row.expires);
      }
    }
    save();
  }

  function sessionId(req) {
    const cookie = (req.headers.cookie || '').split(';').map((v) => v.trim()).find((v) => v.startsWith(`${COOKIE}=`));
    const value = cookie?.slice(COOKIE.length + 1);
    if (!value || !/^[A-Za-z0-9_-]{43}$/.test(value)) return null;
    const id = digest(value);
    return sessions.get(id) > now() ? id : null;
  }
  function sameOrigin(req) {
    if (req.headers['sec-fetch-site'] === 'cross-site') return false;
    if (!req.headers.origin) return true; // CLI clients do not send Origin.
    try {
      const origin = new URL(req.headers.origin);
      return ['http:', 'https:'].includes(origin.protocol) && origin.origin === new URL(`${origin.protocol}//${req.headers.host}`).origin;
    } catch { return false; }
  }
  function cookieValue(req, value, maxAge) {
    const secure = req.protocol === 'https' || req.headers['x-forwarded-proto']?.split(',')[0].trim() === 'https';
    // Keep the session on top-level links/bookmarks from another site.
    // Cross-origin writes are still rejected by sameOrigin().
    return `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}${maxAge === undefined ? '' : `; Max-Age=${maxAge}`}`;
  }

  app.addHook('onRequest', async (req, reply) => {
    if (!enabled) return;
    const pathname = req.url.split('?')[0];
    const upgrade = req.headers.upgrade?.toLowerCase() === 'websocket';
    if (upgrade) {
      if (!sameOrigin(req)) return reply.code(403).send({ error: 'Asal permintaan tidak diizinkan' });
      const protocols = (req.headers['sec-websocket-protocol'] || '').split(',').map((v) => v.trim());
      const value = protocols[0] === 'agent-dorm' && protocols.length === 2 ? protocols[1] : null;
      const ticket = tickets.get(value);
      tickets.delete(value);
      if (ticket?.expires > now() && sessions.get(ticket.session) > now()) {
        req.dormSessionId = ticket.session;
        return;
      }
      return reply.code(403).send({ error: 'Sesi realtime tidak valid' });
    }
    if (PUBLIC_FILES.has(pathname) || pathname === '/api/auth/login') return;
    const id = sessionId(req);
    if (!id) {
      reply.header('Cache-Control', 'no-store');
      if (req.method === 'GET' && (pathname === '/' || pathname === '/index.html')) return reply.redirect('/login');
      return reply.code(401).send({ error: 'Silakan masuk ke Dorm', loginUrl: '/login' });
    }
    req.dormSessionId = id;
    if (pathname.startsWith('/api/') || pathname === '/' || pathname === '/index.html') reply.header('Cache-Control', 'no-store');
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && !sameOrigin(req)) return reply.code(403).send({ error: 'Asal permintaan tidak diizinkan' });
  });

  app.get('/login', async (req, reply) => {
    reply.header('Cache-Control', 'no-store');
    if (!enabled || sessionId(req)) return reply.redirect('/');
    return reply.sendFile('login.html');
  });
  app.post('/api/auth/login', { bodyLimit: 4096 }, async (req, reply) => {
    reply.header('Cache-Control', 'no-store');
    if (!enabled) return { ok: true };
    if (!sameOrigin(req)) return reply.code(403).send({ error: 'Asal permintaan tidak diizinkan' });
    const current = now();
    for (const [ip, entry] of failures) if (entry.until <= current) failures.delete(ip);
    const previous = failures.get(req.ip);
    if (previous?.count >= 5) {
      reply.header('Retry-After', String(Math.ceil((previous.until - current) / 1000)));
      return reply.code(429).send({ error: 'Terlalu banyak percobaan. Coba lagi dalam beberapa menit.' });
    }
    const { username, password, remember } = req.body || {};
    const valid = typeof username === 'string' && typeof password === 'string' && username.length <= 200 && password.length <= 1024
      && timingSafeEqual(Buffer.from(digest(`${username}\0${password}`), 'hex'), Buffer.from(digest(`${config.basicUser}\0${config.basicPass}`), 'hex'));
    if (!valid) {
      if (failures.size >= 1000 && !failures.has(req.ip)) failures.delete(failures.keys().next().value);
      failures.set(req.ip, { count: (previous?.count || 0) + 1, until: previous?.until || current + 300000 });
      return reply.code(401).send({ error: 'Username atau password belum cocok.' });
    }
    failures.delete(req.ip);
    const old = sessionId(req);
    if (old) sessions.delete(old);
    if (sessions.size >= 256) sessions.delete(sessions.keys().next().value);
    const value = randomBytes(32).toString('base64url');
    sessions.set(digest(value), current + (remember === true ? REMEMBER_MS : SESSION_MS));
    save();
    reply.header('Set-Cookie', cookieValue(req, value, remember === true ? REMEMBER_MS / 1000 : undefined));
    return { ok: true };
  });
  app.post('/api/auth/logout', async (req, reply) => {
    const id = req.dormSessionId;
    if (id) {
      sessions.delete(id);
      save();
      for (const listener of logoutListeners) listener(id);
    }
    reply.header('Cache-Control', 'no-store');
    reply.header('Set-Cookie', cookieValue(req, '', 0));
    return { ok: true };
  });
  app.get('/api/ws-ticket', async (req, reply) => {
    reply.header('Cache-Control', 'no-store');
    if (!enabled) return { ticket: null };
    for (const [value, ticket] of tickets) if (ticket.expires <= now()) tickets.delete(value);
    if (tickets.size >= 256) tickets.delete(tickets.keys().next().value);
    const ticket = randomBytes(32).toString('base64url');
    tickets.set(ticket, { expires: now() + 30000, session: req.dormSessionId });
    return { ticket };
  });
  return { enabled, isSessionValid: (id) => !enabled || sessions.get(id) > now(), onLogout: (listener) => logoutListeners.add(listener) };
}
