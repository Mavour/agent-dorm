/**
 * Sutradara laporan: menyerikan presentasi event (SATU cue dalam satu waktu).
 * Event mentah tetap disiarkan langsung sebagai {type:"event"} (data, daftar
 * alert popup, dan badge merah tetap real-time). Murni + bisa diuji lewat
 * schedule/cancel/now injeksi seperti boss-controller.
 *
 * - Tipe reportable: coin_found, position_out_of_range, position_back_in_range,
 *   position_closed, report_ready, agent_offline, agent_online ("info" tidak
 *   ditampilkan).
 * - Satu cue 6500 ms + jeda 1200 ms. Reaksi bos dari event YANG SAMA,
 *   dimainkan 700 ms setelah cue mulai (via playBoss injeksi).
 * - Kritis > penting > normal. Prioritas tinggi menyalip antrean tapi tak
 *   pernah menyela cue yang sedang main. Maks 8 menunggu (buang normal
 *   tertua dulu). Koalesce: agentId+type sama -> hanya yang terbaru.
 *   Non-kritis menunggu > 30 dtk dibuang; kritis tak pernah dibuang.
 */
import { reactionForEvent } from './boss-reactions.js';

export const CUE_MS = 6500;
export const GAP_MS = 1200;
const BATCH_MS = 400;
const BATCH_MAX_MS = 1000;
const MAX_WAITING = 8;
const STALE_MS = 30000;

/**
 * Prioritas antrean cue: 3 kritis, 2 penting, 1 normal, 0 lewati.
 * @param {any} event
 */
export function cuePriority(event) {
  const d = (event && event.data) || {};
  switch (event && event.type) {
    case 'info':
      return 0;
    case 'position_out_of_range':
    case 'agent_offline':
      return 3;
    case 'position_closed':
      return Number(d.pnlUsd ?? 0) < 0 ? 3 : 2;
    case 'report_ready':
      return d.tone === 'warn' ? 2 : 1;
    case 'coin_found':
      return Number(d.score ?? 0) >= 80 ? 2 : 1;
    default:
      return 1;
  }
}

/**
 * @param {{ schedule?: (fn: Function, ms: number) => any, cancel?: (h: any) => void, now?: () => number, playBoss?: (reaction: any, meta: any) => void }} [opts]
 */
export function createReportDirector(opts = {}) {
  const schedule = opts.schedule || ((fn, ms) => setTimeout(fn, ms));
  const cancel = opts.cancel || ((h) => clearTimeout(h));
  const now = opts.now || (() => Date.now());
  const playBoss = opts.playBoss || (() => {});

  /** @type {Set<Function>} */
  const subs = new Set();
  /** @type {{ event: any, pri: number, at: number }[]} */
  let waiting = [];
  /** @type {any|null} */
  let playing = null;
  let phase = 'idle'; // idle | batch | playing | gap
  let timer = null;
  let batchStart = 0;
  let cueSeq = 0;

  /** @param {any} cue */
  function emit(cue) {
    for (const fn of subs) {
      try {
        fn({ ...cue });
      } catch {
        /* abaikan */
      }
    }
  }

  function sortQueue() {
    waiting.sort((a, b) => b.pri - a.pri || a.at - b.at);
  }

  /** @param {any} ev @returns {boolean} true bila diterima untuk presentasi */
  function insert(ev) {
    const pri = cuePriority(ev);
    if (pri <= 0) return false;
    const at = now();
    const ix = waiting.findIndex((q) => q.event.agentId === ev.agentId && q.event.type === ev.type);
    if (ix >= 0) waiting.splice(ix, 1); // koalesce: hanya yang terbaru
    waiting.push({ event: ev, pri, at });
    sortQueue();
    while (waiting.length > MAX_WAITING) {
      // Buang normal tertua dulu; kritis paling terakhir dibuang.
      let victimIx = -1;
      let victimPri = 99;
      let victimAt = -1;
      waiting.forEach((q, i) => {
        if (q.pri < victimPri || (q.pri === victimPri && q.at > victimAt)) {
          victimPri = q.pri;
          victimAt = q.at;
          victimIx = i;
        }
      });
      waiting.splice(victimIx, 1);
    }
    return true;
  }

  function prune() {
    const t = now();
    waiting = waiting.filter((q) => q.pri >= 3 || t - q.at <= STALE_MS);
  }

  function playNext() {
    timer = null;
    prune();
    const next = waiting.shift();
    if (!next) {
      phase = 'idle';
      playing = null;
      return;
    }
    phase = 'playing';
    cueSeq += 1;
    const cue = {
      type: 'cue',
      cueId: `cue-${cueSeq}`,
      agentId: next.event.agentId,
      event: next.event,
      durationMs: CUE_MS,
      startedAt: new Date(now()).toISOString(),
      queueLength: waiting.length,
    };
    playing = cue;
    emit(cue);
    const reaction = reactionForEvent(next.event);
    if (reaction) {
      schedule(() => playBoss(reaction, { sourceEventId: next.event.id, agentId: next.event.agentId }), 700);
    }
    timer = schedule(() => {
      timer = null;
      playing = null;
      phase = 'gap';
      timer = schedule(() => {
        timer = null;
        playNext();
      }, GAP_MS);
    }, CUE_MS);
  }

  return {
    /** @param {(cue: any) => void} fn */
    onCue: (fn) => {
      subs.add(fn);
      return () => subs.delete(fn);
    },
    /** Masukkan event mentah ke antrean presentasi. @param {any} ev @returns {boolean} */
    pushEvent: (ev) => {
      if (!ev || typeof ev !== 'object') return false;
      const ok = insert(ev);
      if (!ok || phase === 'playing' || phase === 'gap') return ok;
      // idle/batch: debounce agar event beruntun terurut prioritas dulu.
      if (phase === 'idle') {
        phase = 'batch';
        batchStart = now();
      }
      if (timer) cancel(timer);
      if (now() - batchStart >= BATCH_MAX_MS) {
        timer = null;
        playNext();
      } else {
        timer = schedule(() => {
          timer = null;
          playNext();
        }, BATCH_MS);
      }
      return ok;
    },
    /** True bila tak ada cue main/antre/batch (idleTick bos boleh jalan). */
    isIdle: () => phase === 'idle',
    getState: () => ({
      phase,
      playing: playing ? { cueId: playing.cueId, agentId: playing.agentId, type: playing.event.type } : null,
      queueLength: waiting.length,
    }),
  };
}
