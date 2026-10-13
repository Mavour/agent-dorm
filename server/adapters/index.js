/**
 * Registry adapter: bangun 1 adapter per agen sesuai MODE.
 */
import { createHttpAdapter } from './http-adapter.js';
import { createFileAdapter } from './file-adapter.js';
import { createExitbotDummy } from './dummy/exitbot.js';
import { createLpwatcherDummy } from './dummy/lpwatcher.js';
import { createAlertDummy } from './dummy/alert.js';
import { createPortfolioDummy } from './dummy/portfolio.js';

const DUMMY_FACTORY = {
  exitbot: createExitbotDummy,
  lpwatcher: createLpwatcherDummy,
  alert: createAlertDummy,
  portfolio: createPortfolioDummy,
};

/**
 * @param {any} config hasil loadConfig()
 */
export function buildAdapters(config) {
  /** @type {any[]} */
  const list = [];
  for (const id of Object.keys(config.agents)) {
    const a = config.agents[id];
    if (a.mode === 'http') {
      list.push(createHttpAdapter(id, { url: a.url, apiKey: a.apiKey, pollMs: a.pollMs, staleAfterSec: config.staleAfterSec }));
    } else if (a.mode === 'file') {
      list.push(createFileAdapter(id, { file: a.file, pollMs: a.pollMs, staleAfterSec: config.staleAfterSec }));
    } else {
      list.push(DUMMY_FACTORY[id]({ seed: config.demoSeed, speed: config.demoSpeed }));
    }
  }
  return list;
}

/**
 * @param {any} config
 */
export function hasAnyDummy(config) {
  return Object.values(config.agents).some((a) => a.mode === 'dummy');
}
