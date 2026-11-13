import { it } from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { createOpenRouterAdvisor, DEFAULT_MODEL } from '../server/services/advisor/llm-advisor.js';
import { getAdvisor } from '../server/services/advisor/index.js';
import { registerRoutes } from '../server/routes.js';
import { createKaroConversation } from '../server/services/karo-conversation.js';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';

function snapshot() {
  return { status: 'warn', updatedAt: new Date().toISOString(), metrics: {
    netWorthUsd: null, valuationComplete: false, knownNetWorthUsd: 100,
    accounts: [{ type: 'cash', valueUsd: 100, id: 'private-account', label: 'private-label' }],
    cashflow: {}, budget: {}, transactions: [{ id: 'private-id', note: 'private-note', amountIdr: 25000, amountUsd: null }],
    wallet: 'private-wallet',
    native: { currency: 'IDR', knownNetWorthIdr: 1600000, monthlyBudgetIdr: null, monthSpentIdr: 25000, cashflow: { todayIncomeIdr: 0, todayExpenseIdr: 25000, last7dExpenseIdr: 175000 } },
  } };
}

it('OpenRouter sends only aggregates, uses free fallbacks, and deduplicates simultaneous requests', async () => {
  let calls = 0;
  const advisor = createOpenRouterAdvisor({ apiKey: 'fixture-key', fetchFn: async (url, options) => {
    calls++;
    assert.equal(url, 'https://openrouter.ai/api/v1/chat/completions');
    assert.equal(options.headers.Authorization, 'Bearer fixture-key');
    const body = JSON.parse(options.body);
    assert.deepEqual(body.models, [DEFAULT_MODEL, 'openrouter/free']);
    assert.notEqual(body.reasoning.enabled, false, 'some free providers require reasoning and reject disabling it');
    assert.equal(body.reasoning.effort, 'low');
    assert.ok(body.max_tokens <= 2048);
    for (const value of ['private-id', 'private-note', 'private-wallet', 'private-account', 'private-label', 'fixture-key']) assert.ok(!options.body.includes(value));
    const data = JSON.parse(body.messages[1].content).DATA;
    assert.equal(data.currency, 'IDR');
    assert.equal(data.cashflow.todayExpense, 25000);
    assert.equal(data.netWorth, null);
    return { ok: true, json: async () => ({ model: DEFAULT_MODEL, choices: [{ message: { content: 'Pengeluaran hari ini Rp25.000.' }, finish_reason: 'stop' }] }) };
  } });
  const snap = snapshot();
  const [a, b] = await Promise.all([advisor.answer('today_summary', snap), advisor.answer('today_summary', snap)]);
  assert.equal(a.source, 'llm');
  assert.deepEqual(a, b);
  assert.equal((await advisor.answer('today_summary', snap)).text, a.text);
  assert.equal(calls, 1);
  advisor.advise(snap);
  advisor.dailyReport(snap);
  assert.equal(calls, 1, 'background advice and reports must never call the API');
});

it('quota pauses calls while transient failures retry free routing without exposing errors', async () => {
  for (const [fetchFn, hard] of [
    [async () => ({ ok: false, status: 429 }), true],
    [async () => { throw new Error('secret-key from upstream'); }, false],
    [async () => ({ ok: true, json: async () => ({ error: { message: 'secret-key' } }) }), false],
    [async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: 'unfinished' }, finish_reason: 'length' }] }) }), false],
  ]) {
    let calls = 0;
    const advisor = createOpenRouterAdvisor({ apiKey: 'secret-key', fetchFn: (...args) => { calls++; return fetchFn(...args); } });
    const a = await advisor.answer('today_summary', snapshot());
    assert.equal(a.source, 'rules');
    assert.equal(a.fallback, true);
    assert.match(a.text, /Rp/);
    assert.ok(!JSON.stringify(a).includes('secret-key'));
    await advisor.chat('Beri saran', snapshot());
    assert.equal(calls, hard ? 1 : 4, 'only account/quota errors should pause the next question');
    assert.equal(advisor.status().state, 'degraded');
  }
});

it('a slow primary model retries free routing and does not force following questions into rules', async () => {
  let calls = 0;
  const advisor = createOpenRouterAdvisor({ apiKey: 'key', timeoutMs: 10, fetchFn: (_url, options) => {
    calls++;
    if (calls === 1) return new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true }));
    if (calls === 2) assert.deepEqual(JSON.parse(options.body).models, ['openrouter/free']);
    return Promise.resolve({ ok: true, json: async () => ({ model: 'provider/model:free', choices: [{ message: { content: 'Jawaban AI berhasil.' }, finish_reason: 'stop' }] }) });
  } });
  const keepAlive = setTimeout(() => {}, 1000);
  try {
    const first = await advisor.answer('am_i_wasteful', snapshot());
    assert.equal(first.source, 'llm');
    assert.equal(first.fallback, undefined);
    assert.equal((await advisor.chat('Pertanyaan berikutnya', snapshot())).source, 'llm');
    assert.equal(calls, 3);
    assert.equal(advisor.status().state, 'ready');
    assert.equal(advisor.status().retryAfterSec, 0);
  } finally { clearTimeout(keepAlive); }
});

