/**
 * Stage: ukuran persis manifest, background, skala contain + letterbox,
 * konversi koordinat stage -> layar untuk lapisan UI.
 */
export function createStage(manifest) {
  const stage = document.getElementById('stage');
  const bg = document.getElementById('bg');
  const viewport = document.getElementById('viewport');
  const ui = document.getElementById('ui-layer');
  const W = manifest.stage.width;
  const H = manifest.stage.height;

  stage.style.width = W + 'px';
  stage.style.height = H + 'px';
  bg.setAttribute('src', '/assets/' + manifest.background);
  bg.style.width = W + 'px';
  bg.style.height = H + 'px';

  const view = { scale: 1, ox: 0, oy: 0 };

  function fit() {
    const r = viewport.getBoundingClientRect();
    const s = Math.min(r.width / W, r.height / H);
    const ox = (r.width - W * s) / 2;
    const oy = (r.height - H * s) / 2;
    view.scale = s;
    view.ox = ox;
    view.oy = oy;
    stage.style.transform = `translate(${ox}px, ${oy}px) scale(${s})`;
  }
  window.addEventListener('resize', fit);
  fit();

  return {
    W,
    H,
    manifest,
    /** stage {x,y} -> layar relatif viewport */
    toScreen(x, y) {
      return { x: view.ox + x * view.scale, y: view.oy + y * view.scale };
    },
    get scale() {
      return view.scale;
    },
    get stageEl() {
      return stage;
    },
    get uiEl() {
      return ui;
    },
    /** Area jalan dalam piksel stage */
    walkArea() {
      const w = manifest.layout.walkArea;
      return { xMin: w.xMin * W, xMax: w.xMax * W, yMin: w.yMin * H, yMax: w.yMax * H };
    },
    /** Kursi bos dalam piksel stage */
    bossSeat() {
      return { x: manifest.layout.bossSeat.x * W, y: manifest.layout.bossSeat.y * H };
    },
  };
}
