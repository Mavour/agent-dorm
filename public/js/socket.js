/**
 * Klien WebSocket + fallback polling /api/state tiap 5 dtk saat putus.
 * Server -> client saja; client tidak mengirim apa pun kecuali pong implisit.
 */
export function connectSocket(store, hud) {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const url = `${proto}//${location.host}/ws`;
  let backoff = 1000;
  let alive = true;
  let fallbackTimer = null;
  let ws = null;
  let lastWsMsgAt = 0; // Date.now() pesan WS terakhir (filter fallback basi)

  function setConn(state) {
    if (hud && hud.setConn) hud.setConn(state);
  }

  function startFallback() {
    stopFallback();
    fallbackTimer = setInterval(async () => {
      const startedAt = Date.now();
      try {
        const r = await fetch('/api/state');
        if (!r.ok) return;
        // WS sudah mengirim data lebih segar selagi fetch jalan: abaikan.
        if (lastWsMsgAt > startedAt) return;
        const s = await r.json();
        if (lastWsMsgAt > startedAt) return;
        if (s.agents) store.setAll(s.agents);
        if (s.meta) store.setMeta(s.meta);
        if (s.events) store.setEvents(s.events);
        if (s.boss) store.setBoss(s.boss);
        hud.bumpSync();
      } catch {
        /* tetap coba lagi */
      }
    }, 5000);
  }

  function stopFallback() {
    if (fallbackTimer) {
      clearInterval(fallbackTimer);
      fallbackTimer = null;
    }
  }

  async function connect() {
    if (!alive) return;
    setConn('reconnecting');
    try {
      const response = await fetch('/api/ws-ticket', { cache: 'no-store' });
      let ticket = null;
      if (response.ok) {
        const data = await response.json();
        if (typeof data.ticket !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(data.ticket)) throw new Error('Invalid WebSocket ticket');
        ticket = data.ticket;
      } else if (response.status !== 404) throw new Error('WebSocket authorization failed');
      if (!alive) return;
      ws = ticket ? new WebSocket(url, ['agent-dorm', ticket]) : new WebSocket(url);
    } catch {
      retry();
      return;
    }
    ws.onopen = () => {
      backoff = 1000;
      setConn('connected');
      stopFallback();
    };
    ws.onmessage = (ev) => {
      let m;
      try {
        m = JSON.parse(ev.data);
      } catch {
        return;
      }
      lastWsMsgAt = Date.now();
      hud.bumpSync();
      if (m.type === 'hello') {
        if (m.meta) store.setMeta(m.meta);
      } else if (m.type === 'snapshot_all') {
        if (m.agents) store.setAll(m.agents);
        if (m.boss) store.setBoss(m.boss);
        if (m.events) store.setEvents(m.events);
      } else if (m.type === 'agent_update') {
        store.setSnapshot(m.agentId, m.snapshot);
      } else if (m.type === 'event') {
        store.pushEvent(m.event);
      } else if (m.type === 'cue') {
        // Cue presentasi: bubble/ikon/bos, sekali jalan (tak diputar ulang).
        store.pushCue(m);
      } else if (m.type === 'boss') {
        store.setBoss(m);
      }
      // ping: tidak perlu dibalas (server hanya broadcast)
    };
    ws.onclose = () => retry();
    ws.onerror = () => {
      try {
        ws.close();
      } catch {
        /* abaikan */
      }
    };
  }

  function retry() {
    if (!alive) return;
    setConn('reconnecting');
    startFallback();
    setTimeout(() => {
      backoff = Math.min(backoff * 2, 15000);
      connect();
    }, backoff);
  }

  connect();
  return {
    stop() {
      alive = false;
      stopFallback();
      try {
        if (ws) ws.close();
      } catch {
        /* abaikan */
      }
    },
  };
}
