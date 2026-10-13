import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildAdapters } from '../server/adapters/index.js';

describe('registry adapter', () => {
  it('dummy default untuk semua agen', () => {
    const cfg = {
      demoSeed: 1,
      demoSpeed: 1,
      staleAfterSec: 120,
      agents: {
        exitbot: { mode: 'dummy', pollMs: 5000 },
        lpwatcher: { mode: 'dummy', pollMs: 5000 },
        alert: { mode: 'dummy', pollMs: 5000 },
        portfolio: { mode: 'dummy', pollMs: 5000 },
      },
    };
    const list = buildAdapters(cfg);
    assert.equal(list.length, 4);
    assert.ok(list.every((a) => a.mode === 'dummy'));
  });
  it('campuran http + dummy', () => {
    const cfg = {
      demoSeed: 1,
      demoSpeed: 1,
      staleAfterSec: 120,
      agents: {
        exitbot: { mode: 'http', url: 'http://x', pollMs: 5000 },
        lpwatcher: { mode: 'dummy', pollMs: 5000 },
        alert: { mode: 'file', file: '/tmp/x.json', pollMs: 5000 },
        portfolio: { mode: 'dummy', pollMs: 5000 },
      },
    };
    const modes = Object.fromEntries(buildAdapters(cfg).map((a) => [a.id, a.mode]));
    assert.equal(modes.exitbot, 'http');
    assert.equal(modes.alert, 'file');
  });
});
