import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mulberry32, eventId } from '../server/adapters/dummy/engine.js';
import { createStore } from '../server/store.js';

describe('dummy engine + store', () => {
  it('PRNG seeded reproducible', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    assert.equal(a(), b());
    assert.equal(a(), b());
  });
  it('store dedupe event + ring buffer', () => {
    const store = createStore();
    assert.equal(store.publishEvent({ id: 'x-1', type: 'info' }), true);
    assert.equal(store.publishEvent({ id: 'x-1', type: 'info' }), false);
    for (let i = 0; i < 250; i++) store.publishEvent({ id: `e-${i}`, type: 'info' });
    assert.ok(store.getAllEvents().length <= 200);
  });
  it('eventId unik', () => {
    assert.notEqual(eventId('a'), eventId('a'));
  });
});
