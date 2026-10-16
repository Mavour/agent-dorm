/**
 * Util format angka: USD Intl, tanda+warna PnL, desimal adaptif harga kecil.
 */

/** @param {number} n */
export function usd(n) {
  if (!Number.isFinite(n)) return '-';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
}

/** @param {number} n */
export function signedUsd(n) {
  if (!Number.isFinite(n)) return '-';
  const s = n >= 0 ? '+' : '-';
  return s + usd(Math.abs(n));
}

/** Harga kecil: desimal adaptif (mis. 0.000024). @param {number} n */
export function price(n) {
  if (!Number.isFinite(n)) return '-';
  if (n !== 0 && Math.abs(n) < 0.01) {
    let d = 2;
    let m = Math.abs(n);
    while (m < 1 && d < 10) {
      m *= 10;
      d += 1;
    }
    return n.toFixed(Math.min(d, 8));
  }
  return String(Math.round(n * 10000) / 10000);
}

/** @param {number} n */
export function num(n) {
  if (!Number.isFinite(n)) return '-';
  return new Intl.NumberFormat('en-US').format(n);
}

/** @param {string} iso -> HH:MM:SS lokal ('--:--:--' bila tak valid) */
export function clockOf(iso) {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return '--:--:--';
  return new Date(t).toLocaleTimeString('id-ID', { hour12: false });
}

/** @param {string} iso -> waktu relatif Indonesia */
export function rel(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(diff) || diff < 0) return 'baru saja';
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'baru saja';
  if (m < 60) return `${m} mnt lalu`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} jam lalu`;
  return `${Math.floor(h / 24)} hari lalu`;
}
