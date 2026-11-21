/**
 * Gerak jelajah: posisi awal + target acak (hindari bos + agen lain).
 */
import { walkBand, blockedRect, isFree } from './path-logic.js';

/**
 * @param {string} id
 * @param {number} W lebar stage
 * @param {number} H tinggi stage
 */
export function homeFor(id, W, H) {
  const frac = { kawaraban: 0.08, exitbot: 0.18, portfolio: 0.36, alert: 0.64, lpwatcher: 0.82, bravonoid: 0.92 };
  return { x: (frac[id] ?? 0.5) * W, y: 0.9 * H };
}

/**
 * Target kaki acak di walkArea: di luar zona eksklusi bos dan
 * min 120 px dari target agen lain.
 * @param {{ xMin: number, xMax: number, yMin: number, yMax: number }} area
 * @param {{ x: number, y: number }} seat kursi bos
 * @param {() => { x: number, y: number }[]} peers target/posisi agen lain
 * @param {{ x: number, y: number }} home fallback
 * @param {() => number} [rng=Math.random]
 */
export function pickWanderTarget(area, seat, peers, home, rng = Math.random) {
  const band = walkBand(area, seat);
  const rect = blockedRect(seat);
  for (let i = 0; i < 12; i++) {
    const x = band.xMin + rng() * (band.xMax - band.xMin);
    const y = band.yMin + rng() * (band.yMax - band.yMin);
    if (!isFree({ x, y }, rect)) continue;
    let ok = true;
    for (const t of peers()) {
      if (t && t.x !== undefined && Math.hypot(t.x - x, t.y - y) < 120) {
        ok = false;
        break;
      }
    }
    if (ok) return { x, y };
  }
  return { x: home.x, y: home.y };
}
