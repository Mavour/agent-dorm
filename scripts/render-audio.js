/**
 * Render offline musik/SFX Agent Dorm ke WAV + analisis level, memakai
 * createEngine yang SAMA dengan browser. Alat dev opsional:
 *
 *   npm i --no-save node-web-audio-api
 *   node scripts/render-audio.js [folder-keluaran]
 *
 * Keluaran: calm.wav, battle.wav, demo.wav (tenang -> dash -> tempur -> tenang)
 * dan ringkasan level (peak / RMS / clipping) di konsol.
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import { createEngine } from '../public/js/sound.js';

const here = path.dirname(new URL(import.meta.url).pathname);
const outDir = path.resolve(process.argv[2] || path.join(here, '..', 'audio-preview'));

function loadWebAudio() {
  for (const base of [process.cwd(), here]) {
    try {
      return createRequire(path.join(base, 'noop.js'))('node-web-audio-api');
    } catch {
      /* coba lokasi berikut */
    }
  }
  console.error('Butuh paket dev: npm i --no-save node-web-audio-api');
  process.exit(1);
}
const { OfflineAudioContext } = loadWebAudio();

/** PRNG deterministik (mulberry32) agar hasil render bisa diulang. */
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

function wav(buf) {
  const ch = buf.numberOfChannels;
  const n = buf.length;
  const out = Buffer.alloc(44 + n * ch * 2);
  out.write('RIFF', 0);
  out.writeUInt32LE(36 + n * ch * 2, 4);
  out.write('WAVEfmt ', 8);
  out.writeUInt32LE(16, 16);
  out.writeUInt16LE(1, 20);
  out.writeUInt16LE(ch, 22);
  out.writeUInt32LE(buf.sampleRate, 24);
  out.writeUInt32LE(buf.sampleRate * ch * 2, 28);
  out.writeUInt16LE(ch * 2, 32);
  out.writeUInt16LE(16, 34);
  out.write('data', 36);
  out.writeUInt32LE(n * ch * 2, 40);
  const data = [...Array(ch)].map((_, c) => buf.getChannelData(c));
  let o = 44;
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < ch; c++) {
      const v = Math.max(-1, Math.min(1, data[c][i]));
      out.writeInt16LE(Math.round(v * 32767), o);
      o += 2;
    }
  }
  return out;
}

/** Peak/RMS (dBFS) + RMS per jendela 1 dtk. */
function analyze(buf) {
  const d = buf.getChannelData(0);
  let peak = 0;
  let clip = 0;
  let sum = 0;
  for (let i = 0; i < d.length; i++) {
    const a = Math.abs(d[i]);
    if (a > peak) peak = a;
    if (a >= 0.999) clip += 1;
    sum += d[i] * d[i];
  }
  const db = (x) => (x > 0 ? 20 * Math.log10(x) : -120);
  const win = buf.sampleRate;
  const secs = [];
  for (let s = 0; s + win <= d.length; s += win) {
    let e = 0;
    for (let i = s; i < s + win; i++) e += d[i] * d[i];
    secs.push(db(Math.sqrt(e / win)));
  }
  return { peakDb: db(peak), rmsDb: db(Math.sqrt(sum / d.length)), clip, secs };
}

async function render(name, seconds, script, seed = 7) {
  const sr = 44100;
  const ac = new OfflineAudioContext(2, sr * seconds, sr);
  const eng = createEngine(ac, { rng: seeded(seed) });
  script(eng);
  const buf = await ac.startRendering();
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, name + '.wav'), wav(buf));
  const a = analyze(buf);
  console.log(
    `${name.padEnd(7)} ${String(seconds).padStart(3)}s  peak ${a.peakDb.toFixed(1)} dBFS  rms ${a.rmsDb.toFixed(1)} dBFS  clip ${a.clip}  ` +
      `min1s ${Math.min(...a.secs).toFixed(1)}  max1s ${Math.max(...a.secs).toFixed(1)}`,
  );
  return a;
}

const results = {};
results.calm = await render('calm', 60, (e) => e.scheduleUntil(60, 0));
results.battle = await render('battle', 26, (e) => {
  e.startBattle(0.2);
  e.scheduleUntil(22, 0);
  e.stopBattle(22);
});
results.demo = await render('demo', 52, (e) => {
  e.scheduleUntil(14, 0); // tenang
  e.sfx.whoosh(14, 0.6); // dash meluncur
  e.startBattle(14.1);
  e.scheduleUntil(14.1, 0);
  e.sfx.impact(14.75);
  e.scheduleUntil(34, 14); // tempur
  e.stopBattle(34);
  e.scheduleUntil(52, 34); // tenang kembali
});
console.log(`WAV di ${outDir}`);
if (process.env.JSON) console.log(JSON.stringify(results));
