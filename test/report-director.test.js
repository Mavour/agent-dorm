import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createReportDirector, cuePriority, CUE_MS, GAP_MS } from '../server/services/report-director.js';

/** @param {string} type @param {string} agentId @param {any} data */
function evt(type, agentId, data = {}) {
  return { id: `e-${type}-${agentId}-${Math.random().toString(36).slice(2)}`, ts: new Date().toISOString(), type, level: 'info', message: 'x', agentId, data };
}

/** Jam manual: timer jalan saat advance() melewati waktunya. */
function fakeClock() {
  let t = 0;
  let seq = 0;
  /** @type {Map<number, { fn: Function, at: number }>} */
  const timers = new Map();
  return {
    now: () => t,
    schedule: (fn, ms) => {
      seq += 1;
      timers.set(seq, { fn, at: t + ms });
      return seq;
    },
    cancel: (h) => {
      timers.delete(h);
    },
    advance: (ms) => {
      const end = t + ms;
      for (;;) {
        let best = null;
        for (const [id2, tm] of timers) {
          if (tm.at <= end && (best === null || tm.at < timers.get(best).at)) best = id2;
        }
        if (best === null) break;
        const tm = timers.get(best);
        timers.delete(best);
        t = tm.at;
        tm.fn();
      }
      t = end;
    },
  };
}

function rig() {
  const clock = fakeClock();
  /** @type {any[]} */
  const cues = [];
  /** @type {any[]} */
  const bossCalls = [];
  const director = createReportDirector({
    schedule: clock.schedule,
    cancel: clock.cancel,
    now: clock.now,
    playBoss: (r, m) => bossCalls.push({ reaction: { ...r }, meta: { ...m } }),
  });
  director.onCue((c) => cues.push({ ...c }));
  return { clock, cues, bossCalls, director };
}

describe('report-director: prioritas cue', () => {
  it('kritis > penting > normal; info dilewati', () => {
    assert.equal(cuePriority(evt('position_out_of_range', 'lp')), 3);
    assert.equal(cuePriority(evt('agent_offline', 'a')), 3);
    assert.equal(cuePriority(evt('position_closed', 'x', { pnlUsd: -5 })), 3);
    assert.equal(cuePriority(evt('position_closed', 'x', { pnlUsd: 10 })), 2);
    assert.equal(cuePriority(evt('report_ready', 'p', { tone: 'warn' })), 2);
    assert.equal(cuePriority(evt('coin_found', 'a', { score: 85 })), 2);
    assert.equal(cuePriority(evt('coin_found', 'a', { score: 60 })), 1);
    assert.equal(cuePriority(evt('report_ready', 'p', { tone: 'good' })), 1);
    assert.equal(cuePriority(evt('agent_online', 'a')), 1);
    assert.equal(cuePriority(evt('position_back_in_range', 'l')), 1);
    assert.equal(cuePriority(evt('info', 'x')), 0);
  });
});

