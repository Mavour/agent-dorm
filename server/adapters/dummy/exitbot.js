/**
 * Dummy ExitBot: 6 posisi dipantau, eksekusi close terjadwal + acak.
 */
import { mulberry32, nowIso, eventId, registerDemoHandler, unregisterDemoHandler } from './engine.js';

const PAIRS = ['SOL/USDC', 'JUP/SOL', 'POPCAT/SOL', 'MEW/USDC', 'BOME/SOL', 'PYTH/USDC'];
const REASONS = ['take_profit', 'stop_loss', 'out_of_range', 'manual'];
const TX = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz123456789';

/**
 * @param {() => number} rnd
 * @param {number} n
 */
function txSig(rnd, n = 12) {
  let s = '';
  for (let i = 0; i < n; i++) s += TX[Math.floor(rnd() * TX.length)];
  return 'DUMMY' + s;
}

/**
 * @param {{ seed?: number, speed?: number }} opts
 */
export function createExitbotDummy(opts = {}) {
  const rnd = mulberry32((opts.seed ?? 42) + 3);
  const speed = opts.speed ?? 1;
  /** @type {any} */
  let ctx = null;
  let timer = null;
  const timers = [];
  let n = 0;

  const past = [
    { pair: 'SOL/USDC', reason: 'take_profit', pnlUsd: 62.4 },
    { pair: 'JUP/SOL', reason: 'stop_loss', pnlUsd: -18.9 },
    { pair: 'BONK/USDC', reason: 'take_profit', pnlUsd: 35.1 },
    { pair: 'WIF/SOL', reason: 'take_profit', pnlUsd: 51.7 },
    { pair: 'PYTH/USDC', reason: 'manual', pnlUsd: 12.0 },
    { pair: 'MEW/USDC', reason: 'stop_loss', pnlUsd: -31.4 },
    { pair: 'BOME/SOL', reason: 'take_profit', pnlUsd: 44.8 },
    { pair: 'POPCAT/SOL', reason: 'out_of_range', pnlUsd: -9.5 },
  ];
  /** @type {any[]} */
  let recent = past.map((p) => ({
    id: `ex-${p.pair}-${p.reason}`,
    ts: new Date(Date.now() - Math.floor(rnd() * 20 + 2) * 3600 * 1000).toISOString(),
    pair: p.pair,
    reason: p.reason,
    pnlUsd: p.pnlUsd,
    txSig: txSig(rnd),
  }));
  /** @type {any[]} */
  let pending = [];
  let closedToday = recent.length;
  let closedProfitToday = recent.filter((r) => r.pnlUsd >= 0).length;
  let closedLossToday = recent.filter((r) => r.pnlUsd < 0).length;
  let realized = r2(recent.reduce((s, r) => s + r.pnlUsd, 0));

  function snapshot() {
    return {
      agentId: 'exitbot',
      status: 'ok',
      updatedAt: nowIso(),
      headline: pending.length ? `${pending.length} antrian close menunggu` : 'Siaga memantau 6 posisi',
      metrics: {
        mode: 'armed',
        monitoredPositions: 6,
        closedToday,
        closedProfitToday,
        closedLossToday,
        realizedPnlTodayUsd: realized,
        rules: { stopLossPct: 8, takeProfitPct: 15, maxSlippageBps: 80, closeAfterOutOfRangeMin: 10 },
        pending: pending.map((p) => ({ ...p })),
        recentExecutions: recent.slice(0, 10),
      },
      alerts: [],
      events: [],
    };
  }

  function publish() {
    if (ctx) ctx.publishSnapshot('exitbot', snapshot());
  }

  /** @param {string} pair @param {string} reason @param {number} pnl */
  function doClose(pair, reason, pnl) {
    n += 1;
    const ex = { id: eventId(`ex-${n}`), ts: nowIso(), pair, reason, pnlUsd: pnl, txSig: txSig(rnd) };
    recent = [ex, ...recent].slice(0, 10);
    pending = pending.filter((p) => p.pair !== pair);
    closedToday += 1;
    if (pnl >= 0) closedProfitToday += 1;
    else closedLossToday += 1;
    realized = r2(realized + pnl);
    publish();
    ctx.publishEvent({
      id: eventId('evt-close'),
      ts: nowIso(),
      type: 'position_closed',
      level: pnl >= 0 ? 'info' : 'warn',
      message: `Tebas! ${pair} ditutup (${fmtPnl(pnl)})`,
      agentId: 'exitbot',
      data: { pair, reason, pnlUsd: pnl, txSig: ex.txSig },
    });
  }

  /**
   * @param {string} pair
   * @param {string} reason
   */
  function addPending(pair, reason) {
    if (!pending.find((p) => p.pair === pair)) {
      pending.push({ pair, reason, etaSec: 30 });
      publish();
    }
  }

  function later(ms, fn) {
    timers.push(setTimeout(fn, ms / speed));
  }

  return {
    id: 'exitbot',
    mode: 'dummy',
    /** @param {any} c */
    start(c) {
      ctx = c;
      publish();
      timer = setInterval(publish, 4000 / speed);
      // Showcase: t+30 pending, t+34 close profit, t+65 close loss
      later(30000, () => addPending('POPCAT/SOL', 'out_of_range'));
      later(34000, () => doClose('POPCAT/SOL', 'out_of_range', 41.2));
      later(65000, () => doClose('MEW/USDC', 'stop_loss', -23.8));
      // Setelah itu: close acak tiap 25-70 dtk
      const loop = () => {
        timers.push(
          setTimeout(() => {
            const r = rnd();
            const pair = PAIRS[Math.floor(rnd() * PAIRS.length)];
            if (r < 0.55) doClose(pair, rnd() < 0.65 ? 'take_profit' : REASONS[Math.floor(rnd() * 4)], rnd() < 0.6 ? r2(10 + rnd() * 60) : r2(-(5 + rnd() * 30)));
            else addPending(pair, 'out_of_range');
            loop();
          }, (25000 + rnd() * 45000) / speed),
        );
      };
      later(100000, loop);
      registerDemoHandler('exitbot', (action) => {
        if (action === 'close_profit') {
          doClose('SOL/USDC', 'take_profit', r2(20 + rnd() * 50));
          return { handled: true };
        }
        if (action === 'close_loss') {
          doClose('BOME/SOL', 'stop_loss', r2(-(10 + rnd() * 25)));
          return { handled: true };
        }
        return null;
      });
    },
    stop() {
      if (timer) clearInterval(timer);
      for (const t of timers) clearTimeout(t);
      unregisterDemoHandler('exitbot');
    },
  };
}

function r2(n) {
  return Math.round(n * 100) / 100;
}

function fmtPnl(pnl) {
  return `${pnl >= 0 ? '+' : '-'}$${Math.abs(pnl).toFixed(2)}`;
}
