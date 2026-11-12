/**
 * Panel Bot Alert: statistik scan, filter, kartu kandidat + tautan pasar.
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
  const fdvFilter = f.fdvFilterEnabled === false ? 'FDV: nonaktif' : f.maxFdvUsd > 0 ? `FDV ≤ $${num(f.maxFdvUsd)}` : 'FDV: tidak tersedia';
  fc.textContent = `Likuiditas ≥ $${num(f.minLiquidityUsd)} · Vol 24j ≥ $${num(f.minVolume24hUsd)} · ${fdvFilter} · umur ≥ ${f.minAgeHours} jam`;
  body.appendChild(fc);

  body.appendChild(h.t('h3', `Kandidat (${m.candidates.length})`));
  const sorted = [...m.candidates].sort((a, b) => b.score - a.score);
  for (const c of sorted) {
    const card = h.el('div', 'card alert-candidate');
    const head = h.el('div', 'candidate-head');
    const nm = h.el('strong');
    nm.textContent = c.pair?.trim() || c.symbol || 'Token';
    const badge = h.el('span', 'chip ' + (c.score >= 75 ? 'chip-green' : 'chip-gray'));
    badge.textContent = `skor ${c.score}`;
    head.appendChild(nm);
    head.appendChild(badge);
    card.appendChild(head);
    const metrics = h.el('dl', 'candidate-metrics');
    for (const [label, value, full] of [
      ['Likuiditas', compactUsd(c.liquidityUsd), c.liquidityUsd],
      ['Volume 24j', compactUsd(c.volume24hUsd), c.volume24hUsd],
      ['FDV', compactUsd(c.fdvUsd), c.fdvUsd],
      ['Harga', Number.isFinite(c.priceUsd) ? `$${price(c.priceUsd)}` : '—'],
      ['APR fee (estimasi)', Number.isFinite(c.estFeeAprPct) ? `${num(Math.round(c.estFeeAprPct * 100) / 100)}%` : '—'],
    ]) {
      const item = h.el('div');
      item.appendChild(h.t('dt', label));
      const amount = h.t('dd', value);
      if (Number.isFinite(full)) amount.title = `$${num(full)}`;
      item.appendChild(amount);
      metrics.appendChild(item);
    }
    card.appendChild(metrics);
    if (c.reasons && c.reasons.length) {
      const rs = h.el('div', 'candidate-reasons');
      rs.textContent = 'Alasan: ' + c.reasons.join('; ');
      card.appendChild(rs);
    }
    if (c.riskFlags && c.riskFlags.length) {
      const rk = h.el('div', 'neg candidate-risks');
      rk.textContent = 'Risiko: ' + c.riskFlags.join('; ');
      card.appendChild(rk);
    }
    const foot = h.el('div', 'candidate-foot');
    const age = h.el('span', 'muted');
    const isNew = Date.now() - new Date(c.foundAt).getTime() < 10 * 60000;
    age.textContent = `${rel(c.foundAt)}${isNew ? ' · BARU' : ''}`;
    const links = h.el('div', 'candidate-links');
    const validMint = typeof c.mint === 'string' && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(c.mint);
    for (const [name, icon, base] of [
      ['GMGN', 'gmgn', 'https://gmgn.ai/sol/token/'],
      ['Dexscreener', 'dexscreener', 'https://dexscreener.com/solana/'],
    ]) {
      const link = h.el(validMint ? 'a' : 'span', 'market-link');
      link.setAttribute('aria-label', `Buka ${c.symbol || 'token'} di ${name} (tab baru)`);
      link.title = validMint ? `Buka di ${name}` : `${name}: alamat mint belum tersedia`;
      if (validMint) {
        link.href = base + encodeURIComponent(c.mint);
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.addEventListener('click', (e) => e.stopPropagation());
      } else link.setAttribute('aria-disabled', 'true');
      const img = h.el('img');
      img.src = `/icons/${icon}.png`;
      img.alt = '';
      img.width = 22;
      img.height = 22;
      link.appendChild(img);
      links.appendChild(link);
    }
    foot.appendChild(age);
    foot.appendChild(links);
    card.appendChild(foot);
    body.appendChild(card);
  }
}

function compactUsd(value) {
  if (!Number.isFinite(value)) return '—';
  return '$' + new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 }).format(value);
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
