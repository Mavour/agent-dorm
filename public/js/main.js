/**
 * Titik masuk frontend: muat manifest + state awal, bangun stage,
 * karakter, bos, popup, socket, loop animasi, overlay debug, panel demo.
 */
import { createStage } from './stage.js';
import { createClientStore } from './store.js';
import { createHud } from './hud.js';
import { connectSocket } from './socket.js';
import { createAgent } from './agent.js';
import { createBoss } from './boss.js';
import { createBubbles } from './bubbles.js';
import { createPopup } from './popup.js';

const DEBUG = new URLSearchParams(location.search).get('debug') === '1';

async function main() {
  const [manifest, state] = await Promise.all([
    fetch('/api/manifest').then((r) => {
      if (!r.ok) throw new Error('Manifest tidak tersedia');
      return r.json();
    }),
    fetch('/api/state').then((r) => r.json()),
  ]);

  window.__ADVISOR_MODE__ = state.advisorMode || 'rules';
  window.__DEMO_CONTROLS__ = !!state.demoControls;

  const store = createClientStore();
  if (state.agents) store.setAll(state.agents);
  if (state.meta) store.setMeta(state.meta);
  if (state.events) store.setEvents(state.events);
  if (state.boss) store.setBoss(state.boss);

  const stage = createStage(manifest);
  const hud = createHud(store);
  const bubbles = createBubbles(stage);
  const popup = createPopup({ store, stage, manifest });

  /** @type {any[]} */
  const agents = [];
  window.__AGENTS__ = agents;
  for (const id of Object.keys(manifest.agents)) {
    const a = createAgent({
      id,
      cfg: manifest.agents[id],
      store,
      stage,
      bubbles,
      icons: manifest.icons,
      onOpen: (aid) => {
        const ag = agents.find((x) => x.id === aid);
        popup.open(aid, ag ? ag.anchor() : { x: stage.W / 2, y: stage.H / 2 });
      },
    });
    agents.push(a);
  }
  const boss = createBoss(stage, store, bubbles, manifest);

  // Event -> agen (ikon/bubble) + reaksi awal
  for (const a of agents) a.react();
  store.subscribe((kind, payload) => {
    if (kind === 'event') {
      for (const a of agents) a.onEvent(payload.event);
    } else if (kind === 'snapshot' || kind === 'snapshot_all') {
      for (const a of agents) a.react();
    }
  });

  connectSocket(store, hud);
  setupDemo();
  setupDebug(agents);

  // Loop animasi (jeda saat tab hidden)
  let last = performance.now();
  let frames = 0;
  let fpsAt = performance.now();
  function loop(now) {
    requestAnimationFrame(loop);
    if (document.hidden) {
      last = now;
      return;
    }
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    for (const a of agents) a.frame(now, dt);
    boss.frame();
    bubbles.frame();
    frames += 1;
    if (DEBUG && now - fpsAt > 1000) {
      window.__FPS__ = Math.round((frames * 1000) / (now - fpsAt));
      frames = 0;
      fpsAt = now;
      paintDebug(agents);
    }
  }
  requestAnimationFrame(loop);
}

/** Panel demo: tombol D atau klik DEMO; POST /api/demo/trigger. */
function setupDemo() {
  const btn = document.getElementById('demo-btn');
  const root = document.getElementById('demo-root');
  let panel = null;

  const ACTIONS = [
    ['new_coin', 'Koin baru'],
    ['lp_out', 'LP keluar range'],
    ['close_profit', 'Close profit'],
    ['close_loss', 'Close rugi'],
    ['bot_offline', 'Bot offline 15 dtk'],
    ['daily_report', 'Rapor harian'],
  ];

  function toggle() {
    if (panel) {
      panel.remove();
      panel = null;
      return;
    }
    panel = document.createElement('div');
    panel.className = 'demo-panel';
    for (const [action, label] of ACTIONS) {
      const b = document.createElement('button');
      b.textContent = label;
      b.addEventListener('click', async () => {
        b.disabled = true;
        try {
          await fetch('/api/demo/trigger', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action }),
          });
        } catch {
          /* abaikan */
        }
        b.disabled = false;
      });
      panel.appendChild(b);
    }
    root.appendChild(panel);
  }

  if (btn) btn.addEventListener('click', (e) => {
    e.stopPropagation();
    toggle();
  });
  document.addEventListener('keydown', (e) => {
    if ((e.key === 'd' || e.key === 'D') && !/INPUT|TEXTAREA/.test(document.activeElement.tagName)) {
      if (!btn.hidden) toggle();
    }
  });
}

/** @param {any[]} agents */
function setupDebug(agents) {
  if (!DEBUG) return;
  const el = document.getElementById('debug');
  el.hidden = false;
  // Tampilkan kotak area klik tiap karakter.
  document.body.classList.add('show-hit');
  window.__FPS__ = 0;
  window.__paintDebug = () => paintDebug(agents);
}

/** @param {any[]} agents */
function paintDebug(agents) {
  const el = document.getElementById('debug');
  if (!el) return;
  const lines = [`FPS ${window.__FPS__ || 0}`];
  for (const a of agents) {
    const d = a.debug();
    lines.push(`${a.id}: ${d.state}/${d.status} (${d.x},${d.y})`);
  }
  el.textContent = lines.join('\n');
}

main().catch((err) => {
  document.body.replaceChildren();
  const p = document.createElement('p');
  p.style.padding = '40px';
  p.textContent = 'Gagal memuat dashboard: ' + (err && err.message ? err.message : err);
  document.body.appendChild(p);
});
