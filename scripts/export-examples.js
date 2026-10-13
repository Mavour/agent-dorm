/**
 * Tulis examples/status-<agent>.json dari snapshot dummy.
 * Jalan: npm run export:examples
 */
import { writeFile, mkdir } from 'node:fs/promises';
import { createExitbotDummy } from '../server/adapters/dummy/exitbot.js';
import { createLpwatcherDummy } from '../server/adapters/dummy/lpwatcher.js';
import { createAlertDummy } from '../server/adapters/dummy/alert.js';
import { createPortfolioDummy } from '../server/adapters/dummy/portfolio.js';

const factories = {
  exitbot: createExitbotDummy,
  lpwatcher: createLpwatcherDummy,
  alert: createAlertDummy,
  portfolio: createPortfolioDummy,
};

async function one(id) {
  return new Promise((resolve) => {
    const ad = factories[id]({ seed: 42, speed: 1000 });
    ad.start({
      publishSnapshot: (aid, s) => {
        if (aid === id) {
          ad.stop();
          resolve(s);
        }
      },
      publishEvent: () => {},
      log: () => {},
    });
  });
}

await mkdir('examples', { recursive: true });
for (const id of Object.keys(factories)) {
  const s = await one(id);
  await writeFile(`examples/status-${id}.json`, JSON.stringify(s, null, 2) + '\n');
  console.log(`ditulis examples/status-${id}.json`);
}
