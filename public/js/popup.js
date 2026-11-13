/**
 * Popup: satu terbuka dalam satu waktu; jangkar di samping karakter,
 * dijepit dalam viewport; Esc / klik kosong / X menutup.
 * SEMUA teks data via textContent (aturan XSS).
 */
import { renderExitbot } from './panels/exitbot.js';
import { renderLpwatcher } from './panels/lpwatcher.js';
import { renderAlert } from './panels/alert.js';
import { renderPortfolio } from './panels/portfolio.js';
import { clockOf } from './format.js';

const RENDER = { exitbot: renderExitbot, lpwatcher: renderLpwatcher, alert: renderAlert, portfolio: renderPortfolio };

/**
 * @param {object} opts {store, stage, manifest}
 */
export function createPopup(opts) {
  const { store, stage, manifest } = opts;
  const root = document.getElementById('popup-root');
  let openId = null;
  /** @type {HTMLElement|null} */
  let box = null;
  /** @type {{ foot?: HTMLElement, pill?: HTMLElement, alertsWrap?: HTMLElement, body?: HTMLElement, update?: Function }|null} */
  let refs = null;

  /** Helper bikin elemen teks aman. */
  function t(tag, text, cls) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    e.textContent = text;
    return e;
  }

  function close() {
    openId = null;
    refs = null;
    if (box) {
      box.remove();
      box = null;
    }
  }

  /** @param {string} agentId @param {{x:number,y:number}} anchorPos posisi kaki (stage) */
  function open(agentId, anchorPos) {
    close();
    openId = agentId;
    const snap = store.get(agentId);
    if (!snap) return;
    const meta = store.getMeta()[agentId] || {};
    const mode = meta.mode || 'dummy';
    const cfg = manifest.agents[agentId];

    box = document.createElement('div');
    box.className = 'popup';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-label', `Status ${cfg.name}`);

    // Header
    const head = document.createElement('header');
    head.appendChild(t('h2', cfg.name));
    const modeChip = t('span', mode === 'dummy' ? 'DUMMY' : 'LIVE', 'chip ' + (mode === 'dummy' ? 'chip-amber' : 'chip-green'));
    head.appendChild(modeChip);
    const llmChip = t(
      'span',
      agentId === 'portfolio' ? (window.__ADVISOR_MODE__ === 'llm' ? 'OpenRouter' : 'rule-based') : 'tanpa LLM',
      'chip chip-gray',
    );
    head.appendChild(llmChip);
    const pill = t('span', labelStatus(snap.status), 'status-pill st-' + snap.status);
    head.appendChild(pill);
    const x = document.createElement('button');
    x.className = 'x';
    x.textContent = '✕';
    x.setAttribute('aria-label', 'Tutup');
    x.addEventListener('click', (e) => {
      e.stopPropagation();
      close();
    });
    head.appendChild(x);
    box.appendChild(head);
    box.appendChild(t('p', cfg.description, 'muted'));

    // Alert terbuka di atas (dibungkus agar bisa refresh ringan)
    const alertsWrap = document.createElement('div');
    fillAlerts(alertsWrap, snap.alerts || []);
    box.appendChild(alertsWrap);

    // Isi per agen
    const body = document.createElement('div');
    const render = RENDER[agentId];
    const update = render?.(body, snap, { t, el: mkEl });
    box.appendChild(body);

    const foot = document.createElement('footer');
    foot.className = 'muted mono';
    foot.textContent = `Sinkron: ${clockOf(snap.updatedAt)}`;
    box.appendChild(foot);
    refs = { foot, pill, alertsWrap, body, update };

    root.appendChild(box);
    place(anchorPos);
    // Fokus tombol tutup untuk aksesibilitas
    x.focus();
  }

  /** Isi ulang daftar alert (teks aman via textContent). @param {HTMLElement} wrap @param {any[]} alerts */
  function fillAlerts(wrap, alerts) {
    wrap.replaceChildren();
    if (!alerts.length) return;
    const h = t('h3', 'Peringatan');
    wrap.appendChild(h);
    for (const a of alerts) {
      const row = document.createElement('div');
      row.className = 'alert-row ' + (a.level === 'critical' ? 'critical' : a.level === 'warn' ? '' : 'info');
      row.textContent = `[${a.level}] ${a.message}`;
      wrap.appendChild(row);
    }
  }

  /** @param {{x:number,y:number}} a */
  function place(a) {
    if (!box) return;
    // toScreen = relatif viewport; popup fixed = relatif window -> tambah offset viewport.
    const p = stage.toScreen(a.x, a.y);
    const vp = document.getElementById('viewport').getBoundingClientRect();
    const bw = Math.min(380, window.innerWidth - 20);
    const bh = box.offsetHeight || 300;
    let left = vp.left + p.x + 24;
    let top = vp.top + p.y - bh - 20;
    // Balik ke bawah kalau kepentok atas
    if (top < vp.top + 8) top = vp.top + p.y + 20;
    left = Math.max(10, Math.min(left, window.innerWidth - bw - 10));
    top = Math.max(vp.top + 8, Math.min(top, window.innerHeight - bh - 40));
    box.style.left = left + 'px';
    box.style.top = top + 'px';
  }

  /**
   * Refresh ringan saat snapshot baru: pill status, daftar alert, waktu sinkron.
   * Body di-render ulang kecuali portfolio (agar tab/chat/saran tidak hilang
   * saat user membaca); scroll posisi dipertahankan.
   */
  function refresh() {
    if (!openId || !box || !refs) return;
    const snap = store.get(openId);
    if (!snap) return;
    // Pill + alert + footer selalu segar
    refs.pill.textContent = labelStatus(snap.status);
    refs.pill.className = 'status-pill st-' + snap.status;
    fillAlerts(refs.alertsWrap, snap.alerts || []);
    refs.foot.textContent = `Sinkron: ${clockOf(snap.updatedAt)}`;
    // Portfolio refreshes data without discarding its selected tab or chat.
    if (openId === 'portfolio' && refs.update) {
      const st = box.scrollTop;
      refs.update(snap);
      box.scrollTop = st;
    }
    // Body: render ulang kecuali portfolio; jaga scroll
    if (openId !== 'portfolio') {
      const st = box.scrollTop;
      refs.body.replaceChildren();
      const render = RENDER[openId];
      if (render) render(refs.body, snap, { t, el: mkEl });
      box.scrollTop = st;
    }
    const agents = window.__AGENTS__ || [];
    const a = agents.find((x) => x.id === openId);
    place(a ? a.anchor() : { x: stage.W / 2, y: stage.H / 2 });
  }

  function isOpen() {
    return openId !== null;
  }

  document.addEventListener('click', (e) => {
    if (openId && box && !box.contains(e.target)) close();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
  });

  store.subscribe((kind) => {
    if ((kind === 'snapshot' || kind === 'snapshot_all') && openId) refresh();
  });

  return { open, close, isOpen, get openId() { return openId; } };
}

/** @param {string} tag @param {string} cls */
function mkEl(tag, cls) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  return e;
}

/** @param {string} s */
function labelStatus(s) {
  return { ok: 'OK', warn: 'WARN', error: 'ERROR', offline: 'OFFLINE' }[s] || s;
}
