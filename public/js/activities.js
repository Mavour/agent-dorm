/**
 * Aktivitas client-side: trigger demo per aktivitas + duel "adu pedang"
 * ExitBot vs LP Watcher. Tak ada panggilan server di sini.
 */
import {
  duelTargets,
  closeDuelTargets,
  resolveActivities,
  pickSocialPair,
  SOCIAL_MS,
  duelBlockers,
  createDuelScheduler,
  DUEL_APPROACH_MS,
  DUEL_RETRY_MS,
} from './activity-logic.js';
import { dashWhoosh, dashImpact, duelMode } from './sound.js';
import { blockedRect } from './path-logic.js';

export const DUEL_GAP = 140;
export const DUEL_ARRIVE_PX = 4;
/** Sudah sedekat ini -> langsung tarung di titik tengah. */
export const DUEL_CLOSE_PX = 220;
const DUEL_PLAY_MS = [8000, 12000];

/**
 * @param {{ agents: any[], stage: any, manifest: any, isPopupOpen: (id: string) => boolean, reduced: boolean }} opts
 */
export function createActivities(opts) {
  const { agents, stage, manifest, isPopupOpen, reduced } = opts;
  const byId = new Map(agents.map((a) => [a.id, a]));
  /** @type {{ phase: 'approach'|'duel', a: any, b: any, ta: any, tb: any, cueA: number, cueB: number, endsAt: number, startedAt: number, forced: boolean }|null} */
  let duel = null;
  const sched = createDuelScheduler({ now: performance.now() });
  /** alert pertama terlihat per agen (untuk grace 30 dtk). */
  const alertSince = new Map();
  let lastBlockLogAt = 0;

  /** @param {string} agentId */
  function inDuel(agentId) {
    return !!duel && (duel.a.id === agentId || duel.b.id === agentId);
  }

  /**
   * Mainkan satu aktivitas (tombol demo). Client-side saja.
   * @param {string} agentId
   * @param {string} name
   * @returns {{ ok: boolean, reason?: string }}
   */
  function trigger(agentId, name) {
    const a = byId.get(agentId);
    if (!a) return { ok: false, reason: 'Agen tak dikenal' };
    if (reduced) return { ok: false, reason: 'Nonaktif (reduced motion)' };
    if (inDuel(agentId)) return { ok: false, reason: 'Sedang adu pedang' };
    const d = a.debug();
    if (d.status === 'offline') return { ok: false, reason: 'Agen offline' };
    if (d.unacked > 0 || d.state === 'alert') return { ok: false, reason: 'Ada alert' };
    if (d.state === 'busy' || d.state === 'duelWalk' || d.act) return { ok: false, reason: 'Agen sibuk' };
    const acts = resolveActivities(manifest)[agentId] || {};
    const def = acts[name];
    if (!def) return { ok: false, reason: 'Aktivitas tak dikenal' };
    const n = (def.frames || []).length || 1;
    const dur = def.mode === 'once' ? Math.ceil((n / (def.fps || 4)) * 1000) + 1000 : 5000;
    if (!a.playActivity(name, dur, 'demo')) return { ok: false, reason: 'Gagal mulai' };
    return { ok: true };
  }

  /** @param {any} a @param {number} now */
  function snap(a, now) {
    const d = a.debug();
    const un = d.unacked || 0;
    if (un > 0 && !alertSince.has(a.id)) alertSince.set(a.id, now);
    if (un === 0 && alertSince.has(a.id)) alertSince.delete(a.id);
    return {
      state: d.state,
      status: d.status,
      unacked: un,
      alertAt: alertSince.get(a.id) ?? now,
      cueUntil: d.cueUntil,
      activity: d.act,
    };
  }

  /** @param {any} a */
  function hasFrames(a) {
    if (typeof a.duelReady === 'function') {
      try {
        return !!a.duelReady();
      } catch {
        return true;
      }
    }
    const acts = resolveActivities(manifest)[a.id] || {};
    return !!(acts.duel && (acts.duel.frames || []).length);
  }

  /** @param {boolean} force */
  function currentBlockers(now, force) {
    const a = byId.get('exitbot');
    const b = byId.get('lpwatcher');
    if (!a || !b) return ['agen duel tak ada'];
    return duelBlockers({
      a: snap(a, now),
      b: snap(b, now),
      now,
      popupA: isPopupOpen('exitbot'),
      popupB: isPopupOpen('lpwatcher'),
      reduced,
      framesA: hasFrames(a),
      framesB: hasFrames(b),
      nextAt: sched.state.nextAt,
      force,
    });
  }

  function releasePair(a, b) {
    duelMode(false);
    for (const ag of [a, b]) {
      try {
        if (typeof ag.releaseDuel === 'function') ag.releaseDuel();
        else ag.stopActivity();
      } catch {
        /* abaikan */
      }
      try {
        if (typeof ag.restoreAlert === 'function') ag.restoreAlert();
      } catch {
        /* abaikan */
      }
    }
  }

  /**
   * Inti mulai duel (dipakai otomatis + paksa). Berhentikan idle/walking,
   * jalan terproteksi via planPath, hadap berhadapan, tangguhkan alert.
   * @param {boolean} force
   * @returns {{ ok: boolean, reasons?: string[] }}
   */
  function startDuel(force) {
    const a = byId.get('exitbot');
    const b = byId.get('lpwatcher');
    if (!a || !b) return { ok: false, reasons: ['agen duel tak ada'] };
    const now = performance.now();
    const reasons = currentBlockers(now, force);
    if (reasons.length) {
      console.info('[duel] blocked:', reasons);
      return { ok: false, reasons };
    }
    // Sudah berdekatan -> temu di titik tengah, langsung tarung di tempat.
    // Jauh -> titik acak seperti biasa.
    const pa = { x: a.debug().x, y: a.debug().y };
    const pb = { x: b.debug().x, y: b.debug().y };
    let t = null;
    let close = false;
    if (Math.hypot(pa.x - pb.x, pa.y - pb.y) <= DUEL_CLOSE_PX) {
      t = closeDuelTargets(pa, pb, DUEL_GAP, blockedRect(stage.bossSeat()));
      close = !!t;
    }
    if (!t) {
      t = duelTargets(stage.walkArea(), stage.bossSeat(), DUEL_GAP, Math.random, stage.W, stage.H);
      if (!t) {
        console.info('[duel] blocked:', ['titik temu tak ada']);
        return { ok: false, reasons: ['titik temu tak ada'] };
      }
    }
    // Hentikan aktivitas idle/walking biasa (event/cue sudah diblokir).
    for (const ag of [a, b]) {
      try {
        const inf = typeof ag.activityInfo === 'function' ? ag.activityInfo() : null;
        if (inf) ag.stopActivity();
      } catch {
        /* abaikan */
      }
      try {
        if (typeof ag.suspendAlert === 'function') ag.suspendAlert();
      } catch {
        /* abaikan */
      }
    }
    // Setelah burst, keduanya berhadapan (ikut sisi target masing-masing);
    // selama windup/burst mereka menghadap arah luncur.
    const dirA = t.b.x >= t.a.x ? 1 : -1;
    a.duelTo(t.a.x, t.a.y, { face: dirA });
    b.duelTo(t.b.x, t.b.y, { face: -dirA });
    duel = {
      phase: 'approach',
      a,
      b,
      ta: t.a,
      tb: t.b,
      cueA: a.cueSeq(),
      cueB: b.cueSeq(),
      endsAt: 0,
      startedAt: now,
      forced: force,
      whooshed: false,
    };
    sched.notifyStart();
    console.info(`[duel] mulai! (${force ? 'paksa' : 'otomatis'}${close ? ', dekat' : ''})`);
    // Musik tempur masuk sekarang; whoosh menunggu burst (sinkron gerakan).
    duelMode(true);
    return { ok: true };
  }

  /** Hadapkan dua duelist saling memandang (ikut posisi target). */
  function facePair(a, b, ta, tb) {
    try {
      const dirA = tb.x >= ta.x ? 1 : -1;
      if (typeof a.setFacing === 'function') a.setFacing(dirA);
      if (typeof b.setFacing === 'function') b.setFacing(-dirA);
    } catch {
      /* abaikan */
    }
  }

  /**
   * Mulai duel bila kedua agen bebas (dipakai timer + tombol demo lama).
   * @returns {boolean}
   */
  function tryStart() {
    if (duel || reduced) return false;
    const r = startDuel(false);
    return r.ok;
  }

  /**
   * DEMO "Adu pedang": paksa mulai (abaikan cooldown + alert).
   * @returns {{ ok: boolean, reasons?: string[], reason?: string }}
   */
  function forceStart() {
    if (duel) return { ok: false, reason: 'Sedang adu pedang', reasons: ['Sedang adu pedang'] };
    if (reduced) return { ok: false, reason: 'Nonaktif (reduced motion)', reasons: ['reduced-motion'] };
    const r = startDuel(true);
    if (!r.ok) return { ok: false, reason: (r.reasons || []).join(', ') || 'Terhalang', reasons: r.reasons };
    return { ok: true };
  }

  function abort(retryMs, why) {
    if (!duel) return;
    if (why) console.info(`[duel] abort (${why})`);
    const now = performance.now();
    releasePair(duel.a, duel.b);
    duel = null;
    if (typeof retryMs === 'number') sched.retryIn(now, retryMs);
    else sched.notifyEnd(now);
  }

  /**
   * Dipanggil tiap frame (setelah frame agen).
   * @param {number} now
   */
  function tick(now) {
    tickSocial(now);
    // Perbarui usia alert meski belum duel.
    for (const id of ['exitbot', 'lpwatcher']) {
      const ag = byId.get(id);
      if (ag) snap(ag, now);
    }
    if (!duel) {
      const blocked = currentBlockers(now, false);
      const res = sched.tick(now, blocked);
      if (res === 'start') {
        startDuel(false);
      } else if (res === 'pending') {
        if (now - lastBlockLogAt > 10000) {
          lastBlockLogAt = now;
          console.info('[duel] blocked:', blocked);
        }
      } else if (res === 'giveup') {
        console.info('[duel] blocked 60s, reschedule:', blocked);
      }
      return;
    }
    const { a, b } = duel;
    const da = a.debug();
    const db = b.debug();
    // Abort bersih: offline, cue baru, atau popup dibuka. Alert TIDAK abort.
    if (da.status === 'offline' || db.status === 'offline' || isPopupOpen('exitbot') || isPopupOpen('lpwatcher')) {
      abort(undefined, `ganggu (${da.status}/${db.status} popup:${isPopupOpen('exitbot')}/${isPopupOpen('lpwatcher')})`);
      return;
    }
    if (a.cueSeq() !== duel.cueA || b.cueSeq() !== duel.cueB) {
      abort(undefined, 'cue milik duelist');
      return;
    }
    if (duel.phase === 'approach') {
      if (now - duel.startedAt > DUEL_APPROACH_MS) {
        abort(DUEL_RETRY_MS, 'timeout pendekatan 25s');
        return;
      }
      const okState = (d) => d.state === 'duelWalk' || d.state === 'idle' || d.state === 'activity';
      if (!okState(da) || !okState(db)) {
        abort(DUEL_RETRY_MS, `state lepas (${da.state}/${db.state})`);
        return;
      }
      // Whoosh tepat saat salah satu mulai meluncur (bukan di awal windup).
      if (!duel.whooshed && (da.dash === 'burst' || db.dash === 'burst')) {
        duel.whooshed = true;
        const ms = Math.max(da.dashBurstMs || 0, db.dashBurstMs || 0);
        dashWhoosh(ms > 0 ? ms / 1000 : undefined);
      }
      const near = (d, t) => Math.hypot(d.x - t.x, d.y - t.y) < DUEL_ARRIVE_PX;
      // Tarung baru mulai setelah KEDUANYA berhenti total (burst + skid selesai).
      if (near(da, duel.ta) && near(db, duel.tb) && !da.dash && !db.dash) {
        // Hadapkan sebelum strip duel (tanpa mirror artwork direksional).
        facePair(a, b, duel.ta, duel.tb);
        const dur = DUEL_PLAY_MS[0] + Math.random() * (DUEL_PLAY_MS[1] - DUEL_PLAY_MS[0]);
        const okA = a.playActivity('duel', dur, 'duel');
        const okB = b.playActivity('duel', dur, 'duel');
        if (!okA || !okB) {
          abort(DUEL_RETRY_MS, 'strip duel gagal mulai');
          return;
        }
        duel.phase = 'duel';
        duel.endsAt = now + dur;
        dashImpact(); // benturan pertama: don + dentang, sejalan beat musik tempur
        console.info(`[duel] tarung! (${Math.round(dur)}ms)`);
      }
    } else {
      if (da.state !== 'activity' || db.state !== 'activity') {
        // Offline/cue/popup sudah ditangani; state lain = abort + retry.
        if (da.status === 'offline' || db.status === 'offline') abort(undefined, 'offline saat tarung');
        else abort(DUEL_RETRY_MS, `state tarung lepas (${da.state}/${db.state})`);
        return;
      }
      // Dentang pedang dijadwalkan musik tempur tepat di beat (sound.js),
      // bukan acak di sini - acak membuat bunyi kacau & tak selaras irama.
      if (now >= duel.endsAt) {
        releasePair(a, b);
        duel = null;
        sched.notifyEnd(now);
        console.info('[duel] selesai bersih.');
      }
    }
  }

  function info() {
    if (!duel) {
      const now = performance.now();
      return {
        phase: sched.state.pending ? 'pending' : 'idle',
        nextAt: sched.state.nextAt,
        blockers: currentBlockers(now, false),
      };
    }
    return {
      phase: duel.phase === 'approach' ? 'walking' : 'fighting',
      nextAt: sched.state.nextAt,
      blockers: [],
    };
  }

  /**
   * Jeda sosial: dua agen idle berdekatan kadang saling menghadap 3 dtk.
   * @param {number} now
   */
  function tickSocial(now) {
    if (reduced) return;
    const snaps = [];
    for (const a of agents) {
      if (typeof a.socialHold !== 'function') continue;
      const d = a.debug();
      if (d.state !== 'idle') continue;
      snaps.push({ id: a.id, x: d.x, y: d.y, state: d.state, socialUntil: d.socialUntil || 0 });
    }
    if (snaps.length < 2) return;
    const pair = pickSocialPair(snaps, now, Math.random);
    if (!pair) return;
    const a = byId.get(pair.a);
    const b = byId.get(pair.b);
    if (!a || !b) return;
    if (inDuel(pair.a) || inDuel(pair.b)) return;
    a.socialHold(pair.dirA, now + SOCIAL_MS);
    b.socialHold(pair.dirB, now + SOCIAL_MS);
  }

  return { trigger, tick, tryStart, forceStart, info };
}
