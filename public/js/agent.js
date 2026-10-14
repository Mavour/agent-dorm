/**
 * Karakter agen: sprite + bayangan + slot ikon + label nama,
 * mesin status client (idle/walking/busy/alert/offline) via requestAnimationFrame.
 * Berhenti saat tab hidden. Hormati prefers-reduced-motion.
 */
import { noteEvent, reactToCue } from './reactions.js';
import { createIconLayer } from './icon-layer.js';
import { homeFor, pickWanderTarget } from './wander.js';
import { createActivityPlayer } from './activity-player.js';
import { createActivityDriver, eventActivityFor } from './agent-activity.js';
import { resolveActivities, resolveFeet } from './activity-logic.js';

const SPEED = 35; // px stage per detik
const STATUS_COLOR = { ok: '#4ade80', warn: '#fbbf24', error: '#f87171', offline: '#9ca3af' };
const REDUCED = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
// Skala render ikon (relatif ukuran manifest; ubah di sini untuk mengatur besarnya).
const ICON_SCALE = 0.6;
const ICON_SCALE_OVERRIDE = { alert: 0.7 };
// Sisi emote per agen (alert kiri karena banner-nya di kanan).
const ICON_SIDE = { exitbot: 'right', portfolio: 'right', lpwatcher: 'right', alert: 'left' };

/**
 * @param {object} opts {id, cfg (manifest agent), acts, manifest, store, stage, bubbles, icons, onOpen}
 */
