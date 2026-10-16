/**
 * Logika jalur murni (tanpa DOM): walk band, zona eksklusi bos,
 * uji bebas dan perpotongan segmen, serta perencana waypoint.
 * Bisa diuji penuh dengan node:test.
 */

/**
 * Pita jalan: kaki selalu di depan bos.
 * yMin = seat.y + 28, yMax tidak berubah, x tidak berubah.
 * @param {{ xMin: number, xMax: number, yMin: number, yMax: number }} area
 * @param {{ x: number, y: number }} seat
 */
export function walkBand(area, seat) {
  return { xMin: area.xMin, xMax: area.xMax, yMin: seat.y + 28, yMax: area.yMax };
}

/**
 * Kotak terlarang bos: x di [seat.x-170, seat.x+170],
 * y dari atas stage (0) sampai seat.y + 60.
 * @param {{ x: number, y: number }} seat
 */
export function blockedRect(seat) {
  return { x0: seat.x - 170, x1: seat.x + 170, y0: 0, y1: seat.y + 60 };
}

/**
 * Titik bebas dari rect (dengan margin)? Batas dianggap bebas.
 * @param {{ x: number, y: number }} p
 * @param {{ x0: number, x1: number, y0: number, y1: number }} rect
 * @param {number} [margin=14]
 */
export function isFree(p, rect, margin = 14) {
  if (!p || !rect) return false;
  const X0 = rect.x0 - margin;
  const X1 = rect.x1 + margin;
  const Y0 = rect.y0 - margin;
  const Y1 = rect.y1 + margin;
  if (p.x <= X0 || p.x >= X1 || p.y <= Y0 || p.y >= Y1) return true;
  return false;
}

/**
 * Apakah segmen a->b menembus interior rect (dengan margin)?
 * Sentuhan tepi (grazing) tidak dihitung menembus.
 * @param {{ x: number, y: number }} a
 * @param {{ x: number, y: number }} b
 * @param {{ x0: number, x1: number, y0: number, y1: number }} rect
 * @param {number} [margin=14]
 */
export function segmentIntersectsRect(a, b, rect, margin = 14) {
  const X0 = rect.x0 - margin;
  const X1 = rect.x1 + margin;
  const Y0 = rect.y0 - margin;
  const Y1 = rect.y1 + margin;
  const insideStrict = (p) => p.x > X0 && p.x < X1 && p.y > Y0 && p.y < Y1;
  // Ujung di dalam interior -> menembus.
  if (insideStrict(a) || insideStrict(b)) return true;
  // Liang-Barsky untuk rect tertutup, lalu cek titik tengah.
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  let t0 = 0;
  let t1 = 1;
  const p = [-dx, dx, -dy, dy];
  const q = [a.x - X0, X1 - a.x, a.y - Y0, Y1 - a.y];
  for (let i = 0; i < 4; i++) {
    if (Math.abs(p[i]) < 1e-12) {
      if (q[i] < 0) return false;
    } else {
      const r = q[i] / p[i];
      if (p[i] < 0) {
        if (r > t1) return false;
        if (r > t0) t0 = r;
      } else {
        if (r < t0) return false;
        if (r < t1) t1 = r;
      }
    }
  }
  if (t0 > t1) return false;
  // Interval hanya satu titik sentuh -> tidak menembus.
  // Segmen di tepat batas (kolinear) -> titik tengah di batas -> bebas.
  const tm = (t0 + t1) / 2;
  const mx = a.x + dx * tm;
  const my = a.y + dy * tm;
  return mx > X0 && mx < X1 && my > Y0 && my < Y1;
}

/**
 * Jarak euclid.
 * @param {{ x: number, y: number }} a
 * @param {{ x: number, y: number }} b
 */
function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * Rencana waypoint dari `from` ke `to` menghindari rect.
 * Bila segmen lurus bebas -> [to]. Bila menembus -> rute BAWAH rect
 * lewat kedua sudut bawah ((x0-m, y1+m) dan (x1+m, y1+m)),
 * masuk dari sudut terdekat start, pilih rute terpendek.
 * Semua waypoint dijepit ke dalam band bila band diberikan.
 * @param {{ x: number, y: number }} from
 * @param {{ x: number, y: number }} to
 * @param {{ x0: number, x1: number, y0: number, y1: number }} rect
 * @param {{ xMin: number, xMax: number, yMin: number, yMax: number }|null} [band=null]
 * @param {number} [margin=14]
 * @returns {{ x: number, y: number }[]}
 */
export function planPath(from, to, rect, band = null, margin = 14) {
  const dst = { x: to.x, y: to.y };
  if (!segmentIntersectsRect(from, dst, rect, margin)) return [dst];
  const yB = rect.y1 + margin;
  let L = { x: rect.x0 - margin, y: yB };
  let R = { x: rect.x1 + margin, y: yB };
  if (band) {
    const cx = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
    L = { x: cx(L.x, band.xMin, band.xMax), y: cx(L.y, band.yMin, band.yMax) };
    R = { x: cx(R.x, band.xMin, band.xMax), y: cx(R.y, band.yMin, band.yMax) };
  }
  const routeLR = [L, R, dst];
  const routeRL = [R, L, dst];
  const len = (route) => {
    let s = dist(from, route[0]);
    for (let i = 1; i < route.length; i++) s += dist(route[i - 1], route[i]);
    return s;
  };
  // Preferensi: masuk dari sudut terdekat start; bila seri, pilih terpendek.
  const dL = dist(from, L);
  const dR = dist(from, R);
  let first;
  if (Math.abs(dL - dR) < 1e-9) {
    first = len(routeLR) <= len(routeRL) ? routeLR : routeRL;
  } else if (dL < dR) {
    first = routeLR;
  } else {
    first = routeRL;
  }
  // Pastikan rute terpilih benar-benar bebas; bila tidak, coba lawannya.
  const segsFree = (route) => {
    let prev = from;
    for (const w of route) {
      if (segmentIntersectsRect(prev, w, rect, margin)) return false;
      prev = w;
    }
    return true;
  };
  if (segsFree(first)) return first.map((w) => ({ x: w.x, y: w.y }));
  const other = first === routeLR ? routeRL : routeLR;
  if (segsFree(other)) return other.map((w) => ({ x: w.x, y: w.y }));
  // Fallback: kembalikan yang terpendek (tetap di bawah rect).
  const best = len(routeLR) <= len(routeRL) ? routeLR : routeRL;
  return best.map((w) => ({ x: w.x, y: w.y }));
}
