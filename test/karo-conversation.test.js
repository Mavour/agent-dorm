import { it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { createKaroConversation } from '../server/services/karo-conversation.js';
import { bubbleForEvent } from '../public/js/bubbles.js';

async function fixture(t, overrides = {}) {
  const directory = await mkdtemp(path.join(tmpdir(), 'karo-chat-test-'));
  const file = path.join(directory, 'history.json');
  let time = Date.now();
  let status = 'ok';
  const received = [];
  const events = [];
  const advisor = {
    yap: async (_s, history) => { received.push(history); return { text: 'Yapping tentang budget, tanpa mengarang angka.', source: 'llm' }; },
    chat: async (_q, _s, history) => { received.push(history); return { text: 'Jawaban berdasarkan obrolan tadi.', source: 'llm' }; },
    answer: async () => ({ text: 'Ringkasan', source: 'rules', fallback: true }),
    ...overrides,
  };
  const store = { getSnapshot: () => ({ updatedAt: new Date(time).toISOString(), status }), publishEvent: e => events.push(e) };
  const options = { advisor, store, file, now: () => time, autoStart: false };
  const instances = [];
  const open = () => { const chat = createKaroConversation(options); instances.push(chat); return chat; };
  t.after(async () => {
    for (const chat of instances) await chat.close();
    if (path.resolve(directory).startsWith(path.join(tmpdir(), 'karo-chat-test-'))) await rm(directory, { recursive: true, force: true });
  });
  return { open, file, store, received, events, advance: ms => { time += ms; }, setStatus: s => { status = s; } };
}

it('yapping and question/answer history persist across restart with correct labels and context', async t => {
  const f = await fixture(t);
  const chat = f.open();
  await chat.tick();
  assert.equal(f.events[0].data.kind, 'yapping');
  assert.equal(bubbleForEvent(f.events[0]), chat.list()[0].text);
  const reply = await chat.ask({ question: 'Kenapa begitu?' }, f.store.getSnapshot());
  assert.deepEqual(chat.list().map(m => m.kind), ['yapping', 'question', 'answer']);
  assert.equal(reply.messages[1].replyTo, reply.messages[0].id);
  assert.equal(f.received[1][0].kind, 'yapping');
  await chat.close();
  const reopened = f.open();
  assert.deepEqual(reopened.list(), chat.list());
  const copy = reopened.list(); copy[0].text = 'changed';
  assert.notEqual(reopened.list()[0].text, 'changed');
  assert.equal(JSON.parse(await readFile(f.file, 'utf8')).messages.length, 3);
});

it('stage yapping preview is bounded while the full text remains in history', () => {
  const text = 'Cerita Karo yang relevan. '.repeat(30);
  assert.ok(bubbleForEvent({ type: 'report_ready', data: { kind: 'yapping', text } }).length <= 150);
  assert.equal(bubbleForEvent({ type: 'report_ready', data: {} }), 'Rapor harian sudah siap.');
});

it('one yapping attempt per two hours survives restart and ignores offline snapshots', async t => {
  const f = await fixture(t);
  const chat = f.open();
  await Promise.all([chat.tick(), chat.tick(), chat.tick()]);
  assert.equal(f.received.length, 1);
  await chat.close();
  const next = f.open();
  await next.tick();
  assert.equal(f.received.length, 1);
  f.advance(2 * 3600000);
  f.setStatus('offline'); await next.tick();
  assert.equal(f.received.length, 1);
  f.setStatus('ok'); await next.tick();
  assert.equal(f.received.length, 2);
});

it('failed LLM attempts never become fake AI yapping and still respect the quota interval', async t => {
  let calls = 0;
  const f = await fixture(t, { yap: async () => { calls++; return { source: 'rules', fallback: true, text: 'fallback' }; } });
  const chat = f.open();
  await chat.tick(); await chat.tick();
  assert.equal(calls, 1);
  assert.equal(chat.list().length, 0);
  await chat.ask({ questionId: 'today_summary' }, f.store.getSnapshot());
  assert.equal(chat.list()[1].source, 'rules');
  assert.equal(chat.list()[1].kind, 'answer');
});

it('corrupted history is not silently overwritten', async t => {
  const f = await fixture(t);
  await writeFile(f.file, 'broken json');
  assert.throws(() => f.open());
  assert.equal(await readFile(f.file, 'utf8'), 'broken json');
});
