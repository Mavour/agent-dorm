/**
 * Store in-memory: snapshot terakhir per agen, meta, ring buffer event.
 */

const MAX_EVENTS = 200;

/**
 * Buat store baru.
 * @returns {any} store
 */
export function createStore() {
  /** @type {Map<string, any>} */
  const snapshots = new Map();
  /** @type {Map<string, { mode: string, status: string, lastOkAt: string|null, lastError: string|null }>} */
  const meta = new Map();
  /** @type {any[]} */
  const events = [];
  /** @type {Set<string>} */
  const seenIds = new Set();
  /** @type {Set<Function>} */
  const subs = new Set();

  function notify(msg) {
    for (const fn of subs) {
      try {
        fn(msg);
      } catch {
        /* abaikan subscriber rusak */
      }
    }
  }

  return {
    /** Daftarkan subscriber broadcast. @param {(m:any)=>void} fn @returns {()=>void} */
    subscribe(fn) {
      subs.add(fn);
      return () => subs.delete(fn);
    },
    /**
     * Simpan snapshot agen.
     * @param {string} agentId
     * @param {any} snapshot
     * @param {{ mode?: string, status?: string }} [m]
     */
    publishSnapshot(agentId, snapshot, m = {}) {
      snapshots.set(agentId, snapshot);
      const prev = meta.get(agentId) || { mode: m.mode || 'dummy', status: snapshot.status, lastOkAt: null, lastError: null };
      prev.mode = m.mode || prev.mode;
      prev.status = snapshot.status;
      if (snapshot.status !== 'offline') {
        prev.lastOkAt = snapshot.updatedAt;
        prev.lastError = null;
      }
      if (m.status === 'offline' || m.lastError) prev.lastError = m.lastError || prev.lastError;
      meta.set(agentId, prev);
      notify({ type: 'agent_update', agentId, snapshot });
    },
    /** Set meta offline dengan pesan jelas. */
    markOffline(agentId, message, mode) {
      const prev = meta.get(agentId) || { mode: mode || 'dummy', status: 'offline', lastOkAt: null, lastError: null };
      prev.status = 'offline';
      prev.lastError = message;
      if (mode) prev.mode = mode;
      meta.set(agentId, prev);
    },
    /**
     * Dorong event (dedupe by id).
     * @param {any} event event {id, ts, type, level, message, ...}
     * @returns {boolean} true jika baru
     */
    publishEvent(event) {
      if (!event || typeof event.id !== 'string') return false;
      if (seenIds.has(event.id)) return false;
      seenIds.add(event.id);
      events.push(event);
      if (events.length > MAX_EVENTS) {
        const rm = events.splice(0, events.length - MAX_EVENTS);
        for (const r of rm) seenIds.delete(r.id);
      }
      notify({ type: 'event', event });
      return true;
    },
    /** @param {string} agentId */
    getSnapshot(agentId) {
      return snapshots.get(agentId) || null;
    },
    getAllSnapshots() {
      return Object.fromEntries(snapshots.entries());
    },
    getMeta() {
      return Object.fromEntries(meta.entries());
    },
    /**
     * @param {number} [limit=50]
     */
    getEvents(limit = 50) {
      return events.slice(-limit).reverse();
    },
    getAllEvents() {
      return [...events];
    },
  };
}
