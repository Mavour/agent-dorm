import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { createPortfolioDummy } from '../server/adapters/dummy/portfolio.js';
import { triggerDemo } from '../server/adapters/dummy/engine.js';
import { dailyReport } from '../server/services/advisor/rules-advisor.js';
import { spendingTone } from '../server/services/advisor/spend-metrics.js';

describe('nada portfolio: satu sumber kebenaran', () => {
  /** @type {any[]} */
  const snaps = [];
  /** @type {any[]} */
  const events = [];
  // speed 1: jadwal t+50/t+100 tidak ikut campur selama tes (ms).
  const ad = createPortfolioDummy({ seed: 42, speed: 1 });
  ad.start({
    publishSnapshot: (id, s) => snaps.push(s),
    publishEvent: (e) => events.push(e),
    log: () => {},
  });
  after(() => ad.stop());

  const lastSnap = () => snaps[snaps.length - 1];
  const lastReport = () => events.filter((e) => e.type === 'report_ready').pop();

  it('sebelum belanja besar: hemat dan semua sepakat', () => {
    assert.equal(triggerDemo('daily_report').handled, true);
    const ev = lastReport();
    assert.ok(ev, 'harus ada event report_ready');
    assert.equal(ev.data.tone, 'good');
    const snap = lastSnap();
    assert.equal(snap.status, 'ok');
    assert.deepEqual(snap.alerts, []);
    assert.ok(snap.headline.length > 0 && snap.headline.length <= 80);
    assert.equal(spendingTone(snap).tone, 'good');
    assert.equal(dailyReport(snap).tone, 'good');
    assert.equal(dailyReport(snap).title, ev.data.title);
  });

  it('setelah belanja besar: boros dan semua sepakat', () => {
    assert.equal(triggerDemo('big_expense').handled, true);
    assert.equal(triggerDemo('daily_report').handled, true);
    const ev = lastReport();
    assert.equal(ev.data.tone, 'warn');
    const snap = lastSnap();
    assert.equal(snap.status, 'warn');
    assert.ok(snap.alerts.some((a) => a.message === 'Pengeluaran melebihi rata-rata'));
    assert.equal(spendingTone(snap).tone, 'warn');
    assert.equal(dailyReport(snap).tone, 'warn');
    assert.equal(dailyReport(snap).title, ev.data.title);
  });
});
