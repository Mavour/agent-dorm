/** Read Fintrack's native amounts as supplied. Never infer an exchange rate. */
export function portfolioData(snapshot) {
  const m = snapshot.metrics;
  const native = m.native?.currency === 'IDR' ? m.native : null;
  const suffix = native ? 'Idr' : 'Usd';
  const source = native || m;
  const cashflow = {};
  for (const key of ['todayIncome', 'todayExpense', 'last7dIncome', 'last7dExpense', 'last30dIncome', 'last30dExpense']) {
    cashflow[key] = source.cashflow?.[key + suffix] ?? null;
  }
  return {
    currency: native ? 'IDR' : 'USD',
    netWorth: native ? (m.valuationComplete === true ? native.knownNetWorthIdr : null) : m.netWorthUsd,
    knownNetWorth: native ? native.knownNetWorthIdr : m.knownNetWorthUsd,
    cashflow,
    budget: {
      monthly: native ? native.monthlyBudgetIdr : m.budget.monthlyUsd,
      monthSpent: native ? native.monthSpentIdr : m.budget.monthSpentUsd,
    },
    transactions: (m.transactions || []).map(tx => ({ ...tx, amount: tx['amount' + suffix] ?? null })),
  };
}

export function portfolioMoney(amount, currency) {
  if (!Number.isFinite(amount)) return 'belum tersedia';
  return new Intl.NumberFormat(currency === 'IDR' ? 'id-ID' : 'en-US', {
    style: 'currency', currency, maximumFractionDigits: currency === 'IDR' ? 0 : 2,
  }).format(amount);
}

/** Same spending assessment for the panel, advisor, and report events. */
export function portfolioSpending(snapshot) {
  const m = portfolioData(snapshot);
  const today = m.cashflow.todayExpense;
  const avg7 = Number.isFinite(m.cashflow.last7dExpense) ? m.cashflow.last7dExpense / 7 : null;
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-US', {
    ...(snapshot.metrics.dayTimeZone ? { timeZone: snapshot.metrics.dayTimeZone } : {}),
    year: 'numeric', month: 'numeric', day: 'numeric',
  }).formatToParts(now);
  const part = key => Number(parts.find(p => p.type === key).value);
  const daysElapsed = part('day');
  const daysInMonth = new Date(Date.UTC(part('year'), part('month'), 0)).getUTCDate();
  const projected = Number.isFinite(m.budget.monthSpent) ? m.budget.monthSpent / daysElapsed * daysInMonth : null;
  const monthlyBudget = m.budget.monthly;
  const ratio = avg7 > 0 ? today / avg7 : 1;
  let tone = 'neutral';
  if ((Number.isFinite(today) && ratio > 1.3) || (Number.isFinite(monthlyBudget) && projected !== null && projected > monthlyBudget)) tone = 'warn';
  else if (Number.isFinite(today) && ratio < 0.7) tone = 'good';
  return { tone, today, avg7, projected, monthlyBudget };
}