it('slow requests are aborted and a paid model configuration never sends a request', async () => {
  const advisor = createOpenRouterAdvisor({ apiKey: 'key', timeoutMs: 10, fetchFn: (_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(signal.reason), { once: true });
  }) });
  // Keep the event loop alive while AbortSignal's unreferenced timeout expires.
  const keepAlive = setTimeout(() => {}, 1000);
  try { assert.equal((await advisor.chat('Ringkas', snapshot())).fallback, true); }
  finally { clearTimeout(keepAlive); }
  const paid = createOpenRouterAdvisor({ apiKey: 'key', model: 'provider/paid-model', fetchFn: () => { throw new Error('must not call'); } });
  assert.equal((await paid.answer('today_summary', snapshot())).source, 'rules');
  assert.equal(getAdvisor({ advisorMode: 'llm', openrouterKey: '' }).mode, 'rules');
});

it('yapping and replies use the Karo persona and bounded conversational context', async () => {
  const bodies = [];
  const advisor = createOpenRouterAdvisor({ apiKey: 'key', fetchFn: async (_url, options) => {
    bodies.push(JSON.parse(options.body));
    return { ok: true, json: async () => ({ choices: [{ message: { content: 'Komentar Karo yang relevan.' }, finish_reason: 'stop' }] }) };
  } });
  const history = [{ role: 'assistant', kind: 'yapping', text: 'Ingat cek budget dulu.' }, { role: 'user', kind: 'question', text: 'Kenapa begitu?' }];
  await advisor.yap(snapshot(), history);
  await advisor.chat('Jelaskan lagi', snapshot(), history);
  assert.match(bodies[0].messages[0].content, /bendahara di Agent Dorm/);
  assert.match(bodies[0].messages[1].content, /\[Yapping Karo\]/);
  assert.match(bodies[0].messages.at(-1).content, /giliranmu yapping/);
  assert.match(bodies[1].messages[2].content, /Kenapa begitu/);
  assert.ok(bodies[0].temperature > bodies[1].temperature);
});

it('failed rules replies stay out of the LLM context so they cannot seed repeated canned answers', async () => {
  let request;
  const advisor = createOpenRouterAdvisor({ apiKey: 'key', fetchFn: async (_url, options) => {
    request = JSON.parse(options.body);
    return { ok: true, json: async () => ({ choices: [{ message: { content: 'Jawaban baru.' }, finish_reason: 'stop' }] }) };
  } });
  await advisor.chat('Tolong jelaskan', snapshot(), [
    { id: 'y', role: 'assistant', kind: 'yapping', text: 'Komentar relevan sebelumnya.' },
    { id: 'failed-question', role: 'user', text: 'Pertanyaan gagal lama' },
    { id: 'failed-answer', role: 'assistant', fallback: true, replyTo: 'failed-question', text: 'Kalimat cadangan yang berulang' },
  ]);
  assert.ok(JSON.stringify(request).includes('Komentar relevan sebelumnya'));
  assert.ok(!JSON.stringify(request).includes('Pertanyaan gagal lama'));
  assert.ok(!JSON.stringify(request).includes('Kalimat cadangan yang berulang'));
});

it('REST exposes readiness without keys, validates chat, awaits LLM and limits rapid repeats', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: 'Jawaban AI dalam rupiah.' } }] }) });
  const app = Fastify();
  const snap = snapshot();
  const directory = await mkdtemp(path.join(tmpdir(), 'karo-api-test-'));
  const config = { advisorMode: 'llm', openrouterKey: 'private-key', agents: {}, demoControls: false };
  const store = { getSnapshot: () => snap, getAllSnapshots: () => ({ portfolio: snap }), getMeta: () => ({}), getEvents: () => [], getAllEvents: () => [] };
  const conversation = createKaroConversation({ advisor: getAdvisor(config), store, file: path.join(directory, 'history.json'), autoStart: false });
  registerRoutes(app, {
    config, store, conversation, boss: { get: () => ({}) },
  });
  try {
    const state = await app.inject('/api/state');
    assert.equal(state.json().advisorMode, 'llm');
    assert.ok(!state.body.includes('private-key'));
    for (const payload of [{ question: '' }, { question: 'a'.repeat(2001) }, { question: 'hi', questionId: 'today_summary' }, { question: 1 }]) {
      assert.equal((await app.inject({ method: 'POST', url: '/api/portfolio/ask', payload })).statusCode, 400);
    }
    const ask = { method: 'POST', url: '/api/portfolio/ask', payload: { question: 'Beri ringkasan' }, remoteAddress: '198.51.100.92' };
    const result = await app.inject(ask);
    assert.equal(result.statusCode, 200);
    assert.equal(result.json().source, 'llm');
    const history = await app.inject('/api/portfolio/history');
    assert.equal(history.headers['cache-control'], 'no-store');
    assert.deepEqual(history.json().messages.map(m => m.kind), ['question', 'answer']);
    assert.equal((await app.inject(ask)).statusCode, 429);
  } finally {
    globalThis.fetch = original;
    await app.close();
    if (path.resolve(directory).startsWith(path.join(tmpdir(), 'karo-api-test-'))) await rm(directory, { recursive: true, force: true });
  }
});
