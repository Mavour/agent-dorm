/**
 * Penasihat berbasis aturan (tanpa LLM). Nada santai Bahasa Indonesia.
 */
import { spendingTone } from './spend-metrics.js';
import { portfolioData, portfolioMoney } from '../../../public/js/portfolio-data.js';

/**
 * @param {any} snapshot snapshot portfolio
 */
function stats(snapshot) {
  const m = snapshot.metrics;
  const data = portfolioData(snapshot);
  const cf = data.cashflow;
  const { avg7, today, projected } = spendingTone(snapshot);
  const net30 = Number.isFinite(cf.last30dIncome) && Number.isFinite(cf.last30dExpense) ? cf.last30dIncome - cf.last30dExpense : null;
  const lpVal = (m.accounts.find((a) => a.type === 'lp') || { valueUsd: 0 }).valueUsd;
  const lpShare = m.valuationComplete !== false && Number.isFinite(lpVal) && Number.isFinite(m.netWorthUsd) && m.netWorthUsd > 0 ? lpVal / m.netWorthUsd : null;
  const stableVal = (m.accounts.find((a) => a.type === 'stable') || { valueUsd: 0 }).valueUsd;
  const avgMonthlySpend = m.cashflow.last30dExpenseUsd || 1;
  // Kategori terbesar 7 hari terakhir
  const weekAgo = Date.now() - 7 * 86400000;
  /** @type {Map<string, number>} */
  const byCat = new Map();
  let categoryComplete = true;
  for (const t of data.transactions) {
    if (t.kind === 'expense' && new Date(t.ts).getTime() >= weekAgo) {
      if (!Number.isFinite(t.amount)) { categoryComplete = false; continue; }
      byCat.set(t.category, (byCat.get(t.category) || 0) + t.amount);
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
  return { avg7, today, projected, net30, lpShare, stableVal, avgMonthlySpend, topCat, topAmt, categoryComplete };
}


/**
 * Daftar kartu saran.
 * @param {any} snapshot
 * @returns {{ id: string, tone: string, title: string, message: string }[]}
 */
export function advise(snapshot) {
  const data = portfolioData(snapshot);
  const money = n => portfolioMoney(n, data.currency);
  const s = stats(snapshot);
  /** @type {any[]} */
  const out = [];
  const ratio = s.avg7 > 0 ? s.today / s.avg7 : 1;
  if (!Number.isFinite(s.today) || s.avg7 === null) {
    out.push({ id: 'spend-unavailable', tone: 'neutral', title: 'Data pengeluaran belum lengkap', message: 'Penilaian hemat atau boros menunggu data pengeluaran yang lengkap.' });
  } else if (ratio > 1.3) {
    out.push({ id: 'spend-warn', tone: 'warn', title: 'Agak boros hari ini', message: `Hari ini ${money(s.today)}, rata-rata 7 hari ${money(s.avg7)}. Rem dikit, ya.` });
  } else if (ratio < 0.7) {
    out.push({ id: 'spend-good', tone: 'good', title: 'Hemat, pertahankan', message: `Nggak boros. Justru lagi hemat banget: hari ini ${money(s.today)}, rata-rata 7 hari ${money(s.avg7)}.` });
  } else {
    out.push({ id: 'spend-neutral', tone: 'neutral', title: 'Pengeluaran normal', message: `Hari ini ${money(s.today)}, rata-rata 7 hari ${money(s.avg7)}. Masih wajar.` });
  }
  const budget = data.budget;
  if (!Number.isFinite(budget.monthly) || s.projected === null || snapshot.metrics.budgetConfigured === false) {
    out.push({ id: 'budget-unavailable', tone: 'neutral', title: 'Budget belum tersedia', message: 'Atur budget bulanan di Fintrack untuk menghitung sisa budget.' });
  } else if (s.projected > budget.monthly) {
    out.push({ id: 'budget-warn', tone: 'warn', title: 'Proyeksi over budget', message: `Proyeksi sebulan ${money(s.projected)}, budget ${money(budget.monthly)}. Kurangi jajan!` });
  } else if (s.projected < budget.monthly * 0.85) {
    out.push({ id: 'budget-good', tone: 'good', title: 'Budget aman', message: `Proyeksi sebulan ${money(s.projected)} dari budget ${money(budget.monthly)}. Aman banget.` });
  } else {
    out.push({ id: 'budget-neutral', tone: 'neutral', title: 'Budget terkendali', message: `Proyeksi sebulan ${money(s.projected)}, masih di dalam budget.` });
  }
  if (s.net30 !== null && s.net30 < 0) out.push({ id: 'cash-warn', tone: 'warn', title: 'Arus kas minus', message: `30 hari terakhir minus ${money(Math.abs(s.net30))}. Pemasukan harus dikejar.` });
  if (s.lpShare > 0.6) out.push({ id: 'lp-warn', tone: 'warn', title: 'Terlalu fokus di LP', message: `${Math.round(s.lpShare * 100)}% net worth ada di LP. Risiko konsentrasi, diversifikasi dikit.` });
  const monthsCover = s.stableVal / s.avgMonthlySpend;
  if (Number.isFinite(s.stableVal) && Number.isFinite(snapshot.metrics.cashflow.last30dExpenseUsd) && monthsCover < 6) out.push({ id: 'emergency', tone: 'neutral', title: 'Dana darurat', message: `Saldo stable cukup buat ${monthsCover.toFixed(1)} bulan. Idealnya 6 bulan, tambah pelan-pelan.` });
  if (s.categoryComplete && s.topCat) out.push({ id: 'topcat', tone: 'neutral', title: 'Kategori terbesar', message: `7 hari terakhir paling besar di ${s.topCat} (${money(s.topAmt)}). Cek lagi perlu nggak.` });
  return out;
}

export const QUESTIONS = ['today_summary', 'am_i_wasteful', 'month_budget', 'top_category', 'lp_exposure', 'more_tips'];

/**
 * Jawab pertanyaan cepat.
 * @param {string} questionId
 * @param {any} snapshot
 */
export function answer(questionId, snapshot) {
  const m = portfolioData(snapshot);
  const money = n => portfolioMoney(n, m.currency);
  const s = stats(snapshot);
  switch (questionId) {
    case 'today_summary':
      return { text: `Hari ini masuk ${money(m.cashflow.todayIncome)}, keluar ${money(m.cashflow.todayExpense)}. ${snapshot.metrics.valuationComplete === false ? `Subtotal aset ${money(m.knownNetWorth)}. Valuasi belum lengkap; total belum dapat dipastikan.` : `Total aset ${money(m.netWorth)}.`}` };
    case 'am_i_wasteful': {
      if (!Number.isFinite(s.today) || s.avg7 === null) return { text: 'Data pengeluaran belum lengkap. Belum bisa menilai hemat atau boros.' };
      const ratio = s.avg7 > 0 ? s.today / s.avg7 : 1;
      if (ratio > 1.3) return { text: `Iya, hari ini agak boros: ${money(s.today)} vs rata-rata ${money(s.avg7)}. Besok rem ya.` };
      if (ratio < 0.7) return { text: `Nggak boros. Justru lagi hemat banget: hari ini ${money(s.today)}, rata-rata 7 hari ${money(s.avg7)}.` };
      return { text: `Nggak boros, masih normal: hari ini ${money(s.today)}, rata-rata ${money(s.avg7)}.` };
    }
    case 'month_budget': {
      if (snapshot.metrics.budgetConfigured === false || !Number.isFinite(m.budget.monthly) || !Number.isFinite(m.budget.monthSpent)) return { text: 'Budget bulanan belum tersedia. Atur budget Fintrack sebelum menghitung sisa budget.' };
      const left = m.budget.monthly - m.budget.monthSpent;
      return { text: `Budget sebulan ${money(m.budget.monthly)}, sudah kepakai ${money(m.budget.monthSpent)}, sisa ${money(left)}. Proyeksi akhir bulan ${money(s.projected)}.` };
    }
    case 'top_category':
      if (!s.categoryComplete) return { text: 'Nilai transaksi belum lengkap. Kategori pengeluaran terbesar belum dapat dipastikan.' };
      return { text: s.topCat ? `Kategori terbesar 7 hari terakhir: ${s.topCat} (${money(s.topAmt)}).` : 'Belum ada pengeluaran 7 hari terakhir. Bagus!' };
    case 'lp_exposure':
      if (s.lpShare === null) return { text: 'Valuasi portofolio belum lengkap. Persentase eksposur LP belum dapat dipastikan.' };
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
  const money = n => portfolioMoney(n, portfolioData(snapshot).currency);
  const t = spendingTone(snapshot);
  if (!Number.isFinite(t.today) || t.avg7 === null) return { title: 'Rapor harian: data belum lengkap', text: 'Data pengeluaran belum tersedia. Penilaian menunggu data lengkap.', tone: 'neutral' };
  if (t.tone === 'warn') {
    return { title: 'Rapor harian: boros', text: `Hari ini ${money(t.today)} (rata-rata ${money(t.avg7)}). Proyeksi ${money(t.projected)}. Rem pengeluarannya!`, tone: 'warn' };
  }
  if (t.tone === 'good') {
    return { title: 'Rapor harian: hemat', text: `Hemat banget hari ini: ${money(t.today)} vs rata-rata ${money(t.avg7)}. Pertahankan!`, tone: 'good' };
  }
  return { title: 'Rapor harian: stabil', text: `Pengeluaran stabil di ${money(t.today)}. Semua terkendali.`, tone: 'neutral' };
}
