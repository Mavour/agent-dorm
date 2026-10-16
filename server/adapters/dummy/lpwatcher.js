/**
 * Dummy LP Watcher: 5 posisi LP Solana dengan random-walk harga.
 */
import { mulberry32, nowIso, eventId, registerDemoHandler, unregisterDemoHandler } from './engine.js';

const SEED_POSITIONS = [
  { id: 'lp-sol', pair: 'SOL/USDC', protocol: 'Orca', rangeLow: 138, rangeHigh: 162, price: 151.2, valueUsd: 4820, fees: 61.2, pnl: 84.5, il: -0.4 },
  { id: 'lp-jup', pair: 'JUP/USDC', protocol: 'Raydium', rangeLow: 0.78, rangeHigh: 0.96, price: 0.87, valueUsd: 2150, fees: 28.4, pnl: 32.1, il: -0.2 },
  { id: 'lp-wif', pair: 'WIF/SOL', protocol: 'Meteora', rangeLow: 0.0042, rangeHigh: 0.0051, price: 0.0047, valueUsd: 1380, fees: 15.9, pnl: -12.6, il: -1.1 },
  { id: 'lp-bonk', pair: 'BONK/USDC', protocol: 'Orca', rangeLow: 0.000021, rangeHigh: 0.000027, price: 0.000024, valueUsd: 1020, fees: 11.2, pnl: 9.8, il: -0.1 },
  { id: 'lp-jto', pair: 'JTO/USDC', protocol: 'Raydium', rangeLow: 2.1, rangeHigh: 2.7, price: 2.38, valueUsd: 890, fees: 9.6, pnl: -4.2, il: -0.6 },
];

/**
 * @param {{ seed?: number, speed?: number }} opts
 */
export function createLpwatcherDummy(opts = {}) {
  const rnd = mulberry32((opts.seed ?? 42) + 7);
  const speed = opts.speed ?? 1;
  const positions = SEED_POSITIONS.map((p) => ({ ...p }));
  let timer = null;
  /** @type {any} */
  let ctx = null;
  let forceOutAt = 0; // timestamp: paksa WIF out of range (showcase/demo)

  function snapshot() {
    const totals = {
      valueUsd: r2(positions.reduce((s, p) => s + p.valueUsd, 0)),
      feesEarnedUsd: r2(positions.reduce((s, p) => s + p.fees, 0)),
      unrealizedPnlUsd: r2(positions.reduce((s, p) => s + p.pnl, 0)),
      positionsInRange: positions.filter((p) => inRange(p)).length,
      positionsOutOfRange: positions.filter((p) => !inRange(p)).length,
    };
    const alerts = [];
    for (const p of positions) {
      if (!inRange(p)) {
        alerts.push({ id: `oor-${p.id}`, level: 'critical', message: `${p.pair} keluar range (${p.price} di luar ${p.rangeLow}-${p.rangeHigh})`, ts: nowIso() });
      }
    }
    return {
      agentId: 'lpwatcher',
      status: alerts.length ? 'warn' : 'ok',
      updatedAt: nowIso(),
      headline: alerts.length ? `${alerts.length} posisi di luar range` : 'Semua posisi LP terpantau',
      metrics: {
        wallet: 'Robinhood Wallet',
        totals,
        positions: positions.map((p) => ({
          id: p.id,
          pair: p.pair,
          protocol: p.protocol,
          rangeLow: p.rangeLow,
          rangeHigh: p.rangeHigh,
          price: p.price,
          inRange: inRange(p),
          valueUsd: r2(p.valueUsd),
          feesEarnedUsd: r2(p.fees),
          unrealizedPnlUsd: r2(p.pnl),
          ilPct: r2(p.il),
          openedAt: '2026-09-01T00:00:00.000Z',
        })),
      },
      alerts,
      events: [],
    };
  }

  /** @param {any} p */
  function inRange(p) {
    return p.price >= p.rangeLow && p.price <= p.rangeHigh;
  }

  function tick() {
    const wif = positions.find((p) => p.id === 'lp-wif');
    for (const p of positions) {
      const drift = (rnd() - 0.5) * 0.008; // +/-0.4%
      p.price = Math.max(p.price * (1 + drift), p.rangeLow * 0.5);
      p.valueUsd = Math.max(50, p.valueUsd * (1 + (rnd() - 0.48) * 0.004));
      p.fees += rnd() * 0.35;
      p.pnl += (rnd() - 0.5) * 2;
      // Normalisasi tampilan harga kecil
      p.price = Number(p.price.toPrecision(4));
    }
    // Showcase t+20: paksa WIF/SOL keluar range sekali
    if (forceOutAt && Date.now() >= forceOutAt && wif && inRange(wif)) {
      wif.price = Number((wif.rangeHigh * 1.06).toPrecision(4));
      forceOutAt = 0;
      const snap = snapshot();
      ctx.publishSnapshot('lpwatcher', snap);
      ctx.publishEvent({
        id: eventId('evt-oor-wif'),
        ts: nowIso(),
        type: 'position_out_of_range',
        level: 'critical',
        message: 'WIF/SOL OUT OF RANGE!',
        agentId: 'lpwatcher',
        data: { pair: 'WIF/SOL' },
      });
      return;
    }
    // Kembali in-range secara alami kadang-kadang
    if (wif && !inRange(wif) && rnd() < 0.12) {
      wif.price = Number(((wif.rangeLow + wif.rangeHigh) / 2).toPrecision(4));
      const snap = snapshot();
      ctx.publishSnapshot('lpwatcher', snap);
      ctx.publishEvent({
        id: eventId('evt-bir-wif'),
        ts: nowIso(),
        type: 'position_back_in_range',
        level: 'info',
        message: 'WIF/SOL kembali in range.',
        agentId: 'lpwatcher',
        data: { pair: 'WIF/SOL' },
      });
      return;
    }
    ctx.publishSnapshot('lpwatcher', snapshot());
  }

  return {
    id: 'lpwatcher',
    mode: 'dummy',
    /** @param {any} c */
    start(c) {
      ctx = c;
      ctx.publishSnapshot('lpwatcher', snapshot());
      // Showcase: t+20s keluar range
      forceOutAt = Date.now() + 20000 / speed;
      timer = setInterval(tick, 3500 / speed);
      registerDemoHandler('lpwatcher', (action) => {
        if (action === 'lp_out') {
          forceOutAt = Date.now();
          tickSoon();
          return { handled: true };
        }
        return null;
      });
    },
    stop() {
      if (timer) clearInterval(timer);
      unregisterDemoHandler('lpwatcher');
    },
  };

  function tickSoon() {
    // picu di luar interval agar responsif
    setTimeout(tick, 50);
  }
}

function r2(n) {
  return Math.round(n * 100) / 100;
}
