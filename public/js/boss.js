/**
 * Bos: duduk di bossSeat, ganti sprite sesuai state dari server,
 * bubble dari server; klik -> bubble acak sesuai situasi.
 */
export function createBoss(stage, store, bubbles, manifest) {
  const seat = stage.bossSeat();
  const size = manifest.boss.size;
  const [w, h] = size;
  const chars = document.getElementById('chars');
  const ui = stage.uiEl;

  const el = document.createElement('div');
  el.className = 'char';
  el.tabIndex = 0;
  el.setAttribute('role', 'button');
  el.setAttribute('aria-label', 'Bos (klik untuk sapaan)');

  const shadow = document.createElement('div');
  shadow.className = 'shadow';
  shadow.style.width = Math.round(w * 0.6) + 'px';
  shadow.style.left = Math.round(w * 0.2) + 'px';

  const img = document.createElement('img');
  img.className = 'sprite';
  img.style.width = w + 'px';
  img.style.height = h + 'px';
  img.style.left = Math.round(-w / 2) + 'px';
  img.setAttribute('alt', 'Bos');
  img.setAttribute('draggable', 'false');

  el.appendChild(shadow);
  el.appendChild(img);
  // Target klik transparan (sama seperti agen).
  const hit = document.createElement('div');
  hit.className = 'hit';
  hit.style.width = Math.round(w * 0.6) + 'px';
  hit.style.height = Math.round(h * 0.92) + 'px';
  hit.style.left = Math.round(-w * 0.3) + 'px';
  hit.style.bottom = '0px';
  hit.setAttribute('aria-hidden', 'true');
  el.appendChild(hit);
  chars.appendChild(el);

  const label = document.createElement('div');
  label.className = 'namelabel';
  const dot = document.createElement('span');
  dot.className = 'sdot';
  dot.style.background = '#4ade80';
  const nameT = document.createElement('span');
  nameT.textContent = manifest.boss.name || 'Bos';
  label.appendChild(dot);
  label.appendChild(nameT);
  ui.appendChild(label);

  /** @param {string} state */
  function setSprite(state) {
    const st = manifest.boss.states[state] || manifest.boss.states.idle;
    img.setAttribute('src', '/assets/' + st.file);
  }
  setSprite('idle');

  bubbles.register('boss', () => ({ x: seat.x, y: seat.y }), h);

  // Timer pengaman: kembali idle kalau tidak ada pesan bos baru dalam
  // durationMs + 1500 ms (pesan hilang / reconnect). seq mencegah replay
  // bubble lama dari snapshot_all.
  let lastSeq = 0;
  let safety = null;
  store.subscribe((kind, payload) => {
    if (kind === 'boss') {
      const b = payload.boss;
      setSprite(b.state);
      const seq = b.seq || 0;
      if (seq <= lastSeq) return;
      lastSeq = seq;
      if (b.bubble) bubbles.sayLatest('boss', b.bubble);
      if (safety) clearTimeout(safety);
      safety = setTimeout(() => setSprite('idle'), (b.durationMs || 6000) + 1500);
    }
  });

  const RELAXED = ['Santai... tapi tetap waspada.', 'Semua aman. Teh dulu.'];
  const WORRIED = ['Berhenti panik, cek datanya.', 'Fokus ke yang merah dulu.'];

  function clickSay() {
    const all = store.all();
    let critical = false;
    for (const s of Object.values(all)) {
      if ((s.alerts || []).some((a) => a.level === 'critical')) {
        critical = true;
        break;
      }
    }
    const arr = critical ? WORRIED : RELAXED;
    bubbles.say('boss', arr[Math.floor(Math.random() * arr.length)]);
  }

  el.addEventListener('click', (e) => {
    e.stopPropagation();
    clickSay();
  });
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      clickSay();
    }
  });

  function frame() {
    el.style.transform = `translate3d(${seat.x}px, ${seat.y}px, 0)`;
    el.style.zIndex = String(Math.round(seat.y));
    const p = stage.toScreen(seat.x, seat.y);
    label.style.left = p.x + 'px';
    label.style.top = p.y + 6 * stage.scale + 'px';
    label.style.fontSize = Math.max(10, 12 * Math.max(stage.scale, 0.5)) + 'px';
  }

  return { frame };
}
