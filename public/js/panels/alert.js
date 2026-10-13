/**
 * Panel Bot Alert: statistik scan, filter, kartu kandidat + tombol salin mint.
 */
import { num, price, rel } from '../format.js';

/**
 * @param {HTMLElement} body
 * @param {any} snap
 * @param {{ t: Function, el: Function }} h
 */
export function renderAlert(body, snap, h) {
  const m = snap.metrics;
  const kpi = h.el('div', 'kpi');
  kpi.appendChild(cell(h, 'Terakhir scan', rel(m.lastScanAt)));
  kpi.appendChild(cell(h, 'Di-scan hari ini', num(m.scannedToday)));
  kpi.appendChild(cell(h, 'Lolos filter', num(m.passedFilters)));
  body.appendChild(kpi);

  body.appendChild(h.t('h3', 'Filter aktif'));
  const f = m.filters;
  const fc = h.el('div', 'card');
  fc.textContent = `Likuiditas ≥ $${num(f.minLiquidityUsd)} · Vol 24j ≥ $${num(f.minVolume24hUsd)} · FDV ≤ $${num(f.maxFdvUsd)} · umur ≥ ${f.minAgeHours} jam`;
  body.appendChild(fc);

  body.appendChild(h.t('h3', `Kandidat (${m.candidates.length})`));
  const sorted = [...m.candidates].sort((a, b) => b.score - a.score);
  for (const c of sorted) {
    const card = h.el('div', 'card');
    const head = h.el('div', 'row');
    const nm = h.el('strong');
    nm.textContent = `${c.symbol} / ${c.pair}`;
    const badge = h.el('span', 'chip ' + (c.score >= 75 ? 'chip-green' : 'chip-gray'));
    badge.textContent = `skor ${c.score}`;
    head.appendChild(nm);
    head.appendChild(badge);
    card.appendChild(head);
    const chips = h.el('div', 'muted');
    chips.textContent = `Likuiditas $${num(c.liquidityUsd)} · Vol 24j $${num(c.volume24hUsd)} · FDV $${num(c.fdvUsd)} · APR ${c.estFeeAprPct}% · harga ${price(c.priceUsd)}`;
    card.appendChild(chips);
    if (c.reasons && c.reasons.length) {
      const rs = h.el('div');
      rs.textContent = 'Alasan: ' + c.reasons.join('; ');
      card.appendChild(rs);
    }
    if (c.riskFlags && c.riskFlags.length) {
      const rk = h.el('div', 'neg');
      rk.textContent = 'Risiko: ' + c.riskFlags.join('; ');
      card.appendChild(rk);
    }
    const foot = h.el('div', 'row');
    const age = h.el('span', 'muted');
    const isNew = Date.now() - new Date(c.foundAt).getTime() < 10 * 60000;
    age.textContent = `${rel(c.foundAt)}${isNew ? ' · BARU' : ''}`;
    const copy = h.el('button', 'copy');
    copy.textContent = 'Salin mint';
    copy.setAttribute('type', 'button');
    copy.addEventListener('click', async (e) => {
      e.stopPropagation();
      try {
        await navigator.clipboard.writeText(c.mint);
        copy.textContent = 'Tersalin!';
        setTimeout(() => {
          copy.textContent = 'Salin mint';
        }, 1500);
      } catch {
        copy.textContent = 'Gagal menyalin';
      }
    });
    foot.appendChild(age);
    foot.appendChild(copy);
    card.appendChild(foot);
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
