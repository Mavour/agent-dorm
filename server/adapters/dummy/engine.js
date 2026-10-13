/**
 * Mesin dummy: PRNG seeded (mulberry32) + helper bersama + registry aksi demo.
 */

/**
 * PRNG mulberry32 agar run reproducible.
 * @param {number} seed
 */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** @type {Map<string, (action: string) => ({ event: any } | null | void)>} */
const demoHandlers = new Map();

/**
 * @param {string} agentId
 * @param {(action: string) => any} fn
 */
export function registerDemoHandler(agentId, fn) {
  demoHandlers.set(agentId, fn);
}

export function unregisterDemoHandler(agentId) {
  demoHandlers.delete(agentId);
}

/**
 * Pemicu aksi demo (dipanggil route POST /api/demo/trigger).
 * @param {string} action
 * @returns {{ handled: boolean, event?: any }}
 */
export function triggerDemo(action) {
  // Tiap aksi dimiliki satu agen; coba semuanya.
  for (const [, fn] of demoHandlers) {
    const r = fn(action);
    if (r && r.handled) return r;
  }
  return { handled: false };
}

/**
 * @param {() => number} rnd
 * @param {number} min
 * @param {number} max
 */
export function range(rnd, min, max) {
  return min + rnd() * (max - min);
}

/**
 * @param {() => number} rnd
 * @param {any[]} arr
 */
export function pick(rnd, arr) {
  return arr[Math.floor(rnd() * arr.length)];
}

/** @returns {string} ISO sekarang */
export function nowIso() {
  return new Date().toISOString();
}

let evCounter = 0;
/** @param {string} prefix @returns {string} id event unik */
export function eventId(prefix) {
  evCounter += 1;
  return `${prefix}-${Date.now()}-${evCounter}`;
}
