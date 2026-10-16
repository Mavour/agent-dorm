/**
 * Jeda poll ulang adapter: normal tiap pollMs, digandakan tiap gagal,
 * dibatasi 60 dtk. Murni, bisa diuji.
 */

/** Batas atas backoff poll (ms). */
export const MAX_RETRY_DELAY_MS = 60000;

/**
 * @param {number} pollMs interval normal (ms)
 * @param {number} fails jumlah gagal beruntun (0 = tidak gagal)
 * @returns {number} jeda sebelum poll berikut (ms)
 */
export function retryDelay(pollMs, fails) {
  const base = Number(pollMs) > 0 ? Number(pollMs) : 5000;
  const f = Number.isFinite(fails) ? Math.max(0, Math.floor(fails)) : 0;
  if (f <= 0) return base;
  return Math.min(base * 2 ** f, MAX_RETRY_DELAY_MS);
}
