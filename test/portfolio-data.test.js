import { it } from 'node:test';
import assert from 'node:assert/strict';
import { portfolioData, portfolioMoney } from '../public/js/portfolio-data.js';

it('uses native IDR exactly as received, without converting inconsistent USD or FX', () => {
  const snapshot = { metrics: {
    currency: 'USD', netWorthUsd: 999, valuationComplete: true,
    cashflow: { todayExpenseUsd: 123 }, budget: { monthlyUsd: 456, monthSpentUsd: 100 },
    fx: { rate: 99999 }, transactions: [{ id: 'tx', amountIdr: 25000, amountUsd: 999 }],
    native: { currency: 'IDR', knownNetWorthIdr: 1234567, cashflow: { todayExpenseIdr: 25000 }, monthlyBudgetIdr: 1000000, monthSpentIdr: 300000 },
  } };
  const data = portfolioData(snapshot);
  assert.equal(data.currency, 'IDR');
  assert.equal(data.netWorth, 1234567);
  assert.equal(data.cashflow.todayExpense, 25000);
  assert.equal(data.budget.monthly, 1000000);
  assert.equal(data.transactions[0].amount, 25000);
  assert.equal(snapshot.metrics.transactions[0].amount, undefined, 'input snapshot stays unchanged');
});

it('native missing values remain unknown while zero remains zero', () => {
  const data = portfolioData({ metrics: { cashflow: { todayIncomeUsd: 100 }, budget: {}, transactions: [{ amountUsd: 100 }], native: { currency: 'IDR', cashflow: { todayExpenseIdr: 0 } } } });
  assert.equal(data.cashflow.todayExpense, 0);
  assert.equal(data.cashflow.todayIncome, null);
  assert.equal(data.transactions[0].amount, null);
  assert.match(portfolioMoney(0, 'IDR'), /Rp.*0/);
  assert.equal(portfolioMoney(null, 'IDR'), 'belum tersedia');
});

it('legacy USD sources still display their original currency', () => {
  const data = portfolioData({ metrics: { netWorthUsd: 100, cashflow: { todayExpenseUsd: 5 }, budget: { monthlyUsd: 200, monthSpentUsd: 50 }, transactions: [{ amountUsd: 5 }] } });
  assert.equal(data.currency, 'USD');
  assert.equal(data.netWorth, 100);
  assert.equal(data.transactions[0].amount, 5);
  assert.equal(portfolioMoney(5, data.currency), '$5.00');
});
