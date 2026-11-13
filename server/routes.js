/**
 * Route REST (hanya baca; satu-satunya POST: /api/portfolio/ask dan /api/demo/trigger).
 * @param {any} app fastify
 * @param {{ config: any, store: any, boss: any }} deps
 */
export function registerRoutes(app, { config, store, boss }) {
  app.get('/api/health', async () => ({ ok: true, uptime: process.uptime(), version: config.version }));

  app.get('/api/state', async () => ({
    agents: store.getAllSnapshots(),
    meta: sanitizeMeta(store.getMeta(), config),
    boss: boss.get(),
    events: store.getEvents(50),
    serverTime: new Date().toISOString(),
    advisorMode: config.advisorMode,
    demoControls: config.demoControls,
    authEnabled: !!(config.basicUser && config.basicPass),
  }));

  app.get('/api/agents/:id', async (req, reply) => {
    const { id } = req.params;
    const snap = store.getSnapshot(id);
    if (!snap) return reply.code(404).send({ error: 'Agen tidak dikenal' });
    return { snapshot: snap, events: store.getAllEvents().filter((e) => e.agentId === id).slice(-20).reverse() };
  });

  app.get('/api/events', async (req) => {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    return { events: store.getEvents(limit) };
  });

  app.get('/api/portfolio/advice', async () => {
    const snap = store.getSnapshot('portfolio');
    if (!snap) return { advice: [] };
    const { getAdvisor } = await import('./services/advisor/index.js');
    return { advice: getAdvisor({ advisorMode: config.advisorMode, anthropicKey: config.anthropicKey }).advise(snap) };
  });

  app.post('/api/portfolio/ask', async (req, reply) => {
    const { questionId } = req.body || {};
    const { getAdvisor, QUESTIONS } = await import('./services/advisor/index.js');
    if (!QUESTIONS.includes(questionId)) return reply.code(400).send({ error: 'questionId tidak dikenal' });
    const snap = store.getSnapshot('portfolio');
    if (!snap) return reply.code(503).send({ error: 'Snapshot portfolio belum ada' });
    try {
      const { text } = getAdvisor({ advisorMode: config.advisorMode, anthropicKey: config.anthropicKey }).answer(questionId, snap);
      return { questionId, text };
    } catch (err) {
      return reply.code(500).send({ error: err && err.message ? err.message : 'Gagal menjawab' });
    }
  });

  app.post('/api/demo/trigger', async (req, reply) => {
    if (!config.demoControls) return reply.code(404).send({ error: 'Demo controls nonaktif' });
    const { action } = req.body || {};
    const valid = ['new_coin', 'lp_out', 'close_profit', 'close_loss', 'bot_offline', 'daily_report', 'big_expense'];
    if (!valid.includes(action)) return reply.code(400).send({ error: 'action tidak dikenal' });
    if (demoThrottled(req.ip, action)) return reply.code(429).send({ error: 'Terlalu sering, coba lagi sebentar' });
    const { hasAnyDummy } = await import('./adapters/index.js');
    const { triggerDemo } = await import('./adapters/dummy/engine.js');
    if (!hasAnyDummy(config)) return reply.code(404).send({ error: 'Tidak ada agen dummy' });
    const r = triggerDemo(action);
    if (!r.handled) return reply.code(400).send({ error: 'Aksi tidak ditangani agen dummy mana pun' });
    return { ok: true, action };
  });
}

/**
 * Throttle demo: maks 1 aksi sama per IP per detik (anti spam ganda).
 * @param {string} ip
 * @param {string} action
 */
const demoHits = new Map();
const DEMO_MIN_MS = 1000;
export function demoThrottled(ip, action) {
  if (demoHits.size > 500) demoHits.clear();
  const key = `${ip || '?'}:${action}`;
  const now = Date.now();
  if (now - (demoHits.get(key) || 0) < DEMO_MIN_MS) return true;
  demoHits.set(key, now);
  return false;
}

/**
 * Meta untuk /api/state: JANGAN bocorkan URL/file path/API key.
 */
function sanitizeMeta(meta, config) {
  const out = {};
  for (const [id, m] of Object.entries(meta)) {
    out[id] = { mode: config.agents[id] ? config.agents[id].mode : m.mode, status: m.status, lastOkAt: m.lastOkAt, lastError: m.lastError };
  }
  // Pastikan semua agen ada walau adapter belum publish
  for (const id of Object.keys(config.agents)) {
    if (!out[id]) out[id] = { mode: config.agents[id].mode, status: 'offline', lastOkAt: null, lastError: null };
  }
  return out;
}
