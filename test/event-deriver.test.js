import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { diffSnapshots } from '../server/services/event-deriver.js';

describe('event deriver', () => {
  it('poll pertama diam (tanpa event histori)', () => {
    const next = { alerts: [{ id: 'a' }], metrics: {} };
    assert.deepEqual(diffSnapshots('exitbot', null, next), []);
  });
  it('eksekusi baru -> position_closed', () => {
    const prev = { alerts: [], events: [], metrics: { recentExecutions: [] } };
    const next = { alerts: [], events: [], metrics: { recentExecutions: [{ id: 'x1', pair: 'SOL/USDC', reason: 'take_profit', pnlUsd: 10, ts: new Date().toISOString() }] } };
    const evs = diffSnapshots('exitbot', prev, next);
    assert.equal(evs[0].type, 'position_closed');
  });
  it('kandidat baru -> coin_found', () => {
    const prev = { alerts: [], events: [], metrics: { candidates: [] } };
    const next = { alerts: [], events: [], metrics: { candidates: [{ id: 'c1', symbol: 'NEKOZ', score: 80, pair: 'NEKOZ/USDC', foundAt: new Date().toISOString() }] } };
    assert.equal(diffSnapshots('alert', prev, next)[0].type, 'coin_found');
  });
  it('inRange true->false -> out_of_range, sebaliknya back_in_range', () => {
    const mk = (inRange) => ({ alerts: [], events: [], metrics: { positions: [{ id: 'p', pair: 'A/B', inRange }] } });
    assert.equal(diffSnapshots('lpwatcher', mk(true), mk(false))[0].type, 'position_out_of_range');
    assert.equal(diffSnapshots('lpwatcher', mk(false), mk(true))[0].type, 'position_back_in_range');
  });
  it('alert baru diteruskan', () => {
    const prev = { alerts: [], events: [], metrics: {} };
    const next = { alerts: [{ id: 'n1', level: 'warn', message: 'Halo' }], events: [], metrics: {} };
    assert.equal(diffSnapshots('exitbot', prev, next).length, 1);
  });
});
