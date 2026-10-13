/**
 * Penasihat berbasis aturan (tanpa LLM). Nada santai Bahasa Indonesia.
 */
import { spendingTone } from './spend-metrics.js';

/**
 * @param {any} snapshot snapshot portfolio
 */
function stats(snapshot) {
  const m = snapshot.metrics;
  const cf = m.cashflow;
  const avg7 = cf.last7dExpenseUsd / 7;
  const today = cf.todayExpenseUsd;
  const now = new Date();
  const daysElapsed = Math.max(1, now.getDate());
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const projected = (m.budget.monthSpentUsd / daysElapsed) * daysInMonth;
  const net30 = cf.last30dIncomeUsd - cf.last30dExpenseUsd;
  const lpVal = (m.accounts.find((a) => a.type === 'lp') || { valueUsd: 0 }).valueUsd;
  const lpShare = m.netWorthUsd ? lpVal / m.netWorthUsd : 0;
  const stableVal = (m.accounts.find((a) => a.type === 'stable') || { valueUsd: 0 }).valueUsd;
  const avgMonthlySpend = cf.last30dExpenseUsd || 1;
  // Kategori terbesar 7 hari terakhir
  const weekAgo = Date.now() - 7 * 86400000;
  /** @type {Map<string, number>} */
  const byCat = new Map();
  for (const t of m.transactions || []) {
    if (t.kind === 'expense' && new Date(t.ts).getTime() >= weekAgo) {
      byCat.set(t.category, (byCat.get(t.category) || 0) + t.amountUsd);
    }
  }
  let topCat = '';
  let topAmt = 0;
  for (const [k, v] of byCat) {
    if (v > topAmt) {
      topAmt = v;
      topCat = k;
    }
  }
  return { avg7, today, projected, net30, lpShare, stableVal, avgMonthlySpend, topCat, topAmt, daysInMonth };
}

/** @param {number} n */
function usd(n) {
  return `$${n.toFixed(2)}`;
}

/**
 * Daftar kartu saran.
 * @param {any} snapshot
 * @returns {{ id: string, tone: string, title: string, message: string }[]}
 */
export function advise(snapshot) {
  const s = stats(snapshot);
  /** @type {any[]} */
  const out = [];
  const ratio = s.avg7 > 0 ? s.today / s.avg7 : 1;
  if (ratio > 1.3) {
    out.push({ id: 'spend-warn', tone: 'warn', title: 'Agak boros hari ini', message: `Hari ini ${usd(s.today)}, rata-rata 7 hari ${usd(s.avg7)}. Rem dikit, ya.` });
  } else if (ratio < 0.7) {
    out.push({ id: 'spend-good', tone: 'good', title: 'Hemat, pertahankan', message: `Nggak boros. Justru lagi hemat banget: hari ini ${usd(s.today)}, rata-rata 7 hari ${usd(s.avg7)}.` });
  } else {
    out.push({ id: 'spend-neutral', tone: 'neutral', title: 'Pengeluaran normal', message: `Hari ini ${usd(s.today)}, rata-rata 7 hari ${usd(s.avg7)}. Masih wajar.` });
  }
  const budget = snapshot.metrics.budget;
  if (s.projected > budget.monthlyUsd) {
    out.push({ id: 'budget-warn', tone: 'warn', title: 'Proyeksi over budget', message: `Proyeksi sebulan ${usd(s.projected)}, budget ${usd(budget.monthlyUsd)}. Kurangi jajan!` });
  } else if (s.projected < budget.monthlyUsd * 0.85) {
    out.push({ id: 'budget-good', tone: 'good', title: 'Budget aman', message: `Proyeksi sebulan ${usd(s.projected)} dari budget ${usd(budget.monthlyUsd)}. Aman banget.` });
  } else {
    out.push({ id: 'budget-neutral', tone: 'neutral', title: 'Budget terkendali', message: `Proyeksi sebulan ${usd(s.projected)}, masih di dalam budget.` });
  }
  if (s.net30 < 0) out.push({ id: 'cash-warn', tone: 'warn', title: 'Arus kas minus', message: `30 hari terakhir minus ${usd(Math.abs(s.net30))}. Pemasukan harus dikejar.` });
  if (s.lpShare > 0.6) out.push({ id: 'lp-warn', tone: 'warn', title: 'Terlalu fokus di LP', message: `${Math.round(s.lpShare * 100)}% net worth ada di LP. Risiko konsentrasi, diversifikasi dikit.` });
  const monthsCover = s.stableVal / s.avgMonthlySpend;
  if (monthsCover < 6) out.push({ id: 'emergency', tone: 'neutral', title: 'Dana darurat', message: `Saldo stable cukup buat ${monthsCover.toFixed(1)} bulan. Idealnya 6 bulan, tambah pelan-pelan.` });
  if (s.topCat) out.push({ id: 'topcat', tone: 'neutral', title: 'Kategori terbesar', message: `7 hari terakhir paling besar di ${s.topCat} (${usd(s.topAmt)}). Cek lagi perlu nggak.` });
  return out;
}

