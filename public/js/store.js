/**
 * Store sisi klien: snapshot per agen, meta, event, status bos.
 */
export function createClientStore() {
  /** @type {Map<string, any>} */
  const snaps = new Map();
  let meta = {};
  /** @type {any[]} */
  let events = [];
  let boss = { state: 'idle', bubble: '', durationMs: 6000 };
  /** @type {Set<Function>} */
  const subs = new Set();

  function emit(kind, payload) {
    for (const fn of subs) {
      try {
        fn(kind, payload);
      } catch {
        /* abaikan */
      }
    }
  }

  return {
    /** @param {Function} fn */
    subscribe(fn) {
      subs.add(fn);
      return () => subs.delete(fn);
    },
    /** @param {string} agentId @param {any} snap */
    setSnapshot(agentId, snap) {
      snaps.set(agentId, snap);
      emit('snapshot', { agentId, snapshot: snap });
    },
    /** @param {Record<string, any>} agents */
    setAll(agents) {
      for (const [k, v] of Object.entries(agents || {})) snaps.set(k, v);
      emit('snapshot_all', { agents });
    },
    /** @param {any} m */
    setMeta(m) {
      meta = m || {};
      emit('meta', { meta });
    },
    /** @param {any} e */
    pushEvent(e) {
      events = [...events.slice(-199), e];
      emit('event', { event: e });
    },
    /** Cue presentasi dari sutradara (tidak disimpan; tidak diputar ulang). @param {any} cue */
    pushCue(cue) {
      emit('cue', { cue });
    },
    /** @param {any[]} list */
    setEvents(list) {
      events = list || [];
      emit('events', { events });
    },
    /** @param {any} b */
    setBoss(b) {
      boss = b;
      emit('boss', { boss: b });
    },
    /** @param {string} id */
    get(id) {
      return snaps.get(id) || null;
    },
    all() {
      return Object.fromEntries(snaps.entries());
    },
    getMeta() {
      return meta;
    },
    getEvents() {
      return events;
    },
    getBoss() {
      return boss;
    },
  };
}
