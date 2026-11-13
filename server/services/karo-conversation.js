import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const YAP_INTERVAL = 2 * 3600000;
const MAX_MESSAGES = 500;
const QUICK = {
  today_summary: 'Ringkasan hari ini', am_i_wasteful: 'Apakah saya boros?',
  month_budget: 'Sisa budget bulan ini', top_category: 'Kategori terbesar',
  lp_exposure: 'Eksposur LP', more_tips: 'Saran lain',
};

/** One owner, shared across devices. Persist before acknowledging a chat turn. */
export function createKaroConversation({ advisor, store, file = path.resolve('.data/karo-chat.json'), now = Date.now, autoStart = true }) {
  let state = { version: 1, messages: [], lastYapAttempt: null };
  if (existsSync(file)) {
    state = JSON.parse(readFileSync(file, 'utf8'));
    if (state.version !== 1 || (state.lastYapAttempt !== null && !Number.isSafeInteger(state.lastYapAttempt)) || !Array.isArray(state.messages) || state.messages.some(m =>
      !['user', 'assistant'].includes(m.role) || !['question', 'answer', 'yapping'].includes(m.kind) || typeof m.id !== 'string' || typeof m.text !== 'string' || !Number.isFinite(Date.parse(m.ts)))) {
      throw new Error('Riwayat Karo tidak valid; file lama tidak diubah.');
    }
    state.messages = state.messages.slice(-MAX_MESSAGES);
  }
  let stopped = false;
  let yapping = null;
  let asking = false;

  function persist(next) {
    mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
    const temp = `${file}.${randomUUID()}.tmp`;
    writeFileSync(temp, JSON.stringify(next), { mode: 0o600, flag: 'wx' });
    renameSync(temp, file);
    state = next;
  }
  function message(role, kind, text, extra = {}) {
    return { id: randomUUID(), ts: new Date(now()).toISOString(), role, kind, text, ...extra };
  }
  function append(messages) {
    persist({ ...state, messages: [...state.messages, ...messages].slice(-MAX_MESSAGES) });
  }
  function list() { return state.messages.map(m => ({ ...m })); }

  async function ask({ questionId, question }, snapshot) {
    if (asking) {
      const error = new Error('Karo sedang menjawab. Tunggu sebentar.');
      error.statusCode = 429;
      throw error;
    }
    asking = true;
    try {
      const history = list();
      const q = message('user', 'question', question || QUICK[questionId]);
      const result = question ? await advisor.chat(question, snapshot, history) : await advisor.answer(questionId, snapshot, history);
      const a = message('assistant', 'answer', result.text, { source: result.source || 'rules', fallback: !!result.fallback, replyTo: q.id, ...(result.reason ? { reason: result.reason } : {}), ...(result.model ? { model: result.model } : {}) });
      append([q, a]);
      return { ...result, messages: [q, a] };
    } finally { asking = false; }
  }

  function tick() {
    if (stopped || !advisor.yap || yapping || asking) return yapping;
    const snapshot = store.getSnapshot('portfolio');
    const age = now() - Date.parse(snapshot?.updatedAt);
    if (!snapshot || ['offline', 'error'].includes(snapshot.status) || !Number.isFinite(age) || age < 0 || age > 120000) return;
    if (state.lastYapAttempt !== null && now() - state.lastYapAttempt < YAP_INTERVAL) return;
    persist({ ...state, lastYapAttempt: now() });
    const history = list();
    yapping = (async () => {
      try {
        const result = await advisor.yap(snapshot, history);
        if (stopped || result.source !== 'llm' || !result.text?.trim()) return;
        const entry = message('assistant', 'yapping', result.text, { source: 'llm', ...(result.model ? { model: result.model } : {}) });
        append([entry]);
        store.publishEvent?.({
          id: `yapping-${entry.id}`, ts: entry.ts, agentId: 'portfolio',
          type: 'report_ready', level: 'info', message: 'Karo lagi yapping.',
          data: { kind: 'yapping', tone: 'neutral', text: entry.text },
        });
      } catch {
        // Keep existing history and wait for the next scheduled attempt.
      } finally { yapping = null; }
    })();
    return yapping;
  }

  const run = () => { try { return tick(); } catch { return undefined; } };
  const unsubscribe = autoStart && store.subscribe?.(msg => {
    if (msg.type === 'agent_update' && msg.agentId === 'portfolio') run();
  });
  const timer = autoStart ? setInterval(run, 60000) : null;
  timer?.unref();
  // Boot with an existing snapshot, or wait for the first fresh snapshot.
  const initial = autoStart ? setTimeout(run, 0) : null;
  initial?.unref();
  return {
    ask, list, tick,
    async close() {
      stopped = true;
      clearTimeout(initial);
      clearInterval(timer);
      if (unsubscribe) unsubscribe();
      await yapping;
    },
  };
}
