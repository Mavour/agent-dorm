import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { advise, answer, dailyReport, QUESTIONS } from '../server/services/advisor/rules-advisor.js';
import { getAdvisor } from '../server/services/advisor/index.js';

function snap(todayExpense, avg7Expense, monthSpent = 100) {
  return {
    metrics: {
      netWorthUsd: 12480,
      accounts: [
        { id: 'a', label: 'Stable', type: 'stable', valueUsd: 3200 },
        { id: 'b', label: 'LP', type: 'lp', valueUsd: 7100 },
        { id: 'c', label: 'Spot', type: 'spot', valueUsd: 1780 },
        { id: 'd', label: 'Cash', type: 'cash', valueUsd: 400 },
      ],
      cashflow: {
        todayIncomeUsd: 5,
        todayExpenseUsd: todayExpense,
        last7dIncomeUsd: 100,
        last7dExpenseUsd: avg7Expense * 7,
        last30dIncomeUsd: 400,
        last30dExpenseUsd: 220,
      },
      budget: { dailyUsd: 9, monthlyUsd: 270, monthSpentUsd: monthSpent },
      transactions: [
        { id: 't1', ts: new Date().toISOString(), kind: 'expense', category: 'Makan', amountUsd: 5, note: '' },
      ],
    },
  };
}

describe('rules advisor', () => {
  it('Fintrack native IDR drives advice, report, and transactions even when USD/FX is absent', () => {
    const s = snap(2.74, 7.2);
    for (const key of Object.keys(s.metrics.cashflow)) s.metrics.cashflow[key] = null;
    s.metrics.budget = { dailyUsd: null, monthlyUsd: null, monthSpentUsd: null };
    s.metrics.netWorthUsd = null;
    s.metrics.valuationComplete = false;
    s.metrics.budgetConfigured = true;
    s.metrics.native = {
      currency: 'IDR', knownNetWorthIdr: 123456789,
      cashflow: { todayIncomeIdr: 100000, todayExpenseIdr: 25000, last7dIncomeIdr: 700000, last7dExpenseIdr: 350000, last30dIncomeIdr: 3000000, last30dExpenseIdr: 1000000 },
      monthlyBudgetIdr: 2000000, monthSpentIdr: 400000,
    };
    s.metrics.transactions[0].amountIdr = 25000;
    s.metrics.transactions[0].amountUsd = null;
    assert.match(answer('today_summary', s).text, /Rp.*100\.000/);
    assert.match(answer('today_summary', s).text, /Subtotal aset Rp.*123\.456\.789/);
    assert.match(answer('month_budget', s).text, /sisa Rp.*1\.600\.000/);
    assert.match(answer('top_category', s).text, /Makan.*Rp.*25\.000/);
    assert.match(dailyReport(s).text, /Rp.*25\.000/);
    const cards = advise(s);
    assert.ok(cards.some(a => a.id === 'spend-good'));
    assert.ok(!cards.some(a => ['budget-unavailable', 'spend-unavailable'].includes(a.id)));
    assert.ok(!JSON.stringify(cards).includes('$'));
  });
  it('Fintrack incomplete valuation and missing budget do not crash or imply healthy LP exposure', () => {
    const s = snap(2.74, 7.2);
    s.metrics.netWorthUsd = null;
    s.metrics.valuationComplete = false;
    s.metrics.budgetConfigured = false;
    s.metrics.budget.monthlyUsd = null;
    s.metrics.budget.dailyUsd = null;
    for (const q of QUESTIONS) assert.equal(typeof answer(q, s).text, 'string');
    assert.match(answer('today_summary', s).text, /belum lengkap/);
    assert.match(answer('month_budget', s).text, /belum tersedia/);
    assert.match(answer('lp_exposure', s).text, /belum dapat dipastikan/);
    const cards = advise(s);
    assert.ok(cards.some(a => a.id === 'budget-unavailable'));
    assert.ok(!cards.some(a => ['budget-warn', 'budget-good', 'budget-neutral'].includes(a.id)));
  });
  it('missing FX does not turn unknown spending into zero or a normal report', () => {
    const s = snap(2.74, 7.2);
    for (const key of Object.keys(s.metrics.cashflow)) s.metrics.cashflow[key] = null;
    for (const key of Object.keys(s.metrics.budget)) s.metrics.budget[key] = null;
    s.metrics.accounts.forEach(a => { a.valueUsd = null; });
    s.metrics.transactions.forEach(tx => { tx.amountUsd = null; });
    s.metrics.netWorthUsd = null;
    for (const q of QUESTIONS) assert.doesNotThrow(() => answer(q, s));
    assert.match(answer('am_i_wasteful', s).text, /belum lengkap/);
    assert.match(answer('top_category', s).text, /belum dapat dipastikan/);
    assert.match(dailyReport(s).title, /belum lengkap/);
    const cards = advise(s);
    assert.ok(cards.some(a => a.id === 'spend-unavailable'));
    assert.ok(!cards.some(a => ['spend-good', 'spend-neutral', 'emergency'].includes(a.id)));
  });
  it('hemat kalau today < 0.7 * avg7', () => {
    const a = advise(snap(2.74, 7.2));
    assert.ok(a.some((x) => x.id === 'spend-good'));
  });
  it('boros kalau today > 1.3 * avg7', () => {
    const a = advise(snap(15, 7.2));
    assert.ok(a.some((x) => x.id === 'spend-warn'));
  });
  it('semua questionId terjawab', () => {
    for (const q of QUESTIONS) {
      const r = answer(q, snap(2.74, 7.2));
      assert.ok(typeof r.text === 'string' && r.text.length > 0);
    }
  });
  it('questionId asing melempar', () => {
    assert.throws(() => answer('ngaco', snap(1, 7)));
  });
  it('dailyReport hemat di awal', () => {
    const r = dailyReport(snap(2.74, 7.2, 100));
    assert.equal(r.tone, 'good');
  });
  it('getAdvisor fallback ke rules saat llm tanpa key', () => {
    const adv = getAdvisor({ advisorMode: 'llm', openrouterKey: '' });
    assert.equal(typeof adv.advise, 'function');
  });
});
