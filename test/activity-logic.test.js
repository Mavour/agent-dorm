import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  frameAt,
  activityPlacement,
  pickIdleActivity,
  duelEligible,
  duelTargets,
  resolveActivities,
  resolveFeet,
  IDLE_ACTIVITIES,
  idlePauseMs,
  canStartIdleActivity,
  walkTargetAllowed,
  faceToward,
  createBehaviorMemory,
  recordBehavior,
  mustWalkFirst,
  pickIdleActivityVaried,
  pickSocialPair,
} from '../public/js/activity-logic.js';
import { createActivityDriver } from '../public/js/agent-activity.js';

describe('activity-logic: frameAt', () => {
  it('once menjepit di frame terakhir', () => {
    assert.deepEqual(frameAt(0, 4, 8, 'once'), { index: 0, done: false });
    assert.deepEqual(frameAt(125, 4, 8, 'once'), { index: 1, done: false });
    // Frame terakhir mulai di (4-1)/8 = 375 ms.
    assert.deepEqual(frameAt(375, 4, 8, 'once'), { index: 3, done: true });
    assert.deepEqual(frameAt(10000, 4, 8, 'once'), { index: 3, done: true });
  });
  it('once hold menunda done', () => {
    assert.equal(frameAt(375, 4, 8, 'once', 1000).done, false);
    assert.equal(frameAt(1375, 4, 8, 'once', 1000).done, true);
    assert.equal(frameAt(1375, 4, 8, 'once', 1000).index, 3);
  });
  it('loop berputar (batas n=2)', () => {
    assert.equal(frameAt(0, 2, 2, 'loop').index, 0);
    assert.equal(frameAt(500, 2, 2, 'loop').index, 1);
    assert.equal(frameAt(1000, 2, 2, 'loop').index, 0);
    assert.equal(frameAt(1000, 2, 2, 'loop').done, false);
  });
  it('pingpong n=3: 0,1,2,1,0,1', () => {
    const got = [0, 500, 1000, 1500, 2000, 2500].map((ms) => frameAt(ms, 3, 2, 'pingpong').index);
    assert.deepEqual(got, [0, 1, 2, 1, 0, 1]);
  });
  it('pingpong n=4: 0,1,2,3,2,1,0', () => {
    const got = [0, 1, 2, 3, 4, 5, 6].map((k) => frameAt(k * 500, 4, 2, 'pingpong').index);
    assert.deepEqual(got, [0, 1, 2, 3, 2, 1, 0]);
  });
});

describe('activity-logic: activityPlacement', () => {
  const base = { size: [171, 225], feet: [82.25, 224] };
  const bfx = -171 / 2 + 82.25; // -3.25
  const bfy = -225 + 224; // -1
  const act = { size: [250, 254], feet: [113, 250.5], faces: 'front' };
  it('kaki aktivitas tepat di kaki dasar', () => {
    const p = activityPlacement(base, act, 1);
    assert.equal(p.left, bfx - 113);
    assert.equal(p.top, bfy - 250.5);
    assert.equal(p.originX, -(bfx - 113));
    assert.equal(p.flip, false);
  });
  it('front dicerminkan saat menghadap kiri, kaki tetap konsisten dengan dasar', () => {
    const p = activityPlacement(base, act, -1);
    assert.equal(p.flip, true);
    assert.equal(p.left, bfx - 113); // left sama; cermin di origin char
    // Kaki aktivitas tercermin == kaki dasar tercermin (tak bergeser relatif).
    const mirror = (x) => -x;
    assert.equal(mirror(p.left + act.feet[0]), mirror(bfx));
  });
  it('aturan flip right/left: hanya bila beda dari artwork', () => {
    const right = { size: [10, 10], feet: [5, 10], faces: 'right' };
    const left = { size: [10, 10], feet: [5, 10], faces: 'left' };
    assert.equal(activityPlacement(base, right, 1).flip, false);
    assert.equal(activityPlacement(base, right, -1).flip, true);
    assert.equal(activityPlacement(base, left, -1).flip, false);
    assert.equal(activityPlacement(base, left, 1).flip, true);
  });
});

