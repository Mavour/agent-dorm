/**
 * HUD atas: jam lokal, waktu sinkron terakhir, dot koneksi, chip demo, tombol demo.
 */
export function createHud(store) {
  const clockEl = document.getElementById('clock');
  const syncEl = document.getElementById('sync');
  const connEl = document.getElementById('conn');
  const demoChip = document.getElementById('demo-chip');
  const demoBtn = document.getElementById('demo-btn');

  function tickClock() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    if (clockEl) clockEl.textContent = `${p(d.getHours())}:${p(d.getMinutes())}`;
  }
  tickClock();
  setInterval(tickClock, 10000);

  const hud = {
    bumpSync() {
      const d = new Date();
      const p = (n) => String(n).padStart(2, '0');
      if (syncEl) syncEl.textContent = `sinkron ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
    },
    /** @param {'connected'|'reconnecting'|'offline'} s */
    setConn(s) {
      if (!connEl) return;
      connEl.className = 'dot ' + (s === 'connected' ? 'dot-green' : s === 'reconnecting' ? 'dot-amber' : 'dot-red');
      connEl.title = s === 'connected' ? 'Terhubung' : s === 'reconnecting' ? 'Menyambung ulang' : 'Offline';
    },
  };

  store.subscribe((kind) => {
    if (kind === 'meta' || kind === 'snapshot' || kind === 'snapshot_all') refreshDemo();
  });

  function refreshDemo() {
    const meta = store.getMeta();
    const anyDummy = Object.values(meta).some((m) => m && m.mode === 'dummy');
    if (demoChip) demoChip.hidden = !anyDummy;
    if (demoBtn) demoBtn.hidden = !(window.__DEMO_CONTROLS__ && anyDummy);
  }
  // Status awal: anggap reconnecting sampai ws terbuka
  hud.setConn('reconnecting');
  refreshDemo();
  return hud;
}
