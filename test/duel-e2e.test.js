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

function makeWorld(withRig = false) {
  const rigOf = (bandTop, f1, f2) => (withRig ? { bandTop, feet: [f1, f2] } : null);
  const doc = globalThis.document;
  const manifest = {
    agents: {
      exitbot: { name: 'ExitBot', size: [171, 225], feet: [85, 224], sprite: 'sprites/exit-bot.png', walkRig: rigOf(195.5, [39.5, 82], [79, 125.5]) },
      lpwatcher: { name: 'LP Watcher', size: [180, 235], feet: [90, 234], sprite: 'sprites/lp-watcher.png', walkRig: rigOf(201, [43, 85.5], [82.5, 129.5]) },
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

describe('duel e2e: dash natural (windup -> burst ber-easing -> skid)', () => {
  it('windup diam, burst melesat bervariasi, skid berhenti tepat di titik', async () => {
    const { agents } = makeWorld();
    await flush();
    const [a] = agents;
    const t0 = performance.now();
    const p0 = a.debug();
    a.duelTo(1200, 690);
    const step = 16;
    const phases = [];
    const xs = [];
    let prev = { x: p0.x, y: p0.y };
    let maxStep = 0;
    const speeds = [];
    for (let el = 0; el <= 1600; el += step) {
      a.frame(t0 + el, step / 1000);
      const d = a.debug();
      if (phases[phases.length - 1] !== d.dash) phases.push(d.dash);
      xs.push(d.x);
      const mv = Math.hypot(d.x - prev.x, d.y - prev.y);
      if (d.dash === 'burst') speeds.push(mv);
      maxStep = Math.max(maxStep, mv);
      prev = d;
    }
    // Urutan babak: windup -> burst -> settle -> (null = selesai)
    assert.deepEqual(phases, ['windup', 'burst', 'settle', null]);
    // Windup: belum bergeser sama sekali.
    a.releaseDuel();
    const b = makeWorld();
    await flush();
    const [c] = b.agents;
    const q0 = c.debug();
    const s0 = performance.now();
    c.duelTo(1200, 690);
    for (let el = 0; el < 200; el += 16) c.frame(s0 + el, 0.016);
    assert.equal(c.debug().x, q0.x, 'bergerak saat windup');
    assert.equal(c.debug().dash, 'windup');
    // Burst: kecepatan sangat bervariasi (bukan laju konstan) dan tak teleport.
    assert.ok(Math.max(...speeds) > 2 * Math.min(...speeds.filter((v) => v > 0)), 'kecepatan terlalu rata');
    assert.ok(maxStep < 60, `lompatan ${maxStep}px/frame`);
    // Tiba persis di tujuan.
    const end = a.debug();
    assert.ok(Math.abs(end.x - 1200) <= 1 && Math.abs(end.y - 690) <= 1, `berhenti di ${end.x},${end.y}`);
  });
  it('REGRESI: bukan jalan dipercepat - dash 1 frame pertama setelah windup tak melompat 6x jalan', async () => {
    const { agents } = makeWorld();
    await flush();
    const [a] = agents;
    const t0 = performance.now();
    a.duelTo(1200, 690);
    a.frame(t0 + 0, 0.016);
    const before = a.debug();
    assert.equal(before.dash, 'windup');
    a.frame(t0 + 230, 0.016); // sudah masuk burst, awal (kecepatan masih rendah)
    const after = a.debug();
    assert.equal(after.dash, 'burst');
    assert.ok(after.x - before.x < 6, 'awal burst harus berakselerasi mulus');
  });
  it('releaseDuel membersihkan dash', async () => {
    const { agents } = makeWorld();
    await flush();
    const [a] = agents;
    a.duelTo(1200, 690);
    a.frame(performance.now() + 300, 0.016);
    assert.equal(a.debug().state, 'duelWalk');
    a.releaseDuel();
    assert.equal(a.debug().dash, null);
    assert.notEqual(a.debug().state, 'duelWalk');
  });
});

describe('duel e2e: sudah dekat -> langsung tarung', () => {
  it('forceStart saat sebelahan -> fighting dalam <150 tick', async () => {
    const { agents, activities } = makeWorld();
    await flush();
    const [a, b] = agents;
    // Giring keduanya ke tengah yang sama (titik bebas di bawah zona bos).
    a.duelTo(700, 700);
    b.duelTo(760, 700);
    let now = performance.now();
    for (let i = 0; i < 600; i++) {
      now += 50;
      a.frame(now, 0.05);
      b.frame(now, 0.05);
      const da = a.debug();
      const db = b.debug();
      if (Math.hypot(da.x - db.x, da.y - db.y) <= 200) break;
    }
    const da = a.debug();
    const db = b.debug();
    assert.ok(Math.hypot(da.x - db.x, da.y - db.y) <= 220, 'gagal mendekatkan agen');
    const r = activities.forceStart();
    assert.deepEqual(r, { ok: true });
    let ticks = 0;
    let fought = false;
    for (let i = 0; i < 300; i++) {
      now += 50;
      a.frame(now, 0.05);
      b.frame(now, 0.05);
      activities.tick(now);
      ticks += 1;
      if (activities.info().phase === 'fighting') {
        fought = true;
        break;
      }
    }
    assert.ok(fought, 'sudah dekat tapi tak kunjung tarung');
    assert.ok(ticks < 150, `kelamaan: ${ticks} tick untuk mulai tarung`);
  });
});

describe('duel e2e: dengan walk-rig (konfigurasi app asli)', () => {
  it('duel penuh: rig tampil selama dash lalu tersembunyi, sprite kembali, garis kecepatan hanya saat burst', async () => {
    const { agents, activities } = makeWorld(true);
    await flush();
    const [a, b] = agents;
    assert.deepEqual(activities.forceStart(), { ok: true });
    let now = performance.now();
    const seen = new Set();
    let fxShown = false;
    let fightAt = -1;
    const fxNodes = globalThis.document._all.filter((e) => e.className === 'dashfx').slice(-2); // milik world ini
    assert.equal(fxNodes.length, 2);
    for (let i = 0; i < 400 && fightAt < 0; i++) {
      now += 16;
      a.frame(now, 0.016);
      b.frame(now, 0.016);
      activities.tick(now);
      seen.add(a.debug().dash);
      if (fxNodes.some((n) => n.style.display === 'block')) fxShown = true;
      if (activities.info().phase === 'fighting') fightAt = i;
    }
    assert.ok(fightAt >= 0, 'tak pernah tarung');
    assert.ok(seen.has('windup') && seen.has('burst') && seen.has('settle'), `babak: ${[...seen]}`);
    assert.ok(fxShown, 'garis kecepatan tak pernah tampil');
    // Total dari mulai sampai tarung: sekitar 1 dtk (bukan jalan 5+ dtk).
    assert.ok(fightAt * 16 < 1800, `kelamaan: ${fightAt * 16}ms`);
    // Saat tarung: tak ada garis kecepatan tersisa, state dash bersih.
    for (const n of fxNodes) assert.equal(n.style.display, 'none');
    assert.equal(a.debug().dash, null);
    assert.equal(b.debug().dash, null);
  });
});
