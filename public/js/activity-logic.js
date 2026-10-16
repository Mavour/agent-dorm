/**
 * Logika aktivitas murni (tanpa DOM): indeks frame, penempatan kaki,
 * pemilihan aktivitas idle, dan kelayakan/target duel. Bisa diuji penuh.
 */
import { isFree } from './path-logic.js';

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
 * M di dalam walk band dan bebas dari blocked rect; a/b tepat gap apart.
 * @param {{ xMin: number, xMax: number, yMin: number, yMax: number }} area px stage
 * @param {{ x: number, y: number }} seat kursi bos (px stage)
 * @param {number} gap jarak kedua agen
 * @param {() => number} rng
 */
export function duelTargets(area, seat, gap, rng) {
  // Logika band/rect di-inline konsisten dengan path-logic.js
  // (yMin = seat.y+28, rect 170/60).
  const band = { xMin: area.xMin, xMax: area.xMax, yMin: seat.y + 28, yMax: area.yMax };
  const rect = { x0: seat.x - 170, x1: seat.x + 170, y0: 0, y1: seat.y + 60 };
  const m = 14;
  const free = (p) => p.x <= rect.x0 - m || p.x >= rect.x1 + m || p.y <= rect.y0 - m || p.y >= rect.y1 + m;
  for (let i = 0; i < 20; i++) {
    const loX = band.xMin + gap / 2;
    const hiX = band.xMax - gap / 2;
    if (hiX <= loX) return null;
    const mx = loX + rng() * (hiX - loX);
    const my = band.yMin + rng() * (band.yMax - band.yMin);
    const mm = { x: mx, y: my };
    const a = { x: mx - gap / 2, y: my };
    const b = { x: mx + gap / 2, y: my };
    if (!free(mm) || !free(a) || !free(b)) continue;
    if (a.x < band.xMin || b.x > band.xMax) continue;
    return { m: mm, a, b };
  }
  return null;
}

/**
 * Titik duel saat keduanya SUDAH dekat: temu di titik tengah, langsung
 * tarung di tempat (tak perlu lari jauh). Sisi sesuai posisi sekarang
 * (yang kiri tetap kiri, tak perlu bersilangan). Null bila titik tengah
 * masuk zona bos (pemanggil fallback ke duelTargets acak).
 * @param {{ x: number, y: number }} pa posisi exitbot sekarang
 * @param {{ x: number, y: number }} pb posisi lpwatcher sekarang
 * @param {number} gap jarak kedua agen
 * @param {{ x0: number, x1: number, y0: number, y1: number }} rect zona bos
 * @returns {{ m: any, a: any, b: any } | null}
 */
export function closeDuelTargets(pa, pb, gap, rect) {
  const m = { x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2 };
  const left = { x: m.x - gap / 2, y: m.y };
  const right = { x: m.x + gap / 2, y: m.y };
  if (!isFree(m, rect) || !isFree(left, rect) || !isFree(right, rect)) return null;
  return pa.x <= pb.x ? { m, a: left, b: right } : { m, a: right, b: left };
}

// ---------------------------------------------------------------------------
// Variasi perilaku: riwayat pendek per agen, jeda diam acak, target jalan
// berjarak, batas aktivitas idle serentak, dan jeda sosial. Semua murni.
// ---------------------------------------------------------------------------

// Jeda diam antar perilaku: 1,5 - 6 dtk.
/** @type {[number, number]} */
export const IDLE_PAUSE_MS = [1500, 6000];
/** @param {() => number} [rng=Math.random] */
export function idlePauseMs(rng = Math.random) {
  const [lo, hi] = IDLE_PAUSE_MS;
  return Math.round(lo + rng() * (hi - lo));
}

// Maks aktivitas IDLE serentak (event dikecualikan oleh pemanggil).
export const MAX_IDLE_ACTIVITIES = 2;
/**
 * @param {number} activeIdleCount agen lain yang sedang aktivitas idle
 * @param {number} [limit=MAX_IDLE_ACTIVITIES]
 */
export function canStartIdleActivity(activeIdleCount, limit = MAX_IDLE_ACTIVITIES) {
  return activeIdleCount < limit;
}

// Target jalan tak boleh dalam 100 px dari target sebelumnya.
export const WALK_RETARGET_PX = 100;
/**
 * @param {{ x: number, y: number }|null} prev target sebelumnya
 * @param {{ x: number, y: number }|null} next kandidat target
 */
export function walkTargetAllowed(prev, next) {
  if (!prev || !next) return true;
  return Math.hypot(next.x - prev.x, next.y - prev.y) >= WALK_RETARGET_PX;
}

