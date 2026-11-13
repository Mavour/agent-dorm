/**
 * Gelembung ucapan: maks 1 per karakter, sisanya antre, fade 5 dtk, maks 60 char.
 * Semua teks via textContent (aturan XSS).
 */
import { layoutBubbles } from './bubble-layout.js';

export function createBubbles(stage) {
  const ui = stage.uiEl;
  /** @type {Map<string, { el: HTMLElement, queue: { text: string, at: number }[], timer: number|null, anchor: () => {x:number,y:number}, topOffset: number }>} */
  const slots = new Map();

  /**
   * @param {string} charId
   * @param {() => {x:number,y:number}} anchor posisi jangkar (kaki) di stage
   * @param {number|(() => number)} topOffset jarak kaki ke atas sprite (px stage), atau fungsi dinamis
   */
  function register(charId, anchor, topOffset) {
    const el = document.createElement('div');
    el.className = 'bubble';
    el.style.display = 'none';
    ui.appendChild(el);
    slots.set(charId, { el, queue: [], timer: null, anchor, topOffset });
  }

  /**
   * Ucapkan teks (agen): antre maks 2, buang yang lebih tua dari 8 dtk.
   * @param {string} charId
   * @param {string} text
   */
  function say(charId, text) {
    const s = slots.get(charId);
    if (!s) return;
    const t = String(text).slice(0, 60);
    const tnow = Date.now();
    s.queue = s.queue.filter((q) => tnow - q.at <= 8000);
    s.queue.push({ text: t, at: tnow });
    while (s.queue.length > 2) s.queue.shift();
    if (s.el.style.display === 'none') next(charId);
  }

  /**
   * Ucapkan teks (bos): "latest wins" — ganti bubble saat ini,
   * kosongkan antrean agar teks selalu sinkron dengan sprite.
   * @param {string} charId
   * @param {string} text
   */
  function sayLatest(charId, text) {
    const s = slots.get(charId);
    if (!s) return;
    const t = String(text).slice(0, 60);
    s.queue.length = 0;
    if (s.el.style.display === 'none') {
      s.queue.push({ text: t, at: Date.now() });
      next(charId);
    } else {
      s.el.textContent = t;
      showFor(s, charId);
    }
  }

  /** @param {string} charId */
  function next(charId) {
    const s = slots.get(charId);
    if (!s) return;
    const q = s.queue.shift();
    if (!q) {
      s.el.style.display = 'none';
      return;
    }
    s.el.textContent = q.text;
    showFor(s, charId);
  }

  /** Tampilkan bubble 5 dtk lalu fade dan lanjutkan antrean. */
  function showFor(s, charId) {
    s.el.style.display = 'block';
    s.el.style.opacity = '1';
    if (s.timer) clearTimeout(s.timer);
    s.timer = window.setTimeout(() => {
      s.el.style.opacity = '0';
      window.setTimeout(() => {
        s.el.style.display = 'none';
        next(charId);
      }, 400);
    }, 5000);
  }

  /** Dipanggil tiap frame: reposisi semua bubble, dijepit dalam stage. */
  function frame() {
    const scale = stage.scale;
    const ox = stage.toScreen(0, 0).x;
    const sw = stage.W * scale;
    const visible = [];
    for (const [, s] of slots) {
      if (s.el.style.display === 'none') continue;
      const a = s.anchor();
      const to = typeof s.topOffset === 'function' ? s.topOffset() : s.topOffset;
      const p = stage.toScreen(a.x, a.y - (to + 10));
      s.el.style.fontSize = Math.max(11, 13 * Math.max(scale, 0.5)) + 'px';
      s.el.style.maxWidth = Math.min(240, sw - 8) + 'px';
      visible.push({ el: s.el, x: p.x, y: p.y, width: s.el.offsetWidth, height: s.el.offsetHeight });
    }
    // Prioritas dari atas ke bawah tetap stabil saat karakter berjalan.
    visible.sort((a, b) => a.y - b.y);
    const positions = layoutBubbles(visible, { x: ox + 4, y: 4, width: sw - 8, height: ui.clientHeight - 8 });
    for (const p of positions) {
      p.el.style.left = p.x + p.width / 2 + 'px';
      p.el.style.top = p.y + p.height + 'px';
      const anchorX = visible.find((v) => v.el === p.el).x;
      p.el.style.setProperty('--tail-x', Math.max(12, Math.min(p.width - 12, anchorX - p.x)) + 'px');
    }
  }

  return { register, say, sayLatest, frame };
}

/**
 * Template bubble per tipe event (Bahasa Indonesia).
 * @param {any} event
 */
export function bubbleForEvent(event) {
  const d = (event && event.data) || {};
  switch (event.type) {
    case 'coin_found':
      return `Ada koin menarik: ${d.symbol || '?'} (skor ${d.score ?? '?'})`;
    case 'position_out_of_range':
      return `${d.pair || 'Posisi'} OUT OF RANGE!`;
    case 'position_back_in_range':
      return `${d.pair || 'Posisi'} kembali in range.`;
    case 'position_closed': {
      const pnl = Number(d.pnlUsd ?? 0);
      const sign = pnl >= 0 ? '+' : '-';
      return `Tebas! ${d.pair || '?'} ditutup (${sign}$${Math.abs(pnl).toFixed(2)})`;
    }
    case 'report_ready':
      if (d.kind === 'yapping' && typeof d.text === 'string') {
        const text = d.text.replace(/\s+/g, ' ').trim();
        return text.length > 150 ? text.slice(0, 147) + '…' : text;
      }
      return 'Rapor harian sudah siap.';
    case 'agent_offline':
      return 'Zzz... aku terputus.';
    case 'agent_online':
      return 'Aku kembali!';
    default:
      return event.message || '';
  }
}