describe('activity-logic: pickIdleActivity', () => {
  const acts = {
    mencatat: { frames: [1, 2, 3], fps: 3 },
    soroban: { frames: [1, 2, 3], fps: 3 },
  };
  it('null saat cooldown', () => {
    assert.equal(pickIdleActivity('portfolio', acts, () => 0, 1000, 5000), null);
  });
  it('null bila tak ada definisi', () => {
    assert.equal(pickIdleActivity('portfolio', {}, () => 0, 9000, 0), null);
    assert.equal(pickIdleActivity('takada', acts, () => 0, 9000, 0), null);
  });
  it('bobot memilih sesuai rng + durasi dalam rentang', () => {
    const seq = [0.1, 0.5, 0.9, 0.5];
    let i = 0;
    const rng = () => seq[i++ % seq.length];
    assert.equal(pickIdleActivity('portfolio', acts, rng, 9000, 0).name, 'mencatat');
    const p2 = pickIdleActivity('portfolio', acts, rng, 9000, 0);
    assert.equal(p2.name, 'soroban');
    assert.ok(p2.durationMs >= 8000 && p2.durationMs <= 14000);
  });
  it('once: durasi = strip + tahan 1 detik', () => {
    const tebas = { tebas: { frames: [1, 2, 3, 4], fps: 8 } };
    const p = pickIdleActivity('exitbot', tebas, () => 0.99, 9000, 0);
    assert.equal(p.name, 'tebas');
    assert.equal(p.durationMs, Math.ceil((4 / 8) * 1000) + 1000);
  });
});

describe('activity-logic: resolveActivities + resolveFeet', () => {
  it('pakai manifest bila ada', () => {
    const m = { activities: { exitbot: { tebas: { frames: ['a.png'] } } } };
    assert.equal(resolveActivities(m), m.activities);
  });
  it('fallback 12 aktivitas + pola path benar', () => {
    const r = resolveActivities({});
    const names = Object.entries(r).map(([a, o]) => [a, Object.keys(o)]);
    assert.deepEqual(names, [
      ['exitbot', ['tebas', 'duel']],
      ['portfolio', ['mencatat', 'soroban', 'lapor']],
      ['alert', ['terompet', 'mengintai']],
      ['lpwatcher', ['lentera', 'tombak', 'ngantuk', 'duel']],
      ['boss', ['kipas']],
    ]);
    assert.deepEqual(r.exitbot.tebas.frames, [
      'activities/exitbot/tebas-1.png',
      'activities/exitbot/tebas-2.png',
      'activities/exitbot/tebas-3.png',
      'activities/exitbot/tebas-4.png',
    ]);
    assert.equal(r.lpwatcher.ngantuk.frames.length, 2);
    assert.equal(r.exitbot.duel.faces, 'right');
    assert.equal(r.lpwatcher.duel.faces, 'left');
  });
  it('resolveFeet: manifest dulu, else tengah-bawah', () => {
    assert.deepEqual(resolveFeet({ size: [10, 20], feet: [4, 19] }), [4, 19]);
    assert.deepEqual(resolveFeet({ size: [10, 20] }), [5, 19]);
  });
});

describe('activity-logic: duelEligible + duelTargets', () => {
  const free = { state: 'idle', status: 'ok', unacked: 0, cueUntil: 0, activity: null };
  const base = { a: { ...free }, b: { ...free }, now: 1000, popupA: false, popupB: false, reduced: false };
  it('bebas -> true', () => {
    assert.equal(duelEligible(base), true);
  });
  it('menolak alert/offline/sibuk/aktivitas/popup/cue/reduced', () => {
    const mod = (k, v) => duelEligible({ ...base, [k]: v });
    assert.equal(duelEligible({ ...base, a: { ...free, state: 'alert' } }), false);
    assert.equal(duelEligible({ ...base, b: { ...free, state: 'busy' } }), false);
    assert.equal(duelEligible({ ...base, a: { ...free, state: 'activity' } }), false);
    assert.equal(duelEligible({ ...base, a: { ...free, status: 'offline' } }), false);
    assert.equal(duelEligible({ ...base, a: { ...free, unacked: 1 } }), false);
    assert.equal(duelEligible({ ...base, a: { ...free, cueUntil: 5000 } }), false);
    assert.equal(duelEligible({ ...base, a: { ...free, activity: 'tebas' } }), false);
    assert.equal(mod('popupA', true), false);
    assert.equal(mod('popupB', true), false);
    assert.equal(mod('reduced', true), false);
  });
  it('duelTargets dalam batas, hindari bos, gap tepat', () => {
    const area = { xMin: 80, xMax: 1290, yMin: 580, yMax: 745 };
    const seat = { x: 688, y: 614 };
    const rngs = [0.05, 0.5, 0.95];
    for (const r of rngs) {
      const t = duelTargets(area, seat, 140, () => r, 1376, 768);
      assert.ok(t, 'harus ada titik temu');
      assert.ok(t.m.x >= area.xMin + 160 && t.m.x <= area.xMax - 160);
      assert.ok(t.m.y >= 0.8 * 768 && t.m.y <= 0.93 * 768);
      assert.equal(t.a.x, t.m.x - 70);
      assert.equal(t.b.x, t.m.x + 70);
      assert.ok(!(Math.abs(t.m.x - seat.x) < 150 && t.m.y > seat.y - 70 && t.m.y < seat.y + 40));
    }
  });
});

