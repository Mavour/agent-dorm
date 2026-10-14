import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  STRIDE,
  FOOT_OVERLAP,
  advancePhase,
  walkPose,
  mergeFootRects,
  bodyClipPolygon,
  footInset,
} from '../public/js/walk-logic.js';

describe('walk-logic: advancePhase', () => {
  it('satu langkah penuh (STRIDE px) = PI', () => {
    assert.equal(advancePhase(0, STRIDE, STRIDE), Math.PI);
    assert.equal(advancePhase(0, 14, 14), Math.PI);
  });
  it('kontinu: dua setengah langkah = satu langkah', () => {
    const dua = advancePhase(advancePhase(0, 7, 14), 7, 14);
    assert.ok(Math.abs(dua - advancePhase(0, 14, 14)) < 1e-12);
  });
  it('jarak nol tidak mengubah fase; 35 px/dtk ~= 2,5 langkah/dtk', () => {
    assert.equal(advancePhase(1.2, 0, STRIDE), 1.2);
    assert.ok(Math.abs(advancePhase(0, 35, STRIDE) - 2.5 * Math.PI) < 1e-12);
  });
});

describe('walk-logic: walkPose', () => {
  const cfg = { lift: 8 };
  it('amp=0 memberi pose dasar persis', () => {
    for (const ph of [0, 0.7, Math.PI / 2, Math.PI, 3.3]) {
      assert.deepEqual(walkPose(ph, 0, cfg), {
        leftLift: 0,
        rightLift: 0,
        leftShift: 0,
        rightShift: 0,
        bodyBob: 0,
        lean: 0,
      });
    }
  });
  it('lift tak pernah negatif', () => {
    for (let i = 0; i < 64; i++) {
      const p = walkPose((i / 64) * Math.PI * 2, 1, cfg);
      assert.ok(p.leftLift >= 0 && p.rightLift >= 0, `fase ${(i / 64) * 2}PI`);
      assert.ok(p.bodyBob >= 0);
    }
  });
  it('hanya satu kaki terangkat tiap saat', () => {
    for (let i = 0; i < 64; i++) {
      const p = walkPose((i / 64) * Math.PI * 2, 1, cfg);
      assert.equal(Math.min(p.leftLift, p.rightLift), 0);
    }
    // Kaki kiri penuh di PI/2, kanan penuh di 3PI/2.
    const l = walkPose(Math.PI / 2, 1, cfg);
    assert.equal(l.leftLift, 8);
    assert.equal(l.rightLift, 0);
    const r = walkPose((3 * Math.PI) / 2, 1, cfg);
    assert.equal(r.rightLift, 8);
    assert.equal(r.leftLift, 0);
  });
  it('bentuk pose: geser berlawanan, bob 2*|s|, condong -1,6+0,8s', () => {
    const p = walkPose(Math.PI / 2, 1, cfg);
    assert.ok(Math.abs(p.leftShift) < 1e-12);
    assert.equal(p.bodyBob, 2);
    // -1,6 + 0,8 * sin(PI/2): derau float diabaikan.
    assert.ok(Math.abs(p.lean + 0.8) < 1e-12);
    const q = walkPose(0, 1, cfg);
    assert.equal(q.leftShift, 4);
    assert.equal(q.rightShift, -4);
    assert.equal(q.bodyBob, 0);
    assert.equal(q.lean, -1.6);
  });
  it('amp menskala semua komponen', () => {
    const full = walkPose(Math.PI / 2, 1, cfg);
    const half = walkPose(Math.PI / 2, 0.5, cfg);
    assert.equal(half.leftLift, full.leftLift / 2);
    assert.equal(half.bodyBob, full.bodyBob / 2);
    assert.equal(half.lean, full.lean / 2);
  });
});

describe('walk-logic: clip-path', () => {
  it('gabung kaki yang bertumpang-tindih', () => {
    assert.deepEqual(mergeFootRects([[79, 125.5], [39.5, 82]]), [[39.5, 125.5]]);
    assert.deepEqual(mergeFootRects([[10, 30], [40, 50]]), [[10, 30], [40, 50]]);
  });
  it('polygon men-notch dua kaki terpisah dari kanan ke kiri', () => {
    const rig = { bandTop: 100, feet: [[10, 30], [40, 50]] };
    assert.equal(
      bodyClipPolygon(rig, 100, 200),
      'polygon(0px 0px, 100px 0px, 100px 200px, 50px 200px, 50px 100px, ' +
        '40px 100px, 40px 200px, 30px 200px, 30px 100px, 10px 100px, 10px 200px, 0px 200px)',
    );
  });
  it('polygon menggabung kaki bertumpang-tindih (rig exitbot)', () => {
    const rig = { bandTop: 195.5, feet: [[39.5, 82], [79, 125.5]] };
    assert.equal(
      bodyClipPolygon(rig, 171, 225),
      'polygon(0px 0px, 171px 0px, 171px 225px, 125.5px 225px, 125.5px 195.5px, ' +
        '39.5px 195.5px, 39.5px 225px, 0px 225px)',
    );
  });
  it('inset kaki meluas OVERLAP px di atas bandTop', () => {
    const rig = { bandTop: 195.5, feet: [[39.5, 82], [79, 125.5]] };
    assert.equal(FOOT_OVERLAP, 3);
    assert.equal(footInset([39.5, 82], rig, 171, 225), 'inset(192.5px 89px 0px 39.5px)');
    assert.equal(footInset([79, 125.5], rig, 171, 225), 'inset(192.5px 45.5px 0px 79px)');
    assert.equal(footInset([10, 30], { bandTop: 100 }, 100, 200, 5), 'inset(95px 70px 0px 10px)');
  });
});
