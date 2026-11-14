/**
 * Musik latar MP3 berulang + efek suara Web Audio. Musik dimulai setelah
 * interaksi pertama, mengikuti tombol mute, dan dijeda saat tab tersembunyi.
 * createEngine tetap tersedia untuk sintesis dan pengujian efek suara.
 *
 * Latar: lima menit pertama japan rock, MP3 96 kbps dengan fade di ujung.
 * HTMLAudioElement memutar file tanpa mendekode seluruh lagu ke buffer JS.
 * SFX: whoosh dash, benturan pertama, dan dentang tetap memakai createEngine.
 * Komposer synth pada createEngine dipertahankan untuk kompatibilitas;
 * wrapper realtime tidak menjadwalkannya bersama musik rekaman.
 */

const STORE_KEY = 'agent-dorm-sound';
let mutedCache = null;

// ---------------------------------------------------------------------------
// Murni: nada, tangga, komposer musik tenang, partitur tempur
// ---------------------------------------------------------------------------

/**
 * Frekuensi nada dari nomor MIDI (murni, bisa diuji).
 * @param {number} midi
 */
export function noteFreq(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/** Tangga Hirajoshi dari tonika: A B C E F (interval 0,2,3,7,8). */
export const HIRAJOSHI = Object.freeze([0, 2, 3, 7, 8]);

/**
 * MIDI dari derajat tangga (boleh melewati oktaf / negatif).
 * @param {number} rootMidi tonika
 * @param {number} degree 0 = tonika, 5 = tonika +1 oktaf, dst.
 */
export function scaleMidi(rootMidi, degree, scale = HIRAJOSHI) {
  const oct = Math.floor(degree / scale.length);
  const idx = ((degree % scale.length) + scale.length) % scale.length;
  return rootMidi + oct * 12 + scale[idx];
}

/** Musik idle hangat dan ceria: pentatonik mayor, 78 BPM, register C4?E5. */
export const CALM = Object.freeze({
  ROOT: 60,
  SCALE: Object.freeze([0, 2, 4, 7, 9]),
  DEG_MIN: 0,
  DEG_MAX: 7,
  BPM: 78,
  PAD_EVERY: 60 / 78 * 8,
  PAD_LEN: 8,
});

// Tiap baris = frasa 16 ketukan, termasuk jeda penutup.
// Motif kembali sebagai jawaban: terasa seperti lagu, bukan nada acak.
const CALM_SCORE = [
  [[0, 1.5], [2, 0.5], [3, 1], [5, 2], [4, 1], [3, 2], [2, 4], [0, 4]],
  [[2, 1.5], [3, 0.5], [4, 1], [5, 2], [6, 1], [5, 2], [4, 4], [3, 4]],
  [[3, 1], [5, 1], [7, 1.5], [6, 0.5], [5, 2], [4, 2], [2, 4], [3, 4]],
  [[4, 1.5], [5, 0.5], [3, 1], [2, 2], [1, 1], [2, 2], [3, 4], [0, 4]],
];

/** Variasi hanya pada sentuhan petikan; melodi dan ketukan tetap koheren. */
export function createCalmComposer(rng = Math.random) {
  let phrase = 0;
  let i = 0;
  function next() {
    const score = CALM_SCORE[phrase];
    const [degree, beats] = score[i];
    const phraseStart = i === 0;
    const phraseEnd = i === score.length - 1;
    const bass = i === 0 ? CALM.ROOT - 12 : i === 4 ? CALM.ROOT - 5 : null;
    const note = {
      midi: scaleMidi(CALM.ROOT, degree, CALM.SCALE),
      vel: (phraseStart ? 0.7 : phraseEnd ? 0.56 : 0.62) + rng() * 0.04,
      gap: beats * 60 / CALM.BPM,
      phraseStart,
      phraseEnd,
      bass,
    };
    i += 1;
    if (phraseEnd) {
      i = 0;
      phrase = (phrase + 1) % CALM_SCORE.length;
    }
    return note;
  }
  return { next };
}

/** Musik latihan: 104 BPM, pentatonik mayor senada dengan musik idle. */
export const BATTLE = Object.freeze({
  BPM: 104,
  STEPS: 16,
  stepSec: 60 / 104 / 4,
  taiko: {
    A: [3, 0, 0, 0, 1, 0, 0, 0, 2, 0, 0, 0, 1, 0, 1, 0],
    B: [3, 0, 0, 0, 1, 0, 0, 1, 2, 0, 0, 0, 1, 0, 1, 0],
    FILL: [3, 0, 0, 0, 1, 0, 0, 0, 2, 0, 1, 0, 1, 0, 2, 0],
  },
  // Frasa tanya-jawab yang ringan, dengan ruang untuk suara latihan.
  ostinato: [
    [60, null, 64, null, 67, null, 69, null, 67, null, 64, null, 62, null, 64, null],
    [60, null, 64, null, 67, null, 72, null, 69, null, 67, null, 64, null, 67, null],
    [69, null, 72, null, 74, null, 72, null, 69, null, 67, null, 64, null, 67, null],
    [69, null, 67, null, 64, null, 62, null, 64, null, 67, null, 62, null, 60, null],
  ],
});

// ---------------------------------------------------------------------------
// Mesin audio (bergantung pada objek AudioContext yang diberikan)
// ---------------------------------------------------------------------------

/**
 * @param {any} ac AudioContext / OfflineAudioContext
 * @param {{ rng?: () => number, masterGain?: number }} [opts]
 */
export function createEngine(ac, opts = {}) {
  const rng = opts.rng || Math.random;
  const comp = ac.createDynamicsCompressor();
  comp.threshold.value = -16;
  comp.knee.value = 20;
  comp.ratio.value = 4;
  comp.attack.value = 0.008;
  comp.release.value = 0.25;
  const master = ac.createGain();
  master.gain.value = opts.masterGain ?? 0.6;
  master.connect(comp);
  comp.connect(ac.destination);

  // Level bus yang dilacak mesin (untuk fade eksplisit yang deterministik di
  // semua implementasi Web Audio; setTargetAtTime tak seragam antar engine).
  const lv = { master: opts.masterGain ?? 0.6, calm: 1, battle: 0 };

  /** Fade linear param dari level terlacak ke `to` mulai t selama dur detik. */
  function fade(param, key, to, t, dur) {
    param.cancelScheduledValues(t);
    param.setValueAtTime(Math.max(0, lv[key]), t);
    param.linearRampToValueAtTime(Math.max(0, to), t + Math.max(0.005, dur));
    lv[key] = to;
  }

  // Bus: calm / battle / sfx, masing-masing kering ke master + kirim ke reverb.
  const calmBus = ac.createGain();
  const battleBus = ac.createGain();
  const sfxBus = ac.createGain();
  battleBus.gain.value = 0;
  for (const b of [calmBus, battleBus, sfxBus]) b.connect(master);

  try {
    const conv = ac.createConvolver();
    conv.buffer = makeImpulse(ac, rng, 2.4, 3);
    const wet = ac.createGain();
    wet.gain.value = 0.55;
    const verbIn = ac.createGain();
    verbIn.connect(conv);
    conv.connect(wet);
    wet.connect(master);
    const send = (bus, amt) => {
      const g = ac.createGain();
      g.gain.value = amt;
      bus.connect(g);
      g.connect(verbIn);
    };
    send(calmBus, 0.25);
    send(battleBus, 0.14);
    send(sfxBus, 0.18);
  } catch {
    /* tanpa reverb (kering) bila Convolver tak tersedia */
  }

  // Noise putih 1 dtk dipakai bersama (pick, whoosh, slap).
  const noise = ac.createBuffer(1, Math.floor(ac.sampleRate), ac.sampleRate);
  {
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = rng() * 2 - 1;
  }

  /** Envelope: naik linear cepat lalu luruh eksponensial. */
  function env(g, t, peak, attack, decay) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(Math.max(0.0002, peak), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }

  function osc(type, freq, t, dur, detuneCents = 0) {
    const o = ac.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    if (detuneCents) o.detune.value = detuneCents;
    o.start(t);
    o.stop(t + dur);
    return o;
  }

  function noiseHit(t, dur, filterType, freq, q, peak, dest) {
    const s = ac.createBufferSource();
    s.buffer = noise;
    const f = ac.createBiquadFilter();
    f.type = filterType;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ac.createGain();
    env(g, t, peak, 0.002, dur);
    s.connect(f);
    f.connect(g);
    g.connect(dest);
    s.start(t, rng() * 0.5);
    s.stop(t + dur + 0.03);
  }

  function panTo(node, dest, pan) {
    if (typeof ac.createStereoPanner === 'function') {
      const p = ac.createStereoPanner();
      p.pan.value = pan;
      node.connect(p);
      p.connect(dest);
    } else {
      node.connect(dest);
    }
  }

  // ---- Instrumen ----------------------------------------------------------

  /** Petikan membulat: fundamental sinus, harmonik lembut, attack tanpa klik/noise. */
  function koto(midi, t, vel, dest = calmBus) {
    const out = ac.createGain();
    out.gain.value = vel * 0.24;
    const lp = ac.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1800;
    lp.Q.value = 0.3;
    lp.connect(out);
    for (const [multiple, level, decay] of [[1, 1, 2.8], [2, 0.22, 1.3], [3, 0.05, 0.6]]) {
      const o = osc('sine', noteFreq(midi) * multiple, t, decay + 0.1);
      const g = ac.createGain();
      env(g, t, level, 0.025, decay);
      o.connect(g);
      g.connect(lp);
    }
    panTo(out, dest, midi < CALM.ROOT ? -0.15 : 0.15);
  }

  /** Iringan C mayor hangat, naik dan turun perlahan tanpa detune berdenyut. */
  function pad(t, dur) {
    const out = ac.createGain();
    out.gain.setValueAtTime(0.0001, t);
    out.gain.linearRampToValueAtTime(0.045, t + dur * 0.4);
    out.gain.linearRampToValueAtTime(0.0001, t + dur);
    const lp = ac.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 650;
    lp.connect(out);
    out.connect(calmBus);
    for (const [midi, det, type] of [
      [48, 0, 'sine'],
      [52, 0, 'sine'],
      [55, 0, 'sine'],
      [60, 0, 'sine'],
    ]) {
      const o = osc(type, noteFreq(midi), t, dur + 0.1, det);
      const g = ac.createGain();
      g.gain.value = 0.5;
      o.connect(g);
      g.connect(lp);
    }
  }

  /** Taiko latihan: pukulan membulat, tanpa sub-bass panjang yang mengagetkan. */
  function taiko(t, level, big = false) {
    const v = Math.max(0, Math.min(1, level));
    const body = ac.createOscillator();
    body.type = 'sine';
    body.frequency.setValueAtTime(big ? 118 : 145, t);
    body.frequency.exponentialRampToValueAtTime(big ? 68 : 92, t + 0.08);
    const g = ac.createGain();
    env(g, t, 0.26 * v, 0.008, big ? 0.38 : 0.22);
    body.connect(g);
    g.connect(battleBus);
    body.start(t);
    body.stop(t + 0.45);
    noiseHit(t, 0.035, 'bandpass', 950, 0.5, 0.045 * v, battleBus);
  }

  /** Petikan latihan: harmonik lembut tanpa gergaji dan klik bernada tinggi. */
  function shamisen(midi, t, vel) {
    const out = ac.createGain();
    out.gain.value = 0.14 * vel;
    const lp = ac.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 0.4;
    lp.frequency.value = 1900;
    lp.connect(out);
    for (const [type, mult, amp, decay] of [
      ['triangle', 1, 0.65, 0.55],
      ['sine', 1, 0.35, 0.7],
      ['sine', 2, 0.12, 0.24],
    ]) {
      const o = osc(type, noteFreq(midi) * mult, t, decay + 0.05);
      const g = ac.createGain();
      env(g, t, amp, 0.012, decay);
      o.connect(g);
      g.connect(lp);
    }
    panTo(out, battleBus, 0.12);
  }

  /** Benturan bokken: ketukan kayu pendek, bukan dentang logam melengking. */
  function clash(t, vel = 0.8, dest = sfxBus) {
    const base = 440 + rng() * 50;
    const out = ac.createGain();
    const lp = ac.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2300;
    lp.Q.value = 0.4;
    lp.connect(out);
    out.connect(dest);
    for (const [mult, amp, life] of [[1, 0.13, 0.09], [1.53, 0.07, 0.065], [2.12, 0.025, 0.04]]) {
      const o = osc('sine', base * mult, t, life + 0.02);
      const g = ac.createGain();
      env(g, t, amp * vel, 0.004, life);
      o.connect(g);
      g.connect(lp);
    }
    noiseHit(t, 0.04, 'bandpass', 1100, 0.6, 0.06 * vel, dest);
  }

  /** Whoosh dash: noise tersapu naik, durasi mengikuti burst. */
  function whoosh(t, dur = 0.45) {
    const d = Math.max(0.25, Math.min(1.2, dur));
    const s = ac.createBufferSource();
    s.buffer = noise;
    s.loop = true;
    const bp = ac.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 0.6;
    bp.frequency.setValueAtTime(350, t);
    bp.frequency.exponentialRampToValueAtTime(1800, t + d * 0.7);
    bp.frequency.exponentialRampToValueAtTime(700, t + d + 0.12);
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.07, t + d * 0.35);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.12);
    s.connect(bp);
    bp.connect(g);
    g.connect(sfxBus);
    s.start(t);
    s.stop(t + d + 0.15);
  }

  /** Awal latihan: pukulan ringan dan bunyi kayu yang singkat. */
  function impact(t) {
    taiko(t, 0.65, true);
    clash(t + 0.01, 0.65);
  }

  // ---- Penjadwal ----------------------------------------------------------

  const calm = { nextT: null, padT: null, composer: createCalmComposer(rng), resumeAt: 0 };
  const battle = { on: false, nextT: 0, step: 0, bar: 0 };

  function playBattleStep(t, bar, step) {
    const fill = bar % 4 === 3;
    const grid = fill ? BATTLE.taiko.FILL : bar % 2 ? BATTLE.taiko.B : BATTLE.taiko.A;
    const lv = grid[step];
    // Intensitas naik pelan selama beberapa bar pertama.
    const rise = 0.8 + 0.1 * Math.min(1, bar / 4);
    if (lv) taiko(t, (lv / 3) * rise, lv === 3);
    const m = BATTLE.ostinato[bar % 4][step];
    if (m != null) shamisen(m, t, (step % 8 === 0 ? 1 : 0.75) * rise);
    if (step === 0 || step === 8) koto(step === 0 ? 48 : 55, t, 0.3, battleBus);
    // Aksen latihan jarang dan pelan agar tidak menutupi melodi.
    if (step === 12 && bar % 2 === 1) clash(t, 0.35, battleBus);
  }

  function startBattle(t) {
    if (battle.on) return;
    battle.on = true;
    battle.nextT = t;
    battle.step = 0;
    battle.bar = 0;
    fade(battleBus.gain, 'battle', 1, t, 0.45);
    fade(calmBus.gain, 'calm', 0, t, 0.7);
  }

  function stopBattle(t) {
    if (!battle.on) return;
    battle.on = false;
    taiko(t + 0.04, 0.35);
    koto(60, t + 0.04, 0.35, battleBus); // penutup lembut menuju idle
    fade(battleBus.gain, 'battle', 0, t + 0.5, 1.0);
    fade(calmBus.gain, 'calm', 1, t + 1.0, 2.5);
    calm.resumeAt = t + 2.5; // musik tenang kembali pelan setelah debu reda
    calm.nextT = null;
    calm.padT = null;
  }

  /**
   * Jadwalkan semua not sampai `horizon` (detik waktu konteks).
   * @param {number} horizon
   * @param {number} [now] waktu konteks sekarang (untuk sinkron ulang)
   */
  function scheduleUntil(horizon, now = 0) {
    if (battle.on) {
      if (battle.nextT < now - 0.05) battle.nextT = now + 0.03; // ketinggalan: lompat, jangan memutar ulang
      while (battle.nextT < horizon) {
        playBattleStep(battle.nextT, battle.bar, battle.step);
        battle.nextT += BATTLE.stepSec;
        battle.step += 1;
        if (battle.step >= BATTLE.STEPS) {
          battle.step = 0;
          battle.bar += 1;
        }
      }
      return;
    }
    if (now < calm.resumeAt) return;
    if (calm.nextT == null) calm.nextT = Math.max(now, calm.resumeAt) + 0.5;
    if (calm.padT == null) calm.padT = Math.max(now, calm.resumeAt) + 0.05;
    if (calm.nextT < now - 0.05) calm.nextT = now + 0.2;
    if (calm.padT < now - 0.05) calm.padT = now + 0.1;
    while (calm.padT < horizon) {
      pad(calm.padT, CALM.PAD_LEN);
      calm.padT += CALM.PAD_EVERY;
    }
    while (calm.nextT < horizon) {
      const n = calm.composer.next();
      koto(n.midi, calm.nextT, n.vel);
      if (n.bass != null) koto(n.bass, calm.nextT, 0.4);
      calm.nextT += n.gap;
    }
  }

  /** Ubah gain master (mute/unmute) dengan fade singkat. */
  function setMasterGain(v, t) {
    fade(master.gain, 'master', v, t, 0.08);
  }

  return {
    master,
    setMasterGain,
    calmBus,
    battleBus,
    sfxBus,
    scheduleUntil,
    startBattle,
    stopBattle,
    isBattle: () => battle.on,
    sfx: { clash, whoosh, impact },
    voices: { koto, pad, taiko, shamisen },
  };
}

