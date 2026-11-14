import { it } from 'node:test';
import assert from 'node:assert/strict';
import { renderLpwatcher } from '../public/js/panels/lpwatcher.js';

class Element {
  children = [];
  style = {};
  textContent = '';
  constructor(tag, className = '') {
    this.tag = tag;
    this.className = className;
    this.classList = { add: name => { this.className += ' ' + name; } };
  }
  appendChild(child) { this.children.push(child); return child; }
}
const helpers = {
  el: (tag, cls) => new Element(tag, cls),
  t(tag, text, cls) { const e = new Element(tag, cls); e.textContent = text; return e; },
};
const text = e => e.textContent + e.children.map(text).join(' ');
const nodes = e => [e, ...e.children.flatMap(nodes)];

function snapshot() {
  return { metrics: {
    wallet: '2 Robinhood wallets', wallets: [{ address: '0x1111111111111111111111111111111111111111', label: 'Main', protocols: [{ protocol: 'v3', stale: true, updatedAt: null }] }],
    totals: { valueUsd: 100, feesEarnedUsd: 1, unrealizedPnlUsd: 0, positionsInRange: 0, positionsOutOfRange: 0 },
    totalsComplete: { valueUsd: false, feesEarnedUsd: false, unrealizedPnlUsd: false, positions: false },
    feesBasis: 'estimated-unclaimed-only',
    positions: [{ id: '1', pair: 'A/B', protocol: 'Uniswap v3', rangeLow: null, rangeHigh: null, price: null, inRange: null, valueUsd: null, feesEarnedUsd: 1, unrealizedPnlUsd: null, ilPct: null, feesEstimated: true, stale: true }],
  } };
}

it('Hood watcher unknown PnL and range never appear as zero profit, OUT, or a fabricated range bar', () => {
  const body = new Element('div');
  renderLpwatcher(body, snapshot(), helpers);
  const rendered = text(body);
  assert.match(rendered, /Subtotal nilai diketahui/);
  assert.match(rendered, /Fee belum diklaim \(estimasi\)/);
  assert.equal(body.children[0].children[2].children[0].textContent, 'Belum tersedia');
  assert.match(rendered, /Range belum diketahui/);
  assert.match(rendered, /Data tertunda/);
  assert.match(rendered, /IL belum tersedia/);
  assert.match(rendered, /V3: tertunda/);
  assert.ok(!rendered.includes('null%'));
  assert.ok(!nodes(body).some(e => e.className.split(' ').includes('rangebar')));
  assert.ok(!nodes(body).some(e => e.textContent === 'OUT'));
});

it('an unscanned zero subtotal stays unknown while a confirmed empty wallet can show zero', () => {
  const snap = snapshot();
  snap.metrics.positions = [];
  snap.metrics.totals.valueUsd = 0;
  snap.metrics.totals.feesEarnedUsd = 0;
  const pending = new Element('div'); renderLpwatcher(pending, snap, helpers);
  assert.equal(pending.children[0].children[0].children[0].textContent, '-');
  assert.equal(pending.children[0].children[1].children[0].textContent, '-');
  snap.metrics.totalsComplete = { valueUsd: true, feesEarnedUsd: true, unrealizedPnlUsd: true, positions: true };
  const complete = new Element('div'); renderLpwatcher(complete, snap, helpers);
  assert.equal(complete.children[0].children[0].children[0].textContent, '$0.00');
  assert.equal(complete.children[0].children[1].children[0].textContent, '$0.00');
});

it('existing numeric snapshots still show ranges and PnL', () => {
  const snap = snapshot();
  delete snap.metrics.totalsComplete;
  delete snap.metrics.feesBasis;
  Object.assign(snap.metrics.positions[0], { rangeLow: 1, rangeHigh: 2, price: 1.5, inRange: true, valueUsd: 100, unrealizedPnlUsd: 5, ilPct: 1, stale: false });
  snap.metrics.totals.unrealizedPnlUsd = 5;
  const body = new Element('div'); renderLpwatcher(body, snap, helpers);
  assert.ok(nodes(body).some(e => e.className === 'rangebar'));
  assert.equal(body.children[0].children[2].children[0].textContent, '+$5.00');
});
