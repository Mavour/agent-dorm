/**
 * Panel Karo: 3 tab (Ringkasan, Transaksi, Saran).
 * Saran: kartu advice + chip pertanyaan cepat (POST /api/portfolio/ask),
 * tampil sebagai chat; input teks DISABLED (mode rules).
 */
import { usd, signedUsd, rel } from '../format.js';

const QUICK = [
  ['today_summary', 'Ringkasan hari ini'],
  ['am_i_wasteful', 'Apakah saya boros?'],
  ['month_budget', 'Sisa budget bulan ini'],
  ['top_category', 'Kategori terbesar'],
  ['lp_exposure', 'Eksposur LP'],
  ['more_tips', 'Saran lain'],
];

/**
 * @param {HTMLElement} body
 * @param {any} snap
 * @param {{ t: Function, el: Function }} h
 */
export function renderPortfolio(body, snap, h) {
  const tabs = h.el('div', 'tabs');
  /** @type {HTMLElement[]} */
  const panes = [];
  const names = ['Ringkasan', 'Transaksi', 'Saran'];
  names.forEach((n, i) => {
    const b = h.el('button');
    b.textContent = n;
    b.setAttribute('role', 'tab');
    b.setAttribute('aria-selected', i === 0 ? 'true' : 'false');
    b.setAttribute('type', 'button');
    const pane = h.el('div');
    if (i > 0) pane.style.display = 'none';
    panes.push(pane);
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      names.forEach((_, j) => {
        panes[j].style.display = j === i ? 'block' : 'none';
        tabs.children[j].setAttribute('aria-selected', j === i ? 'true' : 'false');
      });
    });
    tabs.appendChild(b);
  });
  body.appendChild(tabs);
  for (const p of panes) body.appendChild(p);
  renderSummary(panes[0], snap, h);
  renderTx(panes[1], snap, h);
  renderAdvice(panes[2], snap, h);
}

/** @param {HTMLElement} pane @param {any} snap @param {any} h */
function renderSummary(pane, snap, h) {
  const m = snap.metrics;
  const nw = h.el('div', 'kpi');
  nw.appendChild(cell(h, 'Net worth', usd(m.netWorthUsd)));
  nw.appendChild(cell(h, 'Hari ini', `${usd(m.cashflow.todayIncomeUsd)} / ${usd(m.cashflow.todayExpenseUsd)}`));
  pane.appendChild(nw);
  pane.appendChild(h.t('h3', 'Akun'));
  const bar = h.el('div', 'bar');
  const colors = ['#4ade80', '#3b82f6', '#f59e0b', '#9ca3af'];
  m.accounts.forEach((a, i) => {
    const seg = document.createElement('div');
    seg.style.width = (m.netWorthUsd ? (a.valueUsd / m.netWorthUsd) * 100 : 0) + '%';
    seg.style.background = colors[i % colors.length];
    seg.title = `${a.label}: ${usd(a.valueUsd)}`;
    bar.appendChild(seg);
  });
  bar.style.display = 'flex';
  pane.appendChild(bar);
  for (const a of m.accounts) {
    const row = h.el('div', 'row');
    const l = h.el('span');
    l.textContent = `${a.label} (${a.type})`;
    const v = h.el('span');
    v.textContent = usd(a.valueUsd);
    row.appendChild(l);
    row.appendChild(v);
    pane.appendChild(row);
  }
  pane.appendChild(h.t('h3', 'Arus kas'));
  const cf = h.el('div', 'kpi');
  cf.appendChild(cell(h, '7 hari', `${usd(m.cashflow.last7dIncomeUsd)} / ${usd(m.cashflow.last7dExpenseUsd)}`));
  cf.appendChild(cell(h, '30 hari', `${usd(m.cashflow.last30dIncomeUsd)} / ${usd(m.cashflow.last30dExpenseUsd)}`));
  pane.appendChild(cf);
  pane.appendChild(h.t('h3', 'Budget bulan ini'));
  const b = m.budget;
  const now = new Date();
  const elapsed = Math.max(1, now.getDate());
  const dim = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const proj = (b.monthSpentUsd / elapsed) * dim;
  const pct = Math.min(100, (b.monthSpentUsd / b.monthlyUsd) * 100);
  const bb = h.el('div', 'bar' + (proj > b.monthlyUsd ? ' warn' : ''));
  const fill = document.createElement('div');
  fill.style.width = pct + '%';
  bb.appendChild(fill);
  pane.appendChild(bb);
  const bl = h.el('div', 'muted');
  bl.textContent = `Terpakai ${usd(b.monthSpentUsd)} dari ${usd(b.monthlyUsd)} · proyeksi ${usd(proj)}`;
  pane.appendChild(bl);
  pane.appendChild(h.t('h3', 'Rapor harian'));
  const rep = dailyLocal(snap);
  const rc = h.el('div', 'card');
  const rt = h.el('strong');
  rt.textContent = rep.title;
  const rx = h.el('div');
  rx.textContent = rep.text;
  rc.appendChild(rt);
  rc.appendChild(rx);
  pane.appendChild(rc);
}

