// Efek untuk gambar dojo 1376×768 dari lampiran dojo-animasi.html.
const W = 1376;
const H = 768;

// ---- Koordinat area (piksel pada gambar asli 1376x768) ----
const WINDOW = { x: 792, y: 207, w: 238, h: 188 };
// Hanya area plot di dalam layar; teks, sumbu, dan bingkai asli tetap terlihat
const MON = {
  top:   { x: 653, y: 353, w: 67, h: 41 },
  left:  { x: 598, y: 427, w: 27, h: 38 },
  mid:   { x: 653, y: 422, w: 57, h: 41 },
  right: { x: 758, y: 435, w: 66, h: 33 },
};
const MOON = { x: 978, y: 240 };
const LANTERNS = [[88, 88], [355, 70], [530, 105], [425, 145], [953, 88], [1066, 65], [1027, 150], [1293, 115]];
const ARM = { x: 1202, y: 462, w: 16, h: 28 }; // lengan kanan kucing yang terangkat

export function createDojoAnimation(canvas, img) {
  if (!canvas) return () => {};
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) return () => {};
  ctx.imageSmoothingEnabled = false;
  const motion = window.matchMedia?.('(prefers-reduced-motion: reduce)');

  const rnd = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // ---- Data chart (random walk) ----
  function walk(n, start = 0.5) {
    const a = [start];
    for (let i = 1; i < n; i++) a.push(clamp(a[i - 1] + rnd(-0.09, 0.09), 0.08, 0.92));
    return a;
  }
  function nextCandle(st) {
    const o = st.last, c = clamp(o + rnd(-0.12, 0.12), 0.1, 0.9);
    st.last = c;
    return { o, c, h: Math.min(1, Math.max(o, c) + rnd(0, 0.025)), l: Math.max(0, Math.min(o, c) - rnd(0, 0.025)) };
  }
  function makeCandles(n) {
    const st = { last: 0.5 };
    return { st, arr: Array.from({ length: n }, () => nextCandle(st)) };
  }
  const candA = makeCandles(13), candB = makeCandles(14);
  const line1 = walk(33, 0.2);
  const bars = Array.from({ length: 6 }, () => rnd(0.2, 0.9));
  let lastTick = 0;

  function tick() {
    [candA, candB].forEach(c => { c.arr.push(nextCandle(c.st)); c.arr.shift(); });
    line1.push(clamp(line1[line1.length - 1] + rnd(-0.07, 0.09), 0.08, 0.92)); line1.shift();
    for (let i = 0; i < bars.length; i++) bars[i] = clamp(bars[i] + rnd(-0.25, 0.25), 0.15, 1);
  }

  const C_BG = "#853619", C_UP = "#ffc97a", C_DN = "#d9822e", C_LN = "#ffd28a";

  function screen(r) {
    ctx.fillStyle = C_BG;
    ctx.fillRect(r.x, r.y, r.w, r.h);
  }
  function drawCandles(r, arr, step, bw) {
    screen(r);
    const lo = Math.min(...arr.map(k => k.l)), hi = Math.max(...arr.map(k => k.h)), sp = Math.max(0.2, hi - lo);
    const y = v => Math.round(r.y + r.h - 2 - (v - lo) / sp * (r.h - 4));
    arr.forEach((k, i) => {
      const x = r.x + 1 + i * step;
      ctx.fillStyle = k.c >= k.o ? C_UP : C_DN;
      ctx.fillRect(x + Math.floor(bw / 2), y(k.h), 1, y(k.l) - y(k.h) + 1);
      ctx.fillRect(x, y(Math.max(k.o, k.c)), bw, Math.max(3, Math.abs(y(k.o) - y(k.c))));
    });
  }
  function drawBars(r) {
    screen(r);
    const step = Math.floor(r.w / bars.length);
    ctx.fillStyle = C_UP;
    bars.forEach((v, i) => {
      const h = Math.round(v * (r.h - 2));
      ctx.fillRect(r.x + 1 + i * step, r.y + r.h - h, 2, h);
    });
  }
  function drawLine(r, data) {
    screen(r);
    const lo = Math.min(...data), hi = Math.max(...data), sp = Math.max(0.2, hi - lo);
    const y = v => Math.round(r.y + r.h - 3 - (v - lo) / sp * (r.h - 6));
    const step = (r.w - 2) / (data.length - 1);
    ctx.fillStyle = C_LN;
    let yp = null;
    for (let px = 0; px < r.w - 2; px += 2) {
      const f = px / step, i = Math.min(data.length - 2, Math.floor(f)), u = f - i;
      const yy = y(data[i] + (data[i + 1] - data[i]) * u);
      const a = yp === null ? yy : yp;
      ctx.fillRect(r.x + 1 + px, Math.min(a, yy), 2, Math.abs(yy - a) + 2);
      yp = yy;
    }
    ctx.globalAlpha = 0.18;
    ctx.fillRect(r.x + 3, y(data[data.length - 1]), r.w - 6, 1); // garis harga terakhir
    ctx.globalAlpha = 1;
  }

  // ---- Kelopak sakura ----
  const petals = Array.from({ length: 30 }, () => spawn(true));
  function spawn(init) {
    return {
      x: WINDOW.x + rnd(-20, WINDOW.w),
      y: init ? WINDOW.y + rnd(0, WINDOW.h) : WINDOW.y - 6,
      vy: rnd(14, 30), sw: rnd(10, 22), ph: rnd(0, 6.28),
      big: Math.random() < 0.35,
    };
  }
  const stars = Array.from({ length: 16 }, () => ({
    x: Math.round(WINDOW.x + rnd(6, WINDOW.w - 6)),
    y: Math.round(WINDOW.y + rnd(6, 110)),
    ph: rnd(0, 6.28),
  }));

  function glow(x, y, r, color, a) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(${color},${a})`);
    g.addColorStop(1, `rgba(${color},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }

  let prev = null;
  let lastFrame = -1;
  return function drawFrame(ms) {
    if (motion?.matches || !img.complete || img.naturalWidth !== W || img.naturalHeight !== H) return;
    const frame = Math.floor(ms * 30 / 1000);
    if (frame === lastFrame) return;
    lastFrame = frame;
    const t = ms / 1000;
    const dt = prev === null ? 0 : Math.min(0.05, t - prev);
    prev = t;
    ctx.globalCompositeOperation = "source-over";
    ctx.drawImage(img, 0, 0, W, H);

    // Monitor
    if (t - lastTick > 0.55) { tick(); lastTick = t; }
    drawCandles(MON.top, candA.arr, 5, 3);
    drawBars(MON.left);
    drawCandles(MON.mid, candB.arr, 4, 3);
    drawLine(MON.right, line1);

    // Jendela: bintang, bulan, sakura
    ctx.save();
    ctx.beginPath(); ctx.rect(WINDOW.x, WINDOW.y, WINDOW.w, WINDOW.h); ctx.clip();
    stars.forEach(s => {
      ctx.fillStyle = `rgba(255,255,230,${0.25 + 0.75 * Math.abs(Math.sin(t * 1.6 + s.ph))})`;
      ctx.fillRect(s.x, s.y, 2, 2);
    });
    ctx.globalCompositeOperation = "lighter";
    glow(MOON.x, MOON.y, 70, "170,190,255", 0.16 + 0.06 * Math.sin(t * 1.2));
    ctx.globalCompositeOperation = "source-over";
    petals.forEach((p, i) => {
      p.y += p.vy * dt;
      p.x += (10 + Math.sin(t * 0.9 + p.ph) * p.sw) * dt;
      if (p.y > WINDOW.y + WINDOW.h || p.x > WINDOW.x + WINDOW.w + 10) petals[i] = spawn(false);
      const px = Math.round(p.x), py = Math.round(p.y);
      ctx.fillStyle = p.big ? "#f6bfd6" : "#e98fb5";
      ctx.fillRect(px, py, p.big ? 4 : 3, 3);
      ctx.fillStyle = "#fbe0ec";
      ctx.fillRect(px, py, 2, 1);
    });
    ctx.restore();

    // Lampion berkedip
    ctx.globalCompositeOperation = "lighter";
    LANTERNS.forEach(([x, y], i) => {
      const f = 0.10 + 0.04 * Math.sin(t * 3 + i * 1.7) + 0.02 * Math.sin(t * 11 + i);
      glow(x, y, 80, "255,170,70", f);
    });
    ctx.globalCompositeOperation = "source-over";

    // Maneki-neko melambai (bergerak patah-patah ala pixel art)
    // Tutup lengan asli dengan latar di sebelah kanannya, lalu gambar lengan naik-turun
    ctx.drawImage(img, 1218, 461, 8, 29, 1202, 461, 8, 29);
    ctx.drawImage(img, 1218, 461, 8, 29, 1210, 461, 8, 29);
    const dy = Math.round(Math.sin(t * 4.5) * 2.5 - 1.5); // -4..+1 px, patah-patah
    ctx.save();
    ctx.translate(ARM.x + 8, ARM.y + ARM.h);
    ctx.rotate(dy * 0.03);
    ctx.drawImage(img, ARM.x, ARM.y, ARM.w, ARM.h, -8, -ARM.h + dy, ARM.w, ARM.h);
    ctx.restore();
    ctx.globalCompositeOperation = "lighter";
    glow(1180, 517, 22, "255,200,80", 0.10 + 0.08 * Math.sin(t * 2.5)); // koin emas
    ctx.globalCompositeOperation = "source-over";
    if (canvas.hidden) canvas.hidden = false;
  };
}
