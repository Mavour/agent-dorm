/**
 * Lapisan ikon + badge + crosshair debug untuk satu karakter.
 * Emote di samping kepala (jangkar siluet terukur), badge di sudut
 * berlawanan. Dipanggil ulang tiap frame agar ikut arah hadap/posisi.
 */
import { measureHead, placeIcon } from './icon-anchor.js';

/**
 * @param {{ icons: any, w: number, h: number, stage: any, iconSlot: HTMLElement, badge: HTMLElement, cross: HTMLElement, getDir: () => number, getX: () => number, defaultSide: 'left'|'right', scaleFor: (name: string) => number }} opts
 */
export function createIconLayer(opts) {
  const { icons, w, h, stage, iconSlot, badge, cross, getDir, getX, defaultSide, scaleFor, measureSrc } = opts;
  let name = null;
  let side = defaultSide;
  let head = null;
  let badgeOn = false;
  let until = 0;

  // Ukur siluet kepala sekali (fallback bila gagal).
  if (measureSrc) {
    measureHead(measureSrc, w, h).then((m) => {
      head = m;
    });
  }

  /** @param {string} n @param {number} ms berapa lama tampil */
  function show(n, ms) {
    const meta = icons[n];
    if (!meta) return;
    name = n;
    const sc = scaleFor(n);
    const iw = Math.max(8, Math.round(meta.size[0] * sc));
    const ih = Math.max(8, Math.round(meta.size[1] * sc));
    iconSlot.replaceChildren();
    const im = document.createElement('img');
    im.setAttribute('src', '/assets/' + meta.file);
    im.style.width = iw + 'px';
    im.style.height = ih + 'px';
    iconSlot.appendChild(im);
    iconSlot.style.display = 'block';
    until = performance.now() + (ms || 0);
    position();
  }

  function hide() {
    name = null;
    until = 0;
    iconSlot.style.display = 'none';
    iconSlot.replaceChildren();
    cross.style.display = 'none';
  }

  /**
   * Dipanggil tiap frame: sembunyikan bila kedaluwarsa (kecuali keep true,
   * mis. status alert/offline) lalu reposisi.
   * @param {number} now
   * @param {boolean} keep
   */
  function tick(now, keep) {
    if (name && until && now >= until && !keep) hide();
    else position();
  }

  function position() {
    if (name) {
      const meta = icons[name];
      if (!meta) return;
      const sc = scaleFor(name);
      const iw = Math.max(8, Math.round(meta.size[0] * sc));
      const ih = Math.max(8, Math.round(meta.size[1] * sc));
      const hd = head || { left: Math.round(w * 0.3), right: Math.round(w * 0.7) };
      // Cerminkan pengukuran saat sprite menghadap kiri (flip di img saja).
      const eff = getDir() < 0 ? { left: w - hd.right, right: w - hd.left } : hd;
      const r = placeIcon({ spriteW: w, spriteH: h, headLeft: eff.left, headRight: eff.right, iconW: iw, iconH: ih, side: defaultSide, feetX: getX(), stageW: stage.W });
      side = r.side;
      iconSlot.style.left = Math.round(r.left) + 'px';
      iconSlot.style.bottom = Math.round(r.bottom) + 'px';
      if (document.body.classList.contains('show-hit')) {
        const ax = -w / 2 + (r.side === 'right' ? eff.right : eff.left);
        cross.style.display = 'block';
        cross.style.left = Math.round(ax - 5) + 'px';
        cross.style.bottom = Math.round(h * 0.8 - 5) + 'px';
      } else {
        cross.style.display = 'none';
      }
    }
    if (badgeOn) {
      badge.style.left = side === 'right' ? Math.round(-w / 2 - 10) + 'px' : Math.round(w / 2 - 8) + 'px';
      badge.style.bottom = h - 10 + 'px';
    }
  }

  /** @param {number} n */
  function showBadge(n) {
    badge.textContent = String(n);
    badge.style.display = 'block';
    badgeOn = true;
    position();
  }

  function hideBadge() {
    badgeOn = false;
    badge.style.display = 'none';
  }

  return { show, hide, tick, position, showBadge, hideBadge, visible: () => name !== null };
}
