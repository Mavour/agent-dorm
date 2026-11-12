import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  noteFreq,
  scaleMidi,
  HIRAJOSHI,
  CALM,
  BATTLE,
  createCalmComposer,
  createEngine,
  swordClash,
  dashWhoosh,
  dashImpact,
  duelMode,
  unlock,
  isMuted,
  setMuted,
} from '../public/js/sound.js';

/** PRNG deterministik. */
function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** AudioContext palsu: mencatat waktu start tiap sumber suara. */
function fakeCtx() {
  const starts = [];
  const param = (v = 0) => ({
    value: v,
    setValueAtTime() {},
    linearRampToValueAtTime() {},
    exponentialRampToValueAtTime() {},
    setTargetAtTime() {},
    cancelScheduledValues() {},
  });
  const node = (extra = {}) => ({ connect: (x) => x, disconnect() {}, ...extra });
  return {
    sampleRate: 8000,
    currentTime: 0,
    starts,
    destination: node(),
    createGain: () => node({ gain: param(1) }),
    createDynamicsCompressor: () =>
      node({ threshold: param(), knee: param(), ratio: param(), attack: param(), release: param() }),
    createOscillator: () =>
      node({
        type: '',
        frequency: param(440),
        detune: param(0),
        start(t) {
          starts.push(t);
        },
        stop() {},
      }),
    createBiquadFilter: () => node({ type: '', frequency: param(), Q: param(), detune: param(), gain: param() }),
    createBufferSource: () =>
      node({
        buffer: null,
        loop: false,
        start(t) {
          starts.push(t);
        },
        stop() {},
      }),
    createBuffer: (_c, len) => ({ length: len, getChannelData: () => new Float32Array(len) }),
    createConvolver: () => node({ buffer: null }),
    createStereoPanner: () => node({ pan: param() }),
  };
}

const PC_HIRAJOSHI = new Set(HIRAJOSHI.map((s) => (57 + s) % 12)); // A B C E F

describe('sound: nada & tangga', () => {
  it('noteFreq MIDI benar', () => {
    assert.equal(noteFreq(69), 440);
    assert.equal(noteFreq(81), 880);
    assert.ok(Math.abs(noteFreq(60) - 261.63) < 0.01);
  });
  it('scaleMidi: tonika, oktaf, negatif', () => {
    assert.equal(scaleMidi(57, 0), 57);
    assert.equal(scaleMidi(57, 4), 65);
    assert.equal(scaleMidi(57, 5), 69);
    assert.equal(scaleMidi(57, -1), 53);
    assert.deepEqual([...PC_HIRAJOSHI].sort((a, b) => a - b), [0, 4, 5, 9, 11]);
  });
});

describe('sound: komposer musik tenang', () => {
  const rng = seeded(42);
  const comp = createCalmComposer(rng);
  const notes = Array.from({ length: 600 }, () => comp.next());

  it('idle memakai pentatonik mayor dan register hangat C4?E5', () => {
    const lo = scaleMidi(CALM.ROOT, CALM.DEG_MIN, CALM.SCALE);
    const hi = scaleMidi(CALM.ROOT, CALM.DEG_MAX, CALM.SCALE);
    for (const n of notes) {
      assert.ok(new Set([0, 2, 4, 7, 9]).has(n.midi % 12), `bukan mayor: ${n.midi}`);
      assert.ok(n.midi >= lo && n.midi <= hi, `di luar rentang: ${n.midi}`);
    }
  });
  it('empat frasa tanya-jawab kembali sebagai tema dengan ketukan tetap', () => {
    const a = createCalmComposer(seeded(1));
    const b = createCalmComposer(seeded(2));
    const theme = Array.from({ length: 32 }, () => a.next());
    const repeat = Array.from({ length: 32 }, () => a.next());
    const other = Array.from({ length: 32 }, () => b.next());
    const score = (ns) => ns.map(({ midi, gap, bass }) => ({ midi, gap, bass }));
    assert.deepEqual(score(theme), score(repeat), 'tema tidak kembali');
    assert.deepEqual(score(theme), score(other), 'melodi bergantung rng');
    assert.notDeepEqual(theme.map(n => n.vel), other.map(n => n.vel), 'sentuhan terlalu mekanis');
    assert.notDeepEqual(score(theme.slice(0, 8)), score(theme.slice(8, 16)), 'jawaban sama dengan pertanyaan');
    for (let i = 0; i < theme.length; i += 8) {
      const phrase = theme.slice(i, i + 8);
      assert.ok(phrase[0].phraseStart);
      assert.ok(phrase[7].phraseEnd);
      assert.ok([0, 7].includes(phrase[7].midi % 12), 'kadens bukan C/G');
      const beats = phrase.reduce((sum, n) => sum + n.gap * CALM.BPM / 60, 0);
      assert.ok(Math.abs(beats - 16) < 1e-9, 'frasa keluar dari 16 ketukan');
      assert.ok(phrase[7].gap >= 3 && phrase[7].gap <= 4, 'jeda penutup terlalu panjang');
      assert.equal(phrase.filter(n => n.bass != null).length, 2);
      for (const n of phrase) assert.ok(n.gap > 0 && n.vel > 0 && n.vel <= 1);
    }
  });
  it('deterministik terhadap rng', () => {
    const x = createCalmComposer(seeded(9));
    const y = createCalmComposer(seeded(9));
    for (let i = 0; i < 50; i++) assert.deepEqual(x.next(), y.next());
  });
});

