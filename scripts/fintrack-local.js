/** Local Karo bridge: run only Fintrack's read-only API, without its sync jobs. */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parseEnv } from 'node:util';
import { pathToFileURL } from 'node:url';
import { loadDotEnv } from '../server/env.js';

loadDotEnv();
const directory = process.argv[2];
if (!directory) throw new Error('Gunakan: node scripts/fintrack-local.js <folder-fintrack>');
const root = path.resolve(directory);
const env = parseEnv(readFileSync(path.join(root, '.env'), 'utf8'));
const url = new URL(process.env.PORTFOLIO_URL || 'http://127.0.0.1:9002');
if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(url.hostname) || url.pathname !== '/' || url.username || url.password || url.search || url.hash) {
  throw new Error('Bridge lokal memerlukan PORTFOLIO_URL HTTP loopback tanpa path atau kredensial.');
}
const apiKey = process.env.PORTFOLIO_API_KEY;
if (!apiKey) throw new Error('Isi PORTFOLIO_API_KEY di .env Dorm sebelum menjalankan bridge.');
const { readDormApiOptions, startDormApi } = await import(pathToFileURL(path.join(root, 'dist/server/dormApi.js')));
const options = readDormApiOptions({ ...env, STATUS_API_ENABLED: 'true', STATUS_API_KEY: apiKey, STATUS_API_HOST: '127.0.0.1', STATUS_API_PORT: url.port || '80' });
const api = await startDormApi(path.resolve(root, env.DATABASE_PATH || './data/app.db'), options);
console.log(`Fintrack read-only API siap di http://127.0.0.1:${options.port}/status`);
let closing = false;
async function close() {
  if (closing) return;
  closing = true;
  await api.close();
}
process.on('SIGINT', close);
process.on('SIGTERM', close);
