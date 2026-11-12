/**
 * Logika dash duel murni (tanpa DOM, bisa diuji penuh dengan node:test).
 *
 * Dash yang "natural" bukan jalan 6x lebih cepat. Ia punya tiga babak:
 *   1. windup  - menunduk + condong ke belakang (antisipasi), diam di tempat
 *   2. burst   - meluncur; kecepatan naik cepat lalu mengerem halus
 *                (profil kecepatan C1, BUKAN laju konstan)
 *   3. settle  - tergelincir berhenti, pose kembali ke sikap tegak
 *
 * Durasi burst mengikuti jarak (dibatasi) sehingga dash pendek tetap terasa
 * seperti terkaman singkat, dan dash panjang tidak berubah jadi "jalan lama".
 * Waktu memakai jam dinding (now ms), bukan akumulasi dt, jadi tahan terhadap
 * frame yang tertahan (tab di-throttle).
 */

export const DASH = Object.freeze({
  /** Antisipasi sebelum meluncur. */
  WINDUP_MS: 220,
  /** Tergelincir berhenti setelah burst. */
  SETTLE_MS: 180,
  /** Burst = BASE + PER_PX * jarak, dijepit MIN..MAX. */
  BURST_BASE_MS: 260,
  BURST_PER_PX: 0.55,
  BURST_MIN_MS: 340,
  BURST_MAX_MS: 760,
  /** Porsi waktu burst untuk akselerasi (sisanya mengerem). */
  ACCEL: 0.3,
  /** Jarak di bawah ini dianggap sudah di tujuan (tanpa dash). */
  MIN_LEN_PX: 6,
});

/**
 * Panjang rute from -> path[0] -> path[1] ... (px).
 * @param {{ x: number, y: number }} from
 * @param {{ x: number, y: number }[]} path
 * @returns {number}
 */
export function pathLength(from, path) {
  let len = 0;
  let prev = from;
  for (const p of path || []) {
    len += Math.hypot(p.x - prev.x, p.y - prev.y);
    prev = p;
  }
  return len;
}

/**
 * Lama burst untuk jarak tertentu.
 * @param {number} len jarak (px)
 * @returns {number} ms
 */
export function burstDurationMs(len) {
  const raw = DASH.BURST_BASE_MS + DASH.BURST_PER_PX * Math.max(0, len);
  return Math.min(DASH.BURST_MAX_MS, Math.max(DASH.BURST_MIN_MS, raw));
}

// Profil kecepatan ternormalisasi (rata-rata = 1 di [0,1]):
//   t < a : v naik linear   0 -> VMAX
//   t >= a: v turun kuadratik VMAX -> 0 (mengerem makin halus ke ujung)
// Posisi = integral v. Kontinu (C1) di t = a dan berhenti mulus di t = 1.
const A = DASH.ACCEL;
const VMAX = 1 / (A / 2 + (1 - A) / 3);

/**
 * Easing dash: progres jarak 0..1 terhadap waktu burst 0..1.
 * Monoton naik, ease(0)=0, ease(1)=1, kecepatan awal & akhir 0.
 * @param {number} t 0..1
 * @returns {number} 0..1
 */
export function dashEase(t) {
  if (!(t > 0)) return 0;
  if (t >= 1) return 1;
  if (t < A) return (VMAX * t * t) / (2 * A);
  const r = (1 - t) / (1 - A);
  return (VMAX * A) / 2 + (VMAX * (1 - A) * (1 - r * r * r)) / 3;
}

/**
 * Kecepatan ternormalisasi (turunan dashEase). Rata-rata = 1, puncak = VMAX.
 * @param {number} t 0..1
 * @returns {number}
 */
export function dashVelocity(t) {
  if (!(t > 0) || t >= 1) return 0;
  if (t < A) return (VMAX * t) / A;
  const r = (1 - t) / (1 - A);
  return VMAX * r * r;
}

/** Puncak kecepatan relatif terhadap rata-rata (untuk uji & normalisasi). */
export const DASH_PEAK = VMAX;

/**
 * Titik pada jarak `dist` di sepanjang rute, plus arah segmen saat itu.
 * @param {{ x: number, y: number }} from
 * @param {{ x: number, y: number }[]} path
 * @param {number} dist px dari awal (dijepit 0..panjang)
 * @returns {{ x: number, y: number, dx: number, dy: number }}
 */
export function pointAlong(from, path, dist) {
  let left = Math.max(0, dist);
  let prev = from;
  let last = { dx: 0, dy: 0 };
  for (const p of path || []) {
    const segX = p.x - prev.x;
    const segY = p.y - prev.y;
    const seg = Math.hypot(segX, segY);
    if (seg > 0) last = { dx: segX / seg, dy: segY / seg };
    if (left <= seg && seg > 0) {
      const k = left / seg;
      return { x: prev.x + segX * k, y: prev.y + segY * k, dx: last.dx, dy: last.dy };
    }
    left -= seg;
    prev = p;
  }
  return { x: prev.x, y: prev.y, dx: last.dx, dy: last.dy };
}

/**
 * Buat rencana dash. Tak ada jarak berarti -> langsung 'done' (tanpa gaya).
 * @param {{ x: number, y: number }} from
 * @param {{ x: number, y: number }[]} path waypoint (sudah menghindari bos)
 * @param {number} startMs jam dinding saat mulai (performance.now())
 * @returns {{ from: any, path: any[], end: {x:number,y:number}, len: number, startMs: number, windupMs: number, burstMs: number, settleMs: number, totalMs: number }}
 */
