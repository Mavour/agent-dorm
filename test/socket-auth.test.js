import { it } from 'node:test';
import assert from 'node:assert/strict';
import { connectSocket } from '../public/js/socket.js';

it('socket waits for HTTP authorization; stopping during ticket fetch prevents a connection', async () => {
  const original = { location: globalThis.location, fetch: globalThis.fetch, WebSocket: globalThis.WebSocket };
  const opened = [];
  let respond;
  globalThis.location = new URL('http://localhost:8765');
  globalThis.fetch = () => new Promise((resolve) => { respond = resolve; });
  globalThis.WebSocket = class {
    constructor(url, protocols) { opened.push({ url, protocols }); }
    close() {}
  };
  const hud = { setConn() {} };
  let client;
  try {
    client = connectSocket({}, hud);
    assert.equal(opened.length, 0);
    respond({ ok: true, json: async () => ({ ticket: 'a'.repeat(43) }) });
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.deepEqual(opened, [{ url: 'ws://localhost:8765/ws', protocols: ['agent-dorm', 'a'.repeat(43)] }]);
    client.stop();
    client = connectSocket({}, hud);
    client.stop();
    respond({ ok: true, json: async () => ({ ticket: 'b'.repeat(43) }) });
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(opened.length, 1);
    client = connectSocket({}, hud);
    respond({ ok: false, status: 404 });
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(opened.length, 2, 'auth-disabled server works without a ticket endpoint');
    assert.equal(opened[1].protocols, undefined);
  } finally {
    client?.stop();
    if (original.location === undefined) delete globalThis.location;
    else globalThis.location = original.location;
    globalThis.fetch = original.fetch;
    globalThis.WebSocket = original.WebSocket;
  }
});
