import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// ---- DOM palsu minimal (sama seperti agent-walk.test.js) ----
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
const { createActivities } = await import('../public/js/activities.js');

const flush = () => new Promise((r) => setTimeout(r, 10));

const duelDef = (side) => ({
  frames: ['d-1.png', 'd-2.png', 'd-3.png'],
  size: [243, 231],
  feet: [84, 227],
  fps: 6,
  mode: 'pingpong',
  faces: side,
});
const jalanDef = () => ({
  frames: ['j-1.png', 'j-2.png', 'j-3.png', 'j-4.png'],
  size: [200, 230],
  feet: [90, 228],
  fps: 8,
  mode: 'loop',
  faces: 'right',
});

function makeWorld() {
  const doc = globalThis.document;
  const manifest = {
    agents: {
      exitbot: { name: 'ExitBot', size: [171, 225], feet: [85, 224], sprite: 'sprites/exit-bot.png', walkRig: null },
      lpwatcher: { name: 'LP Watcher', size: [180, 235], feet: [90, 234], sprite: 'sprites/lp-watcher.png', walkRig: null },
    },
    activities: {
      exitbot: { jalan: jalanDef(), duel: duelDef('right') },
      lpwatcher: { jalan: jalanDef(), duel: duelDef('left') },
    },
    icons: {},
  };
  const stage = {
    W: 1376,
    H: 768,
    scale: 1,
    walkArea: () => ({ xMin: 82, xMax: 1294, yMin: 584, yMax: 745 }),
    bossSeat: () => ({ x: 688, y: 614 }),
    uiEl: doc.createElement('div'),
    stageEl: doc.createElement('div'),
    toScreen: (x, y) => ({ x, y }),
  };
  const store = { get: () => ({ status: 'ok', alerts: [] }) };
  const bubbles = { register() {}, say() {} };
  const agents = ['exitbot', 'lpwatcher'].map((id) =>
    createAgent({ id, cfg: manifest.agents[id], manifest, store, stage, bubbles, icons: {}, onOpen() {} }),
  );
  globalThis.window.__AGENTS__ = agents;
  const activities = createActivities({ agents, stage, manifest, isPopupOpen: () => false, reduced: false });
  return { agents, activities };
}

describe('duel e2e: paksa mulai sampai tarung selesai', () => {
  it('forceStart -> jalan -> tarung -> bubar bersih', async () => {
    const { agents, activities } = makeWorld();
    await flush();
    const [a, b] = agents;
    const r = activities.forceStart();
    assert.deepEqual(r, { ok: true });
    const seen = new Set();
    let now = performance.now();
    let ended = false;
    for (let i = 0; i < 3000 && !ended; i++) {
      now += 50;
      a.frame(now, 0.05);
      b.frame(now, 0.05);
      activities.tick(now);
      seen.add(activities.info().phase);
      if (seen.has('fighting') && activities.info().phase === 'idle') ended = true;
    }
    assert.ok(seen.has('walking'), `tak pernah jalan: ${[...seen]}`);
    assert.ok(seen.has('fighting'), `tak pernah tarung: ${[...seen]}`);
    assert.ok(ended, 'duel tak selesai bersih');
    for (const ag of agents) {
      const d = ag.debug();
      assert.ok(d.state === 'idle' || d.state === 'walking', `${ag.id} macet di ${d.state}`);
    }
  });
});
