import { it } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { mkdtemp, mkdir, copyFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

it('Basic Auth challenges browser login and accepts only valid credentials', { timeout: 15_000 }, async () => {
  const root = fileURLToPath(new URL('..', import.meta.url));
  const prefix = path.join(tmpdir(), 'dorm-auth-');
  const cwd = await mkdtemp(prefix);
  const socket = createServer();
  socket.listen(0, '127.0.0.1');
  await once(socket, 'listening');
  const port = socket.address().port;
  await new Promise((resolve) => socket.close(resolve));
  await mkdir(path.join(cwd, 'public'));
  await copyFile(path.join(root, 'public/index.html'), path.join(cwd, 'public/index.html'));
  const child = spawn(process.execPath, [path.join(root, 'server/index.js')], {
    cwd,
    env: { ...process.env, HOST: '127.0.0.1', PORT: String(port), LOG_LEVEL: 'info',
      BASIC_AUTH_USER: 'fixture', BASIC_AUTH_PASS: 'fixture-password',
      ASSETS_DIR: path.join(root, 'assets_ready'), ADVISOR_MODE: 'rules',
      EXITBOT_MODE: 'dummy', ALERT_MODE: 'dummy', PORTFOLIO_MODE: 'dummy', LPWATCHER_MODE: 'dummy' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const exited = once(child, 'exit');
  try {
    await new Promise((resolve, reject) => {
      let output = '';
      const timer = setTimeout(() => reject(new Error('Server startup timeout')), 8000);
      child.stdout.on('data', (data) => {
        output += data;
        if (output.includes('Agent Dorm jalan di')) { clearTimeout(timer); resolve(); }
      });
      child.once('error', (error) => { clearTimeout(timer); reject(error); });
      child.once('exit', () => { clearTimeout(timer); reject(new Error('Server exited before test completed')); });
    });
    for (const route of ['/', '/api/state', '/assets/assets.json']) {
      const url = `http://127.0.0.1:${port}${route}`;
      const missing = await fetch(url);
      assert.equal(missing.status, 401);
      assert.match(missing.headers.get('www-authenticate') || '', /^Basic realm="Agent Dorm"/);
      const wrong = await fetch(url, { headers: { Authorization: `Basic ${Buffer.from('fixture:wrong').toString('base64')}` } });
      assert.equal(wrong.status, 401);
      const valid = await fetch(url, { headers: { Authorization: `Basic ${Buffer.from('fixture:fixture-password').toString('base64')}` } });
      assert.equal(valid.status, 200);
      await valid.arrayBuffer();
    }
  } finally {
    child.kill();
    await exited;
    if (path.resolve(cwd).startsWith(path.resolve(prefix))) await rm(cwd, { recursive: true, force: true });
  }
});
