/**
 * Pengendali reaksi bos (diekstrak dari index.js agar bisa diuji).
 * Aturan antrean:
 * - Prioritas sama/lebih tinggi menyela langsung (yang disela dibuang).
 * - Prioritas lebih rendah antre (maks 3, buang tertua, buang yang
 *   lebih tua dari 15 dtk) dan dimainkan setelah reaksi berjalan selesai.
 * - Antrean kosong -> kembali idle.
 * Broadcast HANYA lewat subscriber onBoss (satu jalur, tanpa dobel).
 * Tabel prioritas + teks bubble tetap di boss-reactions.js.
 */
import { reactionForEvent, idleReaction, priorityOf } from './boss-reactions.js';

/**
 * @param {{ schedule?: (fn: Function, ms: number) => any, cancel?: (h: any) => void, now?: () => number }} [opts]
 */
export function createBossController(opts = {}) {
  const schedule = opts.schedule || ((fn, ms) => setTimeout(fn, ms));
  const cancel = opts.cancel || ((h) => clearTimeout(h));
  const now = opts.now || (() => Date.now());

  /** @type {{ state: string, bubble: string, durationMs: number, seq: number }} */
  let current = { state: 'idle', bubble: '', durationMs: 6000, seq: 0 };
  /** @type {Set<Function>} */
  const subs = new Set();
  let timer = null;
  /** @type {{ reaction: any, at: number }[]} */
  let queue = [];

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

  /** @param {{ state: string, bubble: string, durationMs: number }} r */
  function play(r) {
    if (timer) {
      cancel(timer);
      timer = null;
    }
    current = { state: r.state, bubble: r.bubble, durationMs: r.durationMs, seq: current.seq };
    emit();
    if (r.state !== 'idle') {
      timer = schedule(advance, r.durationMs);
    }
  }

  function prune() {
    const t = now();
    queue = queue.filter((q) => t - q.at <= 15000);
    while (queue.length > 3) queue.shift();
  }

  function advance() {
    timer = null;
    prune();
    const next = queue.shift();
    if (next) play(next.reaction);
    else play({ state: 'idle', bubble: '', durationMs: 6000 });
  }

  return {
    /** Status bos saat ini (termasuk seq untuk dedupe klien). */
    get: () => ({ ...current }),
    /** @param {(b: any) => void} fn */
    onBoss: (fn) => {
      subs.add(fn);
      return () => subs.delete(fn);
    },
    /** Terima event store; tidak me-return apa pun (broadcast via onBoss). @param {any} event */
    onEvent: (event) => {
      const r = reactionForEvent(event);
      if (!r) return;
      if (current.state === 'idle' || priorityOf(r.state) >= priorityOf(current.state)) {
        play(r);
      } else {
        queue.push({ reaction: r, at: now() });
        prune();
      }
    },
    /** Detak idle (30-60 dtk dari index.js). */
    idleTick: () => {
      if (current.state === 'idle') play(idleReaction());
    },
  };
}
