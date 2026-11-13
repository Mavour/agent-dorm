import { it } from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { registerAuth } from '../server/auth.js';

async function fixture(t) {
  const prefix = path.join(tmpdir(), 'dorm-sessions-');
  const directory = await mkdtemp(prefix);
  const sessionFile = path.join(directory, 'sessions.json');
  let time = Date.now();
  const apps = [];
  function open(password = 'fixture-password') {
    const app = Fastify();
    registerAuth(app, { basicUser: 'fixture', basicPass: password }, { sessionFile, now: () => time });
    app.get('/private', async () => ({ secret: 'fixture-data' }));
    apps.push(app);
    return app;
  }
  t.after(async () => {
    for (const app of apps) await app.close();
    if (path.resolve(directory).startsWith(path.resolve(prefix))) await rm(directory, { recursive: true, force: true });
  });
  const login = (app, remember = true) => app.inject({ method: 'POST', url: '/api/auth/login', payload: { username: 'fixture', password: 'fixture-password', remember } });
  return { open, login, sessionFile, advance: (ms) => { time += ms; } };
}

it('remembered sessions survive server restart, contain only hashes on disk, and expire after 30 days', async (t) => {
  const f = await fixture(t);
  const app = f.open();
  const response = await f.login(app);
  assert.equal(response.statusCode, 200);
  const header = response.headers['set-cookie'];
  assert.match(header, /HttpOnly/);
  assert.match(header, /SameSite=Lax/);
  assert.match(header, /Max-Age=2592000/);
  const cookie = header.split(';')[0];
  const stored = await readFile(f.sessionFile, 'utf8');
  assert.ok(!stored.includes(cookie.split('=')[1]));
  assert.ok(!stored.includes('fixture-password'));
  assert.equal((await app.inject({ url: '/private', headers: { cookie } })).statusCode, 200);
  await app.close();
  const restarted = f.open();
  assert.equal((await restarted.inject({ url: '/private', headers: { cookie } })).statusCode, 200);
  f.advance(30 * 86400000 + 1);
  assert.equal((await restarted.inject({ url: '/private', headers: { cookie } })).statusCode, 401);
});

it('session-only login has no persistent cookie and expires in eight hours', async (t) => {
  const f = await fixture(t);
  const app = f.open();
  const response = await f.login(app, false);
  assert.ok(!response.headers['set-cookie'].includes('Max-Age'));
  const cookie = response.headers['set-cookie'].split(';')[0];
  f.advance(8 * 3600000 + 1);
  assert.equal((await app.inject({ url: '/private', headers: { cookie } })).statusCode, 401);
});

it('logging in on another device does not revoke the first device session', async (t) => {
  const f = await fixture(t);
  const app = f.open();
  const cookies = [];
  for (let i = 0; i < 3; i++) cookies.push((await f.login(app)).headers['set-cookie'].split(';')[0]);
  assert.equal(new Set(cookies).size, 3);
  await app.close();
  const restarted = f.open();
  for (const cookie of cookies) assert.equal((await restarted.inject({ url: '/private', headers: { cookie } })).statusCode, 200);
});

it('logout is persistent, cross-origin writes are blocked, and changing the account revokes old sessions', async (t) => {
  const f = await fixture(t);
  const app = f.open();
  const response = await f.login(app);
  const cookie = response.headers['set-cookie'].split(';')[0];
  assert.equal((await app.inject({ method: 'POST', url: '/api/auth/logout', headers: { cookie, origin: 'https://other.example' } })).statusCode, 403);
  assert.equal((await app.inject({ url: '/private', headers: { cookie } })).statusCode, 200);
  const logout = await app.inject({ method: 'POST', url: '/api/auth/logout', headers: { cookie } });
  assert.match(logout.headers['set-cookie'], /Max-Age=0/);
  await app.close();
  const restarted = f.open();
  assert.equal((await restarted.inject({ url: '/private', headers: { cookie } })).statusCode, 401);
  const nextCookie = (await f.login(restarted)).headers['set-cookie'].split(';')[0];
  await restarted.close();
  const changed = f.open('new-fixture-password');
  assert.equal((await changed.inject({ url: '/private', headers: { cookie: nextCookie } })).statusCode, 401);
});

it('forged cookies, browser Basic headers and cross-origin logins cannot bypass authentication; failed logins are limited', async (t) => {
  const f = await fixture(t);
  const app = f.open();
  const headers = { authorization: `Basic ${Buffer.from('fixture:fixture-password').toString('base64')}`, cookie: 'dorm_session=' + 'a'.repeat(43) };
  assert.equal((await app.inject({ url: '/private', headers })).statusCode, 401);
  assert.equal((await app.inject({ method: 'POST', url: '/api/auth/login', headers: { origin: 'https://other.example' }, payload: { username: 'fixture', password: 'fixture-password' } })).statusCode, 403);
  for (let i = 0; i < 5; i++) {
    const response = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { username: 'fixture', password: 'wrong' } });
    assert.equal(response.statusCode, 401);
    assert.equal(response.headers['www-authenticate'], undefined);
  }
  assert.equal((await f.login(app)).statusCode, 429);
  f.advance(300001);
  assert.equal((await f.login(app)).statusCode, 200);
});

it('HTTPS proxy cookies carry Secure; auth-disabled mode needs no session file', async (t) => {
  const f = await fixture(t);
  const app = f.open();
  const response = await app.inject({ method: 'POST', url: '/api/auth/login', headers: { 'x-forwarded-proto': 'https' }, payload: { username: 'fixture', password: 'fixture-password', remember: true } });
  assert.match(response.headers['set-cookie'], /; Secure/);
  const anonymous = Fastify();
  registerAuth(anonymous, {});
  try {
    assert.equal((await anonymous.inject('/api/ws-ticket')).json().ticket, null);
    assert.equal((await anonymous.inject('/login')).headers.location, '/');
  } finally { await anonymous.close(); }
});
