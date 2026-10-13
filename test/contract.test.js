import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validateSnapshot } from '../server/contract.js';
import { createExitbotDummy } from '../server/adapters/dummy/exitbot.js';
import { createLpwatcherDummy } from '../server/adapters/dummy/lpwatcher.js';
import { createAlertDummy } from '../server/adapters/dummy/alert.js';
import { createPortfolioDummy } from '../server/adapters/dummy/portfolio.js';

function collect(factory, id) {
  return new Promise((resolve) => {
    const snaps = [];
    const ad = factory({ seed: 42, speed: 1000 });
    ad.start({
      publishSnapshot: (aid, s) => {
        if (aid === id) snaps.push(s);
        if (snaps.length >= 1) {
          ad.stop();
          resolve(snaps[0]);
        }
      },
      publishEvent: () => {},
      log: () => {},
    });
  });
}

describe('kontrak: snapshot dummy valid', () => {
  it('exitbot valid', async () => {
    const s = await collect(createExitbotDummy, 'exitbot');
    assert.equal(validateSnapshot('exitbot', s).ok, true);
  });
  it('lpwatcher valid', async () => {
    const s = await collect(createLpwatcherDummy, 'lpwatcher');
    assert.equal(validateSnapshot('lpwatcher', s).ok, true);
  });
  it('alert valid', async () => {
    const s = await collect(createAlertDummy, 'alert');
    assert.equal(validateSnapshot('alert', s).ok, true);
  });
  it('portfolio valid', async () => {
    const s = await collect(createPortfolioDummy, 'portfolio');
    assert.equal(validateSnapshot('portfolio', s).ok, true);
  });
  it('menolak snapshot rusak', () => {
    const r = validateSnapshot('exitbot', { agentId: 'exitbot' });
    assert.equal(r.ok, false);
    assert.ok(r.errors.length > 0);
  });
});