describe('report-director: serialisasi', () => {
  it('3 event 3 agen main satu per satu tanpa overlap, jeda >= 1200 ms', () => {
    const { clock, cues, director } = rig();
    director.pushEvent(evt('coin_found', 'alert', { score: 60 }));
    clock.advance(30);
    director.pushEvent(evt('position_closed', 'exitbot', { pnlUsd: 10 }));
    clock.advance(30);
    director.pushEvent(evt('report_ready', 'portfolio', { tone: 'good' }));
    clock.advance(60000);
    assert.equal(cues.length, 3);
    const starts = cues.map((c) => Date.parse(c.startedAt));
    for (let i = 1; i < starts.length; i++) {
      assert.ok(starts[i] - starts[i - 1] >= CUE_MS + GAP_MS, `cue ${i} terlalu cepat`);
    }
    // Durasi cue tetap 6500.
    for (const c of cues) assert.equal(c.durationMs, CUE_MS);
  });
  it('kritis menyalip antrean tapi tak menyela yang sedang main', () => {
    const { clock, cues, director } = rig();
    director.pushEvent(evt('coin_found', 'alert', { score: 60 })); // normal, main duluan
    clock.advance(400); // batch jalan -> cue 1 main
    assert.equal(cues.length, 1);
    assert.equal(cues[0].event.type, 'coin_found');
    director.pushEvent(evt('position_closed', 'exitbot', { pnlUsd: 10 })); // penting, antre
    director.pushEvent(evt('position_out_of_range', 'lpwatcher', {})); // kritis, menyalip
    clock.advance(60000);
    assert.deepEqual(cues.map((c) => c.event.type), ['coin_found', 'position_out_of_range', 'position_closed']);
    // Kritis mulai setelah cue pertama selesai + jeda (tak menyela).
    assert.ok(Date.parse(cues[1].startedAt) - Date.parse(cues[0].startedAt) >= CUE_MS + GAP_MS);
  });
  it('koalesce: agentId+type sama hanya yang terbaru', () => {
    const { clock, cues, director } = rig();
    director.pushEvent(evt('position_closed', 'exitbot', { pnlUsd: 41.2 }));
    clock.advance(400);
    director.pushEvent(evt('coin_found', 'alert', { score: 61 }));
    director.pushEvent(evt('coin_found', 'alert', { score: 88 }));
    clock.advance(60000);
    const coins = cues.filter((c) => c.event.type === 'coin_found');
    assert.equal(coins.length, 1);
    assert.equal(coins[0].event.data.score, 88);
  });
  it('antrean maks 8 (buang normal tertua dulu)', () => {
    const { clock, cues, director } = rig();
    director.pushEvent(evt('coin_found', 'alert', { score: 60 }));
    clock.advance(400);
    for (let i = 0; i < 10; i++) {
      director.pushEvent(evt('report_ready', 'portfolio', { tone: 'neutral' }));
    }
    assert.ok(director.getState().queueLength <= 8);
    clock.advance(120000);
    assert.ok(cues.length <= 9);
  });
  it('non-kritis basi > 30 dtk dibuang; kritis tidak', () => {
    const { clock, cues, director } = rig();
    director.pushEvent(evt('coin_found', 'alert', { score: 60 }));
    clock.advance(400); // cue 1 main
    // 5 normal dari agen berbeda (tidak terkoalesce) + 1 kritis di belakang.
    for (let i = 0; i < 5; i++) director.pushEvent(evt('coin_found', `agen${i}`, { score: 60 }));
    director.pushEvent(evt('agent_offline', 'alert', {})); // kritis
    clock.advance(120000);
    const types = cues.map((c) => c.event.type);
    assert.ok(types.includes('agent_offline'), 'kritis harus tetap main');
    assert.equal(cues[1].event.type, 'agent_offline');
    assert.equal(cues.length, 4); // koin + kritis + 2 normal; sisanya basi
    assert.equal(director.isIdle(), true);
  });
  it('reaksi bos sekali per cue dari event yang sama', () => {
    const { clock, cues, bossCalls, director } = rig();
    director.pushEvent(evt('position_closed', 'exitbot', { pnlUsd: 41.2, pair: 'POPCAT/SOL' }));
    director.pushEvent(evt('coin_found', 'alert', { score: 84, symbol: 'NEKOZ' }));
    clock.advance(60000);
    assert.equal(cues.length, 2);
    assert.equal(bossCalls.length, 2);
    for (let i = 0; i < 2; i++) {
      assert.equal(bossCalls[i].meta.sourceEventId, cues[i].event.id);
      assert.equal(bossCalls[i].meta.agentId, cues[i].agentId);
    }
    // Bos 700 ms setelah cue mulai.
    assert.ok(bossCalls[0].reaction.bubble.includes('POPCAT/SOL'));
    assert.ok(bossCalls[1].reaction.bubble.includes('NEKOZ'));
  });
  it('isIdle benar dan idleTick tak dipanggil saat sibuk (via getState)', () => {
    const { clock, director } = rig();
    assert.equal(director.isIdle(), true);
    director.pushEvent(evt('coin_found', 'alert', { score: 60 }));
    assert.equal(director.isIdle(), false);
    clock.advance(60000);
    assert.equal(director.isIdle(), true);
  });
});
