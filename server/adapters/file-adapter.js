/**
 * Adapter file: baca JSON dari <file> tiap poll (untuk bot tanpa server HTTP).
 * Backoff via rantai setTimeout; event offline/online sekali per transisi.
 */
import { readFile } from 'node:fs/promises';
import { validateSnapshot } from '../contract.js';
import { diffSnapshots } from '../services/event-deriver.js';
import { retryDelay } from './retry.js';

/**
 * @param {string} agentId
 * @param {{ file: string, pollMs?: number, staleAfterSec?: number }} opts
 */
export function createFileAdapter(agentId, opts) {
  const pollMs = opts.pollMs || 5000;
  const staleAfterSec = opts.staleAfterSec || 120;
  let timer = null;
  /** @type {any} */
  let ctx = null;
  let prev = null;
  let fails = 0;
  let offline = false;

  /** Jeda berikut sesuai gagal beruntun. */
  function delay() {
    return fails === 0 ? pollMs : retryDelay(pollMs, fails);
  }

  /** Jadwalkan poll berikut (rantai, bukan interval). */
  function schedule(ms) {
    clearTimeout(timer);
    timer = setTimeout(tick, ms);
  }

  async function tick() {
    const c = ctx;
    if (!c) return;
    await poll(c);
    if (ctx) schedule(delay());
  }

  async function poll(c) {
    if (!opts.file) return;
    try {
      const raw = await readFile(opts.file, 'utf8');
      const data = JSON.parse(raw);
      const v = validateSnapshot(agentId, data);
      if (!v.ok) throw new Error('Kontrak tidak valid: ' + v.errors.slice(0, 3).join('; '));
      fails = 0;
      const age = (Date.now() - Date.parse(data.updatedAt)) / 1000;
      const snap = { ...data };
      if (age > staleAfterSec) {
        snap.status = 'warn';
        snap.alerts = [...(snap.alerts || []), { id: 'stale-data', level: 'warn', message: 'Data basi', ts: new Date().toISOString() }];
      }
      const evs = diffSnapshots(agentId, prev, snap);
      prev = snap;
      c.publishSnapshot(agentId, snap);
      for (const e of evs) c.publishEvent(e);
      if (offline) {
        offline = false;
        c.publishEvent({ id: `on-${agentId}-${Date.now()}`, ts: new Date().toISOString(), type: 'agent_online', level: 'info', message: 'Aku kembali!', agentId, data: {} });
      }
    } catch (err) {
      fails += 1;
      c.log(`[${agentId}] baca file gagal (${fails}x): ${err && err.message ? err.message : err}`);
      if (fails >= 3 && !offline) {
        offline = true;
        if (prev) {
          const off = { ...prev, status: 'offline', headline: 'Terputus', updatedAt: new Date().toISOString() };
          c.publishSnapshot(agentId, off);
        }
        c.publishEvent({ id: `off-${agentId}-${Date.now()}`, ts: new Date().toISOString(), type: 'agent_offline', level: 'warn', message: 'Zzz... aku terputus.', agentId, data: {} });
      }
    }
  }

  return {
    id: agentId,
    mode: 'file',
    /** @param {any} c */
    start(c) {
      ctx = c;
      if (!opts.file) {
        ctx.log(`[${agentId}] MODE file tapi FILE kosong — agen offline.`);
        ctx.publishSnapshot(agentId, {
          agentId,
          status: 'offline',
          updatedAt: new Date().toISOString(),
          headline: 'File belum dikonfigurasi',
          metrics: {},
          alerts: [{ id: 'cfg-missing', level: 'critical', message: 'FILE kosong (isi <AGENT>_FILE di .env)', ts: new Date().toISOString() }],
          events: [],
        });
        return;
      }
      tick();
    },
    stop() {
      ctx = null;
      if (timer) clearTimeout(timer);
      timer = null;
    },
  };
}
