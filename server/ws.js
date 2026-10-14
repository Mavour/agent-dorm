/**
 * WebSocket /ws: server -> client saja (client hanya boleh kirim pong).
 * @param {any} app fastify
 * @param {{ store: any, boss: any, director?: any }} deps
 */
export function registerWs(app, { store, boss, director }) {
  /** @type {Set<any>} */
  const clients = new Set();

  // Broadcast tiap notifikasi store
  store.subscribe((msg) => {
    if (msg.type === 'agent_update') {
      broadcast({ type: 'agent_update', agentId: msg.agentId, snapshot: msg.snapshot });
    } else if (msg.type === 'event') {
      // Mentah langsung disiarkan; presentasi (bubble/ikon/bos) antre di director.
      broadcast({ type: 'event', event: msg.event });
      if (director) director.pushEvent(msg.event);
    }
  });

  boss.onBoss((b) => broadcast({ type: 'boss', ...b }));

  if (director) {
    director.onCue((cue) => broadcast(cue));
  }

  /** @param {any} obj */
  function broadcast(obj) {
    const s = JSON.stringify(obj);
    for (const ws of clients) {
      try {
        ws.send(s);
      } catch {
        /* abaikan */
      }
    }
  }

  app.get('/ws', { websocket: true }, (socket) => {
    clients.add(socket);
    try {
      socket.send(JSON.stringify({ type: 'hello', serverTime: new Date().toISOString(), meta: store.getMeta() }));
      socket.send(JSON.stringify({ type: 'snapshot_all', agents: store.getAllSnapshots(), boss: boss.get(), events: store.getEvents(50) }));
    } catch {
      /* abaikan */
    }
    socket.on('message', () => {
      /* client hanya pong; abaikan isi */
    });
    socket.on('close', () => clients.delete(socket));
    socket.on('error', () => clients.delete(socket));
  });

  // Ping tiap 30 dtk; client yang mati akan drop otomatis
  setInterval(() => {
    for (const ws of [...clients]) {
      try {
        ws.send(JSON.stringify({ type: 'ping', serverTime: new Date().toISOString() }));
      } catch {
        clients.delete(ws);
      }
    }
  }, 30000);
}
