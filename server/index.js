/**
 * Entry point server Agent Dorm.
 */
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import fastifyWs from '@fastify/websocket';
import fastifyBasicAuth from '@fastify/basic-auth';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { loadConfig, printConfigTable } from './config.js';
import { createStore } from './store.js';
import { buildAdapters } from './adapters/index.js';
import { registerRoutes } from './routes.js';
import { registerWs } from './ws.js';
import { createBossController } from './services/boss-controller.js';
import { createReportDirector } from './services/report-director.js';
import { startReportScheduler } from './services/report-scheduler.js';

const config = loadConfig();
const log = (...a) => {
  if (config.logLevel !== 'silent') console.log(...a);
};

const app = Fastify({ logger: false });

// Header keamanan manual
app.addHook('onSend', async (req, reply, payload) => {
  reply.header('Content-Security-Policy', "default-src 'self'; img-src 'self' data:; connect-src 'self' ws: wss:; style-src 'self'; script-src 'self'");
  reply.header('X-Content-Type-Options', 'nosniff');
  reply.header('Referrer-Policy', 'no-referrer');
  return payload;
});

// Basic auth opsional (lindungi semuanya)
if (config.basicUser && config.basicPass) {
  await app.register(fastifyBasicAuth, {
    validate: async (user, pass) => {
      if (user !== config.basicUser || pass !== config.basicPass) throw new Error('Unauthorized');
    },
  });
  app.addHook('onRequest', app.basicAuth);
} else if (config.host !== '127.0.0.1' && config.host !== 'localhost' && config.host !== '::1') {
  console.warn('⚠️  PERINGATAN KERAS: HOST bukan loopback dan basic auth TIDAK diset. Siapa pun bisa membuka dashboard ini!');
}

await app.register(fastifyWs);

// --- Bos + sutradara laporan: satu cue presentasi dalam satu waktu ---
const boss = createBossController();
const director = createReportDirector({ playBoss: (r, m) => boss.play(r, m) });
// Idle tick tiap 30-60 dtk, hanya saat tak ada cue main/antre.
(function idleLoop() {
  setTimeout(() => {
    if (director.isIdle()) boss.idleTick();
    idleLoop();
  }, 30000 + Math.random() * 30000);
})();

const store = createStore();

// Adapter: ctx push
const adapters = buildAdapters(config);
for (const ad of adapters) {
  const mode = config.agents[ad.id] ? config.agents[ad.id].mode : ad.mode;
  const ctx = {
    publishSnapshot: (id, snap) => store.publishSnapshot(id, snap, { mode }),
    publishEvent: (e) => store.publishEvent(e),
    log: (m) => log(String(m).replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')),
  };
  try {
    ad.start(ctx);
  } catch (err) {
    log(`[${ad.id}] gagal start: ${err && err.message ? err.message : err}`);
    store.markOffline(ad.id, 'Gagal start adapter', mode);
  }
}

registerRoutes(app, { config, store, boss });
registerWs(app, { store, boss, director });

// Mode http/file tidak mengirim report_ready: terbitkan dari advisor
// (nada selalu dari fungsi yang sama). Mode dummy punya jadwal sendiri.
if (config.agents.portfolio.mode !== 'dummy') {
  startReportScheduler(store, { advisorMode: config.advisorMode, anthropicKey: config.anthropicKey });
}

// Global error handler: JSON {error} tanpa stack
app.setErrorHandler((err, req, reply) => {
  const code = err.statusCode && err.statusCode >= 400 ? err.statusCode : 500;
  reply.code(code).send({ error: code === 401 ? 'Butuh autentikasi' : err.message || 'Kesalahan server' });
});

// Static: /assets + frontend
const assetsDir = path.resolve(config.assetsDir);
const assetsOk = existsSync(assetsDir) && existsSync(path.join(assetsDir, 'assets.json'));
if (!assetsOk) {
  log(`[aset] ERROR: folder aset tidak ditemukan di ${assetsDir} — halaman error ramah akan ditayangkan.`);
}
await app.register(fastifyStatic, { root: path.resolve('public'), prefix: '/' });
if (assetsOk) {
  await app.register(fastifyStatic, { root: assetsDir, prefix: '/assets/', decorateReply: false });
}

// Halaman error ramah kalau aset hilang
app.get('/', async (req, reply) => {
  if (!assetsOk) {
    return reply.type('text/html').send('<html><body style="font-family:sans-serif;background:#0b0b12;color:#fff;padding:40px"><h1>Agent Dorm belum bisa tampil</h1><p>Folder <code>assets_ready</code> tidak ditemukan atau <code>assets.json</code> hilang. Letakkan folder <code>assets_ready</code> di root proyek lalu restart.</p></body></html>');
  }
  return reply.sendFile('index.html');
});

// Manifest untuk frontend (agar tak hardcode ukuran)
app.get('/api/manifest', async (req, reply) => {
  if (!assetsOk) return reply.code(503).send({ error: 'Aset tidak tersedia' });
  try {
    const raw = await readFile(path.join(assetsDir, 'assets.json'), 'utf8');
    return JSON.parse(raw);
  } catch {
    return reply.code(500).send({ error: 'Gagal membaca manifest' });
  }
});

printConfigTable(config, log);

const shutdown = async () => {
  log('Mematikan server...');
  try {
    for (const ad of adapters) {
      try {
        ad.stop();
      } catch {
        /* abaikan */
      }
    }
    await app.close();
  } finally {
    process.exit(0);
  }
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

try {
  await app.listen({ port: config.port, host: config.host });
  log(`Agent Dorm jalan di http://${config.host}:${config.port}`);
} catch (err) {
  console.error(err);
  process.exit(1);
}
