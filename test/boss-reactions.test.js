import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { reactionForEvent } from '../server/services/boss-reactions.js';
import { createBossController } from '../server/services/boss-controller.js';

/** @param {string} type @param {any} data */
function evt(type, data = {}) {
  return { id: `e-${type}-${Math.random()}`, ts: new Date().toISOString(), type, level: 'info', message: 'x', agentId: 't', data };
}

/** Jam + scheduler manual agar tidak menunggu 6 detik. */
function manualClock() {
  let t = 0;
  /** @type {Map<number, Function>} */
  const pending = new Map();
  let n = 0;
  return {
    now: () => t,
    schedule: (fn) => {
      n += 1;
      pending.set(n, fn);
      return n;
    },
    cancel: (h) => {
      pending.delete(h);
    },
    advanceTime: (ms) => {
      t += ms;
    },
    /** Jalankan semua timer yang tertunda (sinkron). */
    fire: () => {
      const fns = [...pending.values()];
      pending.clear();
      for (const f of fns) f();
    },
  };
}

/** @param {any} clock */
function hooked(clock) {
  const out = [];
  const boss = createBossController({
    schedule: clock.schedule,
    cancel: clock.cancel,
    now: clock.now,
  });
  boss.onBoss((b) => out.push({ ...b }));
  return { boss, out };
}

describe('boss-reactions: peta event -> state', () => {
  const cases = [
    ['coin_found', {}, 'think'],
    ['position_out_of_range', {}, 'shock'],
    ['position_back_in_range', {}, 'approve'],
    ['agent_offline', {}, 'shock'],
    ['agent_online', {}, 'approve'],
  ];
  for (const [type, data, state] of cases) {
    it(`${type} -> ${state}`, () => {
      assert.equal(reactionForEvent(evt(type, data)).state, state);
    });
  }
  it('position_closed pnl >= 0 -> laugh', () => {
    assert.equal(reactionForEvent(evt('position_closed', { pnlUsd: 41.2 })).state, 'laugh');
    assert.equal(reactionForEvent(evt('position_closed', { pnlUsd: 0 })).state, 'laugh');
  });
  it('position_closed pnl < 0 -> angry', () => {
    assert.equal(reactionForEvent(evt('position_closed', { pnlUsd: -23.8 })).state, 'angry');
  });
  it('report_ready good -> approve, warn -> angry, neutral -> approve', () => {
    assert.equal(reactionForEvent(evt('report_ready', { tone: 'good' })).state, 'approve');
    assert.equal(reactionForEvent(evt('report_ready', { tone: 'warn' })).state, 'angry');
    assert.equal(reactionForEvent(evt('report_ready', { tone: 'neutral' })).state, 'approve');
  });
});

describe('boss-controller: satu broadcast per reaksi', () => {
  it('satu event -> tepat satu broadcast', () => {
    const clock = manualClock();
    const { boss, out } = hooked(clock);
    boss.onEvent(evt('position_closed', { pnlUsd: 10 }));
    assert.equal(out.length, 1);
    assert.equal(out[0].state, 'laugh');
  });
});

describe('boss-controller: sela vs antre', () => {
  it('prioritas lebih tinggi menyela langsung', () => {
    const clock = manualClock();
    const { boss, out } = hooked(clock);
    boss.onEvent(evt('position_closed', { pnlUsd: 10 })); // laugh (3)
    boss.onEvent(evt('position_out_of_range', {})); // shock (4)
    assert.deepEqual(out.map((o) => o.state), ['laugh', 'shock']);
    assert.equal(boss.get().state, 'shock');
  });
  it('prioritas sama menyela langsung', () => {
    const clock = manualClock();
    const { boss, out } = hooked(clock);
    boss.onEvent(evt('position_closed', { pnlUsd: 10 })); // laugh
    boss.onEvent(evt('position_closed', { pnlUsd: -5 })); // angry (sama-sama 4? laugh 3, angry 4)
    assert.equal(out.length, 2);
    assert.equal(boss.get().state, 'angry');
  });
  it('prioritas lebih rendah antre lalu dimainkan, lalu idle', () => {
    const clock = manualClock();
    const { boss, out } = hooked(clock);
    boss.onEvent(evt('position_out_of_range', {})); // shock
    boss.onEvent(evt('report_ready', { tone: 'good' })); // approve (antre)
    assert.equal(out.length, 1); // belum disiarkan
    clock.fire(); // shock selesai -> approve
    assert.equal(out.length, 2);
    assert.equal(out[1].state, 'approve');
    clock.fire(); // approve selesai -> idle
    assert.equal(out.length, 3);
    assert.equal(out[2].state, 'idle');
  });
  it('antrean maks 3 (buang tertua)', () => {
    const clock = manualClock();
    const { boss, out } = hooked(clock);
    boss.onEvent(evt('position_out_of_range', {})); // shock
    for (let i = 0; i < 4; i++) boss.onEvent(evt('coin_found', { symbol: 'X', score: 80 })); // think x4
    clock.fire(); // shock -> think
    clock.fire(); // think -> think
    clock.fire(); // think -> think
    clock.fire(); // think -> idle
    assert.deepEqual(out.map((o) => o.state), ['shock', 'think', 'think', 'think', 'idle']);
  });
  it('entri antrean lebih tua dari 15 dtk dibuang', () => {
    const clock = manualClock();
    const { boss, out } = hooked(clock);
    boss.onEvent(evt('position_out_of_range', {})); // shock
    boss.onEvent(evt('report_ready', { tone: 'good' })); // approve antre
    clock.advanceTime(16000); // antrean basi
    clock.fire(); // shock selesai -> langsung idle
    assert.deepEqual(out.map((o) => o.state), ['shock', 'idle']);
  });
});
