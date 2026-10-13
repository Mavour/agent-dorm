/**
 * Adapter HTTP: poll GET <url>/status dengan Bearer opsional.
 */
import { validateSnapshot } from '../contract.js';
import { diffSnapshots } from '../services/event-deriver.js';

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
  let backoff = pollMs;

  async function poll() {
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
      backoff = pollMs;
      // Data basi?
      const age = (Date.now() - Date.parse(data.updatedAt)) / 1000;
      const snap = { ...data };
      if (age > staleAfterSec) {
        snap.status = 'warn';
        snap.alerts = [...(snap.alerts || []), { id: 'stale-data', level: 'warn', message: 'Data basi', ts: new Date().toISOString() }];
      }
      const evs = diffSnapshots(agentId, prev, snap);
      prev = snap;
      ctx.publishSnapshot(agentId, snap);
      for (const e of evs) ctx.publishEvent(e);
      checkOfflineRecovery(snap);
    } catch (err) {
      fails += 1;
      backoff = Math.min(backoff * 2, 60000);
      ctx.log(`[${agentId}] poll gagal (${fails}x): ${err && err.message ? err.message : err}`);
      if (fails >= 3) {
        if (prev) {
          const off = { ...prev, status: 'offline', headline: 'Terputus', updatedAt: new Date().toISOString() };
          ctx.publishSnapshot(agentId, off);
        }
        ctx.publishEvent({ id: `off-${agentId}-${Date.now()}`, ts: new Date().toISOString(), type: 'agent_offline', level: 'warn', message: 'Zzz... aku terputus.', agentId, data: {} });
      }
    } finally {
      clearTimeout(to);
    }
  }

  let wasOffline = false;
  /** @param {any} snap */
  function checkOfflineRecovery(snap) {
    if (wasOffline && snap.status !== 'offline') {
      ctx.publishEvent({ id: `on-${agentId}-${Date.now()}`, ts: new Date().toISOString(), type: 'agent_online', level: 'info', message: 'Aku kembali!', agentId, data: {} });
    }
    wasOffline = snap.status === 'offline';
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
      poll();
      timer = setInterval(poll, pollMs);
    },
    stop() {
      if (timer) clearInterval(timer);
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