// Jeda sosial: dua agen idle berdekatan kadang saling menghadap sejenak.
export const SOCIAL_DIST = 220;
export const SOCIAL_CHANCE = 0.25;
export const SOCIAL_MS = 3000;
/** Arah hadap agar a memandang b. @param {number} ax @param {number} bx */
export function faceToward(ax, bx) {
  return ax < bx ? 1 : -1;
}

/** Riwayat 3 perilaku terakhir ('walk' atau nama aktivitas). */
export function createBehaviorMemory() {
  return { hist: [] };
}
/** @param {{ hist: string[] }} mem @param {string} behavior */
export function recordBehavior(mem, behavior) {
  mem.hist.push(behavior);
  if (mem.hist.length > 3) mem.hist.splice(0, mem.hist.length - 3);
}
/** Wajib jalan dulu bila perilaku terakhir adalah aktivitas. @param {{ hist: string[] }} mem */
export function mustWalkFirst(mem) {
  if (!mem || !mem.hist.length) return false;
  return mem.hist[mem.hist.length - 1] !== 'walk';
}

/** Aktivitas terakhir dalam riwayat (lewati 'walk'). @param {string[]} hist */
function lastActivityOf(hist) {
  for (let i = hist.length - 1; i >= 0; i--) {
    if (hist[i] !== 'walk') return hist[i];
  }
  return null;
}

/**
 * Durasi satu entri tabel idle (sama untuk versi dasar dan variasi).
 * @param {{ name: string, dur: [number, number]|null }} entry
 * @param {Record<string, any>} acts
 * @param {() => number} rng
 */
export function idleEntryDuration(entry, acts, rng) {
  if (!entry.dur) {
    const def = acts[entry.name] || {};
    const n = (def.frames || []).length || 1;
    const fps = def.fps || 4;
    return Math.ceil((n / fps) * 1000) + ONCE_HOLD_MS;
  }
  const [lo, hi] = entry.dur;
  return Math.round(lo + rng() * (hi - lo));
}

/**
 * Pilih aktivitas idle dengan variasi: tak pernah sama dua pick beruntun
 * (kecuali agen hanya punya satu aktivitas), aktivitas di 2 pick terakhir
 * berbobot x0,3.
 * @param {string} agentId
 * @param {Record<string, any>|null} acts definisi manifest (atau null)
 * @param {() => number} rng acak [0,1)
 * @param {number} now ms
 * @param {number} cooldownUntil ms (0 = bebas)
 * @param {string[]} [hist] riwayat perilaku (lihat createBehaviorMemory)
 * @returns {{ name: string, durationMs: number } | null}
 */
export function pickIdleActivityVaried(agentId, acts, rng, now, cooldownUntil, hist) {
  if (now < cooldownUntil) return null;
  const table = (IDLE_ACTIVITIES[agentId] || []).filter((e) => acts && acts[e.name]);
  if (!table.length) return null;
  const h = hist || [];
  const recentActs = h.filter((b) => b !== 'walk').slice(-2);
  const lastAct = lastActivityOf(h);
  let cand = table.filter((e) => e.name !== lastAct);
  if (!cand.length) {
    // Agen satu aktivitas (exitbot/alert): boleh lagi hanya bila sudah
    // dipisah jalan; bila tidak, kembalikan null agar jalan dulu.
    if (h[h.length - 1] !== 'walk') return null;
    cand = table;
  }
  const weighted = cand.map((e) => ({ e, w: e.weight * (recentActs.includes(e.name) ? 0.3 : 1) }));
  const total = weighted.reduce((s, c) => s + c.w, 0);
  if (!(total > 0)) return null;
  let r = rng() * total;
  let pick = weighted[weighted.length - 1].e;
  for (const c of weighted) {
    r -= c.w;
    if (r <= 0) {
      pick = c.e;
      break;
    }
  }
  return { name: pick.name, durationMs: idleEntryDuration(pick, acts, rng) };
}

/**
 * Cari pasangan idle berdekatan untuk jeda sosial (murni, tanpa efek).
 * @param {{ id: string, x: number, y: number, state: string, socialUntil: number }[]} snaps
 * @param {number} now ms
 * @param {() => number} rng
 * @returns {{ a: string, b: string, dirA: number, dirB: number } | null}
 */