describe('sound: partitur tempur', () => {
  it('grid 16 langkah, velositas 0..3, bar pembuka kuat', () => {
    for (const g of Object.values(BATTLE.taiko)) {
      assert.equal(g.length, BATTLE.STEPS);
      for (const v of g) assert.ok(v >= 0 && v <= 3);
      assert.equal(g[0], 3);
    }
    assert.equal(BATTLE.ostinato.length, 4);
    for (const bar of BATTLE.ostinato) {
      assert.equal(bar.length, BATTLE.STEPS);
      for (const m of bar) if (m != null) assert.ok(new Set([0, 2, 4, 7, 9]).has(m % 12), `bukan mayor: ${m}`);
    }
  });
  it('stepSec konsisten dengan BPM', () => {
    assert.ok(Math.abs(BATTLE.stepSec - 60 / BATTLE.BPM / 4) < 1e-12);
  });
});

describe('sound: engine (konteks palsu)', () => {
  it('musik tenang menjadwalkan nada sampai horizon, tanpa duplikat saat dipanggil ulang', () => {
    const ac = fakeCtx();
    const e = createEngine(ac, { rng: seeded(1) });
    e.scheduleUntil(10, 0);
    const n1 = ac.starts.length;
    assert.ok(n1 > 0, 'tak ada nada');
    assert.ok(Math.max(...ac.starts) < 10 + 1e-9);
    assert.ok(Math.min(...ac.starts) >= 0);
    e.scheduleUntil(10, 0);
    assert.equal(ac.starts.length, n1, 'terjadwal ganda');
    assert.equal(e.isBattle(), false);
  });
  it('musik tempur: semua suara jatuh TEPAT di grid ketukan', () => {
    const ac = fakeCtx();
    const e = createEngine(ac, { rng: seeded(3) });
    e.startBattle(0.2);
    assert.equal(e.isBattle(), true);
    e.scheduleUntil(12, 0);
    assert.ok(ac.starts.length > 50);
    for (const t of ac.starts) {
      const k = (t - 0.2) / BATTLE.stepSec;
      assert.ok(Math.abs(k - Math.round(k)) < 1e-6, `off-grid di t=${t}`);
      assert.ok(t >= 0.2 - 1e-9 && t < 12);
    }
  });
  it('stopBattle: hentikan jadwal tempur, hantaman penutup, musik tenang menunggu', () => {
    const ac = fakeCtx();
    const e = createEngine(ac, { rng: seeded(5) });
    e.startBattle(0.2);
    e.scheduleUntil(5, 0);
    e.stopBattle(5);
    assert.equal(e.isBattle(), false);
    const before = ac.starts.length;
    e.scheduleUntil(7, 5);
    const fresh = ac.starts.slice(before);
    assert.equal(fresh.length, 0, 'musik muncul terlalu cepat setelah duel');
    e.scheduleUntil(12, 8);
    const later = ac.starts.slice(before);
    assert.ok(later.length > 0, 'musik tenang tak kembali');
    assert.ok(Math.min(...later) >= 7.5 - 1e-9, `kembali terlalu cepat: ${Math.min(...later)}`);
  });
  it('sinkron ulang bila tertinggal jauh (tab tersembunyi): tak memutar ulang masa lalu', () => {
    const ac = fakeCtx();
    const e = createEngine(ac, { rng: seeded(8) });
    e.scheduleUntil(4, 0);
    const n = ac.starts.length;
    e.scheduleUntil(1000.16, 1000);
    const late = ac.starts.slice(n);
    assert.ok(late.length > 0);
    assert.ok(late.every((t) => t >= 1000 - 0.06), 'ada not dijadwalkan di masa lalu');
    // Tempur juga: tertinggal 4000 dtk tidak meledak jadi ribuan not.
    e.startBattle(1001);
    const m = ac.starts.length;
    e.scheduleUntil(5000.16, 5000);
    const burst = ac.starts.slice(m);
    assert.ok(burst.every((t) => t >= 5000 - 0.06), 'tempur memutar ulang masa lalu');
    assert.ok(burst.length < 200, `terlalu banyak not: ${burst.length}`);
  });
  it('SFX dan setMasterGain tidak melempar', () => {
    const ac = fakeCtx();
    const e = createEngine(ac);
    e.sfx.clash(0.1, 0.8);
    e.sfx.whoosh(0.1, 0.4);
    e.sfx.whoosh(0.1, 99); // durasi liar dijepit
    e.sfx.impact(0.2);
    e.setMasterGain(0, 0.3);
    e.setMasterGain(0.6, 1);
  });
  it('tanpa Convolver/StereoPanner tetap jalan (kering)', () => {
    const ac = fakeCtx();
    ac.createConvolver = () => {
      throw new Error('tidak didukung');
    };
    delete ac.createStereoPanner;
    const e = createEngine(ac);
    e.scheduleUntil(6, 0);
    assert.ok(ac.starts.length > 0);
  });
});

describe('sound: wrapper tanpa AudioContext = no-op aman', () => {
  it('tak berbunyi tapi tak crash', () => {
    assert.equal(unlock(), false);
    assert.equal(swordClash(), false);
    assert.equal(dashWhoosh(), false);
    assert.equal(dashWhoosh(0.6), false);
    assert.equal(dashImpact(), false);
    duelMode(true);
    duelMode(false);
  });
  it('mute on/off tersimpan', () => {
    setMuted(true);
    assert.equal(isMuted(), true);
    setMuted(false);
    assert.equal(isMuted(), false);
  });
});
