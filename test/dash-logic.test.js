import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  DASH,
  DASH_PEAK,
  pathLength,
  burstDurationMs,
  dashEase,
  dashVelocity,
  pointAlong,
  createDash,
  dashAt,
  dashPose,
} from '../public/js/dash-logic.js';

const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

describe('dash-logic: panjang rute + durasi burst', () => {
  it('pathLength menjumlah segmen', () => {
    assert.equal(pathLength({ x: 0, y: 0 }, []), 0);
    assert.equal(pathLength({ x: 0, y: 0 }, [{ x: 3, y: 4 }]), 5);
    assert.equal(pathLength({ x: 0, y: 0 }, [{ x: 3, y: 4 }, { x: 3, y: 14 }]), 15);
  });
  it('burstDurationMs dijepit MIN..MAX dan naik dengan jarak', () => {
    assert.equal(burstDurationMs(0), DASH.BURST_MIN_MS);
    assert.equal(burstDurationMs(5000), DASH.BURST_MAX_MS);
    assert.ok(burstDurationMs(300) < burstDurationMs(600));
    for (const l of [0, 50, 200, 500, 1000, 4000]) {
      const ms = burstDurationMs(l);
      assert.ok(ms >= DASH.BURST_MIN_MS && ms <= DASH.BURST_MAX_MS);
    }
  });
});

describe('dash-logic: easing (bukan laju konstan)', () => {
  it('titik ujung + monoton', () => {
    assert.equal(dashEase(0), 0);
    assert.equal(dashEase(1), 1);
    assert.equal(dashEase(-1), 0);
    assert.equal(dashEase(2), 1);
    let prev = 0;
    for (let i = 1; i <= 1000; i++) {
      const v = dashEase(i / 1000);
      assert.ok(v >= prev - 1e-12, `tidak monoton di ${i / 1000}`);
      prev = v;
    }
  });
  it('kecepatan 0 di awal & akhir (mulai dan berhenti mulus)', () => {
    assert.equal(dashVelocity(0), 0);
    assert.equal(dashVelocity(1), 0);
    assert.ok(dashVelocity(0.001) < 0.05 * DASH_PEAK);
    assert.ok(dashVelocity(0.999) < 0.001 * DASH_PEAK);
  });
  it('kecepatan kontinu di titik sambung akselerasi/pengereman', () => {
    const a = DASH.ACCEL;
    assert.ok(near(dashVelocity(a - 1e-9), dashVelocity(a + 1e-9), 1e-6));
    assert.ok(near(dashVelocity(a), DASH_PEAK, 1e-9));
  });
  it('dashVelocity = turunan dashEase (konsisten)', () => {
    for (const t of [0.05, 0.15, 0.29, 0.31, 0.5, 0.8, 0.95]) {
      const h = 1e-6;
      const num = (dashEase(t + h) - dashEase(t - h)) / (2 * h);
      assert.ok(near(num, dashVelocity(t), 1e-4), `t=${t}: ${num} vs ${dashVelocity(t)}`);
    }
  });
  it('puncak kecepatan wajar (2x - 3x rata-rata), bukan 1x seperti jalan', () => {
    assert.ok(DASH_PEAK > 2 && DASH_PEAK < 3, `peak ${DASH_PEAK}`);
    let max = 0;
    for (let i = 0; i <= 1000; i++) max = Math.max(max, dashVelocity(i / 1000));
    assert.ok(near(max, DASH_PEAK, 1e-3));
  });
  it('pengereman lebih panjang dari akselerasi (tergelincir berhenti)', () => {
    // 50% waktu pertama sudah menempuh > 50% jarak.
    assert.ok(dashEase(0.5) > 0.5);
  });
});

