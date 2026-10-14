/**
 * Gerak jelajah: posisi awal + target acak (hindari bos + agen lain).
 */

/**
 * @param {string} id
 * @param {number} W lebar stage
 * @param {number} H tinggi stage
 */
export function homeFor(id, W, H) {
  const order = ['exitbot', 'portfolio', 'alert', 'lpwatcher'];
  const frac = [0.18, 0.36, 0.64, 0.82];
  return { x: frac[order.indexOf(id)] * W, y: 0.9 * H };
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
  for (let i = 0; i < 12; i++) {
    const x = area.xMin + rng() * (area.xMax - area.xMin);
    const y = area.yMin + rng() * (area.yMax - area.yMin);
    if (Math.abs(x - seat.x) < 150 && y > seat.y - 70 && y < seat.y + 40) continue;
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
