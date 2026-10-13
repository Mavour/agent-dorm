/**
 * Dummy portfolio (Karo): net worth ~12.480, 30 hari transaksi,
 * pengeluaran hari ini hemat, lalu boros setelah t+100s.
 */
import { mulberry32, nowIso, eventId, registerDemoHandler, unregisterDemoHandler } from './engine.js';

const CATS = ['Makan', 'Transport', 'Langganan', 'Server/VPS', 'Belanja', 'Lainnya'];

/**
 * @param {{ seed?: number, speed?: number }} opts
 */
export function createPortfolioDummy(opts = {}) {
  const rnd = mulberry32((opts.seed ?? 42) + 21);
  const speed = opts.speed ?? 1;
  /** @type {any} */
  let ctx = null;
  let timer = null;
  const timers = [];
  let n = 0;

  /** @type {any[]} */
  let transactions = [];
  let monthSpent = 0;
  let reportCount = 0;
  let bigExpenseDone = false;

  function seedTx() {
    transactions = [];
    const now = Date.now();
    for (let d = 29; d >= 1; d--) {
      const day = new Date(now - d * 86400000);
      // 0-2 transaksi per hari, rata-rata ~7.2/hari
      const count = rnd() < 0.2 ? 0 : rnd() < 0.6 ? 1 : 2;
      for (let k = 0; k < count; k++) {
        const amt = r2(2 + rnd() * 9);
        transactions.push({
          id: `tx-${d}-${k}`,
          ts: new Date(day.getTime() + Math.floor(rnd() * 12 + 8) * 3600000).toISOString(),
          kind: 'expense',
          category: CATS[Math.floor(rnd() * CATS.length)],
          amountUsd: amt,
          note: 'Belanja harian',
        });
      }
      if (d % 3 === 0) {
        transactions.push({
          id: `tx-in-${d}`,
          ts: new Date(day.getTime() + 19 * 3600000).toISOString(),
          kind: 'income',
          category: 'Fee LP',
          amountUsd: r2(8 + rnd() * 14),
          note: 'Payout fee LP',
        });
      }
      if (d % 7 === 0) {
        transactions.push({
          id: `tx-tr-${d}`,
          ts: new Date(day.getTime() + 15 * 3600000).toISOString(),
          kind: 'income',
          category: 'Trading',
          amountUsd: r2(15 + rnd() * 30),
          note: 'Profit trading',
        });
      }
    }
    // Hari ini: hemat (2 transaksi kecil)
    const today = new Date();
    transactions.push({
      id: 'tx-today-1',
      ts: new Date(today.getTime() - 5 * 3600000).toISOString(),
      kind: 'expense',
      category: 'Makan',
      amountUsd: 1.85,
      note: 'Sarapan',
    });
    transactions.push({
      id: 'tx-today-2',
      ts: new Date(today.getTime() - 2 * 3600000).toISOString(),
      kind: 'expense',
      category: 'Transport',
      amountUsd: 0.89,
      note: 'Ojek',
    });
    transactions.sort((a, b) => (a.ts < b.ts ? 1 : -1));
    transactions = transactions.slice(0, 60);
    monthSpent = r2(transactions.filter((t) => t.kind === 'expense' && sameMonth(t.ts)).reduce((s, t) => s + t.amountUsd, 0));
  }

  function sameMonth(iso) {
    const d = new Date(iso);
    const n2 = new Date();
    return d.getMonth() === n2.getMonth() && d.getFullYear() === n2.getFullYear();
  }

  function sums() {
    const now = Date.now();
    const inDays = (t) => now - new Date(t.ts).getTime() < 86400000;
    const in7 = (t) => now - new Date(t.ts).getTime() < 7 * 86400000;
    const in30 = (t) => now - new Date(t.ts).getTime() < 30 * 86400000;
    const sum = (f, k) => r2(transactions.filter((t) => f(t) && t.kind === k).reduce((s, t) => s + t.amountUsd, 0));
    return {
      todayIncomeUsd: sum(inDays, 'income'),
      todayExpenseUsd: sum(inDays, 'expense'),
      last7dIncomeUsd: sum(in7, 'income'),
      last7dExpenseUsd: sum(in7, 'expense'),
      last30dIncomeUsd: sum(in30, 'income'),
      last30dExpenseUsd: sum(in30, 'expense'),
    };
  }

  function snapshot() {
    const cf = sums();
    return {
      agentId: 'portfolio',
      status: 'ok',
      updatedAt: nowIso(),
      headline: 'Portofolio stabil, pengeluaran hemat',
      metrics: {
        currency: 'USD',
        netWorthUsd: r2(12480 + (rnd() - 0.5) * 40),
        accounts: [
          { id: 'acc-stable', label: 'Stablecoin Wallet', type: 'stable', valueUsd: 3200 },
          { id: 'acc-lp', label: 'LP Positions', type: 'lp', valueUsd: 7100 },
          { id: 'acc-spot', label: 'Spot SOL', type: 'spot', valueUsd: 1780 },
          { id: 'acc-cash', label: 'Cash', type: 'cash', valueUsd: 400 },
        ],
        cashflow: cf,
        budget: { dailyUsd: 9, monthlyUsd: 270, monthSpentUsd: monthSpent },
        transactions: transactions.slice(0, 60),
      },
      alerts: [],
      events: [],
    };
  }

  function publish() {
    if (ctx) ctx.publishSnapshot('portfolio', snapshot());
  }

  function publishReport(tone) {
    reportCount += 1;
    ctx.publishEvent({
      id: eventId(`evt-report-${reportCount}`),
      ts: nowIso(),
      type: 'report_ready',
      level: 'info',
      message: 'Rapor harian sudah siap.',
      agentId: 'portfolio',
      data: { tone, title: 'Rapor harian', reportNo: reportCount },
    });
    publish();
  }

  function addExpense(amount, category, note) {
    n += 1;
    transactions = [
      { id: eventId(`tx-man-${n}`), ts: nowIso(), kind: 'expense', category, amountUsd: amount, note },
      ...transactions,
    ].slice(0, 60);
    monthSpent = r2(monthSpent + amount);
    publish();
  }

  function later(ms, fn) {
    timers.push(setTimeout(fn, ms / speed));
  }

  return {
    id: 'portfolio',
    mode: 'dummy',
    /** @param {any} c */
    start(c) {
      ctx = c;
      seedTx();
      publish();
      timer = setInterval(publish, 5000 / speed);
      later(50000, () => publishReport('good'));
      later(100000, () => {
        if (!bigExpenseDone) {
          bigExpenseDone = true;
          addExpense(85, 'Belanja', 'Belanja bulanan besar');
        }
      });
      registerDemoHandler('portfolio', (action) => {
        if (action === 'daily_report') {
          publishReport('good');
          return { handled: true };
        }
        if (action === 'big_expense') {
          addExpense(85, 'Belanja', 'Belanja bulanan besar');
          return { handled: true };
        }
        return null;
      });
    },
    stop() {
      if (timer) clearInterval(timer);
      for (const t of timers) clearTimeout(t);
      unregisterDemoHandler('portfolio');
    },
  };
}

function r2(n) {
  return Math.round(n * 100) / 100;
}
