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
} from '../public/js/activity-logic.js';

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