/**
 * Impulse response reverb sintetis: noise stereo diredam (one-pole LPF) dan
 * meluruh kubik. Gelap & halus agar petikan terasa di ruang, bukan gema logam.
 */
function makeImpulse(ac, rng, seconds, decay) {
  const len = Math.floor(ac.sampleRate * seconds);
  const buf = ac.createBuffer(2, len, ac.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      lp += (rng() * 2 - 1 - lp) * 0.3;
      d[i] = lp * Math.pow(1 - i / len, decay);
    }
  }
  return buf;
}

// ---------------------------------------------------------------------------
// Wrapper realtime (konteks, mute, tab tersembunyi, timer lookahead)
// ---------------------------------------------------------------------------

let ac = null;
let engine = null;
let music = null;
let unlocked = false;
const MASTER_GAIN = 0.6;
const MUSIC_VOLUME = 0.22;

function syncSound() {
  const quiet = isMuted() || !!globalThis.document?.hidden;
  if (engine && ac) engine.setMasterGain(quiet ? 0 : MASTER_GAIN, ac.currentTime);
  if (!music || !unlocked) return;
  if (quiet) music.pause();
  else if (music.paused) music.play()?.catch(() => {});
}

function musicTrack() {
  if (music) return music;
  if (typeof globalThis.Audio !== 'function') return null;
  music = new globalThis.Audio();
  music.preload = 'none';
  music.src = '/audio/japan-rock-loop.mp3';
  music.loop = true;
  music.volume = MUSIC_VOLUME;
  globalThis.document?.addEventListener('visibilitychange', syncSound);
  return music;
}

