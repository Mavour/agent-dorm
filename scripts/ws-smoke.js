/**
 * Smoke test WS: connect /ws, tunggu snapshot_all + agent_update (6 dtk),
 * lalu event coin_found showcase t+8s (total 15-20 dtk).
 * Jalan: npm run smoke (server harus sudah jalan di 127.0.0.1:8765).
 * Hanya pakai WebSocket global bawaan Node (>=20.6) + fetch. Tanpa dep tambahan.
 */
const PORT = Number(process.env.PORT || 8765);
const HOST = process.env.HOST || '127.0.0.1';

async function main() {
  const url = `ws://${HOST}:${PORT}/ws`;
  console.log(`[smoke] menghubungkan ke ${url} ...`);
  await new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    let gotAll = false;
    let gotUpdate = false;
    let gotCoin = false;
    const t0 = Date.now();
    const hardTimeout = setTimeout(() => {
      try {
        ws.close();
      } catch {}
      reject(new Error(`timeout (snapshot_all=${gotAll} agent_update=${gotUpdate} coin_found=${gotCoin})`));
    }, 25000);
    ws.onopen = () => console.log('[smoke] ws terbuka.');
    ws.onerror = () => {
      clearTimeout(hardTimeout);
      reject(new Error('ws error (apakah server jalan di ' + url + '?)'));
    };
    ws.onmessage = (ev) => {
      let m;
      try {
        m = JSON.parse(String(ev.data));
      } catch {
        return;
      }
      if (m.type === 'snapshot_all') {
        gotAll = true;
        const n = Object.keys(m.agents || {}).length;
        console.log(`[smoke] snapshot_all OK (${n} agen).`);
      }
      if (m.type === 'agent_update') {
        if (!gotUpdate) console.log(`[smoke] agent_update pertama OK (${m.agentId}, ${Date.now() - t0}ms).`);
        gotUpdate = true;
      }
      if (m.type === 'event' && m.event && m.event.type === 'coin_found') {
        gotCoin = true;
        console.log(`[smoke] coin_found terlihat: ${m.event.message}`);
        clearTimeout(hardTimeout);
        try {
          ws.close();
        } catch {}
        console.log('[smoke] SMOKE LULUS.');
        resolve();
      }
      if (!gotCoin && Date.now() - t0 > 6000 && gotAll && gotUpdate) {
        console.log('[smoke] snapshot_all + agent_update OK dalam 6 dtk; menunggu coin_found...');
      }
    };
  });
}

main().catch((e) => {
  console.error('[smoke] GAGAL:', e.message);
  process.exit(1);
});
