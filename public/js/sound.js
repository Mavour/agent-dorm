/**
 * Synth suara tanpa aset (Web Audio murni): debing pedang + whoosh +
 * musik santai pentatonik ala Jepang saat idle. Aman diimpor di Node
 * (semua fungsi no-op tanpa AudioContext). Musik mulai setelah
 * gesture pertama (aturan autoplay browser).
 */

let ac = null;
let master = null;
let musicBus = null;
let noiseBuf = null;
let musicTimer = null;
let melodyIx = 0;
let droneAt = 0;
let ducked = false;

const STORE_KEY = 'agent-dorm-sound';
let mutedCache = null;

/** Tangga pentatonik santai (A minor pent) + jeda; 0 = istirahat. */
const MELODY = [76, 74, 72, 74, 76, 79, 76, 74, 72, 69, 72, 0];
const MELODY_STEP_MS = 2100;
const DRONE_MS = 16000;

/**
 * Frekuensi nada dari nomor MIDI (murni, bisa diuji).
 * @param {number} midi
 */
export function noteFreq(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
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
  if (master && ac) master.gain.setTargetAtTime(mutedCache ? 0 : 0.6, ac.currentTime, 0.05);
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
  } catch {
    return null;
  }
  master = ac.createGain();
  master.gain.value = isMuted() ? 0 : 0.6;
  master.connect(ac.destination);
  musicBus = ac.createGain();
  musicBus.gain.value = 0.5;
  musicBus.connect(master);
  return ac;
}

/** Siapkan konteks + mulai musik idle. Panggil dari gesture pertama. */
export function unlock() {
  if (!ctx()) return false;
  startIdleMusic();
  return true;
}

function noiseBufGet() {
  if (noiseBuf) return noiseBuf;
  const c = ctx();
  if (!c) return null;
  const len = c.sampleRate;
  noiseBuf = c.createBuffer(1, len, c.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return noiseBuf;
}

/** Debing pedang metalik. @returns {boolean} true bila berbunyi */
export function swordClash() {
  const c = ctx();
  if (!c || isMuted()) return false;
  const t = c.currentTime;
  const base = 1180 + Math.random() * 500;
  const parts = [
    [1, 'square', 0.1],
    [1.51, 'triangle', 0.12],
    [2.02, 'sine', 0.08],
  ];
  for (const [mult, type, g] of parts) {
    const o = c.createOscillator();
    const gn = c.createGain();
    o.type = type;
    o.frequency.value = base * mult;
    gn.gain.setValueAtTime(g, t);
    gn.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
    o.connect(gn);
    gn.connect(master);
    o.start(t);
    o.stop(t + 0.3);
  }
  const nb = noiseBufGet();
  if (nb) {
    const src = c.createBufferSource();
    src.buffer = nb;
    const hp = c.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 3000;
    const gn = c.createGain();
    gn.gain.setValueAtTime(0.16, t);
    gn.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    src.connect(hp);
    hp.connect(gn);
    gn.connect(master);
    src.start(t);
    src.stop(t + 0.15);
  }
  return true;
}

/** Whoosh dash saat duel mulai. @returns {boolean} */
export function dashWhoosh() {
  const c = ctx();
  if (!c || isMuted()) return false;
  const nb = noiseBufGet();
  if (!nb) return false;
  const t = c.currentTime;
  const src = c.createBufferSource();
  src.buffer = nb;
  src.loop = true;
  const bp = c.createBiquadFilter();
  bp.type = 'bandpass';
  bp.Q.value = 1.2;
  bp.frequency.setValueAtTime(400, t);
  bp.frequency.exponentialRampToValueAtTime(4500, t + 0.45);
  const gn = c.createGain();
  gn.gain.setValueAtTime(0.0001, t);
  gn.gain.exponentialRampToValueAtTime(0.22, t + 0.12);
  gn.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
  src.connect(bp);
  bp.connect(gn);
  gn.connect(master);
  src.start(t);
  src.stop(t + 0.55);
  return true;
}

/** Petik koto lembut (segitiga + lowpass + luruh panjang). */
function pluck(midi, when, vol) {
  const o = ac.createOscillator();
  const g = ac.createGain();
  const f = ac.createBiquadFilter();
  o.type = 'triangle';
  o.frequency.value = noteFreq(midi);
  f.type = 'lowpass';
  f.frequency.value = 2200;
  g.gain.setValueAtTime(0.0001, when);
  g.gain.exponentialRampToValueAtTime(vol, when + 0.03);
  g.gain.exponentialRampToValueAtTime(0.0001, when + 2.2);
  o.connect(f);
  f.connect(g);
  g.connect(musicBus);
  o.start(when);
  o.stop(when + 2.4);
}

function startIdleMusic() {
  if (musicTimer || !ac) return;
  musicTimer = setInterval(() => {
    if (isMuted()) return;
    if (globalThis.document && globalThis.document.hidden) return;
    const t = ac.currentTime + 0.1;
    const m = MELODY[melodyIx % MELODY.length];
    melodyIx += 1;
    if (m) pluck(m, t, ducked ? 0.02 : 0.05);
    if (!droneAt || Date.now() - droneAt > DRONE_MS) {
      droneAt = Date.now();
      pluck(45, t, 0.03);
      pluck(52, t + 0.05, 0.02);
    }
  }, MELODY_STEP_MS);
}

/** Kecilkan musik saat duel (naikkan lagi setelahnya). @param {boolean} on */
export function duelMode(on) {
  ducked = !!on;
}
