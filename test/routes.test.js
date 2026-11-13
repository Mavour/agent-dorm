import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { registerRoutes, demoThrottled } from '../server/routes.js';
import { registerDemoHandler, unregisterDemoHandler } from '../server/adapters/dummy/engine.js';

function buildApp() {
  const app = Fastify();
  const store = {
    getAllSnapshots: () => ({}),
    getMeta: () => ({}),
    getSnapshot: () => null,
    getEvents: () => [],
    getAllEvents: () => [],
  };
  const boss = { get: () => ({}) };
  const config = {
    version: '0.1.0',
    advisorMode: 'rules',
    demoControls: true,
    agents: { exitbot: { mode: 'dummy' } },
  };
  registerRoutes(app, { config, store, boss, conversation: { list: () => [], close: async () => {} } });
  return app;
}

describe('routes: throttle demo trigger', () => {
  it('demoThrottled murni: pertama lolos, kedua tertahan', () => {
    const key = `uji-${Date.now()}`;
    assert.equal(demoThrottled('1.2.3.4', key), false);
    assert.equal(demoThrottled('1.2.3.4', key), true);
    assert.equal(demoThrottled('5.6.7.8', key), false);
  });

  it('POST ganda cepat -> 200 lalu 429; aksi invalid tetap 400', async () => {
    registerDemoHandler('uji', (action) => (action === 'new_coin' ? { handled: true } : null));
    const app = buildApp();
    try {
      const body = JSON.stringify({ action: 'new_coin' });
      const r1 = await app.inject({ method: 'POST', url: '/api/demo/trigger', payload: body, headers: { 'content-type': 'application/json' } });
      assert.equal(r1.statusCode, 200);
      const r2 = await app.inject({ method: 'POST', url: '/api/demo/trigger', payload: body, headers: { 'content-type': 'application/json' } });
      assert.equal(r2.statusCode, 429);
      const bad = JSON.stringify({ action: 'ngawur' });
      const b1 = await app.inject({ method: 'POST', url: '/api/demo/trigger', payload: bad, headers: { 'content-type': 'application/json' } });
      const b2 = await app.inject({ method: 'POST', url: '/api/demo/trigger', payload: bad, headers: { 'content-type': 'application/json' } });
      assert.equal(b1.statusCode, 400);
      assert.equal(b2.statusCode, 400);
    } finally {
      unregisterDemoHandler('uji');
      await app.close();
    }
  });
});