export function isMuted() {
  if (mutedCache !== null) return mutedCache;
  try {
    mutedCache = globalThis.localStorage?.getItem(STORE_KEY) === 'off';
  } catch {
    mutedCache = false;
  }
  return mutedCache;
}

/** @param {boolean} m @returns {boolean} status mute baru */
export function setMuted(m) {
  mutedCache = !!m;
  try {
    globalThis.localStorage?.setItem(STORE_KEY, mutedCache ? 'off' : 'on');
  } catch {
    /* abaikan */
  }
  syncSound();
  return mutedCache;
}

function ctx() {
  if (ac) {
    if (ac.state === 'suspended') ac.resume().catch(() => {});
    return ac;
  }
  const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!AC) return null;
  try {
    ac = new AC();
    engine = createEngine(ac, { masterGain: isMuted() || globalThis.document?.hidden ? 0 : MASTER_GAIN });
  } catch {
    ac = null;
    engine = null;
    return null;
  }
  return ac;
}

/** Siapkan konteks + mulai musik. Panggil dari gesture pertama. */
export function unlock() {
  const track = musicTrack();
  const context = ctx();
  unlocked = true;
  syncSound();
  return !!(track || context);
}

/** Debing pedang (SFX tunggal). @returns {boolean} true bila berbunyi */
export function swordClash() {
  const c = ctx();
  if (!c || !engine || isMuted()) return false;
  engine.sfx.clash(c.currentTime + 0.005, 0.8);
  return true;
}

/**
 * Whoosh dash; durasi mengikuti lama burst. @param {number} [durSec]
 * @returns {boolean}
 */
export function dashWhoosh(durSec) {
  const c = ctx();
  if (!c || !engine || isMuted()) return false;
  engine.sfx.whoosh(c.currentTime + 0.005, durSec);
  return true;
}

/** Benturan pertama saat tarung mulai (don + dentang). @returns {boolean} */
export function dashImpact() {
  const c = ctx();
  if (!c || !engine || isMuted()) return false;
  engine.sfx.impact(c.currentTime + 0.005);
  return true;
}

/**
 * Musik rekaman tetap berjalan saat duel; efek benturan diputar terpisah.
 * @param {boolean} on
 */
export function duelMode(_on) {
  // Keep the background track continuous instead of layering synth music.
}
