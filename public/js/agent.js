/**
 * Karakter agen: sprite + bayangan + slot ikon + label nama,
 * mesin status client (idle/walking/busy/alert/offline) via requestAnimationFrame.
 * Berhenti saat tab hidden. Hormati prefers-reduced-motion.
 */
import { reactToEvent, noteEvent } from './reactions.js';
import { measureHead, placeIcon } from './icon-anchor.js';

const SPEED = 35; // px stage per detik
const STATUS_COLOR = { ok: '#4ade80', warn: '#fbbf24', error: '#f87171', offline: '#9ca3af' };
const REDUCED = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
// Skala render ikon (relatif ukuran manifest; ubah di sini untuk mengatur besarnya).
const ICON_SCALE = 0.6;
const ICON_SCALE_OVERRIDE = { alert: 0.7 };
// Sisi emote per agen (alert kiri karena banner-nya di kanan).
const ICON_SIDE = { exitbot: 'right', portfolio: 'right', lpwatcher: 'right', alert: 'left' };

/**
 * @param {object} opts {id, cfg (manifest agent), store, stage, bubbles, icons, onOpen}
 */
export function createAgent(opts) {
  const { id, cfg, store, stage, bubbles, icons, onOpen } = opts;
  const [w, h] = cfg.size;
  const chars = document.getElementById('chars');
  const ui = stage.uiEl;

  const el = document.createElement('div');
  el.className = 'char';
  el.tabIndex = 0;
  el.setAttribute('role', 'button');
  el.setAttribute('aria-label', `Buka status ${cfg.name}`);

  const shadow = document.createElement('div');
  shadow.className = 'shadow';
  shadow.style.width = Math.round(w * 0.7) + 'px';
  shadow.style.left = Math.round(w * 0.15) + 'px';

  const img = document.createElement('img');
  img.className = 'sprite';
  img.setAttribute('src', '/assets/' + cfg.sprite);
  img.setAttribute('alt', cfg.name);
  img.setAttribute('draggable', 'false');
  img.style.width = w + 'px';
  img.style.height = h + 'px';
  img.style.left = Math.round(-w / 2) + 'px';

  const iconSlot = document.createElement('div');
  iconSlot.className = 'icon-slot';
  iconSlot.style.display = 'none';

  const badge = document.createElement('div');
  badge.className = 'badge';
  badge.style.display = 'none';

  // Crosshair debug (?debug=1): titik jangkar ikon terhitung.
  const cross = document.createElement('div');
  cross.className = 'crosshair';
  cross.style.display = 'none';
  cross.setAttribute('aria-hidden', 'true');

  // Target klik transparan: 60% lebar (tengah), 92% tinggi (rata bawah).
  // Bukan anak img sehingga tidak ikut tercermin saat sprite menghadap kiri.
  const hit = document.createElement('div');
  hit.className = 'hit';
  hit.style.width = Math.round(w * 0.6) + 'px';
  hit.style.height = Math.round(h * 0.92) + 'px';
  hit.style.left = Math.round(-w * 0.3) + 'px';
  hit.style.bottom = '0px';
  hit.setAttribute('aria-hidden', 'true');

  el.appendChild(shadow);
  el.appendChild(img);
  el.appendChild(hit);
  el.appendChild(iconSlot);
  el.appendChild(badge);
  el.appendChild(cross);
  chars.appendChild(el);

  const label = document.createElement('div');
  label.className = 'namelabel';
  const dot = document.createElement('span');
  dot.className = 'sdot';
  const nameT = document.createElement('span');
  nameT.textContent = cfg.name;
  label.appendChild(dot);
  label.appendChild(nameT);
  ui.appendChild(label);

  const area = stage.walkArea();
  const seat = stage.bossSeat();
  const order = ['exitbot', 'portfolio', 'alert', 'lpwatcher'];
  const spawnFrac = [0.18, 0.36, 0.64, 0.82];
  const home = { x: spawnFrac[order.indexOf(id)] * stage.W, y: 0.9 * stage.H };

  const S = {
    id,
    x: home.x,
    y: home.y,
    state: 'idle',
    target: null,
    idleUntil: performance.now() + 2000 + Math.random() * 3000,
    busyUntil: 0,
    iconUntil: 0,
    shakeAt: 0,
    unacked: 0, // jumlah warn/critical belum diakui
    acked: new Set(), // id alert yang sudah diakui via popup
    dir: 1,
    icon: null, // nama ikon yang sedang tampil
    iconSide: ICON_SIDE[id] || 'right', // sisi efektif terakhir
    head: null, // {left, right} hasil ukur siluet kepala
  };

  // Ukur siluet kepala sekali saat sprite termuat (fallback bila gagal).
  const measureSrc = '/assets/' + cfg.sprite;
  if (img.complete && img.naturalWidth) {
    measureHead(measureSrc, w, h).then((m) => {
      S.head = m;
    });
  } else {
    img.addEventListener('load', () => {
      measureHead(measureSrc, w, h).then((m) => {
        S.head = m;
      });
    });
  }

  /** Skala ikon (override per ikon bila ada). @param {string} name */
  function iconScale(name) {
    return ICON_SCALE_OVERRIDE[name] ?? ICON_SCALE;
  }

  /** @param {string} name */
  function showIcon(name, ms) {
    const meta = icons[name];
    if (!meta) return;
    S.icon = name;
    const sc = iconScale(name);
    const iw = Math.max(8, Math.round(meta.size[0] * sc));
    const ih = Math.max(8, Math.round(meta.size[1] * sc));
    iconSlot.replaceChildren();
    const im = document.createElement('img');
    im.setAttribute('src', '/assets/' + meta.file);
    im.style.width = iw + 'px';
    im.style.height = ih + 'px';
    iconSlot.appendChild(im);
    iconSlot.style.display = 'block';
    positionIcon();
    S.iconUntil = performance.now() + ms;
  }
  function hideIcon() {
    S.icon = null;
    iconSlot.style.display = 'none';
    iconSlot.replaceChildren();
    cross.style.display = 'none';
  }

  /**
   * Posisikan ikon di samping kepala (tengah vertikal 20% dari atas sprite).
   * Sisi mengikuti konfigurasi + arah hadap agar tetap di luar siluet,
   * lalu auto-flip bila keluar batas stage. Dipanggil tiap frame selama
   * ikon tampil agar selalu sinkron dengan gerakan.
   */
  function positionIcon() {
    if (!S.icon) return;
    const meta = icons[S.icon];
    if (!meta) return;
    const sc = iconScale(S.icon);
    const iw = Math.max(8, Math.round(meta.size[0] * sc));
    const ih = Math.max(8, Math.round(meta.size[1] * sc));
    const head = S.head || { left: Math.round(w * 0.3), right: Math.round(w * 0.7) };
    // Cerminkan pengukuran saat sprite menghadap kiri (flip di img saja).
    const eff = S.dir < 0 ? { left: w - head.right, right: w - head.left } : head;
    const want = ICON_SIDE[id] || 'right';
    const r = placeIcon({ spriteW: w, spriteH: h, headLeft: eff.left, headRight: eff.right, iconW: iw, iconH: ih, side: want, feetX: S.x, stageW: stage.W });
    S.iconSide = r.side;
    iconSlot.style.left = Math.round(r.left) + 'px';
    iconSlot.style.bottom = Math.round(r.bottom) + 'px';
    // Crosshair debug di titik jangkar (tepi kepala setinggi tengah ikon).
    if (document.body.classList.contains('show-hit')) {
      const ax = -w / 2 + (r.side === 'right' ? eff.right : eff.left);
      cross.style.display = 'block';
      cross.style.left = Math.round(ax - 5) + 'px';
      cross.style.bottom = Math.round(h * 0.8 - 5) + 'px';
    } else {
      cross.style.display = 'none';
    }
    positionBadge();
  }

  /** Badge merah di sudut atas berlawanan dengan sisi ikon. */
  function positionBadge() {
    if (S.iconSide === 'right') {
      badge.style.left = Math.round(-w / 2 - 10) + 'px';
    } else {
      badge.style.left = Math.round(w / 2 - 8) + 'px';
    }
    badge.style.bottom = h - 10 + 'px';
  }

  /** @param {number} n */
  function showBadge(n) {
    badge.textContent = String(n);
    badge.style.display = 'block';
    positionBadge();
  }
  function hideBadge() {
    badge.style.display = 'none';
  }

  function pickTarget() {
    for (let i = 0; i < 12; i++) {
      const x = area.xMin + Math.random() * (area.xMax - area.xMin);
      const y = area.yMin + Math.random() * (area.yMax - area.yMin);
      // Zona eksklusi bos: 300px lebar, 70px atas s/d 40px bawah kursi
      if (Math.abs(x - seat.x) < 150 && y > seat.y - 70 && y < seat.y + 40) continue;
      // Jarak min 120px dari target agen lain
      let ok = true;
      for (const o of window.__AGENTS__ || []) {
        if (o === api) continue;
        const t = o.debug().target || o.debug();
        if (t && t.x !== undefined && Math.hypot(t.x - x, t.y - y) < 120) {
          ok = false;
          break;
        }
      }
      if (ok) return { x, y };
    }
    return { x: home.x, y: home.y };
  }

  function statusOf() {
    const s = store.get(id);
    return s ? s.status : 'offline';
  }

  /** Dipanggil saat snapshot/event baru memengaruhi ikon & bubble. */
  function react() {
    const snap = store.get(id);
    if (!snap) return;
    const openIds = new Set((snap.alerts || []).filter((a) => a.level === 'warn' || a.level === 'critical').map((a) => a.id));
    // Buang ack untuk alert yang sudah pulih
    for (const aid of [...S.acked]) {
      if (!openIds.has(aid)) S.acked.delete(aid);
    }
    const fresh = [...openIds].filter((aid) => !S.acked.has(aid)).length;
    S.unacked = fresh;
    if (fresh > 0) {
      if (!REDUCED && iconSlot.style.display === 'none') showIcon('alert', 60000);
      showBadge(fresh);
    } else {
      hideBadge();
    }
  }

  /** Membuka popup = akui semua alert terbuka saat ini. */
  function acknowledge() {
    const snap = store.get(id);
    if (snap) {
      for (const a of snap.alerts || []) {
        if (a.level === 'warn' || a.level === 'critical') S.acked.add(a.id);
      }
    }
    S.unacked = 0;
    badge.style.display = 'none';
    if (S.state === 'alert') {
      S.state = 'idle';
      S.idleUntil = performance.now() + 2000;
      hideIcon();
    }
  }

  /**
   * Event global -> ikon + busy/alert sesuai mapping (lihat reactions.js).
   * @param {any} event
   */
  function onEvent(event) {
    reactToEvent({ S, id, w, h, badge, showIcon, hideIcon, busy, bubbles, REDUCED }, event);
  }

  /** @param {string} icon @param {number} ms @param {number} now */
  function busy(icon, ms, now) {
    if (!REDUCED) showIcon(icon, ms);
    S.busyUntil = now + ms;
    S.state = 'busy';
  }

  /** Frame update. @param {number} now @param {number} dt detik */
  function frame(now, dt) {
    const st = statusOf();
    const offline = st === 'offline';
    el.classList.toggle('offline', offline);
    dot.style.background = STATUS_COLOR[st] || '#9ca3af';

    if (offline) {
      S.state = 'offline';
      if (!REDUCED && iconSlot.style.display === 'none') showIcon('sleep', 60000);
    } else if (S.state === 'alert' && S.unacked === 0) {
      // Alert sudah diakui/di-resolve -> kembali idle
      S.state = 'idle';
      S.idleUntil = now + 2000;
      hideIcon();
    } else if (S.unacked > 0 && S.state !== 'busy') {
      S.state = 'alert';
      if (!REDUCED) {
        if (now >= S.shakeAt) {
          el.classList.remove('shake');
          void el.offsetWidth;
          el.classList.add('shake');
          S.shakeAt = now + 4000;
        }
        if (iconSlot.style.display === 'none') showIcon('alert', 60000);
      }
    } else if (S.state === 'busy') {
      if (now >= S.busyUntil) {
        S.state = 'idle';
        S.idleUntil = now + 2000 + Math.random() * 4000;
      }
    } else if (REDUCED) {
      S.state = 'idle';
      S.x = home.x;
      S.y = home.y;
    } else if (S.state === 'idle') {
      if (now >= S.idleUntil) {
        S.target = pickTarget();
        S.state = 'walking';
      }
    } else if (S.state === 'walking' && S.target) {
      const dx = S.target.x - S.x;
      const dy = S.target.y - S.y;
      const dist = Math.hypot(dx, dy);
      const step = SPEED * dt;
      if (dist <= step) {
        S.x = S.target.x;
        S.y = S.target.y;
        S.state = 'idle';
        S.target = null;
        S.idleUntil = now + 2000 + Math.random() * 4000;
      } else {
        S.x += (dx / dist) * step;
        S.y += (dy / dist) * step;
        S.dir = dx < 0 ? -1 : 1;
      }
    }

    if (S.iconUntil && now >= S.iconUntil && S.state !== 'alert' && !offline) hideIcon();
    // Ikon + badge mengikuti tiap frame (arah hadap / posisi berubah).
    if (S.icon && iconSlot.style.display !== 'none') positionIcon();
    else if (badge.style.display !== 'none') positionBadge();

    el.classList.toggle('walking', S.state === 'walking' && !REDUCED);
    el.style.transform = `translate3d(${S.x}px, ${S.y}px, 0)`;
    el.style.zIndex = String(Math.round(S.y));
    img.style.transform = S.dir < 0 ? 'scaleX(-1)' : 'none';

    // Label di bawah kaki (posisi layar)
    const p = stage.toScreen(S.x, S.y);
    label.style.left = p.x + 'px';
    label.style.top = p.y + 6 * stage.scale + 'px';
    label.style.fontSize = Math.max(10, 12 * Math.max(stage.scale, 0.5)) + 'px';
  }

  function anchor() {
    return { x: S.x, y: S.y };
  }

  el.addEventListener('click', (e) => {
    e.stopPropagation();
    acknowledge();
    onOpen(id);
  });
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      acknowledge();
      onOpen(id);
    }
  });

  bubbles.register(id, anchor, h);

  const api = {
    id,
    frame,
    react,
    onEvent,
    anchor,
    topOffset: h,
    debug() {
      return { state: S.state, x: Math.round(S.x), y: Math.round(S.y), target: S.target, status: statusOf() };
    },
  };
  return api;
}