export function createDash(from, path, startMs) {
  const pts = (path || []).map((p) => ({ x: p.x, y: p.y }));
  const len = pathLength(from, pts);
  const end = pts.length ? pts[pts.length - 1] : { x: from.x, y: from.y };
  const none = len < DASH.MIN_LEN_PX;
  const windupMs = none ? 0 : DASH.WINDUP_MS;
  const burstMs = none ? 0 : burstDurationMs(len);
  const settleMs = none ? 0 : DASH.SETTLE_MS;
  return {
    from: { x: from.x, y: from.y },
    path: pts,
    end: { x: end.x, y: end.y },
    len,
    startMs,
    windupMs,
    burstMs,
    settleMs,
    totalMs: windupMs + burstMs + settleMs,
  };
}

/**
 * Keadaan dash pada waktu `now`.
 * @param {ReturnType<typeof createDash>} d
 * @param {number} now ms
 * @returns {{
 *   phase: 'windup'|'burst'|'settle'|'done',
 *   t: number, x: number, y: number, dx: number, dy: number,
 *   speed: number, speedNorm: number
 * }} t = progres dalam babak (0..1); speed px/detik; speedNorm 0..1 terhadap puncak
 */
export function dashAt(d, now) {
  const el = now - d.startMs;
  if (el < d.windupMs) {
    const first = pointAlong(d.from, d.path, 0.0001);
    return { phase: 'windup', t: el <= 0 ? 0 : el / d.windupMs, x: d.from.x, y: d.from.y, dx: first.dx, dy: first.dy, speed: 0, speedNorm: 0 };
  }
  const eb = el - d.windupMs;
  if (eb < d.burstMs) {
    const tb = eb / d.burstMs;
    const p = pointAlong(d.from, d.path, d.len * dashEase(tb));
    const v = dashVelocity(tb);
    const speed = d.burstMs > 0 ? (d.len * v) / (d.burstMs / 1000) : 0;
    return { phase: 'burst', t: tb, x: p.x, y: p.y, dx: p.dx, dy: p.dy, speed, speedNorm: v / VMAX };
  }
  const es = eb - d.burstMs;
  const tail = pointAlong(d.from, d.path, d.len);
  if (es < d.settleMs) {
    return { phase: 'settle', t: es / d.settleMs, x: d.end.x, y: d.end.y, dx: tail.dx, dy: tail.dy, speed: 0, speedNorm: 0 };
  }
  return { phase: 'done', t: 1, x: d.end.x, y: d.end.y, dx: tail.dx, dy: tail.dy, speed: 0, speedNorm: 0 };
}

const easeOut = (t) => 1 - (1 - t) * (1 - t);
const lerp = (a, b, k) => a + (b - a) * k;
const clamp01 = (v) => Math.min(1, Math.max(0, v));

/** Pose acuan tiap babak (koordinat lokal menghadap kanan; sama format walk-rig). */
export const DASH_POSE = Object.freeze({
  WINDUP_LEAN: -7, // condong ke belakang (antisipasi)
  WINDUP_CROUCH: 9, // jongkok di puncak windup
  BURST_LEAN_MIN: 8,
  BURST_LEAN_MAX: 18,
  BURST_CROUCH: 6,
  LEG_TRAIL: 8, // kaki belakang tertarik
  LEG_REACH: 7, // kaki depan menjulur
  LEG_LIFT: 4,
});

/**
 * Pose rig untuk sampel dash. Kaki TIDAK berayun siklik (pada 1000+ px/dtk
 * ayunan jalan hanya jadi kedip): saat burst kaki terentang statis, tubuh
 * condong sesuai kecepatan.
 * @param {{ phase: string, t: number, speedNorm: number }} s hasil dashAt
 * @returns {{ leftLift: number, rightLift: number, leftShift: number, rightShift: number, bodyBob: number, lean: number }}
 */
export function dashPose(s) {
  const P = DASH_POSE;
  const zero = { leftLift: 0, rightLift: 0, leftShift: 0, rightShift: 0, bodyBob: 0, lean: 0 };
  if (!s || s.phase === 'done') return zero;
  if (s.phase === 'windup') {
    const k = easeOut(clamp01(s.t));
    return {
      leftLift: 0,
      rightLift: 0,
      leftShift: -3 * k, // kuda-kuda lebar
      rightShift: 3 * k,
      bodyBob: -P.WINDUP_CROUCH * k,
      lean: P.WINDUP_LEAN * k,
    };
  }
  if (s.phase === 'burst') {
    const sp = clamp01(s.speedNorm);
    const leanTarget = lerp(P.BURST_LEAN_MIN, P.BURST_LEAN_MAX, sp);
    // Lepas dari condong-belakang ke depan dalam 12% awal burst (melesat).
    const rel = easeOut(clamp01(s.t / 0.12));
    return {
      leftLift: P.LEG_LIFT * sp,
      rightLift: P.LEG_LIFT * 0.75 * sp,
      leftShift: -P.LEG_TRAIL * rel * Math.max(sp, 0.35),
      rightShift: P.LEG_REACH * rel * Math.max(sp, 0.35),
      bodyBob: -P.BURST_CROUCH,
      lean: lerp(P.WINDUP_LEAN, leanTarget, rel),
    };
  }
  // settle: pose burst meluruh ke tegak
  const k = 1 - easeOut(clamp01(s.t));
  return {
    leftLift: 0,
    rightLift: 0,
    leftShift: -P.LEG_TRAIL * 0.5 * k,
    rightShift: P.LEG_REACH * 0.5 * k,
    bodyBob: -P.BURST_CROUCH * k,
    lean: P.BURST_LEAN_MIN * k,
  };
}
