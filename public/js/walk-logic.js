/**
 * Logika jalan murni (tanpa DOM): fase langkah, pose kaki/badan,
 * dan clip-path rig kaki. Dipakai walk-rig.js + agent.js. Bisa diuji penuh.
 */

// Langkah: 14 px tampil per langkah, jadi 35 px/dtk ~= 2,5 langkah/dtk.
export const STRIDE = 14;
// Kaki diperlihatkan OVERLAP px di atas bandTop agar tak ada celah
// saat badan mengayun ke atas (bodyBob maks 2 px).
export const FOOT_OVERLAP = 3;
// Amplitudo jalan merambat 0 -> 1 (mulai) atau 1 -> 0 (berhenti).
export const AMP_RAMP = 0.15; // detik

/**
 * Maju fase jalan sejauh jarak tempuh frame ini.
 * Satu langkah penuh (STRIDE px) = setengah siklus sinus (PI).
 * @param {number} phase fase berjalan (radian)
 * @param {number} distancePx jarak tempuh frame ini (px tampil)
 * @param {number} [stridePx=STRIDE] px tampil per langkah
 * @returns {number} fase baru
 */
export function advancePhase(phase, distancePx, stridePx = STRIDE) {
  return phase + (distancePx / stridePx) * Math.PI;
}

/**
 * Pose jalan pada fase tertentu (koordinat lokal menghadap kanan).
 * Kaki kiri/d Tender bergantian: hanya satu yang terangkat tiap saat.
 * @param {number} phase radian
 * @param {number} amp amplitudo 0 (pose dasar) .. 1 (jalan penuh)
 * @param {{ lift: number }} cfg lift = angkat kaki maks (px tampil)
 * @returns {{ leftLift: number, rightLift: number, leftShift: number, rightShift: number, bodyBob: number, lean: number }}
 */
export function walkPose(phase, amp, cfg) {
  const lift = cfg && typeof cfg.lift === 'number' ? cfg.lift : 7;
  if (!amp) return { leftLift: 0, rightLift: 0, leftShift: 0, rightShift: 0, bodyBob: 0, lean: 0 };
  const s = Math.sin(phase);
  const c = Math.cos(phase);
  return {
    leftLift: lift * Math.max(0, s) * amp,
    rightLift: lift * Math.max(0, -s) * amp,
    leftShift: 4 * c * amp,
    rightShift: -4 * c * amp,
    bodyBob: 2 * Math.abs(s) * amp,
    lean: (-1.6 + 0.8 * s) * amp,
  };
}

/**
 * Gabung persegi kaki yang bertumpang-tindih/sentuhan jadi satu.
 * @param {[[number, number]]} feet pasangan [x0, x1] per kaki
 * @returns {[[number, number]]} terurut kiri -> kanan
 */
export function mergeFootRects(feet) {
  const sorted = [...(feet || [])]
    .map(([a, b]) => [Math.min(a, b), Math.max(a, b)])
    .sort((p, q) => p[0] - q[0]);
  /** @type {[[number, number]]} */
  const out = [];
  for (const [x0, x1] of sorted) {
    const last = out[out.length - 1];
    if (last && x0 <= last[1]) last[1] = Math.max(last[1], x1);
    else out.push([x0, x1]);
  }
  return out;
}

/** Angka CSS: bulat bila bulat, else maks 2 desimal (tanpa derau float). */
function fmt(v) {
  if (Object.is(v, -0)) return '0';
  if (Number.isInteger(v)) return String(v);
  return String(Math.round(v * 100) / 100);
}

/**
 * Polygon badan: seluruh gambar KECUALI persegi kaki dari bandTop ke bawah.
 * Notch digambar dari kanan -> kiri di sepanjang tepi bawah.
 * @param {{ bandTop: number, feet: [[number, number]] }} rig dari manifest
 * @param {number} w lebar tampil gambar
 * @param {number} h tinggi tampil gambar
 * @returns {string} CSS polygon()
 */
export function bodyClipPolygon(rig, w, h) {
  const top = rig.bandTop;
  const rects = mergeFootRects(rig.feet).sort((a, b) => b[0] - a[0]); // kanan -> kiri
  const pts = [
    [0, 0],
    [w, 0],
    [w, h],
  ];
  for (const [x0, x1] of rects) {
    pts.push([x1, h], [x1, top], [x0, top], [x0, h]);
  }
  pts.push([0, h]);
  return `polygon(${pts.map(([x, y]) => `${fmt(x)}px ${fmt(y)}px`).join(', ')})`;
}

/**
 * Inset satu kaki: hanya persegi kaki itu, diperluas OVERLAP px
 * di atas bandTop agar selalu menutup di balik badan.
 * @param {[number, number]} rect [x0, x1] kaki ini
 * @param {{ bandTop: number }} rig dari manifest
 * @param {number} w lebar tampil gambar
 * @param {number} h tinggi tampil gambar (tak dipakai selain validasi)
 * @param {number} [overlap=FOOT_OVERLAP]
 * @returns {string} CSS inset()
 */
export function footInset(rect, rig, w, h, overlap = FOOT_OVERLAP) {
  const [x0, x1] = rect;
  void h;
  return `inset(${fmt(rig.bandTop - overlap)}px ${fmt(w - x1)}px 0px ${fmt(x0)}px)`;
}
