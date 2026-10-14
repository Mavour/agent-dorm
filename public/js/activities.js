/**
 * Aktivitas client-side: trigger demo per aktivitas + duel "adu pedang"
 * ExitBot vs LP Watcher. Tak ada panggilan server di sini.
 */
import { duelEligible, duelTargets, resolveActivities, pickSocialPair, SOCIAL_MS } from './activity-logic.js';

export const DUEL_GAP = 140;
const DUEL_ARRIVE_PX = 8;
const DUEL_PLAY_MS = [8000, 12000];
const DUEL_EVERY_MS = [70000, 150000];
const RETRY_MS = 10000;

/**
 * @param {{ agents: any[], stage: any, manifest: any, isPopupOpen: (id: string) => boolean, reduced: boolean }} opts
 */
export function createActivities(opts) {
  const { agents, stage, manifest, isPopupOpen, reduced } = opts;
  const byId = new Map(agents.map((a) => [a.id, a]));
  /** @type {{ phase: 'approach'|'duel', a: any, b: any, ta: any, tb: any, cueA: number, cueB: number, endsAt: number }|null} */
  let duel = null;
  let lastDuelEnd = performance.now();
  let nextAt = lastDuelEnd + DUEL_EVERY_MS[0] + Math.random() * (DUEL_EVERY_MS[1] - DUEL_EVERY_MS[0]);

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
    if (d.state === 'busy' || d.act) return { ok: false, reason: 'Agen sibuk' };
    const acts = resolveActivities(manifest)[agentId] || {};
    const def = acts[name];
    if (!def) return { ok: false, reason: 'Aktivitas tak dikenal' };
    const n = (def.frames || []).length || 1;
    const dur = def.mode === 'once' ? Math.ceil((n / (def.fps || 4)) * 1000) + 1000 : 5000;
    if (!a.playActivity(name, dur, 'demo')) return { ok: false, reason: 'Gagal mulai' };
    return { ok: true };
  }

  /** @param {any} a */
  function snap(a) {
    const d = a.debug();
    return { state: d.state, status: d.status, unacked: d.unacked, cueUntil: d.cueUntil, activity: d.act };
  }

  function planNext(now) {
    nextAt = now + DUEL_EVERY_MS[0] + Math.random() * (DUEL_EVERY_MS[1] - DUEL_EVERY_MS[0]);
  }

  /**
   * Mulai duel bila kedua agen bebas (dipakai timer + tombol demo).
   * @returns {boolean}
   */
  function tryStart() {
    if (duel || reduced) return false;
    const a = byId.get('exitbot');
    const b = byId.get('lpwatcher');
    if (!a || !b) return false;
    const now = performance.now();
    const ok = duelEligible({
      a: snap(a),
      b: snap(b),
      now,
      popupA: isPopupOpen('exitbot'),
      popupB: isPopupOpen('lpwatcher'),
      reduced,
    });
    if (!ok) return false;
    const t = duelTargets(stage.walkArea(), stage.bossSeat(), DUEL_GAP, Math.random, stage.W, stage.H);
    if (!t) return false;
    a.duelTo(t.a.x, t.a.y);
    b.duelTo(t.b.x, t.b.y);
    duel = { phase: 'approach', a, b, ta: t.a, tb: t.b, cueA: a.cueSeq(), cueB: b.cueSeq(), endsAt: 0 };
    return true;
  }

  function abort() {
    if (!duel) return;
    duel.a.stopActivity();
    duel.b.stopActivity();
    duel = null;
    lastDuelEnd = performance.now();
    planNext(lastDuelEnd);
  }

  /** @param {any} d @param {string} id */
  function disturbed(d, id) {
    return d.status === 'offline' || d.unacked > 0 || isPopupOpen(id);
  }

  /**
   * Dipanggil tiap frame (setelah frame agen).
   * @param {number} now
   */
  function tick(now) {
    tickSocial(now);
    if (!duel) {
      if (now >= nextAt) {
        if (!tryStart()) nextAt = now + RETRY_MS;
      }
      return;
    }
    const { a, b } = duel;
    const da = a.debug();
    const db = b.debug();
    // Abort: alert/offline baru, cue baru, atau popup dibuka.
    if (disturbed(da, 'exitbot') || disturbed(db, 'lpwatcher')) {
      abort();
      return;
    }
    if (a.cueSeq() !== duel.cueA || b.cueSeq() !== duel.cueB) {
      abort();
      return;
    }
    if (duel.phase === 'approach') {
      const walking = (d) => d.state === 'walking' || d.state === 'idle';
      if (!walking(da) || !walking(db)) {
        abort();
        return;
      }
      const near = (d, t) => Math.hypot(d.x - t.x, d.y - t.y) < DUEL_ARRIVE_PX;
      if (near(da, duel.ta) && near(db, duel.tb)) {
        const dur = DUEL_PLAY_MS[0] + Math.random() * (DUEL_PLAY_MS[1] - DUEL_PLAY_MS[0]);
        const okA = a.playActivity('duel', dur, 'duel');
        const okB = b.playActivity('duel', dur, 'duel');
        if (!okA || !okB) {
          abort();
          return;
        }
        duel.phase = 'duel';
        duel.endsAt = now + dur;
      }
    } else {
      if (da.state !== 'activity' || db.state !== 'activity') {
        abort();
        return;
      }
      if (now >= duel.endsAt) {
        a.stopActivity();
        b.stopActivity();
        duel = null;
        lastDuelEnd = now;
        planNext(now);
      }
    }
  }

  function info() {
    if (!duel) return null;
    return { phase: duel.phase };
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

  return { trigger, tick, tryStart, info };
}
