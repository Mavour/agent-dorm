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
    const adv = getAdvisor({ advisorMode: 'llm', anthropicKey: '' });
    assert.equal(typeof adv.advise, 'function');
  });
});
