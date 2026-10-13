/**
 * Dummy Bot Alert: kandidat koin fiktif + scan berkala.
 */
import { mulberry32, pick, range, nowIso, eventId, registerDemoHandler, unregisterDemoHandler } from './engine.js';

const POOL = ['NEKOZ', 'RONIN9', 'KATANA', 'SHOGUN', 'MOCHI', 'TANUKI', 'SAKURA', 'ONIGIRI', 'DOJO', 'KABUTO', 'SUMO', 'TOFU'];
const BASES = ['USDC', 'SOL'];
const REASONS = ['Volume naik 3x', 'Likuiditas tebal', 'Holder bertambah', 'Spread rapat', 'Fee APR menarik', 'Usia cukup matang'];
const RISKS = ['Likuiditas tipis', 'Holder terpusat', 'Umur masih muda', 'Volatilitas tinggi'];

/**
 * @param {() => number} rnd
 * @param {number} i
 */
function mint(rnd, i) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ123456789';
  let s = 'DUMMY';
  for (let k = 0; k < 8; k++) s += chars[Math.floor(rnd() * chars.length)];
  return s + i;
}

/**
 * @param {{ seed?: number, speed?: number }} opts
 */
export function createAlertDummy(opts = {}) {
  const rnd = mulberry32((opts.seed ?? 42) + 11);
  const speed = opts.speed ?? 1;
  /** @type {any} */
  let ctx = null;
  let timer = null;
  const timers = [];
  let scanned = 128;
  let used = new Set();
  /** @type {any[]} */
  let candidates = [];

  /** @param {string} symbol @param {number} score */
  function makeCandidate(symbol, score) {
    const base = pick(rnd, BASES);
    const now = Date.now();
    return {
      id: `cand-${symbol}-${now}`,
      symbol,
      pair: `${symbol}/${base}`,
      mint: mint(rnd, Math.floor(rnd() * 999)),
      ageHours: r2(6 + rnd() * 60),
      priceUsd: Number((rnd() * 2 + 0.00001).toPrecision(4)),
      liquidityUsd: Math.round(50000 + rnd() * 400000),
      volume24hUsd: Math.round(100000 + rnd() * 900000),
      fdvUsd: Math.round(500000 + rnd() * 4000000),
      estFeeAprPct: r2(20 + rnd() * 120),
      score,
      reasons: [pick(rnd, REASONS), pick(rnd, REASONS)].filter((v, i, a) => a.indexOf(v) === i),
      riskFlags: rnd() < 0.4 ? [pick(rnd, RISKS)] : [],
      foundAt: new Date(now).toISOString(),
      url: '',
    };
  }

  function seedInitial() {
    const syms = [...POOL].sort(() => rnd() - 0.5).slice(0, 5);
    candidates = syms.map((s) => makeCandidate(s, Math.round(55 + rnd() * 35))).sort((a, b) => b.score - a.score);
    for (const c of candidates) used.add(c.symbol);
  }

  function snapshot() {
    return {
      agentId: 'alert',
      status: offline ? 'offline' : 'ok',
      updatedAt: nowIso(),
      headline: offline ? 'Terputus (mode demo)' : `${candidates.length} kandidat lolos filter`,
      metrics: {
        lastScanAt: nowIso(),
        scannedToday: scanned,
        passedFilters: candidates.length,
        filters: { minLiquidityUsd: 50000, minVolume24hUsd: 100000, maxFdvUsd: 5000000, minAgeHours: 6 },
        candidates: candidates.slice(0, 12),
      },
      alerts: [],
      events: [],
    };
  }

  let offline = false;

  function addCoin(symbol, score) {
    const c = makeCandidate(symbol, score);
    candidates = [c, ...candidates].filter((v, i, a) => a.findIndex((x) => x.symbol === v.symbol) === i).sort((a, b) => b.score - a.score).slice(0, 12);
    if (ctx && !offline) {
      ctx.publishSnapshot('alert', snapshot());
      ctx.publishEvent({
        id: eventId('evt-coin'),
        ts: nowIso(),
        type: 'coin_found',
        level: 'info',
        message: `Ada koin menarik: ${c.symbol} (skor ${c.score})`,
        agentId: 'alert',
        data: { symbol: c.symbol, score: c.score, pair: c.pair },
      });
    }
  }

  function later(ms, fn) {
    timers.push(setTimeout(fn, ms / speed));
  }

  return {
    id: 'alert',
    mode: 'dummy',
    /** @param {any} c */
    start(c) {
      ctx = c;
      seedInitial();
      ctx.publishSnapshot('alert', snapshot());
      timer = setInterval(() => {
        if (offline) return;
        scanned += Math.floor(2 + rnd() * 6);
        if (rnd() < 0.5) {
          const avail = POOL.filter((s) => !used.has(s));
          const sym = avail.length ? pick(rnd, avail) : pick(rnd, POOL);
          used.add(sym);
          const nc = makeCandidate(sym, Math.round(55 + rnd() * 35));
          candidates = [nc, ...candidates].sort((a, b) => b.score - a.score).slice(0, 12);
          ctx.publishEvent({
            id: eventId('evt-coin'),
            ts: nowIso(),
            type: 'coin_found',
            level: 'info',
            message: `Ada koin menarik: ${nc.symbol} (skor ${nc.score})`,
            agentId: 'alert',
            data: { symbol: nc.symbol, score: nc.score, pair: nc.pair },
          });
        }
        ctx.publishSnapshot('alert', snapshot());
      }, 5000 / speed);
      // Showcase: t+8 NEKOZ skor 84; t+80 offline 15 dtk
      later(8000, () => addCoin('NEKOZ', 84));
      later(80000, () => goOffline(15000));
      registerDemoHandler('alert', (action) => {
        if (action === 'new_coin') {
          const avail = POOL.filter((s) => !used.has(s));
          addCoin(avail.length ? avail[0] : pick(rnd, POOL), Math.round(70 + rnd() * 20));
          return { handled: true };
        }
        if (action === 'bot_offline') {
          goOffline(15000);
          return { handled: true };
        }
        return null;
      });
    },
    stop() {
      if (timer) clearInterval(timer);
      for (const t of timers) clearTimeout(t);
      unregisterDemoHandler('alert');
    },
  };

  /** @param {number} ms */
  function goOffline(ms) {
    if (offline) return;
    offline = true;
    ctx.publishSnapshot('alert', snapshot());
    ctx.publishEvent({ id: eventId('evt-off'), ts: nowIso(), type: 'agent_offline', level: 'warn', message: 'Zzz... aku terputus.', agentId: 'alert', data: {} });
    setTimeout(() => {
      offline = false;
      ctx.publishSnapshot('alert', snapshot());
      ctx.publishEvent({ id: eventId('evt-on'), ts: nowIso(), type: 'agent_online', level: 'info', message: 'Aku kembali!', agentId: 'alert', data: {} });
    }, ms / speed);
  }
}

function r2(n) {
  return Math.round(n * 100) / 100;
}