export function pickSocialPair(snaps, now, rng) {
  for (let i = 0; i < snaps.length; i++) {
    for (let j = i + 1; j < snaps.length; j++) {
      const a = snaps[i];
      const b = snaps[j];
      if (a.state !== 'idle' || b.state !== 'idle') continue;
      if (now < (a.socialUntil || 0) || now < (b.socialUntil || 0)) continue;
      if (Math.hypot(a.x - b.x, a.y - b.y) >= SOCIAL_DIST) continue;
      if (rng() >= SOCIAL_CHANCE) continue;
      return { a: a.id, b: b.id, dirA: faceToward(a.x, b.x), dirB: faceToward(b.x, a.x) };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Duel "adu pedang": blockers + scheduler murni. Semua bisa diuji node:test.
// ---------------------------------------------------------------------------

/** Alert tak diakui hanya menghalangi 30 dtk pertama (lalu duel boleh jalan). */
export const DUEL_ALERT_GRACE_MS = 30000;
/** Beri kesempatan scheduler 60 dtk setelah timer menyala. */
export const DUEL_PENDING_MS = 60000;
/** Timeout pendekatan duel 25 dtk -> abort + cooldown retry 20 dtk. */
export const DUEL_APPROACH_MS = 25000;
export const DUEL_RETRY_MS = 20000;
/** Interval duel otomatis 70-150 dtk. */
export const DUEL_EVERY_MS = [70000, 150000];

/**
 * Daftar alasan manusiawi mengapa duel tak bisa mulai sekarang.
 * Hard blockers: offline, cue tampil, popup terbuka, reduced-motion,
 * frame duel hilang. Alert hanya 30 dtk pertama (kecuali force).
 * Cooldown (nextAt) hanya bila !force. State walking/activity/busy
 * TIDAK menghalangi (akan dihentikan + dilepas oleh pemanggil).
 * @param {{
 *   a: { status: string, unacked: number, alertAt?: number, cueUntil?: number },
 *   b: { status: string, unacked: number, alertAt?: number, cueUntil?: number },
 *   now: number, popupA: boolean, popupB: boolean, reduced: boolean,
 *   framesA: boolean, framesB: boolean, nextAt?: number, force?: boolean
 * }} p
 * @returns {string[]}
 */
export function duelBlockers(p) {
  const out = [];
  if (p.reduced) out.push('reduced-motion');
  if (!p.framesA) out.push('exitbot: missing duel frames');
  if (!p.framesB) out.push('lpwatcher: missing duel frames');
  if (p.a && p.a.status === 'offline') out.push('exitbot: offline');
  if (p.b && p.b.status === 'offline') out.push('lpwatcher: offline');
  if (p.a && p.now < (p.a.cueUntil || 0)) out.push('exitbot: cue playing');
  if (p.b && p.now < (p.b.cueUntil || 0)) out.push('lpwatcher: cue playing');
  if (p.popupA) out.push('exitbot: popup open');
  if (p.popupB) out.push('lpwatcher: popup open');
  const force = !!p.force;
  if (!force) {
    if (p.a && (p.a.unacked || 0) > 0) {
      const age = p.now - (p.a.alertAt ?? p.now);
      if (age < DUEL_ALERT_GRACE_MS) out.push('exitbot: alert (grace)');
    }
    if (p.b && (p.b.unacked || 0) > 0) {
      const age = p.now - (p.b.alertAt ?? p.now);
      if (age < DUEL_ALERT_GRACE_MS) out.push('lpwatcher: alert (grace)');
    }
    if (typeof p.nextAt === 'number' && p.now < p.nextAt) {
      out.push(`cooldown ${Math.ceil((p.nextAt - p.now) / 1000)}s`);
    }
  }
  return out;
}

/**
 * Scheduler duel murni: flag PENDING + give-up 60 dtk + reschedule.
 * @param {{ every?: [number, number], now?: number, rng?: () => number }} [opts]
 */
export function createDuelScheduler(opts = {}) {
  const every = opts.every || DUEL_EVERY_MS;
  const rng = opts.rng || Math.random;
  const s = {
    nextAt: (opts.now ?? 0) + every[0] + rng() * (every[1] - every[0]),
    pending: false,
    pendingSince: 0,
    lastDuelEnd: opts.now ?? 0,
  };
  function planNext(now) {
    s.nextAt = now + every[0] + rng() * (every[1] - every[0]);
    s.pending = false;
    s.pendingSince = 0;
  }
  /**
   * @param {number} now
   * @param {string[]} blocked daftar dari duelBlockers (kosong = bebas)
   * @returns {'wait'|'pending'|'start'|'giveup'}
   */
  function tick(now, blocked) {
    const free = !blocked || !blocked.length;
    if (!s.pending) {
      if (now >= s.nextAt) {
        s.pending = true;
        s.pendingSince = now;
        return free ? 'start' : 'pending';
      }
      return 'wait';
    }
    if (free) return 'start';
    if (now - s.pendingSince >= DUEL_PENDING_MS) {
      planNext(now);
      return 'giveup';
    }
    return 'pending';
  }
  function notifyStart() {
    s.pending = false;
    s.pendingSince = 0;
  }
  function notifyEnd(now) {
    s.lastDuelEnd = now;
    planNext(now);
  }
  function retryIn(now, ms) {
    s.nextAt = now + ms;
    s.pending = false;
    s.pendingSince = 0;
  }
  return { state: s, tick, planNext, notifyStart, notifyEnd, retryIn };
}
