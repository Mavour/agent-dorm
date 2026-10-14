/**
 * Logika aktivitas murni (tanpa DOM): indeks frame, penempatan kaki,
 * pemilihan aktivitas idle, dan kelayakan/target duel. Bisa diuji penuh.
 */

/**
 * Indeks frame pada waktu elapsed.
 * once -> min(floor(t*fps), n-1), done setelah frame terakhir + holdMs.
 * loop -> floor(t*fps) % n. pingpong -> urutan [0..n-1, n-2..1].
 * @param {number} elapsedMs
 * @param {number} n jumlah frame
 * @param {number} fps
 * @param {'once'|'loop'|'pingpong'} mode
 * @param {number} [holdMs=0] tahan frame terakhir (hanya once)
 * @returns {{ index: number, done: boolean }}
 */
export function frameAt(elapsedMs, n, fps, mode, holdMs = 0) {
  const t = Math.max(0, elapsedMs) / 1000;
  if (n <= 1) return { index: 0, done: mode === 'once' && elapsedMs >= holdMs };
  if (mode === 'once') {
    const index = Math.min(Math.floor(t * fps), n - 1);
    const done = elapsedMs >= ((n - 1) / fps) * 1000 + holdMs;
    return { index, done };
  }
  if (mode === 'loop') {
    return { index: Math.floor(t * fps) % n, done: false };
  }
  // pingpong: periode 2n-2 (n>=2).
  const period = 2 * n - 2;
  const k = Math.floor(t * fps) % period;
  return { index: k < n ? k : period - k, done: false };
}

/**
 * Penempatan gambar aktivitas agar kakinya tepat di kaki sprite dasar.
 * Kaki dasar dalam koordinat char: bf = (-w/2 + feet[0], -h + feet[1]).
 * Gambar aktivitas: left L = bf.x - act.feet[0], top T = bf.y - act.feet[1].
 * Cermin di sekitar origin char x=0 (persis seperti sprite dasar):
 * originX = -L, scaleX(-1). Aturan flip: "front" ikut arah hadap;
 * "right"/"left" hanya dicerminkan bila arah yang diinginkan beda dari artwork.
 * @param {{ size: [number, number], feet: [number, number] }} baseCfg
 * @param {{ size: [number, number], feet: [number, number], faces: 'front'|'left'|'right' }} act
 * @param {number} dir < 0 menghadap kiri, >= 0 kanan
 * @returns {{ left: number, top: number, originX: number, flip: boolean }}
 */
export function activityPlacement(baseCfg, act, dir) {
  const [bw, bh] = baseCfg.size;
  const bfx = -bw / 2 + baseCfg.feet[0];
  const bfy = -bh + baseCfg.feet[1];
  const left = bfx - act.feet[0];
  const top = bfy - act.feet[1];
  let flip;
  if (act.faces === 'front') {
    flip = dir < 0;
  } else {
    const want = dir < 0 ? 'left' : 'right';
    flip = want !== act.faces;
  }
  return { left, top, originX: -left, flip };
}

// Tabel aktivitas idle: bobot + rentang durasi (pingpong/loop).
// "once" (dur null) dimainkan sekali lalu ditahan 1 detik.
export const IDLE_ACTIVITIES = {
  exitbot: [{ name: 'tebas', weight: 1, dur: null }],
  portfolio: [
    { name: 'mencatat', weight: 1, dur: [8000, 14000] },
    { name: 'soroban', weight: 1, dur: [8000, 14000] },
  ],
  alert: [{ name: 'mengintai', weight: 1, dur: [6000, 10000] }],
  lpwatcher: [
    { name: 'ngantuk', weight: 1, dur: [6000, 12000] },
    { name: 'tombak', weight: 1, dur: null },
  ],
};
const ONCE_HOLD_MS = 1000;

// Tabel cadangan bila manifest tak memuat "activities" (jangan ubah aset;
// pola path terkonfirmasi: activities/<agent>/<nama>-<i>.png).
const FALLBACK_DEFS = [
  ['exitbot', 'tebas', 4, [250, 254], [113, 250.5], 8, 'once', 'front'],
  ['exitbot', 'duel', 3, [243, 231], [84.75, 227.5], 6, 'pingpong', 'right'],
  ['portfolio', 'mencatat', 3, [135, 216], [76, 213], 3, 'pingpong', 'front'],
  ['portfolio', 'soroban', 3, [128, 216], [68.5, 213], 3, 'pingpong', 'front'],
  ['portfolio', 'lapor', 3, [139, 216], [78.25, 213], 3, 'once', 'front'],
  ['alert', 'terompet', 3, [240, 220], [125, 216.5], 4, 'once', 'front'],
  ['alert', 'mengintai', 3, [205, 226], [119.25, 223], 2, 'pingpong', 'front'],
  ['lpwatcher', 'lentera', 3, [229, 235], [77.25, 231.5], 3, 'once', 'front'],
  ['lpwatcher', 'tombak', 3, [318, 235], [98.5, 231.5], 4, 'once', 'front'],
  ['lpwatcher', 'ngantuk', 2, [179, 235], [75, 232], 1.5, 'pingpong', 'front'],
  ['lpwatcher', 'duel', 3, [300, 235], [151.25, 231.5], 6, 'pingpong', 'left'],
  ['boss', 'kipas', 3, [245, 262], [118.75, 255.5], 3, 'pingpong', 'front'],
];