describe('dash-logic: pointAlong', () => {
  const from = { x: 0, y: 0 };
  const path = [{ x: 100, y: 0 }, { x: 100, y: 50 }];
  it('titik di tengah segmen + arah segmen', () => {
    const p = pointAlong(from, path, 40);
    assert.deepEqual([p.x, p.y, p.dx, p.dy], [40, 0, 1, 0]);
    const q = pointAlong(from, path, 125);
    assert.deepEqual([q.x, q.y, q.dx, q.dy], [100, 25, 0, 1]);
  });
  it('dijepit ke ujung rute', () => {
    const e = pointAlong(from, path, 9999);
    assert.deepEqual([e.x, e.y], [100, 50]);
    assert.deepEqual([e.dx, e.dy], [0, 1]);
    const s = pointAlong(from, path, -5);
    assert.deepEqual([s.x, s.y], [0, 0]);
  });
  it('rute kosong aman', () => {
    const p = pointAlong(from, [], 10);
    assert.deepEqual([p.x, p.y], [0, 0]);
  });
});

describe('dash-logic: timeline createDash/dashAt', () => {
  const from = { x: 100, y: 700 };
  const path = [{ x: 700, y: 700 }];
  const d = createDash(from, path, 1000);

  it('durasi tiap babak sesuai konstanta', () => {
    assert.equal(d.windupMs, DASH.WINDUP_MS);
    assert.equal(d.settleMs, DASH.SETTLE_MS);
    assert.equal(d.burstMs, burstDurationMs(600));
    assert.equal(d.totalMs, d.windupMs + d.burstMs + d.settleMs);
  });
  it('windup: diam di tempat, belum bergerak', () => {
    for (const el of [0, 50, 150, DASH.WINDUP_MS - 1]) {
      const s = dashAt(d, 1000 + el);
      assert.equal(s.phase, 'windup');
      assert.deepEqual([s.x, s.y], [100, 700]);
      assert.equal(s.speed, 0);
    }
    assert.equal(dashAt(d, 900).phase, 'windup'); // sebelum start aman
  });
  it('burst: bergerak, berakhir tepat di ujung rute', () => {
    const t0 = 1000 + d.windupMs;
    const mid = dashAt(d, t0 + d.burstMs / 2);
    assert.equal(mid.phase, 'burst');
    assert.ok(mid.x > 100 && mid.x < 700);
    const last = dashAt(d, t0 + d.burstMs - 1);
    assert.ok(Math.abs(last.x - 700) < 3, `x akhir burst ${last.x}`);
  });
  it('settle lalu done: berhenti persis di tujuan', () => {
    const tb = 1000 + d.windupMs + d.burstMs;
    const s = dashAt(d, tb + 10);
    assert.equal(s.phase, 'settle');
    assert.deepEqual([s.x, s.y], [700, 700]);
    const done = dashAt(d, tb + d.settleMs + 1);
    assert.equal(done.phase, 'done');
    assert.deepEqual([done.x, done.y], [700, 700]);
    assert.equal(dashAt(d, 99999).phase, 'done');
  });
  it('urutan babak benar & posisi monoton selama burst', () => {
    const seen = [];
    let prevX = -Infinity;
    for (let el = 0; el <= d.totalMs + 50; el += 5) {
      const s = dashAt(d, 1000 + el);
      if (seen[seen.length - 1] !== s.phase) seen.push(s.phase);
      assert.ok(s.x >= prevX - 1e-9, 'mundur');
      prevX = s.x;
    }
    assert.deepEqual(seen, ['windup', 'burst', 'settle', 'done']);
  });
  it('REGRESI: ini dash, bukan jalan dipercepat - lompatan per frame wajar & kecepatan bervariasi', () => {
    const t0 = 1000 + d.windupMs;
    let maxStep = 0;
    let prev = dashAt(d, t0);
    const speeds = [];
    for (let el = 16; el <= d.burstMs; el += 16) {
      const s = dashAt(d, t0 + el);
      maxStep = Math.max(maxStep, Math.hypot(s.x - prev.x, s.y - prev.y));
      speeds.push(s.speed);
      prev = s;
    }
    const minMid = Math.min(...speeds.slice(1, -1));
    const maxSpeed = Math.max(...speeds);
    // Tidak teleport: < 60 px per frame 60fps meski 600px ditempuh ~0.7 dtk.
    assert.ok(maxStep < 60, `lompatan ${maxStep}px/frame`);
    // Kecepatan jelas BERVARIASI (jalan konstan 210px/dtk akan max==min).
    assert.ok(maxSpeed > 2 * minMid, `max ${maxSpeed} vs min ${minMid}: terlalu rata`);
    // Rata-rata burst jauh di atas jalan biasa (35 px/dtk).
    const avg = d.len / (d.burstMs / 1000);
    assert.ok(avg > 500, `rata-rata ${avg}px/dtk`);
  });
  it('total dash terbatas bahkan untuk rute sangat panjang', () => {
    const far = createDash({ x: 0, y: 0 }, [{ x: 5000, y: 0 }], 0);
    assert.ok(far.totalMs <= DASH.WINDUP_MS + DASH.BURST_MAX_MS + DASH.SETTLE_MS);
  });
  it('rute berbelok: mengikuti waypoint dan mengarah segmen berikut', () => {
    const turn = createDash({ x: 0, y: 0 }, [{ x: 100, y: 0 }, { x: 100, y: 100 }], 0);
    const end = dashAt(turn, turn.windupMs + turn.burstMs - 1);
    assert.ok(Math.abs(end.x - 100) < 2 && Math.abs(end.y - 100) < 2);
    assert.equal(Math.round(end.dy), 1);
  });
  it('sudah di tujuan -> langsung done (tanpa windup/skid)', () => {
    const z = createDash({ x: 50, y: 50 }, [{ x: 52, y: 51 }], 0);
    assert.equal(z.totalMs, 0);
    assert.equal(dashAt(z, 0).phase, 'done');
    const e = createDash({ x: 5, y: 5 }, [], 0);
    assert.equal(e.totalMs, 0);
    assert.deepEqual(e.end, { x: 5, y: 5 });
  });
  it('tahan frame tertahan: loncat waktu jauh tetap valid', () => {
    const s = dashAt(d, 1000 + 4000);
    assert.equal(s.phase, 'done');
    assert.deepEqual([s.x, s.y], [700, 700]);
  });
});

