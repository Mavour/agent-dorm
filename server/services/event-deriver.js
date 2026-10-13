/**
 * Penurun event: bandingkan snapshot berurutan (untuk adapter http/file).
 */

/**
 * Turunkan event dari diff dua snapshot.
 * Di poll pertama (prev == null) tandai semua sebagai sudah terlihat (tanpa event).
 * @param {string} agentId
 * @param {any|null} prev snapshot sebelumnya
 * @param {any} next snapshot baru
 * @returns {any[]} daftar event baru
 */
export function diffSnapshots(agentId, prev, next) {
  if (!next) return [];
  if (!prev) return [];
  /** @type {any[]} */
  const out = [];
  const now = new Date().toISOString();

  // 1. Alert baru (by id)
  const prevAlertIds = new Set((prev.alerts || []).map((a) => a.id));
  for (const a of next.alerts || []) {
    if (!prevAlertIds.has(a.id)) {
      out.push({
        id: `der-alert-${agentId}-${a.id}`,
        ts: now,
        type: a.message && /range/i.test(a.message) && /keluar|out/i.test(a.message) ? 'position_out_of_range' : 'info',
        level: a.level === 'critical' ? 'critical' : a.level === 'warn' ? 'warn' : 'info',
        message: a.message,
        agentId,
        data: {},
      });
    }
  }

  // 2. Item events[] baru (by id) diteruskan apa adanya
  const prevEvIds = new Set((prev.events || []).map((e) => e.id));
  for (const e of next.events || []) {
    if (!prevEvIds.has(e.id)) {
      out.push({ ...e, agentId: e.agentId || agentId });
    }
  }

  const pm = prev.metrics || {};
  const nm = next.metrics || {};

  // 3. recentExecutions baru -> position_closed
  if (agentId === 'exitbot' && Array.isArray(nm.recentExecutions)) {
    const prevIds = new Set((pm.recentExecutions || []).map((x) => x.id));
    for (const x of nm.recentExecutions) {
      if (!prevIds.has(x.id)) {
        out.push({
          id: `der-close-${x.id}`,
          ts: x.ts || now,
          type: 'position_closed',
          level: (x.pnlUsd ?? 0) >= 0 ? 'info' : 'warn',
          message: `Tebas! ${x.pair} ditutup`,
          agentId,
          data: { pair: x.pair, reason: x.reason, pnlUsd: x.pnlUsd },
        });
      }
    }
  }

  // 4. Kandidat baru -> coin_found
  if (agentId === 'alert' && Array.isArray(nm.candidates)) {
    const prevIds = new Set((pm.candidates || []).map((c) => c.id));
    for (const c of nm.candidates) {
      if (!prevIds.has(c.id)) {
        out.push({
          id: `der-coin-${c.id}`,
          ts: c.foundAt || now,
          type: 'coin_found',
          level: 'info',
          message: `Ada koin menarik: ${c.symbol} (skor ${c.score})`,
          agentId,
          data: { symbol: c.symbol, score: c.score, pair: c.pair },
        });
      }
    }
  }

  // 5. Toggle inRange posisi LP
  if (agentId === 'lpwatcher' && Array.isArray(nm.positions)) {
    const prevMap = new Map((pm.positions || []).map((p) => [p.id, p]));
    for (const p of nm.positions) {
      const old = prevMap.get(p.id);
      if (old && old.inRange === true && p.inRange === false) {
        out.push({ id: `der-oor-${p.id}-${now}`, ts: now, type: 'position_out_of_range', level: 'critical', message: `${p.pair} OUT OF RANGE!`, agentId, data: { pair: p.pair } });
      } else if (old && old.inRange === false && p.inRange === true) {
        out.push({ id: `der-bir-${p.id}-${now}`, ts: now, type: 'position_back_in_range', level: 'info', message: `${p.pair} kembali in range.`, agentId, data: { pair: p.pair } });
      }
    }
  }

  return out;
}
