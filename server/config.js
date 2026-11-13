/**
 * Konfigurasi efektif server. Dibaca dari environment (+ .env opsional).
 */
import { loadDotEnv } from './env.js';

loadDotEnv('.env');

const AGENTS = ['exitbot', 'lpwatcher', 'alert', 'portfolio'];

/**
 * @param {string} v
 * @param {number} fallback
 */
function num(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/**
 * Bangun objek konfigurasi dan validasi ringan saat boot.
 * @returns {import('./config-types.js').AppConfig | any}
 */
export function loadConfig() {
  const env = process.env;
  const agents = {};
  for (const id of AGENTS) {
    const p = id.toUpperCase();
    const mode = (env[`${p}_MODE`] || 'dummy').toLowerCase();
    agents[id] = {
      id,
      mode: ['dummy', 'http', 'file'].includes(mode) ? mode : 'dummy',
      url: env[`${p}_URL`] || '',
      file: env[`${p}_FILE`] || '',
      apiKey: env[`${p}_API_KEY`] || '',
      pollMs: num(env[`${p}_POLL_MS`], 5000),
    };
  }
  const advisorMode = (env.ADVISOR_MODE || 'rules').toLowerCase();
  return {
    port: num(env.PORT, 8765),
    host: env.HOST || '127.0.0.1',
    logLevel: env.LOG_LEVEL || 'info',
    assetsDir: env.ASSETS_DIR || './assets_ready',
    basicUser: env.BASIC_AUTH_USER || '',
    basicPass: env.BASIC_AUTH_PASS || '',
    staleAfterSec: num(env.STALE_AFTER_SEC, 120),
    demoControls: (env.DEMO_CONTROLS || 'true').toLowerCase() === 'true',
    demoSeed: Number(env.DEMO_SEED ?? 42),
    demoSpeed: num(env.DEMO_SPEED, 1),
    agents,
    advisorMode: ['rules', 'llm'].includes(advisorMode) ? advisorMode : 'rules',
    openrouterKey: env.OPENROUTER_API_KEY || '',
    openrouterModel: env.OPENROUTER_MODEL || 'nvidia/nemotron-3.5-lightning:free',
    advisorMaxTokens: num(env.ADVISOR_MAX_TOKENS, 1536),
    version: '0.1.0',
  };
}

/**
 * Cetak tabel mode efektif (tanpa rahasia apa pun).
 * @param {any} config
 * @param {(...a: any[]) => void} log
 */
export function printConfigTable(config, log) {
  log('Konfigurasi agen efektif:');
  for (const id of Object.keys(config.agents)) {
    const a = config.agents[id];
    let extra = '';
    if (a.mode === 'http') extra = a.url ? '(URL diset, disembunyikan)' : '(URL KOSONG -> offline)';
    if (a.mode === 'file') extra = a.file ? '(FILE diset)' : '(FILE KOSONG -> offline)';
    log(`  - ${id}: mode=${a.mode} pollMs=${a.pollMs} ${extra}`);
  }
  log(`  - advisor=${config.advisorMode} demoControls=${config.demoControls} seed=${config.demoSeed} speed=${config.demoSpeed}`);
}