export const QUESTIONS = ['today_summary', 'am_i_wasteful', 'month_budget', 'top_category', 'lp_exposure', 'more_tips'];

/**
 * Jawab pertanyaan cepat.
 * @param {string} questionId
 * @param {any} snapshot
 */
export function answer(questionId, snapshot) {
  const m = snapshot.metrics;
  const s = stats(snapshot);
  switch (questionId) {
    case 'today_summary':
      return { text: `Hari ini masuk ${usd(m.cashflow.todayIncomeUsd)}, keluar ${usd(m.cashflow.todayExpenseUsd)}. Net worth ${usd(m.netWorthUsd)}. Santai, masih terkendali.` };
    case 'am_i_wasteful': {
      const ratio = s.avg7 > 0 ? s.today / s.avg7 : 1;
      if (ratio > 1.3) return { text: `Iya, hari ini agak boros: ${usd(s.today)} vs rata-rata ${usd(s.avg7)}. Besok rem ya.` };
      if (ratio < 0.7) return { text: `Nggak boros. Justru lagi hemat banget: hari ini ${usd(s.today)}, rata-rata 7 hari ${usd(s.avg7)}.` };
      return { text: `Nggak boros, masih normal: hari ini ${usd(s.today)}, rata-rata ${usd(s.avg7)}.` };
    }
    case 'month_budget': {
      const left = m.budget.monthlyUsd - m.budget.monthSpentUsd;
      return { text: `Budget sebulan ${usd(m.budget.monthlyUsd)}, sudah kepakai ${usd(m.budget.monthSpentUsd)}, sisa ${usd(left)}. Proyeksi akhir bulan ${usd(s.projected)}.` };
    }
    case 'top_category':
      return { text: s.topCat ? `Kategori terbesar 7 hari terakhir: ${s.topCat} (${usd(s.topAmt)}).` : 'Belum ada pengeluaran 7 hari terakhir. Bagus!' };
    case 'lp_exposure':
      return { text: `Eksposur LP ${Math.round(s.lpShare * 100)}% dari net worth. ${s.lpShare > 0.6 ? 'Kegedean, kurangi dikit.' : 'Masih sehat.'}` };
    case 'more_tips':
      return { text: 'Tips: sisihkan fee LP tiap minggu, jaga stable 6x pengeluaran bulanan, dan catat setiap jajan.' };
    default:
      throw new Error('questionId tidak dikenal');
  }
}

/**
 * Rapor harian (dipakai panel Karo). Nada dari spendingTone (sumber tunggal).
 * @param {any} snapshot
 */
export function dailyReport(snapshot) {
  const t = spendingTone(snapshot);
  if (t.tone === 'warn') {
    return { title: 'Rapor harian: boros', text: `Hari ini ${usd(t.today)} (rata-rata ${usd(t.avg7)}). Proyeksi ${usd(t.projected)}. Rem pengeluarannya!`, tone: 'warn' };
  }
  if (t.tone === 'good') {
    return { title: 'Rapor harian: hemat', text: `Hemat banget hari ini: ${usd(t.today)} vs rata-rata ${usd(t.avg7)}. Pertahankan!`, tone: 'good' };
  }
  return { title: 'Rapor harian: stabil', text: `Pengeluaran stabil di ${usd(t.today)}. Semua terkendali.`, tone: 'neutral' };
}
