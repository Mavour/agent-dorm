import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { retryDelay, MAX_RETRY_DELAY_MS } from '../server/adapters/retry.js';

describe('retry: jeda poll ulang', () => {
  it('tanpa gagal -> pollMs', () => {
    assert.equal(retryDelay(5000, 0), 5000);
    assert.equal(retryDelay(5000, -3), 5000);
  });
  it('ganda tiap gagal', () => {
    assert.equal(retryDelay(5000, 1), 10000);
    assert.equal(retryDelay(5000, 2), 20000);
    assert.equal(retryDelay(5000, 3), 40000);
  });
  it('dibatasi 60 dtk, pollMs aneh -> 5000', () => {
    assert.equal(MAX_RETRY_DELAY_MS, 60000);
    assert.equal(retryDelay(5000, 10), 60000);
    assert.equal(retryDelay(0, 3), 40000);
    assert.equal(retryDelay(-1, 0), 5000);
  });
});
