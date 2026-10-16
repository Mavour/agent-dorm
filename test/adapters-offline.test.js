import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHttpAdapter } from '../server/adapters/http-adapter.js';
import { createFileAdapter } from '../server/adapters/file-adapter.js';

/** Tunggu kondisi (deadline, bukan sleep pas) agar tidak flaky. */
async function waitFor(fn, timeoutMs = 8000) {
  const t0 = Date.now();
  for (;;) {
    if (fn()) return;
    if (Date.now() - t0 > timeoutMs) throw new Error('timeout menunggu kondisi adapter');
    await new Promise((r) => setTimeout(r, 5));
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Snapshot valid dari contoh, updatedAt disegarkan agar tak basi. */
async function freshSnapshot() {
  const raw = await readFile(new URL('../examples/status-exitbot.json', import.meta.url), 'utf8');
  const data = JSON.parse(raw);
  data.updatedAt = new Date().toISOString();
  return data;
}

function makeCtx() {
  return {
    snapshots: [],
    events: [],
    publishSnapshot(id, s) {
      this.snapshots.push({ id, s });
    },
    publishEvent(e) {
      this.events.push(e);
    },
    log() {},
  };
}

const started = [];
afterEach(() => {
  while (started.length) {
    try {
      started.pop().stop();
    } catch {
      /* abaikan */
    }
  }
});

describe('adapter: transisi offline/online sekali per episode', () => {
  it('http: 1x offline saat down, 1x online saat pulih', async () => {
    const origFetch = globalThis.fetch;
    let up = true; // mulai online agar ada snapshot prev
    const data = await freshSnapshot();
    globalThis.fetch = async () => {
      if (!up) throw new Error('jaringan putus');
      return { ok: true, json: async () => ({ ...data, updatedAt: new Date().toISOString() }) };
    };
    try {
      const ad = createHttpAdapter('exitbot', { url: 'http://tes', pollMs: 10, staleAfterSec: 120 });
      const ctx = makeCtx();
      ad.start(ctx);
      started.push(ad);
      await waitFor(() => ctx.snapshots.length >= 1);
      up = false;
      await waitFor(() => ctx.events.filter((e) => e.type === 'agent_offline').length === 1);
      assert.equal(ctx.snapshots[ctx.snapshots.length - 1].s.status, 'offline');
      await sleep(150); // tetap down: tak boleh ada event offline kedua
      assert.equal(ctx.events.filter((e) => e.type === 'agent_offline').length, 1);
      up = true;
      await waitFor(() => ctx.events.filter((e) => e.type === 'agent_online').length === 1);
      await sleep(100); // pulih: tak boleh ada event online kedua
      assert.equal(ctx.events.filter((e) => e.type === 'agent_online').length, 1);
      assert.equal(ctx.events.filter((e) => e.type === 'agent_offline').length, 1);
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it('file: 1x offline saat rusak, 1x online saat pulih', async () => {
    const data = await freshSnapshot();
    const file = join(tmpdir(), `agent-dorm-uji-${Date.now()}.json`);
    await writeFile(file, JSON.stringify(data));
    try {
      const ad = createFileAdapter('exitbot', { file, pollMs: 10, staleAfterSec: 120 });
      const ctx = makeCtx();
      ad.start(ctx);
      started.push(ad);
      await waitFor(() => ctx.snapshots.length >= 1);
      await writeFile(file, 'ini-bukan-json{{{');
      await waitFor(() => ctx.events.filter((e) => e.type === 'agent_offline').length === 1);
      await sleep(150);
      assert.equal(ctx.events.filter((e) => e.type === 'agent_offline').length, 1);
      await writeFile(file, JSON.stringify({ ...data, updatedAt: new Date().toISOString() }));
      await waitFor(() => ctx.events.filter((e) => e.type === 'agent_online').length === 1);
      await sleep(100);
      assert.equal(ctx.events.filter((e) => e.type === 'agent_online').length, 1);
    } finally {
      await rm(file, { force: true });
    }
  });
});
