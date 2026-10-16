import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { walkBand, blockedRect, isFree, segmentIntersectsRect, planPath } from '../public/js/path-logic.js';

const W = 1376;
const H = 768;
const AREA = { xMin: 0.06 * W, xMax: 0.94 * W, yMin: 0.76 * H, yMax: 0.97 * H };
const SEAT = { x: 0.5 * W, y: 0.8 * H };

describe('path-logic: band dan rect', () => {
  it('walkBand yMin = seat.y + 28, yMax tidak berubah', () => {
    const b = walkBand(AREA, SEAT);
    assert.equal(b.yMin, SEAT.y + 28);
    assert.equal(b.yMax, AREA.yMax);
    assert.equal(b.xMin, AREA.xMin);
    assert.equal(b.xMax, AREA.xMax);
  });
  it('blockedRect sesuai spesifikasi', () => {
    const r = blockedRect(SEAT);
    assert.deepEqual(r, { x0: SEAT.x - 170, x1: SEAT.x + 170, y0: 0, y1: SEAT.y + 60 });
  });
  it('isFree: dalam rect tidak bebas, batas bebas', () => {
    const r = blockedRect(SEAT);
    assert.equal(isFree({ x: SEAT.x, y: SEAT.y }, r), false);
    assert.equal(isFree({ x: SEAT.x, y: SEAT.y + 200 }, r), true);
    // Tepat di sudut bawah (x0-14, y1+14) bebas (batas).
    assert.equal(isFree({ x: r.x0 - 14, y: r.y1 + 14 }, r), true);
  });
});

describe('path-logic: planPath', () => {
  it('jalur yang sudah menghindari rect dikembalikan apa adanya', () => {
    const r = blockedRect(SEAT);
    const b = walkBand(AREA, SEAT);
    const from = { x: b.xMin + 10, y: b.yMax - 10 };
    const to = { x: b.xMin + 100, y: b.yMax - 20 };
    assert.equal(segmentIntersectsRect(from, to, r), false);
    assert.deepEqual(planPath(from, to, r, b), [to]);
  });
  it('2000 pasangan acak: tak ada segmen yang menembus rect, waypoint di band', () => {
    const r = blockedRect(SEAT);
    const b = walkBand(AREA, SEAT);
    let rnd = 12345;
    const next = () => {
      rnd = (rnd * 1103515245 + 12345) & 0x7fffffff;
      return rnd / 0x7fffffff;
    };
    const randFree = () => {
      for (let k = 0; k < 100; k++) {
        const p = { x: b.xMin + next() * (b.xMax - b.xMin), y: b.yMin + next() * (b.yMax - b.yMin) };
        if (isFree(p, r)) return p;
      }
      return { x: b.xMin, y: b.yMax };
    };
    for (let i = 0; i < 2000; i++) {
      const from = randFree();
      const to = randFree();
      const path = planPath(from, to, r, b);
      assert.ok(Array.isArray(path) && path.length >= 1);
      for (const w of path) {
        assert.ok(w.x >= b.xMin && w.x <= b.xMax, `waypoint x di luar band: ${w.x}`);
        assert.ok(w.y >= b.yMin && w.y <= b.yMax, `waypoint y di luar band: ${w.y}`);
        assert.ok(isFree(w, r), `waypoint di dalam rect: ${JSON.stringify(w)}`);
      }
      let prev = from;
      for (const w of path) {
        assert.equal(segmentIntersectsRect(prev, w, r), false, `segmen menembus: ${JSON.stringify(prev)} -> ${JSON.stringify(w)}`);
        prev = w;
      }
    }
  });
  it('rute memutar lewat bawah rect dari sudut terdekat', () => {
    const r = blockedRect(SEAT);
    const b = walkBand(AREA, SEAT);
    const from = { x: r.x0 - 200, y: b.yMin + 5 };
    const to = { x: r.x1 + 200, y: b.yMin + 5 };
    assert.equal(segmentIntersectsRect(from, to, r), true);
    const path = planPath(from, to, r, b);
    assert.equal(path.length, 3);
    // Masuk dari kiri (terdekat start kiri).
    assert.equal(path[0].x, r.x0 - 14);
    assert.equal(path[1].x, r.x1 + 14);
    assert.deepEqual(path[2], to);
  });
});
