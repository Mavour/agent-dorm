/**
 * Panel LP Watcher: total + posisi (out-of-range dulu) + range bar.
 */
import { usd, signedUsd, price, rel } from '../format.js';

/**
 * @param {HTMLElement} body
 * @param {any} snap
 * @param {{ t: Function, el: Function }} h
 */
export function renderLpwatcher(body, snap, h) {
  body.classList.add('lpwatcher-panel');
  const m = snap.metrics;
  const t = m.totals;
  const complete = m.totalsComplete || {};
  const estimatedFees = m.feesBasis === 'estimated-unclaimed-only';
  const value = complete.valueUsd === false && t.valueUsd === 0 ? null : t.valueUsd;
  const fees = estimatedFees && complete.feesEarnedUsd === false && !m.positions.some(p => Number.isFinite(p.feesEarnedUsd)) ? null : t.feesEarnedUsd;
  const pnlValue = complete.unrealizedPnlUsd === false ? null : t.unrealizedPnlUsd;
  const kpi = h.el('div', 'kpi');
  kpi.appendChild(cell(h, complete.valueUsd === false ? 'Subtotal nilai diketahui' : estimatedFees ? 'Nilai termasuk fee' : 'Nilai', usd(value)));
  kpi.appendChild(cell(h, estimatedFees ? 'Fee belum diklaim (estimasi)' : 'Fee', usd(fees)));
  const pnl = h.el('div', 'cell');
  const pv = h.el('div', 'v ' + (Number.isFinite(pnlValue) ? pnlValue >= 0 ? 'pos' : 'neg' : 'muted'));
  pv.textContent = Number.isFinite(pnlValue) ? signedUsd(pnlValue) : 'Belum tersedia';
  const pl = h.el('div', 'l');
  pl.textContent = 'PnL belum terealisasi';
  pnl.appendChild(pv);
  pnl.appendChild(pl);
  kpi.appendChild(pnl);
  const unknownRanges = m.positions.filter(p => p.inRange !== true && p.inRange !== false).length;
  kpi.appendChild(cell(h, 'Range', `In ${t.positionsInRange} / Out ${t.positionsOutOfRange}${unknownRanges ? ` / ? ${unknownRanges}` : ''}`));
  body.appendChild(kpi);
  if (complete.positions === false) body.appendChild(h.t('p', 'Sebagian wallet/protokol belum selesai dipindai atau datanya tertunda. Nilai dan jumlah posisi yang tampil masih subtotal.', 'muted'));
  if (estimatedFees) body.appendChild(h.t('p', 'Fee adalah estimasi yang belum diklaim. PnL dan IL menunggu riwayat modal yang terverifikasi.', 'muted'));

  const w = h.el('div', 'row');
  const wl = h.el('span', 'muted');
  wl.textContent = 'Wallet';
  const wv = h.el('span');
  wv.textContent = m.wallet;
  w.appendChild(wl);
  w.appendChild(wv);
  body.appendChild(w);
  for (const wallet of m.wallets || []) {
    const row = h.el('div', 'card');
    row.appendChild(h.t('strong', `${wallet.label} · ${shortAddress(wallet.address)}`));
    const protocols = h.el('div', 'crow-sub');
    protocols.textContent = (wallet.protocols || []).map(p => `${p.protocol.toUpperCase()}: ${p.stale ? 'tertunda' : 'sinkron'}${p.updatedAt ? ' · ' + rel(p.updatedAt) : ' · belum dipindai'}`).join(' | ');
    row.appendChild(protocols);
    body.appendChild(row);
  }

  body.appendChild(h.t('h3', `Posisi (${m.positions.length})`));
  const order = p => p.inRange === false ? 0 : p.inRange === true ? 2 : 1;
  const sorted = [...m.positions].sort((a, b) => order(a) - order(b));
  for (const p of sorted) {
    // Baris ringkas dua baris: baris 1 nama + chip, baris 2 range bar + metrik sebaris.
    const card = h.el('div', 'crow');
    const top = h.el('div', 'crow-top');
    const nm = h.el('strong');
    nm.textContent = `${p.pair} · ${p.protocol}`;
    const st = h.el('span', 'chip ' + (p.inRange === true ? 'chip-green' : p.inRange === false ? 'chip-amber' : 'chip-gray'));
    st.textContent = p.inRange === true ? 'in range' : p.inRange === false ? 'OUT' : 'Range belum diketahui';
    top.appendChild(nm);
    top.appendChild(st);
    card.appendChild(top);
    if (p.walletAddress) card.appendChild(h.t('div', `Wallet: ${shortAddress(p.walletAddress)}`, 'crow-sub'));
    if (p.stale) card.appendChild(h.t('div', `Data tertunda${p.updatedAt ? ' · ' + rel(p.updatedAt) : ''}`, 'muted'));
    // Range bar: posisi price di antara low..high (clamp 0-100)
    if ([p.rangeLow, p.rangeHigh, p.price].every(Number.isFinite) && p.rangeHigh > p.rangeLow) {
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
    } else card.appendChild(h.t('div', 'Rentang/harga belum tersedia', 'muted'));
    const det = h.el('div', 'crow-sub');
    det.textContent = `${price(p.rangeLow)}..${price(p.rangeHigh)} · @${price(p.price)} · ${usd(p.valueUsd)} · fee${p.feesEstimated ? ' estimasi' : ''} ${usd(p.feesEarnedUsd)} · IL ${Number.isFinite(p.ilPct) ? p.ilPct + '%' : 'belum tersedia'} · `;
    const pnlS = h.el('span', Number.isFinite(p.unrealizedPnlUsd) ? p.unrealizedPnlUsd >= 0 ? 'pos' : 'neg' : 'muted');
    pnlS.textContent = Number.isFinite(p.unrealizedPnlUsd) ? signedUsd(p.unrealizedPnlUsd) : 'PnL belum tersedia';
    det.appendChild(pnlS);
    card.appendChild(det);
    body.appendChild(card);
  }
}

function shortAddress(address) {
  return typeof address === 'string' && address.length > 14 ? `${address.slice(0, 6)}…${address.slice(-4)}` : address || '-';
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
