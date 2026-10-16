/**
 * Pemutar aktivitas: strip frame di atas <img> sprite yang sama.
 * Preload + decode SEMUA frame saat boot; frame gagal -> aktivitas
 * dinonaktifkan + peringatan (tanpa crash). src diganti hanya saat
 * indeks berubah. stop() mengembalikan tampilan dasar persis.
 */
import { frameAt, activityPlacement } from './activity-logic.js';

/**
 * @param {{ img: HTMLImageElement, acts: Record<string, any>, base: { size: [number, number], feet: [number, number] }, label?: string }} opts
 */
export function createActivityPlayer(opts) {
  const { img, base } = opts;
  const acts = opts.acts || {};
  const label = opts.label || '?';
  /** @type {Record<string, 'loading'|'ok'|'bad'>} */
  const status = {};
  /** @type {any|null} */
  let cur = null;
  /** @type {any|null} */
  let baseLook = null;
  /** Tampilan jalan jarak-basis (terpisah dari cur agar duel/aktivitas utuh). */
  /** @type {{ name: string, index: number }|null} */
  let walk = null;

  // Preload + decode semua frame saat boot.
  for (const [name, act] of Object.entries(acts)) {
    status[name] = 'loading';
    const frames = (act.frames || []).map((src) => {
      const im = new Image();
      im.src = '/assets/' + src;
      return im;
    });
    const jobs = frames.map((im) => (im.decode ? im.decode() : Promise.resolve()));
    Promise.all(jobs).then(
      () => {
        status[name] = 'ok';
      },
      () => {
        status[name] = 'bad';
        console.warn(`[aktivitas] frame ${label}:${name} gagal dimuat, aktivitas dinonaktifkan.`);
      },
    );
  }

  /** @param {string} name */
  function available(name) {
    return !!acts[name] && status[name] === 'ok';
  }

  /**
   * Mainkan aktivitas (ganti tampilan dasar yang sedang tampil).
   * @param {string} name
   * @returns {boolean} false bila tak tersedia
   */
  function play(name) {
    const act = acts[name];
    if (!act || !available(name)) return false;
    if (!cur) {
      baseLook = {
        src: img.getAttribute('src'),
        width: img.style.width,
        height: img.style.height,
        left: img.style.left,
        top: img.style.top,
        transform: img.style.transform,
        transformOrigin: img.style.transformOrigin,
        bottom: img.style.bottom,
      };
    }
    cur = { name, act, start: performance.now(), index: -1 };
    return true;
  }

  /** Hentikan dan kembalikan tampilan dasar persis seperti semula. */
  function stop() {
    if (!cur) return;
    cur = null;
    if (baseLook && !walk) {
      img.setAttribute('src', baseLook.src);
      img.style.width = baseLook.width;
      img.style.height = baseLook.height;
      img.style.left = baseLook.left;
      img.style.top = baseLook.top;
      img.style.bottom = baseLook.bottom;
      img.style.transform = baseLook.transform;
      img.style.transformOrigin = baseLook.transformOrigin;
      baseLook = null;
    }
  }

  function saveBase() {
    baseLook = {
      src: img.getAttribute('src'),
      width: img.style.width,
      height: img.style.height,
      left: img.style.left,
      top: img.style.top,
      transform: img.style.transform,
      transformOrigin: img.style.transformOrigin,
      bottom: img.style.bottom,
    };
  }

  function restoreBase() {
    if (!baseLook) return;
    img.setAttribute('src', baseLook.src);
    img.style.width = baseLook.width;
    img.style.height = baseLook.height;
    img.style.left = baseLook.left;
    img.style.top = baseLook.top;
    img.style.bottom = baseLook.bottom;
    img.style.transform = baseLook.transform;
    img.style.transformOrigin = baseLook.transformOrigin;
    baseLook = null;
  }

  /**
   * Tampilkan satu frame jalan (dipilih dari JARAK, bukan waktu).
   * Penempatan kaki sama persis dengan aktivitas lain (activityPlacement).
   * @param {string} name nama aktivitas jalan (biasanya "jalan")
   * @param {number} index indeks frame
   * @param {number} dir < 0 menghadap kiri (artwork menghadap kanan)
   * @returns {boolean} false bila tak tersedia (pemanggil pakai fallback)
   */
  function showWalk(name, index, dir) {
    const act = acts[name];
    if (!act || !act.frames || !act.frames.length || status[name] !== 'ok') return false;
    if (cur) return false; // aktivitas (duel/event) menang; jalan mengalah
    const n = act.frames.length;
    const i = ((index % n) + n) % n;
    if (!walk) {
      saveBase();
      walk = { name, index: -1 };
    }
    const p = activityPlacement(base, act, dir);
    if (i !== walk.index) {
      walk.index = i;
      img.setAttribute('src', '/assets/' + act.frames[i]);
      img.style.width = act.size[0] + 'px';
      img.style.height = act.size[1] + 'px';
      img.style.left = Math.round(p.left) + 'px';
      img.style.top = Math.round(p.top) + 'px';
      img.style.bottom = 'auto';
    }
    img.style.transformOrigin = `${Math.round(p.originX)}px 50%`;
    img.style.transform = p.flip ? 'scaleX(-1)' : 'none';
    return true;
  }

  /** Akhiri tampilan jalan, kembalikan sprite diam persis. */
  function hideWalk() {
    if (!walk) return;
    walk = null;
    if (!cur) restoreBase();
  }

  /** @returns {boolean} */
  function walkActive() {
    return !!walk;
  }

  /** @param {string} name @returns {string} 'ok'|'loading'|'bad'|'missing' */
  function statusOf(name) {
    if (!acts[name]) return 'missing';
    return status[name] || 'loading';
  }

  /**
   * Maju ke frame berjalan (dipanggil tiap frame oleh pemilik).
   * @param {number} now
   * @param {number} dir < 0 menghadap kiri
   */
  function tick(now, dir) {
    if (!cur) return;
    const { act, start } = cur;
    const n = (act.frames || []).length || 1;
    const { index } = frameAt(now - start, n, act.fps || 4, act.mode || 'loop', 0);
    const p = activityPlacement(base, act, dir);
    if (index !== cur.index) {
      cur.index = index;
      img.setAttribute('src', '/assets/' + act.frames[index]);
      img.style.width = act.size[0] + 'px';
      img.style.height = act.size[1] + 'px';
      img.style.left = Math.round(p.left) + 'px';
      img.style.top = Math.round(p.top) + 'px';
      img.style.bottom = 'auto';
    }
    img.style.transformOrigin = `${Math.round(p.originX)}px 50%`;
    img.style.transform = p.flip ? 'scaleX(-1)' : 'none';
  }

  /** @returns {{ name: string, index: number } | null} */
  function current() {
    if (!cur) return null;
    return { name: cur.name, index: cur.index };
  }

  /** feet[1] frame berjalan (0 bila tak main) untuk jangkar bubble. */
  function topOffset() {
    if (!cur) return 0;
    return cur.act.feet ? cur.act.feet[1] : 0;
  }

  return { play, stop, tick, current, topOffset, available, showWalk, hideWalk, walkActive, statusOf };
}
