/**
 * Gelembung ucapan: maks 1 per karakter, sisanya antre, fade 5 dtk, maks 60 char.
 * Semua teks via textContent (aturan XSS).
 */
export function createBubbles(stage) {
  const ui = stage.uiEl;
  /** @type {Map<string, { el: HTMLElement, queue: string[], timer: number|null, anchor: () => {x:number,y:number} }>} */
  const slots = new Map();

  /**
   * @param {string} charId
   * @param {() => {x:number,y:number}} anchor posisi jangkar (kaki) di stage
   * @param {number} topOffset jarak dari kaki ke atas sprite (px stage)
   */
  function register(charId, anchor, topOffset) {
    const el = document.createElement('div');
    el.className = 'bubble';
    el.style.display = 'none';
    ui.appendChild(el);
    slots.set(charId, { el, queue: [], timer: null, anchor, topOffset });
  }

  /**
   * @param {string} charId
   * @param {string} text
   */
  function say(charId, text) {
    const s = slots.get(charId);
    if (!s) return;
    const t = String(text).slice(0, 60);
    s.queue.push(t);
    if (s.el.style.display === 'none') next(charId);
  }

  /** @param {string} charId */
  function next(charId) {
    const s = slots.get(charId);
    if (!s) return;
    const t = s.queue.shift();
    if (!t) {
      s.el.style.display = 'none';
      return;
    }
    s.el.textContent = t;
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

  /** Dipanggil tiap frame: reposisi semua bubble. */
  function frame() {
    const scale = stage.scale;
    for (const [, s] of slots) {
      if (s.el.style.display === 'none') continue;
      const a = s.anchor();
      const p = stage.toScreen(a.x, a.y - (s.topOffset + 10));
      s.el.style.left = p.x + 'px';
      s.el.style.top = p.y + 'px';
      s.el.style.fontSize = Math.max(11, 13 * Math.max(scale, 0.5)) + 'px';
    }
  }

  return { register, say, frame };
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
      return 'Rapor harian sudah siap.';
    case 'agent_offline':
      return 'Zzz... aku terputus.';
    case 'agent_online':
      return 'Aku kembali!';
    default:
      return event.message || '';
  }
}
