/**
 * Panel LP Watcher: total + posisi (out-of-range dulu) + range bar.
 */
import { usd, signedUsd, price } from '../format.js';

/**
 * @param {HTMLElement} body
 * @param {any} snap
 * @param {{ t: Function, el: Function }} h
 */
export function renderLpwatcher(body, snap, h) {
  const m = snap.metrics;
  const t = m.totals;
  const kpi = h.el('div', 'kpi');
  kpi.appendChild(cell(h, 'Nilai', usd(t.valueUsd)));
  kpi.appendChild(cell(h, 'Fee', usd(t.feesEarnedUsd)));
  const pnl = h.el('div', 'cell');
  const pv = h.el('div', 'v ' + (t.unrealizedPnlUsd >= 0 ? 'pos' : 'neg'));
  pv.textContent = signedUsd(t.unrealizedPnlUsd);
  const pl = h.el('div', 'l');
  pl.textContent = 'PnL belum terealisasi';
  pnl.appendChild(pv);
  pnl.appendChild(pl);
  kpi.appendChild(pnl);
  kpi.appendChild(cell(h, 'Range', `In ${t.positionsInRange} / Out ${t.positionsOutOfRange}`));
  body.appendChild(kpi);

  const w = h.el('div', 'row');
  const wl = h.el('span', 'muted');
  wl.textContent = 'Wallet';
  const wv = h.el('span');
  wv.textContent = m.wallet;
  w.appendChild(wl);
  w.appendChild(wv);
  body.appendChild(w);

  body.appendChild(h.t('h3', `Posisi (${m.positions.length})`));
  const sorted = [...m.positions].sort((a, b) => Number(a.inRange) - Number(b.inRange));
  for (const p of sorted) {
    // Baris ringkas dua baris: baris 1 nama + chip, baris 2 range bar + metrik sebaris.
    const card = h.el('div', 'crow');
    const top = h.el('div', 'crow-top');
    const nm = h.el('strong');
    nm.textContent = `${p.pair} · ${p.protocol}`;
    const st = h.el('span', 'chip ' + (p.inRange ? 'chip-green' : 'chip-amber'));
    st.textContent = p.inRange ? 'in range' : 'OUT';
    top.appendChild(nm);
    top.appendChild(st);
    card.appendChild(top);
    // Range bar: posisi price di antara low..high (clamp 0-100)
    const bar = h.el('div', 'rangebar' + (p.inRange ? '' : ' out'));
    const span = p.rangeHigh - p.rangeLow;
    const frac = span > 0 ? Math.max(0, Math.min(1, (p.price - p.rangeLow) / span)) : 0.5;
    const fill = h.el('div', 'fill');
    fill.style.left = '0%';
    fill.style.width = Math.round(frac * 100) + '%';
    const mark = h.el('div', 'mark');
    mark.style.left = `calc(${Math.round(frac * 100)}% - 1px)`;
    bar.appendChild(fill);
    bar.appendChild(mark);
    card.appendChild(bar);
    const det = h.el('div', 'crow-sub');
    det.textContent = `${price(p.rangeLow)}..${price(p.rangeHigh)} · @${price(p.price)} · ${usd(p.valueUsd)} · fee ${usd(p.feesEarnedUsd)} · IL ${p.ilPct}% · `;
    const pnlS = h.el('span', p.unrealizedPnlUsd >= 0 ? 'pos' : 'neg');
    pnlS.textContent = signedUsd(p.unrealizedPnlUsd);
    det.appendChild(pnlS);
    card.appendChild(det);
    body.appendChild(card);
  }
}

function cell(h, label, value) {
  const c = h.el('div', 'cell');
  const v = h.el('div', 'v');
  v.textContent = value;
  const l = h.el('div', 'l');
  l.textContent = label;
  c.appendChild(v);
  c.appendChild(l);
  return c;
}
