/**
 * Validator kontrak snapshot (sumber kebenaran tunggal).
 * Lihat docs/BOT_API_CONTRACT.md untuk makna tiap field.
 */

export const AGENT_IDS = ['exitbot', 'portfolio', 'alert', 'lpwatcher', 'bravonoid', 'kawaraban'];
export const STATUSES = ['ok', 'warn', 'error', 'offline'];
export const EVENT_TYPES = [
  'coin_found',
  'position_out_of_range',
  'position_back_in_range',
  'position_closed',
  'report_ready',
  'agent_offline',
  'agent_online',
  'info',
];

/**
 * @param {any} v
 */
function isIso(v) {
  if (typeof v !== 'string') return false;
  const t = Date.parse(v);
  return Number.isFinite(t);
}

/**
 * Validasi snapshot satu agen.
 * @param {string} agentId
 * @param {any} obj
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function validateSnapshot(agentId, obj) {
  const errors = [];
  if (!AGENT_IDS.includes(agentId)) errors.push(`agentId tidak dikenal: ${agentId}`);
  if (!obj || typeof obj !== 'object') return { ok: false, errors: ['snapshot harus objek'] };
  if (obj.agentId !== agentId) errors.push(`agentId harus "${agentId}"`);
  if (!STATUSES.includes(obj.status)) errors.push('status tidak valid');
  if (!isIso(obj.updatedAt)) errors.push('updatedAt harus ISO-8601');
  if (typeof obj.headline !== 'string' || obj.headline.length === 0 || obj.headline.length > 80) {
    errors.push('headline maks 80 karakter dan tidak boleh kosong');
  }
  if (!obj.metrics || typeof obj.metrics !== 'object') {
    errors.push('metrics harus objek');
  } else {
    errors.push(...validateMetrics(agentId, obj.metrics));
  }
  if (!Array.isArray(obj.alerts)) {
    errors.push('alerts harus array');
  } else {
    for (const a of obj.alerts) {
      if (!a || typeof a.id !== 'string') errors.push('alert.id harus string');
      if (!['info', 'warn', 'critical'].includes(a?.level)) errors.push(`alert level tidak valid: ${a?.id}`);
      if (typeof a?.message !== 'string') errors.push(`alert message harus string: ${a?.id}`);
      if (!isIso(a?.ts)) errors.push(`alert ts harus ISO: ${a?.id}`);
    }
  }
  if (obj.events !== undefined) {
    if (!Array.isArray(obj.events)) errors.push('events harus array');
    else {
      for (const e of obj.events) {
        if (!e || typeof e.id !== 'string') errors.push('event.id harus string');
        if (!EVENT_TYPES.includes(e?.type)) errors.push(`event type tidak valid: ${e?.id}`);
        if (!isIso(e?.ts)) errors.push(`event ts harus ISO: ${e?.id}`);
      }
    }
  }
  return { ok: errors.length === 0, errors };
}

/**
 * Validasi metrics per agen (nama field harus persis).
 * @param {string} agentId
 * @param {any} m
 * @returns {string[]}
 */
export function validateMetrics(agentId, m) {
  const e = [];
  const req = (k) => {
    if (!(k in m)) e.push(`metrics.${k} wajib ada`);
  };
  if (agentId === 'exitbot') {
    for (const k of ['mode', 'monitoredPositions', 'closedToday', 'closedProfitToday', 'closedLossToday', 'realizedPnlTodayUsd', 'rules', 'pending', 'recentExecutions']) req(k);
    if (m.mode && !['armed', 'paused'].includes(m.mode)) e.push('metrics.mode harus armed|paused');
    if (m.rules) {
      for (const k of ['stopLossPct', 'takeProfitPct', 'maxSlippageBps', 'closeAfterOutOfRangeMin']) {
        if (typeof m.rules[k] !== 'number') e.push(`metrics.rules.${k} harus number`);
      }
    }
    if (Array.isArray(m.recentExecutions)) {
      if (m.recentExecutions.length > 10) e.push('recentExecutions maks 10');
      for (const x of m.recentExecutions) {
        if (!['take_profit', 'stop_loss', 'out_of_range', 'manual'].includes(x?.reason)) e.push(`execution reason tidak valid: ${x?.id}`);
      }
    }
  } else if (agentId === 'lpwatcher') {
    for (const k of ['wallet', 'totals', 'positions']) req(k);
    if (m.totals) {
      for (const k of ['valueUsd', 'feesEarnedUsd', 'unrealizedPnlUsd', 'positionsInRange', 'positionsOutOfRange']) {
        if (typeof m.totals[k] !== 'number') e.push(`metrics.totals.${k} harus number`);
      }
    }
    if (!Array.isArray(m.positions)) e.push('metrics.positions harus array');
    else {
      for (const p of m.positions) {
        for (const k of ['id', 'pair', 'protocol', 'rangeLow', 'rangeHigh', 'price', 'inRange', 'valueUsd', 'feesEarnedUsd', 'unrealizedPnlUsd', 'ilPct', 'openedAt']) {
          if (!(k in (p || {}))) e.push(`position.${k} wajib ada (${p?.id})`);
        }
      }
    }
  } else if (agentId === 'alert') {
    for (const k of ['lastScanAt', 'scannedToday', 'passedFilters', 'filters', 'candidates']) req(k);
    if (m.filters) {
      for (const k of ['minLiquidityUsd', 'minVolume24hUsd', 'maxFdvUsd', 'minAgeHours']) {
        if (typeof m.filters[k] !== 'number') e.push(`metrics.filters.${k} harus number`);
      }
    }
    if (Array.isArray(m.candidates)) {
      if (m.candidates.length > 12) e.push('candidates maks 12');
      let last = 101;
      for (const c of m.candidates) {
        if (typeof c?.score !== 'number' || c.score < 0 || c.score > 100) e.push(`candidate score 0-100: ${c?.id}`);
        if (c.score > last) e.push('candidates harus urut score desc');
        last = c.score;
      }
    }
  } else if (agentId === 'portfolio') {
    for (const k of ['currency', 'netWorthUsd', 'accounts', 'cashflow', 'budget', 'transactions']) req(k);
    if (m.currency !== 'USD') e.push('metrics.currency harus USD');
    if (Array.isArray(m.transactions) && m.transactions.length > 60) e.push('transactions maks 60');
  } else if (agentId === 'bravonoid') {
    req('position');
    if (m.position != null && (typeof m.position.pair !== 'string' || !Number.isFinite(m.position.depositUsd) || !isIso(m.position.openedAt))) {
      e.push('metrics.position tidak valid');
    }
    if (!Array.isArray(m.recentActions) || !m.recentActions.every((a) => typeof a?.message === 'string' && isIso(a.ts))) {
      e.push('metrics.recentActions tidak valid');
    }
  } else if (agentId === 'kawaraban') {
    if (!Array.isArray(m.ideas) || !m.ideas.every((idea) => typeof idea?.title === 'string' && typeof idea.draft === 'string')) {
      e.push('metrics.ideas tidak valid');
    }
  }
  return e;
}