/**
 * Tabel aktivitas efektif: dari manifest bila ada, else cadangan.
 * @param {any} manifest
 * @returns {Record<string, Record<string, any>>}
 */
export function resolveActivities(manifest) {
  if (manifest && manifest.activities && Object.keys(manifest.activities).length) {
    return manifest.activities;
  }
  /** @type {Record<string, Record<string, any>>} */
  const out = {};
  for (const [agent, name, n, size, feet, fps, mode, faces] of FALLBACK_DEFS) {
    if (!out[agent]) out[agent] = {};
    const frames = [];
    for (let i = 1; i <= n; i++) frames.push(`activities/${agent}/${name}-${i}.png`);
    out[agent][name] = { frames, size, feet, fps, mode, faces };
  }
  return out;
}

/**
 * Titik kaki efektif: dari manifest bila ada, else tengah-bawah.
 * (Penempatan aktivitas memakai nilai yang sama untuk dasar + aktivitas,
 * jadi kaki tetap menancap walau fallback.)
 * @param {{ size: [number, number], feet?: [number, number] }} cfg
 * @returns {[number, number]}
 */
export function resolveFeet(cfg) {
  if (cfg && Array.isArray(cfg.feet)) return cfg.feet;
  const [w, h] = cfg.size;
  return [w / 2, h - 1];
}

/**
 * Pilih aktivitas idle (probabilitas diputuskan pemanggil).
 * @param {string} agentId
 * @param {Record<string, any>|null} acts definisi manifest (atau null)
 * @param {() => number} rng acak [0,1)
 * @param {number} now ms
 * @param {number} cooldownUntil ms (0 = bebas)
 * @returns {{ name: string, durationMs: number } | null}
 */
export function pickIdleActivity(agentId, acts, rng, now, cooldownUntil) {
  if (now < cooldownUntil) return null;
  const table = (IDLE_ACTIVITIES[agentId] || []).filter((e) => acts && acts[e.name]);
  if (!table.length) return null;
  const total = table.reduce((s, e) => s + e.weight, 0);
  let r = rng() * total;
  let pick = table[0];
  for (const e of table) {
    r -= e.weight;
    if (r <= 0) {
      pick = e;
      break;
    }
  }
  if (!pick.dur) {
    // once: seluruh strip + tahan 1 detik.
    const def = acts[pick.name];
    const n = (def.frames || []).length || 1;
    const fps = def.fps || 4;
    return { name: pick.name, durationMs: Math.ceil((n / fps) * 1000) + ONCE_HOLD_MS };
  }
  const [lo, hi] = pick.dur;
  return { name: pick.name, durationMs: Math.round(lo + rng() * (hi - lo)) };
}

/**
 * Kelayakan duel: kedua agen idle/walking, tidak alert/offline,
 * tidak ada cue tampil, tidak sibuk/beraktivitas.
 * @param {{ a: any, b: any, now: number, popupA: boolean, popupB: boolean, reduced: boolean }} p
 * @param {{ state: string, status: string, unacked: number, cueUntil: number, activity: string|null }} a/b
 */
export function duelEligible(p) {
  if (p.reduced) return false;
  if (p.popupA || p.popupB) return false;
  for (const s of [p.a, p.b]) {
    if (!s) return false;
    if (s.state !== 'idle' && s.state !== 'walking') return false;
    if (s.status === 'offline') return false;
    if ((s.unacked || 0) > 0) return false;
    if (p.now < (s.cueUntil || 0)) return false;
    if (s.activity) return false;
  }
  return true;
}

/**
 * Titik temu duel + target masing-masing (gap 140 px).
 * x dalam [xMin+160, xMax-160], hindari zona eksklusi bos, y 0.80H-0.93H.
 * @param {{ xMin: number, xMax: number, yMin: number, yMax: number }} area px stage
 * @param {{ x: number, y: number }} seat kursi bos (px stage)
 * @param {number} gap jarak kedua agen
 * @param {() => number} rng
 * @param {number} W lebar stage
 * @param {number} H tinggi stage
 */
export function duelTargets(area, seat, gap, rng, W, H) {
  for (let i = 0; i < 20; i++) {
    const mx = area.xMin + 160 + rng() * (area.xMax - 160 - (area.xMin + 160));
    const my = 0.8 * H + rng() * (0.93 * H - 0.8 * H);
    // Hindari zona eksklusi bos (konsisten dengan pickTarget).
    if (Math.abs(mx - seat.x) < 150 && my > seat.y - 70 && my < seat.y + 40) continue;
    if (mx - gap / 2 < area.xMin || mx + gap / 2 > area.xMax) continue;
    return { m: { x: mx, y: my }, a: { x: mx - gap / 2, y: my }, b: { x: mx + gap / 2, y: my } };
  }
  return null;
}
