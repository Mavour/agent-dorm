/**
 * Pengendali reaksi bos: play() langsung tanpa antrean/prioritas sendiri
 * (penjadwalan milik report-director). Kembali idle otomatis setelah
 * durationMs. Broadcast HANYA lewat subscriber onBoss (satu jalur).
 * Pesan bos membawa sourceEventId + agentId dari event pemicunya.
 */
import { idleReaction } from './boss-reactions.js';

/**
 * @param {{ schedule?: (fn: Function, ms: number) => any, cancel?: (h: any) => void }} [opts]
 */
export function createBossController(opts = {}) {
  const schedule = opts.schedule || ((fn, ms) => setTimeout(fn, ms));
  const cancel = opts.cancel || ((h) => clearTimeout(h));

  /** @type {{ state: string, bubble: string, durationMs: number, seq: number, sourceEventId: string|null, agentId: string|null }} */
  let current = { state: 'idle', bubble: '', durationMs: 6000, seq: 0, sourceEventId: null, agentId: null };
  /** @type {Set<Function>} */
  const subs = new Set();
  let timer = null;

  function emit() {
    current.seq += 1;
    const out = { ...current };
    for (const fn of subs) {
      try {
        fn(out);
      } catch {
        /* abaikan */
      }
    }
  }

  /**
   * Mainkan reaksi (menimpa yang sedang tampil).
   * @param {{ state: string, bubble: string, durationMs: number }} reaction
   * @param {{ sourceEventId?: string|null, agentId?: string|null }} [meta]
   */
  function play(reaction, meta = {}) {
    if (timer) {
      cancel(timer);
      timer = null;
    }
    current = {
      state: reaction.state,
      bubble: reaction.bubble,
      durationMs: reaction.durationMs,
      seq: current.seq,
      sourceEventId: meta.sourceEventId ?? null,
      agentId: meta.agentId ?? null,
    };
    emit();
    if (reaction.state !== 'idle') {
      timer = schedule(() => {
        timer = null;
        play({ state: 'idle', bubble: '', durationMs: 6000 }, {});
      }, reaction.durationMs);
    }
  }

  return {
    /** Status bos saat ini (termasuk seq untuk dedupe klien). */
    get: () => ({ ...current }),
    /** @param {(b: any) => void} fn */
    onBoss: (fn) => {
      subs.add(fn);
      return () => subs.delete(fn);
    },
    play,
    /** Detak idle (index.js hanya memanggil saat director menganggur). */
    idleTick: () => {
      if (current.state === 'idle') play(idleReaction(), {});
    },
  };
}