/** @param {HTMLElement} pane @param {any} snap @param {any} h */
function renderTx(pane, snap, h) {
  const list = (snap.metrics.transactions || []).slice(0, 20);
  pane.appendChild(h.t('h3', `Transaksi terakhir (${list.length})`));
  for (const tx of list) {
    const row = h.el('div', 'crow');
    const top = h.el('div', 'crow-top');
    const l = h.el('span');
    l.textContent = `${tx.category} · ${tx.note || ''}`;
    const v = h.el('span', tx.kind === 'income' ? 'pos' : 'neg');
    v.textContent = `${tx.kind === 'income' ? '+' : '−'}${usd(tx.amountUsd)}`;
    top.appendChild(l);
    top.appendChild(v);
    row.appendChild(top);
    const sub = h.el('div', 'crow-sub');
    sub.textContent = rel(tx.ts);
    row.appendChild(sub);
    pane.appendChild(row);
  }
}

/** @param {HTMLElement} pane @param {any} snap @param {any} h */
function renderAdvice(pane, snap, h) {
  pane.appendChild(h.t('h3', 'Saran'));
  const advBox = h.el('div');
  pane.appendChild(advBox);
  fetch('/api/portfolio/advice')
    .then((r) => (r.ok ? r.json() : { advice: [] }))
    .then((j) => {
      for (const a of j.advice || []) {
        const card = h.el('div', 'card');
        const ti = h.el('strong');
        ti.textContent = `[${a.tone}] ${a.title}`;
        const ms = h.el('div');
        ms.textContent = a.message;
        card.appendChild(ti);
        card.appendChild(ms);
        advBox.appendChild(card);
      }
      if (!(j.advice || []).length) advBox.appendChild(h.t('p', 'Belum ada saran.', 'muted'));
    })
    .catch(() => advBox.appendChild(h.t('p', 'Gagal memuat saran.', 'muted')));

  const chat = h.el('div', 'chat');
  pane.appendChild(chat);
  const chips = h.el('div', 'qchips');
  for (const [qid, label] of QUICK) {
    const b = h.el('button');
    b.textContent = label;
    b.setAttribute('type', 'button');
    b.addEventListener('click', async (e) => {
      e.stopPropagation();
      const q = h.el('div', 'q');
      q.textContent = label;
      chat.appendChild(q);
      const a = h.el('div', 'a');
      a.textContent = 'Mengetik...';
      chat.appendChild(a);
      try {
        const r = await fetch('/api/portfolio/ask', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ questionId: qid }),
        });
        const j = await r.json();
        a.textContent = r.ok ? j.text : 'Maaf, gagal menjawab.';
      } catch {
        a.textContent = 'Maaf, koneksi gagal.';
      }
    });
    chips.appendChild(b);
  }
  pane.appendChild(chips);

  const ask = h.el('div', 'askrow');
  const inp = document.createElement('input');
  inp.disabled = true;
  inp.placeholder = 'Mode LLM belum aktif (ADVISOR_MODE=rules)';
  const btn = document.createElement('button');
  btn.disabled = true;
  btn.textContent = 'Kirim';
  btn.setAttribute('type', 'button');
  ask.appendChild(inp);
  ask.appendChild(btn);
  pane.appendChild(ask);
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

/** Rapor lokal ringan (konsisten dengan rules advisor). @param {any} snap */
function dailyLocal(snap) {
  const cf = snap.metrics.cashflow;
  const avg7 = cf.last7dExpenseUsd / 7 || 1;
  const ratio = cf.todayExpenseUsd / avg7;
  if (ratio > 1.3) return { title: 'Rapor harian: boros', text: `Hari ini ${usd(cf.todayExpenseUsd)} (rata-rata ${usd(avg7)}). Rem pengeluarannya!` };
  if (ratio < 0.7) return { title: 'Rapor harian: hemat', text: `Hemat banget hari ini: ${usd(cf.todayExpenseUsd)} vs rata-rata ${usd(avg7)}. Pertahankan!` };
  return { title: 'Rapor harian: stabil', text: `Pengeluaran stabil di ${usd(cf.todayExpenseUsd)}. Semua terkendali.` };
}

export { signedUsd };
