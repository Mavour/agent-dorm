import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  duelBlockers,
  createDuelScheduler,
  duelTargets,
  closeDuelTargets,
  DUEL_ALERT_GRACE_MS,
  DUEL_PENDING_MS,
} from '../public/js/activity-logic.js';
import { walkBand, blockedRect, isFree, segmentIntersectsRect, planPath } from '../public/js/path-logic.js';
import { DUEL_GAP, DUEL_CLOSE_PX } from '../public/js/activities.js';

const W = 1376;
const H = 768;
const AREA = { xMin: 0.06 * W, xMax: 0.94 * W, yMin: 0.76 * H, yMax: 0.97 * H };
const SEAT = { x: 0.5 * W, y: 0.8 * H };

function freeSnap(over = {}) {
  return { status: 'ok', unacked: 0, alertAt: 0, cueUntil: 0, ...over };
}

function baseCtx(over = {}) {
  return {
    a: freeSnap(),
    b: freeSnap(),
    now: 100000,
    popupA: false,
    popupB: false,
    reduced: false,
    framesA: true,
    framesB: true,
    ...over,
  };
}

describe('duel: duelBlockers', () => {
  it('bebas -> kosong', () => {
    assert.deepEqual(duelBlockers(baseCtx()), []);
  });
  it('offline / cue / popup / reduced / frame hilang', () => {
    assert.ok(duelBlockers(baseCtx({ a: freeSnap({ status: 'offline' }) })).some((s) => s.includes('exitbot: offline')));
    assert.ok(duelBlockers(baseCtx({ b: freeSnap({ status: 'offline' }) })).some((s) => s.includes('lpwatcher: offline')));
    assert.ok(duelBlockers(baseCtx({ a: freeSnap({ cueUntil: 200000 }) })).some((s) => s.includes('cue playing')));
    assert.ok(duelBlockers(baseCtx({ popupA: true })).some((s) => s.includes('popup')));
    assert.ok(duelBlockers(baseCtx({ popupB: true })).some((s) => s.includes('popup')));
    assert.ok(duelBlockers(baseCtx({ reduced: true })).some((s) => s.includes('reduced')));
    assert.ok(duelBlockers(baseCtx({ framesA: false })).some((s) => s.includes('missing duel frames')));
    assert.ok(duelBlockers(baseCtx({ framesB: false })).some((s) => s.includes('missing duel frames')));
  });
  it('alert grace: 29s terhalang, 31s bebas', () => {
    assert.equal(DUEL_ALERT_GRACE_MS, 30000);
    const now = 100000;
    const blocked = duelBlockers(
      baseCtx({ now, a: freeSnap({ unacked: 1, alertAt: now - 29000 }), b: freeSnap() }),
    );
    assert.ok(blocked.some((s) => s.includes('grace')), `harusnya grace: ${blocked}`);
    const free = duelBlockers(baseCtx({ now, a: freeSnap({ unacked: 1, alertAt: now - 31000 }), b: freeSnap() }));
    assert.deepEqual(free, []);
  });
  it('force mengabaikan cooldown + alert, tetap hormati offline/frame', () => {
    const now = 100000;
    const ctx = baseCtx({
      now,
      a: freeSnap({ unacked: 2, alertAt: now - 1000 }),
      nextAt: now + 43000,
      force: true,
    });
    assert.deepEqual(duelBlockers(ctx), []);
    const off = duelBlockers(baseCtx({ now, force: true, a: freeSnap({ status: 'offline' }) }));
    assert.ok(off.some((s) => s.includes('offline')));
    const fr = duelBlockers(baseCtx({ now, force: true, framesA: false }));
    assert.ok(fr.some((s) => s.includes('missing')));
  });
  it('cooldown muncul bila now < nextAt', () => {
    const now = 100000;
    const r = duelBlockers(baseCtx({ now, nextAt: now + 43000 }));
    assert.ok(r.some((s) => s.startsWith('cooldown')));
    assert.deepEqual(duelBlockers(baseCtx({ now, nextAt: now - 1 })), []);
  });
});