describe('variety: riwayat perilaku', () => {
  it('riwayat maks 3, wajib jalan setelah aktivitas', () => {
    const mem = createBehaviorMemory();
    assert.equal(mustWalkFirst(mem), false);
    recordBehavior(mem, 'mencatat');
    assert.equal(mustWalkFirst(mem), true);
    recordBehavior(mem, 'walk');
    assert.equal(mustWalkFirst(mem), false);
    recordBehavior(mem, 'a');
    recordBehavior(mem, 'b');
    recordBehavior(mem, 'c');
    assert.deepEqual(mem.hist, ['a', 'b', 'c']);
  });
  it('tak pernah aktivitas sama dua pick beruntun', () => {
    const acts = { mencatat: { frames: [1, 2, 3], fps: 3 }, soroban: { frames: [1, 2, 3], fps: 3 } };
    // Setelah mencatat (dipisah jalan), pick berikut bukan mencatat.
    const p = pickIdleActivityVaried('portfolio', acts, () => 0.99, 99999, 0, ['mencatat', 'walk']);
    assert.equal(p.name, 'soroban');
    // Tepat setelah aktivitas yang sama tanpa jalan: pilih yang lain.
    const q = pickIdleActivityVaried('portfolio', acts, () => 0.01, 99999, 0, ['soroban']);
    assert.equal(q.name, 'mencatat');
    // Agen satu aktivitas: kembalikan null agar jalan dulu.
    const tebas = { tebas: { frames: [1], fps: 1 } };
    assert.equal(pickIdleActivityVaried('exitbot', tebas, () => 0.1, 99999, 0, ['tebas']), null);
    assert.equal(pickIdleActivityVaried('exitbot', tebas, () => 0.1, 99999, 0, ['tebas', 'walk']).name, 'tebas');
  });
  it('bobot x0,3 untuk aktivitas di 2 pick terakhir', () => {
    // Tabel uji 3 aktivitas agar jalur bobot teramati (tabel asli maks 2).
    IDLE_ACTIVITIES.uji = [
      { name: 'a', weight: 1, dur: [1000, 1000] },
      { name: 'b', weight: 1, dur: [1000, 1000] },
      { name: 'c', weight: 1, dur: [1000, 1000] },
    ];
    const acts = { a: { frames: [1], fps: 1 }, b: { frames: [1], fps: 1 }, c: { frames: [1], fps: 1 } };
    try {
      // Riwayat [a, walk, b]: kandidat a(0,3) + c(1); rng besar -> c.
      const hi = pickIdleActivityVaried('uji', acts, () => 0.99, 99999, 0, ['a', 'walk', 'b']);
      assert.equal(hi.name, 'c');
      // rng kecil -> a (b dikecualikan sebagai pick terakhir).
      const lo = pickIdleActivityVaried('uji', acts, () => 0.01, 99999, 0, ['a', 'walk', 'b']);
      assert.equal(lo.name, 'a');
      // Tanpa riwayat: bobot seimbang.
      assert.equal(pickIdleActivityVaried('uji', acts, () => 0.1, 99999, 0, []).name, 'a');
      assert.equal(pickIdleActivityVaried('uji', acts, () => 0.9, 99999, 0, []).name, 'c');
    } finally {
      delete IDLE_ACTIVITIES.uji;
    }
  });
  it('500 pick simulasi: selalu jalan di antara aktivitas, tanpa ulang langsung', () => {
    const acts = { mencatat: { frames: [1, 2, 3], fps: 3 }, soroban: { frames: [1, 2, 3], fps: 3 } };
    const seq = [0.05, 0.5, 0.95, 0.33, 0.7, 0.2, 0.85, 0.4];
    let i = 0;
    const rng = () => seq[i++ % seq.length];
    const mem = createBehaviorMemory();
    const log = [];
    for (let k = 0; k < 500; k++) {
      if (mustWalkFirst(mem)) {
        recordBehavior(mem, 'walk');
        log.push('walk');
        continue;
      }
      const p = pickIdleActivityVaried('portfolio', acts, rng, 99999, 0, mem.hist);
      assert.ok(p, 'harus ada pick saat bebas');
      log.push(p.name);
      recordBehavior(mem, p.name);
    }
    for (let k = 1; k < log.length; k++) {
      assert.notEqual(log[k], log[k - 1], `ulang langsung di ${k}: ${log[k - 1]},${log[k]}`);
    }
    // Setiap aktivitas diikuti jalan sebelum aktivitas berikutnya.
    for (let k = 0; k < log.length; k++) {
      if (log[k] === 'walk') continue;
      const nxt = log.findIndex((v, j) => j > k && v !== 'walk');
      if (nxt > 0) assert.equal(log[k + 1], 'walk', `tak ada jalan setelah ${log[k]} di ${k}`);
    }
  });
});

