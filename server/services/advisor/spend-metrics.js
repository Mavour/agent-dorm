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
  const m = snapshot.metrics;
  const cf = m.cashflow;
  const today = cf.todayExpenseUsd;
  const avg7 = cf.last7dExpenseUsd / 7;
  const now = new Date();
  const daysElapsed = Math.max(1, now.getDate());
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const projected = (m.budget.monthSpentUsd / daysElapsed) * daysInMonth;
  const monthlyBudget = m.budget.monthlyUsd;
  const ratio = avg7 > 0 ? today / avg7 : 1;
  let tone = 'neutral';
  if (ratio > 1.3 || projected > monthlyBudget) tone = 'warn';
  else if (ratio < 0.7) tone = 'good';
  return { tone, today, avg7, projected, monthlyBudget };
}
