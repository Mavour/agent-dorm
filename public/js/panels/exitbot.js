/**
 * Panel ExitBot: KPI, mode, rules, pending, eksekusi terbaru.
 * Semua teks via textContent.
 */
import { signedUsd, rel } from '../format.js';

const REASON_ID = {
  take_profit: 'Take profit',
  stop_loss: 'Stop loss',
  out_of_range: 'Out of range',
  manual: 'Manual',
};

/**
 * @param {HTMLElement} body
 * @param {any} snap
 * @param {{ t: Function, el: Function }} h
 */
export function renderExitbot(body, snap, h) {
  const m = snap.metrics;
  const kpi = h.el('div', 'kpi');
  kpi.appendChild(cell(h, 'Ditutup hari ini', `${m.closedToday} (${m.closedProfitToday} profit / ${m.closedLossToday} rugi)`));
  const pnlCell = h.el('div', 'cell');
  const vv = h.el('div', 'v ' + (m.realizedPnlTodayUsd >= 0 ? 'pos' : 'neg'));
  vv.textContent = signedUsd(m.realizedPnlTodayUsd);
  const ll = h.el('div', 'l');
  ll.textContent = 'Realized PnL hari ini';
  pnlCell.appendChild(vv);
  pnlCell.appendChild(ll);
  kpi.appendChild(pnlCell);
  kpi.appendChild(cell(h, 'Posisi dipantau', String(m.monitoredPositions)));
  body.appendChild(kpi);

  const modeRow = h.el('div', 'row');
  const mk = h.el('span');
  mk.textContent = 'Mode';
  const mv = h.el('span', 'chip ' + (m.mode === 'armed' ? 'chip-green' : 'chip-gray'));
  mv.textContent = m.mode === 'armed' ? 'armed' : 'paused';
  modeRow.appendChild(mk);
  modeRow.appendChild(mv);
  body.appendChild(modeRow);

  body.appendChild(h.t('h3', 'Aturan'));
  const r = m.rules;
  const rules = h.el('div', 'card');
  rules.textContent = `SL ${r.stopLossPct}% · TP ${r.takeProfitPct}% · slippage ${r.maxSlippageBps} bps · close setelah out-of-range ${r.closeAfterOutOfRangeMin} mnt`;
  body.appendChild(rules);

  body.appendChild(h.t('h3', `Antrian (${m.pending.length})`));
  if (!m.pending.length) body.appendChild(h.t('p', 'Tidak ada antrian.', 'muted'));
  for (const p of m.pending) {
    const row = h.el('div', 'row');
    const a = h.el('span');
    a.textContent = p.pair;
    const b = h.el('span', 'muted');
    b.textContent = `${REASON_ID[p.reason] || p.reason} · ${p.etaSec} dtk`;
    row.appendChild(a);
    row.appendChild(b);
    body.appendChild(row);
  }

  body.appendChild(h.t('h3', 'Eksekusi terbaru'));
  if (!m.recentExecutions.length) body.appendChild(h.t('p', 'Belum ada eksekusi.', 'muted'));
  for (const x of m.recentExecutions) {
    const row = h.el('div', 'crow');
    const top = h.el('div', 'crow-top');
    const left = h.el('span');
    left.textContent = `${x.pair} · ${REASON_ID[x.reason] || x.reason}`;
    const right = h.el('span', x.pnlUsd >= 0 ? 'pos' : 'neg');
    right.textContent = signedUsd(x.pnlUsd);
    top.appendChild(left);
    top.appendChild(right);
    row.appendChild(top);
    const sub = h.el('div', 'crow-sub');
    sub.textContent = `${shortSig(x.txSig)} · ${rel(x.ts)}`;
    row.appendChild(sub);
    body.appendChild(row);
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

/** @param {string} s */
function shortSig(s) {
  if (typeof s !== 'string') return '-';
  return s.length > 14 ? s.slice(0, 8) + '…' + s.slice(-4) : s;
}
