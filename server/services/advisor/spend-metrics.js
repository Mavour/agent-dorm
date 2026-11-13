import { portfolioSpending } from '../../../public/js/portfolio-data.js';

/**
 * Satu-satunya sumber kebenaran nada pengeluaran (hemat vs boros).
 * Fungsi murni: hanya membaca snapshot portfolio + tanggal hari ini.
 * Dipakai rules-advisor.dailyReport() DAN dummy portfolio (event, headline,
 * status, alert) agar semuanya selalu sepakat.
 */

/**
 * Hitung nada pengeluaran dari angka snapshot saat ini.
 * - warn: belanja hari ini > 1.3x rata-rata 7 hari ATAU proyeksi sebulan
 *   melebihi budget bulanan.
 * - good: belanja hari ini < 0.7x rata-rata 7 hari.
 * - neutral: selain itu.
 * @param {any} snapshot snapshot portfolio (envelope kontrak)
 * @returns {{ tone: 'good'|'neutral'|'warn', today: number, avg7: number, projected: number, monthlyBudget: number }}
 */
export function spendingTone(snapshot) {
  return portfolioSpending(snapshot);
}
