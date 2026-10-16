import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { frameFromDistance, FRAME_PX } from '../public/js/walk-logic.js';

// ---- DOM palsu minimal (cukup untuk createAgent + frame) ----
class El {
  constructor(tag, doc) {
    this.tagName = tag;
    this.ownerDocument = doc;
    this.children = [];
    this.style = {};
    this.attrs = {};
    this.parentNode = null;
    this.offsetWidth = 0;
    this.scrollTop = 0;
    const set = new Set();
    this.classList = {
      add: (...c) => c.forEach((x) => set.add(x)),
      remove: (...c) => c.forEach((x) => set.delete(x)),
      toggle: (c, f) => {
        if (f === undefined) {
          if (set.has(c)) set.delete(c);
          else set.add(c);
        } else if (f) set.add(c);
        else set.delete(c);
      },
      contains: (c) => set.has(c),
    };
    doc._all.push(this);
  }
  setAttribute(k, v) {
    this.attrs[k] = String(v);
  }
  getAttribute(k) {
    return this.attrs[k] ?? null;
  }
  appendChild(c) {
    c.parentNode = this;
    this.children.push(c);
    return c;
  }
  insertBefore(c, before) {
    c.parentNode = this;
    const i = this.children.indexOf(before);
    if (i < 0) this.children.push(c);
    else this.children.splice(i, 0, c);
    return c;
  }
  remove() {
    if (!this.parentNode) return;
    this.parentNode.children = this.parentNode.children.filter((x) => x !== this);
    this.parentNode = null;
  }
  replaceChildren(...kids) {
    this.children = kids;
    for (const k of kids) k.parentNode = this;
  }
  addEventListener() {}
  focus() {}
}

function makeDoc() {
  const doc = {
    _all: [],
    _byId: new Map(),
    createElement(tag) {
      return new El(tag, doc);
    },
    getElementById(id) {
      if (!doc._byId.has(id)) doc._byId.set(id, new El('div', doc));
      return doc._byId.get(id);
    },
    addEventListener() {},
    hidden: false,
  };
  return doc;
}

globalThis.window = globalThis.window || {};
globalThis.window.matchMedia = () => ({ matches: false });
globalThis.window.__AGENTS__ = [];
globalThis.document = makeDoc();
globalThis.Image = class {
  constructor() {
    this._src = '';
    this.onload = null;
    this.onerror = null;
  }
  set src(v) {
    this._src = v;
    // Preload player memakai decode(); measureHead memakai onerror -> fallback.
    if (this.onerror) setTimeout(() => this.onerror(new Error('stub')), 0);
  }
  get src() {
    return this._src;
  }
  decode() {
    return Promise.resolve();
  }
};

const { createAgent } = await import('../public/js/agent.js');

const flush = () => new Promise((r) => setTimeout(r, 10));

function makeStage(doc) {
  return {
    W: 1376,
    H: 768,
    scale: 1,
    walkArea: () => ({ xMin: 82, xMax: 1294, yMin: 584, yMax: 745 }),
    bossSeat: () => ({ x: 688, y: 614 }),
    uiEl: doc.createElement('div'),
    stageEl: doc.createElement('div'),
    toScreen: (x, y) => ({ x, y }),
  };
}

const storeOk = { get: () => ({ status: 'ok', alerts: [] }) };
const bubbles = { register() {} };

function manifestWithJalan() {
  return {
    agents: {
      exitbot: { name: 'ExitBot', size: [171, 225], feet: [85, 224], sprite: 'sprites/exit-bot.png', walkRig: null },
    },
    activities: {
      exitbot: {
        jalan: {
          frames: ['activities/exitbot/jalan-1.png', 'activities/exitbot/jalan-2.png', 'activities/exitbot/jalan-3.png', 'activities/exitbot/jalan-4.png'],
          size: [200, 230],
          feet: [90, 228],
          fps: 8,
          mode: 'loop',
          faces: 'right',
        },
      },
    },
    icons: {},
  };
}

