/**
 * Parser file .env yang sangat kecil (tanpa dependensi).
 * Aturan: file .env opsional; TIDAK PERNAH menimpa environment variable asli.
 */
import { readFileSync, existsSync } from 'node:fs';

/**
 * Muat file .env ke process.env (hanya untuk key yang belum ada).
 * @param {string} [path='.env'] path file .env
 * @returns {string[]} daftar key yang dimuat
 */
export function loadDotEnv(path = '.env') {
  /** @type {string[]} */
  const loaded = [];
  if (!existsSync(path)) return loaded;
  let raw;
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    return loaded;
  }
  for (const line of raw.split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq < 0) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!key) continue;
    if (!(key in process.env)) {
      process.env[key] = val;
      loaded.push(key);
    }
  }
  return loaded;
}