describe('variety: jeda, target, batas, sosial', () => {
  it('jeda diam acak 1,5-6 dtk', () => {
    for (let k = 0; k < 200; k++) {
      const v = idlePauseMs(Math.random);
      assert.ok(v >= 1500 && v <= 6000, `di luar rentang: ${v}`);
    }
    assert.equal(idlePauseMs(() => 0), 1500);
    assert.equal(idlePauseMs(() => 1), 6000);
  });
  it('target jalan ditolak bila <100 px dari sebelumnya', () => {
    assert.equal(walkTargetAllowed({ x: 0, y: 0 }, { x: 99, y: 0 }), false);
    assert.equal(walkTargetAllowed({ x: 0, y: 0 }, { x: 60, y: 80 }), true);
    assert.equal(walkTargetAllowed(null, { x: 0, y: 0 }), true);
    assert.equal(walkTargetAllowed({ x: 0, y: 0 }, null), true);
  });
  it('batas 2 aktivitas idle serentak', () => {
    assert.equal(canStartIdleActivity(0), true);
    assert.equal(canStartIdleActivity(1), true);
    assert.equal(canStartIdleActivity(2), false);
    assert.equal(canStartIdleActivity(3), false);
  });
  it('jeda sosial: dekat + 25% -> saling menghadap', () => {
    const snaps = [
      { id: 'a', x: 0, y: 0, state: 'idle', socialUntil: 0 },
      { id: 'b', x: 100, y: 0, state: 'idle', socialUntil: 0 },
    ];
    assert.deepEqual(pickSocialPair(snaps, 1000, () => 0.1), { a: 'a', b: 'b', dirA: 1, dirB: -1 });
    assert.equal(pickSocialPair(snaps, 1000, () => 0.5), null);
    const jauh = [
      { id: 'a', x: 0, y: 0, state: 'idle', socialUntil: 0 },
      { id: 'b', x: 500, y: 0, state: 'idle', socialUntil: 0 },
    ];
    assert.equal(pickSocialPair(jauh, 1000, () => 0), null);
    const sibuk = [
      { id: 'a', x: 0, y: 0, state: 'walking', socialUntil: 0 },
      { id: 'b', x: 100, y: 0, state: 'idle', socialUntil: 0 },
    ];
    assert.equal(pickSocialPair(sibuk, 1000, () => 0), null);
    assert.equal(faceToward(5, 5), -1);
  });
});

describe('variety: driver aktivitas', () => {
  const acts = { mencatat: { frames: [1, 2, 3], fps: 3 }, soroban: { frames: [1, 2, 3], fps: 3 } };
  const player = { available: () => true, play: () => true };
  it('wajib jalan setelah aktivitas; cap 2 idle', () => {
    const d = createActivityDriver({ id: 'portfolio', acts, player, reduced: false, statusOf: () => 'ok' });
    assert.equal(d.idlePick(100000, 0, 2), null);
    assert.ok(d.play('mencatat', 5000, 'idle', 0));
    assert.equal(d.idlePick(100000, 0, 0), null);
    d.noteWalk();
    let got = null;
    for (let k = 0; k < 50 && !got; k++) got = d.idlePick(100000 + k, 0, 0);
    assert.ok(got, 'harus dapat pick setelah jalan');
    assert.ok(got.name === 'mencatat' || got.name === 'soroban');
  });
});