function spriteImg(doc) {
  const imgs = doc._all.filter((e) => e.tagName === 'img' && e.className === 'sprite');
  assert.ok(imgs.length >= 1, 'harus ada img sprite');
  return imgs[imgs.length - 1];
}

/** Majukan frame sampai agen jalan (idle timer dilewati). */
function startWalking(a) {
  let now = performance.now() + 30000;
  for (let i = 0; i < 10 && a.debug().state !== 'walking'; i++) {
    a.frame(now, 0.05);
    now += 50;
  }
  assert.equal(a.debug().state, 'walking');
  return now;
}

describe('agent: jalan kaki pakai strip jalan', () => {
  it('berjalan pakai frame jalan dari jarak, berhenti kembali ke idle', async () => {
    const doc = globalThis.document;
    const a = createAgent({
      id: 'exitbot',
      cfg: manifestWithJalan().agents.exitbot,
      manifest: manifestWithJalan(),
      store: storeOk,
      stage: makeStage(doc),
      bubbles,
      icons: {},
      onOpen() {},
    });
    await flush();
    const img = spriteImg(doc);
    const baseSrc = img.getAttribute('src');
    assert.ok(baseSrc.endsWith('sprites/exit-bot.png'));

    let now = startWalking(a);
    assert.equal(a.debug().walk, 'jalan');

    let minY = Infinity;
    let steps = 0;
    while (a.debug().state === 'walking' && steps < 3000) {
      now += 50;
      a.frame(now, 0.05);
      steps += 1;
      const d = a.debug();
      if (d.state !== 'walking') break;
      minY = Math.min(minY, d.y);
      // Frame = fungsi jarak (kaki tak slide), src = frame jalan yang tepat.
      assert.equal(d.walkIndex, frameFromDistance(d.walkedPx, 4, FRAME_PX));
      const src = img.getAttribute('src');
      assert.ok(src.endsWith(`jalan-${d.walkIndex + 1}.png`), `src ${src} vs index ${d.walkIndex}`);
      // Flip konsisten dengan hadap.
      assert.equal(img.style.transform, d.dir < 0 ? 'scaleX(-1)' : 'none');
    }
    assert.ok(steps < 3000, 'agen harus sampai');
    assert.ok(minY >= 642, `kaki tak boleh ke belakang bos (min y=${minY})`);
    // Berhenti: sprite diam persis kembali, hadap terakhir dipertahankan.
    const d = a.debug();
    assert.equal(d.state, 'idle');
    assert.equal(img.getAttribute('src'), baseSrc);
  });

  it('tanpa strip jalan -> fallback + warn sekali', async () => {
    const warnings = [];
    const origWarn = console.warn;
    console.warn = (...args) => warnings.push(args.join(' '));
    try {
      const m = manifestWithJalan();
      m.activities = { exitbot: {} };
      const doc = globalThis.document;
      const a = createAgent({
        id: 'exitbot',
        cfg: m.agents.exitbot,
        manifest: m,
        store: storeOk,
        stage: makeStage(doc),
        bubbles,
        icons: {},
        onOpen() {},
      });
      await flush();
      startWalking(a);
      assert.equal(a.debug().walk, 'fallback');
      const jalanWarns = warnings.filter((w) => w.startsWith('[walk] jalan frames missing for exitbot'));
      assert.equal(jalanWarns.length, 1);
      // Jalan kedua (idle 1,5-6 dtk -> butuh ~130 frame @50ms): tetap sekali.
      let now = performance.now() + 60000;
      for (let i = 0; i < 4000 && a.debug().state !== 'idle'; i++) {
        now += 50;
        a.frame(now, 0.05);
      }
      for (let i = 0; i < 300 && a.debug().state !== 'walking'; i++) {
        now += 50;
        a.frame(now, 0.05);
      }
      assert.equal(a.debug().state, 'walking');
      assert.equal(warnings.filter((w) => w.startsWith('[walk] jalan frames missing for exitbot')).length, 1);
    } finally {
      console.warn = origWarn;
    }
  });
});
