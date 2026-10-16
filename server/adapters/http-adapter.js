/**
 * Adapter HTTP: poll GET <url>/status dengan Bearer opsional.
 * Backoff via rantai setTimeout (bukan setInterval) agar jeda
 * benar-benar tumbuh saat gagal; event offline/online sekali per transisi.
 */
import { validateSnapshot } from '../contract.js';
import { diffSnapshots } from '../services/event-deriver.js';
import { retryDelay } from './retry.js';

/**
 * @param {string} agentId
 * @param {{ url: string, apiKey?: string, pollMs?: number, staleAfterSec?: number }} opts
 */
export function createHttpAdapter(agentId, opts) {
  const pollMs = opts.pollMs || 5000;
  const staleAfterSec = opts.staleAfterSec || 120;
  let timer = null;
  /** @type {any} */
  let ctx = null;
  let prev = null;
  let fails = 0;
  let offline = false;

  /** Jeda berikut sesuai gagal beruntun. */
  function delay() {
    return fails === 0 ? pollMs : retryDelay(pollMs, fails);
  }

  /** Jadwalkan poll berikut (rantai, bukan interval). */
  function schedule(ms) {
    clearTimeout(timer);
    timer = setTimeout(tick, ms);
  }

  async function tick() {
    const c = ctx;
    if (!c) return;
    await poll(c);
    if (ctx) schedule(delay());
  }

  async function poll(c) {
    if (!opts.url) return;
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 4000);
    try {
      const headers = {};
      if (opts.apiKey) headers.Authorization = 'Bearer ' + opts.apiKey;
      const res = await fetch(opts.url.replace(/\/$/, '') + '/status', { headers, signal: ctrl.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const v = validateSnapshot(agentId, data);
      if (!v.ok) throw new Error('Kontrak tidak valid: ' + v.errors.slice(0, 3).join('; '));
      fails = 0;
      // Data basi?
      const age = (Date.now() - Date.parse(data.updatedAt)) / 1000;
      const snap = { ...data };
      if (age > staleAfterSec) {
        snap.status = 'warn';
        snap.alerts = [...(snap.alerts || []), { id: 'stale-data', level: 'warn', message: 'Data basi', ts: new Date().toISOString() }];
      }
      const evs = diffSnapshots(agentId, prev, snap);
      prev = snap;
      c.publishSnapshot(agentId, snap);
      for (const e of evs) c.publishEvent(e);
      if (offline) {
        offline = false;
        c.publishEvent({ id: `on-${agentId}-${Date.now()}`, ts: new Date().toISOString(), type: 'agent_online', level: 'info', message: 'Aku kembali!', agentId, data: {} });
      }
    } catch (err) {
      fails += 1;
      c.log(`[${agentId}] poll gagal (${fails}x): ${err && err.message ? err.message : err}`);
      if (fails >= 3 && !offline) {
        offline = true;
        if (prev) {
          const off = { ...prev, status: 'offline', headline: 'Terputus', updatedAt: new Date().toISOString() };
          c.publishSnapshot(agentId, off);
        }
        c.publishEvent({ id: `off-${agentId}-${Date.now()}`, ts: new Date().toISOString(), type: 'agent_offline', level: 'warn', message: 'Zzz... aku terputus.', agentId, data: {} });
      }
    } finally {
      clearTimeout(to);
    }
  }

  return {
    id: agentId,
    mode: 'http',
    /** @param {any} c */
    start(c) {
      ctx = c;
      if (!opts.url) {
        ctx.log(`[${agentId}] MODE http tapi URL kosong — agen offline.`);
        const off = emptyOffline(agentId, 'URL kosong (isi <AGENT>_URL di .env)');
        ctx.publishSnapshot(agentId, off);
        return;
      }
      tick();
    },
    stop() {
      ctx = null;
      if (timer) clearTimeout(timer);
      timer = null;
    },
  };
}

/**
 * @param {string} agentId
 * @param {string} message
 */
function emptyOffline(agentId, message) {
  return {
    agentId,
    status: 'offline',
    updatedAt: new Date().toISOString(),
    headline: 'Belum dikonfigurasi',
    metrics: agentId === 'exitbot'
      ? { mode: 'paused', monitoredPositions: 0, closedToday: 0, closedProfitToday: 0, closedLossToday: 0, realizedPnlTodayUsd: 0, rules: { stopLossPct: 8, takeProfitPct: 15, maxSlippageBps: 80, closeAfterOutOfRangeMin: 10 }, pending: [], recentExecutions: [] }
      : agentId === 'lpwatcher'
        ? { wallet: '-', totals: { valueUsd: 0, feesEarnedUsd: 0, unrealizedPnlUsd: 0, positionsInRange: 0, positionsOutOfRange: 0 }, positions: [] }
        : agentId === 'alert'
          ? { lastScanAt: new Date().toISOString(), scannedToday: 0, passedFilters: 0, filters: { minLiquidityUsd: 50000, minVolume24hUsd: 100000, maxFdvUsd: 5000000, minAgeHours: 6 }, candidates: [] }
          : { currency: 'USD', netWorthUsd: 0, accounts: [], cashflow: { todayIncomeUsd: 0, todayExpenseUsd: 0, last7dIncomeUsd: 0, last7dExpenseUsd: 0, last30dIncomeUsd: 0, last30dExpenseUsd: 0 }, budget: { dailyUsd: 9, monthlyUsd: 270, monthSpentUsd: 0 }, transactions: [] },
    alerts: [{ id: 'cfg-missing', level: 'critical', message, ts: new Date().toISOString() }],
    events: [],
  };
}
