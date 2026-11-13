import { getAdvisor, QUESTIONS } from './services/advisor/index.js';
import { createKaroConversation } from './services/karo-conversation.js';

/**
 * Route REST (hanya baca; satu-satunya POST: /api/portfolio/ask dan /api/demo/trigger).
 * @param {any} app fastify
 * @param {{ config: any, store: any, boss: any }} deps
 */
export function registerRoutes(app, { config, store, boss, conversation }) {
  const advisor = getAdvisor(config);
  const chat = conversation || createKaroConversation({ advisor, store });
  app.addHook('onClose', () => chat.close());
  app.get('/api/portfolio/history', async (_req, reply) => {
    reply.header('Cache-Control', 'no-store');
    return { messages: chat.list(), aiStatus: advisor.status?.() || { state: 'disabled', reason: 'not_configured' } };
  });
  app.get('/api/health', async () => ({ ok: true, uptime: process.uptime(), version: config.version }));

  app.get('/api/state', async () => ({
    agents: store.getAllSnapshots(),
    meta: sanitizeMeta(store.getMeta(), config),
    boss: boss.get(),
    events: store.getEvents(50),
    serverTime: new Date().toISOString(),
    advisorMode: advisor.mode,
    advisorConfigured: config.advisorMode === 'llm',
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
    return { advice: advisor.advise(snap) };
  });

  app.post('/api/portfolio/ask', { bodyLimit: 8192 }, async (req, reply) => {
    const { questionId, question } = req.body || {};
    const freeText = typeof question === 'string' ? question.trim() : '';
    if (question !== undefined ? (!freeText || freeText.length > 2000 || questionId !== undefined) : !QUESTIONS.includes(questionId)) return reply.code(400).send({ error: 'Pertanyaan tidak valid (maksimal 2000 karakter)' });
    if (question !== undefined && !advisor.chat) return reply.code(503).send({ error: 'Chat AI belum aktif. Isi OPENROUTER_API_KEY di .env server lalu restart Dorm.' });
    if (askThrottled(req.dormSessionId || req.ip)) return reply.code(429).send({ error: 'Tunggu sebentar sebelum bertanya lagi.' });
    const snap = store.getSnapshot('portfolio');
    if (!snap) return reply.code(503).send({ error: 'Snapshot portfolio belum ada' });
    try {
      const result = await chat.ask({ questionId, question: question !== undefined ? freeText : undefined }, snap);
      return { questionId, ...result, source: result.source || 'rules' };
    } catch (error) {
      if (error.statusCode === 429) return reply.code(429).send({ error: error.message });
      return reply.code(500).send({ error: 'Gagal menjawab' });
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

const askHits = new Map();
function askThrottled(key) {
  const now = Date.now();
  for (const [id, at] of askHits) if (now - at >= 1000) askHits.delete(id);
  if (askHits.has(key)) return true;
  if (askHits.size >= 1000) askHits.delete(askHits.keys().next().value);
  askHits.set(key, now);
  return false;
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
