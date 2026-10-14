/**
 * Lem aktivitas untuk satu agen: idle/event/demo/duel.
 * Pemilik (agent.js) memegang S + player; driver memegang status
 * aktivitas, cooldown, urutan cue, dan penahan duel.
 */
import { pickIdleActivity } from './activity-logic.js';

// Aktivitas event per tipe cue (didorong CUE terserial, bukan event mentah).
export const EVENT_ACT = {
  position_closed: { exitbot: 'tebas' },
  report_ready: { portfolio: 'lapor' },
  coin_found: { alert: 'terompet' },
  position_out_of_range: { lpwatcher: 'lentera' },
};
export const ACT_COOLDOWN_MS = 15000;
const IDLE_PROBABILITY = 0.55;

/**
 * Nama aktivitas event untuk cue ini (atau null).
 * @param {string} type
 * @param {string} agentId
 */
export function eventActivityFor(type, agentId) {
  return (EVENT_ACT[type] || {})[agentId] || null;
}

/**
 * @param {{ id: string, acts: Record<string, any>|null, player: any|null, reduced: boolean, statusOf: () => string }} opts
 */
export function createActivityDriver(opts) {
  const { id, acts, player, reduced, statusOf } = opts;
  const st = {
    cur: null, // {name, kind} | null
    endsAt: 0,
    unackedAtStart: 0,
    coolUntil: 0,
    cueSeq: 0,
    cueUntil: 0,
    duelHold: false,
  };

  /**
   * @param {string} name
   * @param {number} durationMs
   * @param {'idle'|'event'|'demo'|'duel'} kind
   * @param {number} unacked badge terbuka saat mulai
   */
  function play(name, durationMs, kind, unacked) {
    if (reduced || !player || !player.available(name)) return false;
    if (statusOf() === 'offline') return false;
    if (!player.play(name)) return false;
    st.cur = { name, kind };
    st.endsAt = performance.now() + durationMs;
    st.unackedAtStart = unacked;
    st.duelHold = false;
    return true;
  }

  function stop() {
    if (player) player.stop();
    st.cur = null;
    st.duelHold = false;
  }

  /** Selesai normal: hentikan + cooldown 15 dtk. @param {number} now */
  function finish(now) {
    stop();
    st.coolUntil = now + ACT_COOLDOWN_MS;
  }

  /**
   * Keputusan aktivitas idle (dipanggil saat idle timer habis).
   * @param {number} now
   * @param {number} unacked
   * @returns {{ name: string, durationMs: number } | null}
   */
  function idlePick(now, unacked) {
    if (reduced || !player) return null;
    if (unacked > 0) return null;
    if (st.duelHold) return null;
    if (Math.random() >= IDLE_PROBABILITY) return null;
    const pick = pickIdleActivity(id, acts, Math.random, now, st.coolUntil);
    if (!pick || !player.available(pick.name)) return null;
    return pick;
  }

  /**
   * Cabang state "activity" di frame: alert baru menang (abort),
   * selesai -> idle. Mengubah S langsung.
   * @param {number} now
   * @param {any} S state agen
   * @returns {boolean} true bila state ini tertangani
   */
  function tickActivity(now, S) {
    if (S.unacked > st.unackedAtStart) {
      stop();
      S.state = 'idle';
      S.idleUntil = now;
      return true;
    }
    if (now >= st.endsAt) {
      finish(now);
      S.state = 'idle';
      S.idleUntil = now + 2000 + Math.random() * 4000;
      return true;
    }
    return true;
  }

  return { st, play, stop, finish, idlePick, tickActivity };
}