describe('dash-logic: dashPose', () => {
  const d = createDash({ x: 0, y: 0 }, [{ x: 600, y: 0 }], 0);
  it('windup condong ke BELAKANG + jongkok (antisipasi)', () => {
    const p = dashPose({ phase: 'windup', t: 1, speedNorm: 0 });
    assert.ok(p.lean < 0);
    assert.ok(p.bodyBob < 0);
    assert.ok(Math.abs(dashPose({ phase: 'windup', t: 0, speedNorm: 0 }).lean) < 1e-12);
  });
  it('burst condong ke DEPAN, makin curam saat makin cepat', () => {
    const slow = dashPose({ phase: 'burst', t: 0.5, speedNorm: 0.2 });
    const fast = dashPose({ phase: 'burst', t: 0.5, speedNorm: 1 });
    assert.ok(slow.lean > 0 && fast.lean > slow.lean);
  });
  it('burst: kaki terentang statis (tidak berayun bolak-balik seperti jalan)', () => {
    let leftSign = new Set();
    let rightSign = new Set();
    for (let el = 0; el < d.burstMs; el += 8) {
      const s = dashAt(d, d.windupMs + el);
      const p = dashPose(s);
      leftSign.add(Math.sign(p.leftShift));
      rightSign.add(Math.sign(p.rightShift));
    }
    assert.ok(!leftSign.has(1), 'kaki kiri tak boleh ayun ke depan');
    assert.ok(!rightSign.has(-1), 'kaki kanan tak boleh ayun ke belakang');
  });
  it('settle meluruh ke pose nol persis di akhir; done = nol', () => {
    const end = dashPose({ phase: 'settle', t: 1, speedNorm: 0 });
    for (const v of Object.values(end)) assert.ok(Math.abs(v) < 1e-9);
    const done = dashPose({ phase: 'done', t: 1, speedNorm: 0 });
    for (const v of Object.values(done)) assert.equal(v, 0);
    assert.deepEqual(dashPose(null), done);
  });
  it('semua nilai pose berhingga sepanjang dash', () => {
    for (let el = 0; el <= d.totalMs + 20; el += 4) {
      const p = dashPose(dashAt(d, el));
      for (const v of Object.values(p)) assert.ok(Number.isFinite(v));
    }
  });
});