describe('duel: scheduler pending + giveup + retry', () => {
  it('timer menyala -> pending, bebas -> start', () => {
    const s = createDuelScheduler({ now: 0, rng: () => 0 });
    // every [70k,150k], rng 0 -> nextAt = 70000.
    assert.equal(s.state.nextAt, 70000);
    assert.equal(s.tick(69999, []), 'wait');
    assert.equal(s.tick(70000, ['x']), 'pending');
    assert.equal(s.state.pending, true);
    assert.equal(s.tick(71000, []), 'start');
  });
  it('tetap terhalang 60s -> giveup + reschedule', () => {
    const s = createDuelScheduler({ now: 0, rng: () => 0 });
    assert.equal(s.tick(70000, ['blocked']), 'pending');
    assert.equal(s.tick(70000 + DUEL_PENDING_MS - 1, ['blocked']), 'pending');
    assert.equal(s.tick(70000 + DUEL_PENDING_MS, ['blocked']), 'giveup');
    assert.equal(s.state.pending, false);
    assert.ok(s.state.nextAt > 70000 + DUEL_PENDING_MS);
  });
  it('retry cooldown setelah timeout 25s', () => {
    const s = createDuelScheduler({ now: 0, rng: () => 0 });
    s.notifyStart();
    s.retryIn(100000, 20000);
    assert.equal(s.state.nextAt, 120000);
    assert.equal(s.state.pending, false);
    assert.equal(s.tick(119999, []), 'wait');
    assert.equal(s.tick(120000, []), 'start');
  });
});

describe('duel: geometri titik temu', () => {
  it('DUEL_CLOSE_PX = 220', () => {
    assert.equal(DUEL_CLOSE_PX, 220);
  });
  it('sudah dekat -> titik tengah, sisi ikut posisi, gap tepat', () => {
    const rect = blockedRect(SEAT);
    const t = closeDuelTargets({ x: 600, y: 700 }, { x: 700, y: 710 }, DUEL_GAP, rect);
    assert.ok(t);
    assert.equal(t.m.x, 650);
    assert.equal(t.m.y, 705);
    assert.ok(Math.abs(t.b.x - t.a.x - DUEL_GAP) < 1e-9);
    assert.ok(t.a.x < t.b.x, 'exitbot (kiri) tetap kiri');
    assert.ok(isFree(t.m, rect) && isFree(t.a, rect) && isFree(t.b, rect));
  });
  it('posisi terbalik -> sisi ikut (tak bersilangan)', () => {
    const rect = blockedRect(SEAT);
    const t = closeDuelTargets({ x: 1000, y: 700 }, { x: 900, y: 700 }, DUEL_GAP, rect);
    assert.ok(t);
    assert.ok(t.a.x > t.b.x, 'exitbot (kanan) tetap kanan');
    assert.ok(Math.abs(t.a.x - t.b.x - DUEL_GAP) < 1e-9);
  });
  it('titik tengah di zona bos -> null (fallback acak)', () => {
    const rect = blockedRect(SEAT);
    // Keduanya bebas (kiri-kanan rect) tapi tengahnya masuk zona bos.
    assert.equal(closeDuelTargets({ x: 500, y: 660 }, { x: 876, y: 660 }, DUEL_GAP, rect), null);
  });
  it('selalu di walk band, bebas rect, tepat DUEL_GAP', () => {
    assert.equal(DUEL_GAP, 140);
    const band = walkBand(AREA, SEAT);
    const rect = blockedRect(SEAT);
    let seed = 777;
    const rng = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    for (let i = 0; i < 200; i++) {
      const t = duelTargets(AREA, SEAT, DUEL_GAP, rng, W, H);
      assert.ok(t);
      for (const p of [t.m, t.a, t.b]) {
        assert.ok(p.x >= band.xMin && p.x <= band.xMax);
        assert.ok(p.y >= band.yMin && p.y <= band.yMax);
        assert.ok(isFree(p, rect), `titik di rect: ${JSON.stringify(p)}`);
      }
      assert.ok(Math.abs(t.b.x - t.a.x - DUEL_GAP) < 1e-9);
      assert.ok(Math.abs(t.a.y - t.m.y) < 1e-9);
      assert.ok(Math.abs(t.b.y - t.m.y) < 1e-9);
    }
  });
  it('simulasi 500 perjalanan: y tak pernah < band yMin, segmen tak menembus', () => {
    const band = walkBand(AREA, SEAT);
    const rect = blockedRect(SEAT);
    let seed = 4242;
    const rng = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    const randFree = () => {
      for (let k = 0; k < 100; k++) {
        const p = { x: band.xMin + rng() * (band.xMax - band.xMin), y: band.yMin + rng() * (band.yMax - band.yMin) };
        if (isFree(p, rect)) return p;
      }
      return { x: band.xMin, y: band.yMax };
    };
    for (let i = 0; i < 500; i++) {
      const from = randFree();
      const to = randFree();
      const path = planPath(from, to, rect, band);
      let prev = from;
      for (const w of path) {
        assert.equal(segmentIntersectsRect(prev, w, rect), false);
        // Sampel 10 titik di segmen: y harus di band.
        for (let k = 0; k <= 10; k++) {
          const y = prev.y + ((w.y - prev.y) * k) / 10;
          assert.ok(y >= band.yMin - 1e-9, `y di belakang bos: ${y} < ${band.yMin}`);
        }
        prev = w;
      }
    }
  });
});
