/**
 * Jangkar emote di samping kepala (bukan di atas, agar tak menutupi bubble).
 * measureHead memakai canvas (butuh DOM); placeIcon murni dan bisa diuji.
 */

const HEAD_TOP_FRac = 0.06; // pita kepala: baris 6%-40% tinggi sprite
const HEAD_BOT_FRac = 0.4;
const ALPHA_MIN = 40;
const ICON_GAP = 6; // px antara siluet kepala dan ikon

/**
 * Ukur siluet kepala dari sprite: gambar ke canvas offscreen seukuran
 * tampil, pindai alfa > 40 di pita kepala.
 * @param {string} src URL sprite (same-origin)
 * @param {number} w lebar tampil (px stage)
 * @param {number} h tinggi tampil (px stage)
 * @returns {Promise<{ left: number, right: number }>} tepi kepala (px dari kiri sprite)
 */
export function measureHead(src, w, h) {
  const fallback = { left: Math.round(w * 0.3), right: Math.round(w * 0.7) };
  return new Promise((resolve) => {
    try {
      const img = new Image();
      img.onload = () => {
        try {
          const cv = document.createElement('canvas');
          cv.width = Math.max(1, Math.round(w));
          cv.height = Math.max(1, Math.round(h));
          const cx = cv.getContext('2d', { willReadFrequently: true });
          if (!cx) return resolve(fallback);
          cx.clearRect(0, 0, cv.width, cv.height);
          cx.drawImage(img, 0, 0, cv.width, cv.height);
          const y0 = Math.floor(h * HEAD_TOP_FRac);
          const y1 = Math.min(cv.height - 1, Math.floor(h * HEAD_BOT_FRac));
          const data = cx.getImageData(0, y0, cv.width, Math.max(1, y1 - y0 + 1)).data;
          let left = cv.width;
          let right = -1;
          const bw = cv.width;
          const rows = Math.max(1, y1 - y0 + 1);
          for (let y = 0; y < rows; y++) {
            for (let x = 0; x < bw; x++) {
              if (data[(y * bw + x) * 4 + 3] > ALPHA_MIN) {
                if (x < left) left = x;
                if (x > right) right = x;
              }
            }
          }
          if (right < 0) return resolve(fallback);
          resolve({ left, right });
        } catch {
          resolve(fallback);
        }
      };
      img.onerror = () => resolve(fallback);
      img.src = src;
    } catch {
      resolve(fallback);
    }
  });
}

/**
 * Hitung posisi ikon di samping kepala, tengah vertikal di 20% tinggi
 * sprite dari atas. Otomatis pindah sisi bila ikon keluar batas stage.
 * @param {{ spriteW: number, spriteH: number, headLeft: number, headRight: number, iconW: number, iconH: number, side: 'left'|'right', feetX: number, stageW: number }} p
 * @returns {{ left: number, bottom: number, side: 'left'|'right' }} left/bottom relatif .char (origin di kaki tengah)
 */
export function placeIcon(p) {
  const cyBottom = p.spriteH * 0.8 - p.iconH / 2;
  const rightLeft = -p.spriteW / 2 + p.headRight + ICON_GAP;
  const leftLeft = -p.spriteW / 2 + p.headLeft - ICON_GAP - p.iconW;
  let side = p.side;
  if (side === 'right') {
    if (p.feetX + rightLeft + p.iconW > p.stageW) side = 'left';
  } else if (p.feetX + leftLeft < 0) {
    side = 'right';
  }
  return { left: side === 'right' ? rightLeft : leftLeft, bottom: cyBottom, side };
}