export function createAgent(opts) {
  const { id, cfg, store, stage, bubbles, icons, onOpen } = opts;
  const manifest = opts.manifest || {};
  // Tabel aktivitas: manifest dulu, cadangan bila tak ada (lihat activity-logic.js).
  const acts = resolveActivities(manifest)[id] || null;
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
  const home = homeFor(id, stage.W, stage.H);
  const peers = () => (window.__AGENTS__ || []).filter((o) => o !== api).map((o) => o.debug().target || o.debug());

  const S = {
    id,
    x: home.x,
    y: home.y,
    state: 'idle',
    target: null,
    idleUntil: performance.now() + 2000 + Math.random() * 3000,
    busyUntil: 0,
    shakeAt: 0,
    unacked: 0, // jumlah warn/critical belum diakui
    acked: new Set(), // id alert yang sudah diakui via popup
    dir: 1,
  };

  const layer = createIconLayer({
    icons,
    w,
    h,
    stage,
    iconSlot,
    badge,
    cross,
    getDir: () => S.dir,
    getX: () => S.x,
    defaultSide: ICON_SIDE[id] || 'right',
    scaleFor: (name) => ICON_SCALE_OVERRIDE[name] ?? ICON_SCALE,
    measureSrc: '/assets/' + cfg.sprite,
  });

  // showIcon/hideIcon/showBadge/hideBadge diteruskan ke layer (lihat icon-layer.js).
  const showIcon = (n, ms) => layer.show(n, ms);
  const hideIcon = () => layer.hide();
  const showBadge = (n) => layer.showBadge(n);
  const hideBadge = () => layer.hideBadge();

  // Pemutar aktivitas + driver (null saat reduced-motion: tanpa aktivitas).
  const player = REDUCED
    ? null
    : createActivityPlayer({
        img,
        label: id,
        acts: acts || {},
        base: { size: cfg.size, feet: resolveFeet(cfg) },
      });
  const act = createActivityDriver({ id, acts, player, reduced: REDUCED, statusOf });

  function pickTarget() {
    return pickWanderTarget(area, seat, peers, home);
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
      if (!REDUCED && !layer.visible()) showIcon('alert', 60000);
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
   * Event mentah -> hanya pembukuan badge (real-time).
   * @param {any} event
   */
  function onEvent(event) {
    noteEvent({ S, id, showBadge, hideBadge }, event);
  }

  /**
   * Cue terserial dari director -> bubble + ikon + busy + aktivitas event.
   * @param {any} cue
   */
  function onCue(cue) {
    act.st.cueSeq += 1;
    act.st.cueUntil = performance.now() + (cue.durationMs || 6500);
    reactToCue(
      { S, id, w, h, badge, showIcon, hideIcon, busy, bubbles, REDUCED, isActive: () => !!act.st.cur },
      cue,
    );
    // Aktivitas event menyela aktivitas idle (alert/offline dinilai di frame).
    const ev = cue.event || {};
    const aname = eventActivityFor(ev.type, id);
    if (aname && playActivity(aname, cue.durationMs || 6500, 'event')) {
      // state -> activity (menimpa busy dari reactToCue)
    }
  }

  /**
   * Mainkan aktivitas bernama (demo/duel/paksa). Popup yang terbuka tak dihentikan.
   * @param {string} name
   * @param {number} durationMs
   * @param {'idle'|'event'|'demo'|'duel'} [kind='demo']
   */
  function playActivity(name, durationMs, kind = 'demo') {
    if (!act.play(name, durationMs, kind, S.unacked)) return false;
    S.state = 'activity';
    S.target = null;
    return true;
  }

  function stopActivity() {
    act.stop();
    if (S.state === 'activity') {
      S.state = 'idle';
      S.idleUntil = performance.now() + 1500;
    }
  }

  /** info aktivitas berjalan (atau null). */
  function activityInfo() {
    return act.st.cur ? { ...act.st.cur } : null;
  }

  /** urutan cue terakhir (untuk deteksi interupsi duel). */
  function cueSeq() {
    return act.st.cueSeq;
  }

  /** Jalan duel ke titik eksplisit (logika jalan yang sudah ada). */
  function duelTo(x, y) {
    act.st.duelHold = true;
    S.target = { x, y };
    S.state = 'walking';
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
      act.stop();
      if (!REDUCED && !layer.visible()) showIcon('sleep', 60000);
    } else if (S.state === 'activity') {
      // Diam di tempat; alert baru menang, selesai -> idle + cooldown.
      act.tickActivity(now, S);
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
        if (!layer.visible()) showIcon('alert', 60000);
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
        const pick = act.idlePick(now, S.unacked);
        if (pick && playActivity(pick.name, pick.durationMs, 'idle')) {
          // state -> activity
        } else {
          S.target = pickTarget();
          S.state = 'walking';
        }
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
        // Penahan duel: idle panjang agar manajer sempat memulai duel.
        S.idleUntil = act.st.duelHold ? now + 30000 : now + 2000 + Math.random() * 4000;
      } else {
        S.x += (dx / dist) * step;
        S.y += (dy / dist) * step;
        S.dir = dx < 0 ? -1 : 1;
      }
    }

    // Lapisan ikon + badge mengikuti tiap frame (kedaluwarsa, arah, posisi).
    layer.tick(now, S.state === 'alert' || offline);

    el.classList.toggle('walking', S.state === 'walking' && !REDUCED);
    el.style.transform = `translate3d(${S.x}px, ${S.y}px, 0)`;
    el.style.zIndex = String(Math.round(S.y));
    // Saat aktivitas main, player yang mengatur transform (flip bisa beda arah).
    if (act.st.cur && player) player.tick(now, S.dir);
    else img.style.transform = S.dir < 0 ? 'scaleX(-1)' : 'none';

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

  bubbles.register(id, anchor, () => Math.max(h, player ? player.topOffset() : 0));

  const api = {
    id,
    frame,
    react,
    onEvent,
    onCue,
    playActivity,
    stopActivity,
    activityInfo,
    cueSeq,
    duelTo,
    anchor,
    topOffset: h,
    debug() {
      const cur = player ? player.current() : null;
      return {
        state: S.state,
        x: Math.round(S.x),
        y: Math.round(S.y),
        target: S.target,
        status: statusOf(),
        unacked: S.unacked,
        cueSeq: act.st.cueSeq,
        cueUntil: act.st.cueUntil,
        act: act.st.cur ? act.st.cur.name : null,
        frame: cur ? cur.index : -1,
      };
    },
  };
  return api;
}
