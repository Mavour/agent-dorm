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
import { createActivities } from './activities.js';
import { resolveActivities } from './activity-logic.js';
import { walkBand, blockedRect } from './path-logic.js';

const DEBUG = new URLSearchParams(location.search).get('debug') === '1';
const REDUCED = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

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
      manifest,
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

  // Aktivitas client-side (trigger demo + duel).
  const activities = createActivities({
    agents,
    stage,
    manifest,
    isPopupOpen: (aid) => popup.isOpen() && popup.openId === aid,
    reduced: REDUCED,
  });

  // Event mentah -> badge real-time; cue terserial -> bubble/ikon/busy.
  for (const a of agents) a.react();
  store.subscribe((kind, payload) => {
    if (kind === 'event') {
      for (const a of agents) a.onEvent(payload.event);
    } else if (kind === 'cue') {
      for (const a of agents) a.onCue(payload.cue);
      const ev = payload.cue.event || {};
      window.__DIRECTOR__ = {
        cueId: payload.cue.cueId,
        agentId: payload.cue.agentId,
        type: ev.type,
        queueLength: payload.cue.queueLength,
      };
    } else if (kind === 'snapshot' || kind === 'snapshot_all') {
      for (const a of agents) a.react();
    }
  });

  connectSocket(store, hud);
  setupDemo(agents, manifest, activities);
  window.__PATH_DEBUG__ = { walkBand, blockedRect };
  setupDebug(agents, stage);

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
    activities.tick(now);
    boss.frame(now);
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

/** Panel demo: tombol D atau klik DEMO; POST /api/demo/trigger + aktivitas lokal. */
function setupDemo(agents, manifest, activities) {
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
    ['big_expense', 'Pengeluaran besar'],
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
    // Bagian aktivitas: client-side saja (tanpa panggilan server).
    const sec = document.createElement('div');
    sec.className = 'muted';
    sec.style.cssText = 'font-size:11px;margin-top:6px;';
    sec.textContent = 'Aktivitas';
    panel.appendChild(sec);
    const order = ['exitbot', 'portfolio', 'alert', 'lpwatcher'];
    const allActs = resolveActivities(manifest);
    for (const aid of order) {
      const names = Object.keys(allActs[aid] || {});
      const aname = (manifest.agents[aid] && manifest.agents[aid].name) || aid;
      for (const n of names) {
        panel.appendChild(actButton(`${aname.replace('ō', 'o')}: ${n}`, () => activities.trigger(aid, n)));
      }
    }
    panel.appendChild(actButton('Adu pedang ExitBot vs LP Watcher', () => {
      if (activities.tryStart()) return { ok: true };
      return { ok: false, reason: 'Keduanya harus bebas' };
    }));
    root.appendChild(panel);
  }

  /**
   * Tombol aktivitas: gagal -> tampilkan alasan singkat di tombol.
   * @param {string} label
   * @param {() => { ok: boolean, reason?: string }} fn
   */
  function actButton(label, fn) {
    const b = document.createElement('button');
    b.textContent = label;
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      let r;
      try {
        r = fn();
      } catch {
        r = { ok: false, reason: 'Gagal' };
      }
      if (!r.ok) {
        const old = b.textContent;
        b.textContent = r.reason || 'Tak tersedia';
        b.disabled = true;
        setTimeout(() => {
          b.textContent = old;
          b.disabled = false;
        }, 1500);
      }
    });
    return b;
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
function setupDebug(agents, stage) {
  if (!DEBUG) return;
  const el = document.getElementById('debug');
  el.hidden = false;
  // Tampilkan kotak area klik tiap karakter.
  document.body.classList.add('show-hit');
  window.__FPS__ = 0;
  window.__paintDebug = () => paintDebug(agents);
  // Gambar zona eksklusi bos + tepi walk band di atas stage.
  try {
    if (stage) {
      const { walkBand, blockedRect } = window.__PATH_DEBUG__ || {};
      if (walkBand && blockedRect) {
        const band = walkBand(stage.walkArea(), stage.bossSeat());
        const rect = blockedRect(stage.bossSeat());
        const stageEl = stage.stageEl;
        const box = document.createElement('div');
        box.setAttribute('data-debug', 'blocked');
        box.style.cssText = `position:absolute;left:${rect.x0}px;top:${rect.y0}px;width:${rect.x1 - rect.x0}px;height:${rect.y1 - rect.y0}px;border:2px dashed rgba(248,113,113,0.9);background:rgba(248,113,113,0.08);pointer-events:none;z-index:5;`;
        stageEl.appendChild(box);
        const edge = document.createElement('div');
        edge.setAttribute('data-debug', 'band');
        edge.style.cssText = `position:absolute;left:${band.xMin}px;top:${band.yMin}px;width:${band.xMax - band.xMin}px;height:2px;background:rgba(74,222,128,0.9);pointer-events:none;z-index:5;`;
        stageEl.appendChild(edge);
      }
    }
  } catch {
    /* abaikan */
  }
}

/** @param {any[]} agents */
function paintDebug(agents) {
  const el = document.getElementById('debug');
  if (!el) return;
  const lines = [`FPS ${window.__FPS__ || 0}`];
  const dir = window.__DIRECTOR__;
  if (dir) lines.push(`cue ${dir.type || '-'} oleh ${dir.agentId || '-'} (antre ${dir.queueLength ?? 0})`);
  else lines.push('cue - (antre 0)');
  for (const a of agents) {
    const d = a.debug();
    let line = `${a.id}: ${d.state}/${d.status} (${d.x},${d.y})`;
    if (d.act) line += ` act:${d.act}#${d.frame}`;
    if (typeof d.phase === 'number') line += ` ph:${d.phase} amp:${d.amp}`;
    lines.push(line);
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
