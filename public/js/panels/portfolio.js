/**
 * Panel Karo: 3 tab (Ringkasan, Transaksi, Saran).
 * Saran: kartu advice + chip pertanyaan cepat (POST /api/portfolio/ask),
 * tampil sebagai chat; input teks aktif saat OpenRouter dikonfigurasi.
 */
import { usd, signedUsd, rel } from '../format.js';
import { portfolioData, portfolioMoney, portfolioSpending } from '../portfolio-data.js';

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
  body.classList.add('portfolio-panel');
  const tabs = h.el('div', 'tabs');
  /** @type {HTMLElement[]} */
  const panes = [];
  let chatOpened = false;
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
      body.classList.toggle('portfolio-chat-active', i === 2);
      body.closest('.popup')?.classList.toggle('karo-chat-open', i === 2);
      names.forEach((_, j) => {
        panes[j].style.display = j === i ? (j === 2 ? 'flex' : 'block') : 'none';
        tabs.children[j].setAttribute('aria-selected', j === i ? 'true' : 'false');
      });
      if (i === 2 && !chatOpened) {
        const history = panes[2].querySelector('.karo-history');
        history.scrollTop = history.scrollHeight;
        chatOpened = true;
      }
    });
    tabs.appendChild(b);
  });
  body.appendChild(tabs);
  for (const p of panes) body.appendChild(p);
  renderSummary(panes[0], snap, h);
  renderTx(panes[1], snap, h);
  renderAdvice(panes[2], snap, h);
  return (next) => {
    panes[0].replaceChildren();
    panes[1].replaceChildren();
    renderSummary(panes[0], next, h);
    renderTx(panes[1], next, h);
  };
}

/** @param {HTMLElement} pane @param {any} snap @param {any} h */
function renderSummary(pane, snap, h) {
  const m = snap.metrics;
  const data = portfolioData(snap);
  const money = n => portfolioMoney(n, data.currency);
  const nw = h.el('div', 'kpi');
  nw.appendChild(cell(h, m.valuationComplete === false ? 'Subtotal aset' : 'Total aset', money(m.valuationComplete === false ? data.knownNetWorth : data.netWorth)));
  nw.appendChild(cell(h, 'Hari ini · masuk / keluar', `${money(data.cashflow.todayIncome)} / ${money(data.cashflow.todayExpense)}`));
  pane.appendChild(nw);
  if (m.valuationComplete === false) pane.appendChild(h.t('p', 'Valuasi belum lengkap. Angka di atas hanya subtotal aset yang diketahui Fintrack.', 'muted'));
  pane.appendChild(h.t('h3', 'Alokasi aset (USD)'));
  if (data.currency === 'IDR') pane.appendChild(h.t('p', 'Rincian alokasi diterima dari Fintrack dalam USD.', 'muted'));
  const bar = h.el('div', 'bar');
  const colors = ['#4ade80', '#3b82f6', '#f59e0b', '#9ca3af'];
  m.accounts.forEach((a, i) => {
    const seg = document.createElement('div');
    seg.style.width = (Number.isFinite(a.valueUsd) && m.netWorthUsd > 0 ? (a.valueUsd / m.netWorthUsd) * 100 : 0) + '%';
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
  cf.appendChild(cell(h, '7 hari', `${money(data.cashflow.last7dIncome)} / ${money(data.cashflow.last7dExpense)}`));
  cf.appendChild(cell(h, '30 hari', `${money(data.cashflow.last30dIncome)} / ${money(data.cashflow.last30dExpense)}`));
  pane.appendChild(cf);
  pane.appendChild(h.t('h3', 'Budget bulan ini'));
  const b = data.budget;
  const { projected: proj } = portfolioSpending(snap);
  const budgetReady = m.budgetConfigured !== false && Number.isFinite(b.monthly) && Number.isFinite(b.monthSpent);
  const pct = budgetReady ? (b.monthly > 0 ? Math.min(100, (b.monthSpent / b.monthly) * 100) : b.monthSpent > 0 ? 100 : 0) : 0;
  const bb = h.el('div', 'bar' + (budgetReady && proj > b.monthly ? ' warn' : ''));
  const fill = document.createElement('div');
  fill.style.width = pct + '%';
  bb.appendChild(fill);
  pane.appendChild(bb);
  const bl = h.el('div', 'muted');
  bl.textContent = budgetReady ? `Terpakai ${money(b.monthSpent)} dari ${money(b.monthly)} · proyeksi ${money(proj)}` : 'Budget bulanan belum tersedia. Atur budget di Fintrack.';
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
  const data = portfolioData(snap);
  const list = data.transactions.slice(0, 60);
  pane.appendChild(h.t('h3', `Transaksi terakhir (${list.length})`));
  for (const tx of list) {
    const row = h.el('div', 'crow');
    const top = h.el('div', 'crow-top');
    const l = h.el('span');
    l.textContent = `${tx.category} · ${tx.note || ''}`;
    const v = h.el('span', tx.kind === 'income' ? 'pos' : 'neg');
    v.textContent = `${tx.kind === 'income' ? '+' : '−'}${portfolioMoney(tx.amount, data.currency)}${data.currency === 'IDR' && Number.isFinite(tx.amountUsd) ? ` (${usd(tx.amountUsd)})` : ''}`;
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
  pane.classList.add('karo-conversation');
  pane.appendChild(h.t('h3', 'Obrolan Karō'));
  const intro = h.t('p', window.__ADVISOR_MODE__ === 'llm' ? 'Karo akan yapping sendiri sekitar tiap 2 jam berdasarkan kabar keuanganmu. Riwayat tersimpan dan bisa dibaca lagi.' : window.__ADVISOR_CONFIGURED__ ? 'Chat AI belum terhubung. Isi OPENROUTER_API_KEY di .env server, lalu restart Dorm.' : 'Saran otomatis berdasarkan data yang diterima.', 'muted');
  const aiState = h.t('p', 'Memeriksa status AI…', 'muted karo-ai-status');
  pane.appendChild(aiState);
  function failureText(reason) {
    return {
      timeout: 'OpenRouter melewati batas waktu setelah mencoba model gratis cadangan.',
      rate_limit: 'Kuota atau kapasitas model gratis sedang dibatasi.',
      authentication: 'OpenRouter menolak autentikasi API key.',
      account_limit: 'OpenRouter membatasi akses akun ini.',
      invalid_response: 'Model gratis belum mengirim jawaban lengkap.',
      model_configuration: 'Konfigurasi model gratis belum valid.',
    }[reason] || 'Layanan AI belum berhasil menjawab.';
  }
  const automatic = h.el('details');
  automatic.appendChild(h.t('summary', 'Info & perhitungan'));
  automatic.appendChild(intro);
  automatic.appendChild(h.t('p', 'Detail data dan peringatannya bisa dilihat di tab Ringkasan.', 'muted'));
  const advBox = h.el('div');
  automatic.appendChild(advBox);
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

  const chat = h.el('div', 'chat karo-history');
  chat.setAttribute('aria-label', 'Riwayat obrolan Karo');
  chat.setAttribute('role', 'log');
  pane.appendChild(chat);
  const historyStatus = h.t('p', 'Memuat riwayat…', 'muted');
  historyStatus.classList.add('karo-history-status');
  historyStatus.title = 'Menyimpan 500 pesan terbaru. Pesan lama diganti bertahap; kamu tetap bisa mengirim chat baru.';
  pane.appendChild(historyStatus);
  const entries = new Map();
  let pending = null;
  function bubble(message) {
    const row = h.el('article', message.role === 'user' ? 'q' : `a${message.kind === 'yapping' ? ' yapping' : ''}`);
    const label = message.role === 'user' ? 'Pertanyaan kamu' : message.kind === 'yapping' ? 'Yapping Karo' : 'Jawaban pertanyaan';
    const time = message.ts ? new Date(message.ts).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' }) : '';
    row.appendChild(h.t('div', `${label}${message.source ? message.source === 'llm' ? ' · AI' : ' · Aturan otomatis' : ''}${time ? ' · ' + time : ''}`, 'chat-meta'));
    row.appendChild(h.t('div', `${message.text}${message.fallback ? '\n' + failureText(message.reason) + ' Ini jawaban aturan otomatis, bukan jawaban AI.' : ''}`));
    return row;
  }
  function paint(messages = []) {
    const previousTop = chat.scrollTop;
    const nearBottom = chat.scrollHeight - chat.scrollTop - chat.clientHeight < 60;
    for (const message of messages) entries.set(message.id, message);
    const ordered = [...entries.values()].sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts)).slice(-500);
    entries.clear();
    chat.replaceChildren();
    for (const message of ordered) { entries.set(message.id, message); chat.appendChild(bubble(message)); }
    if (pending) chat.appendChild(pending);
    chat.scrollTop = nearBottom ? chat.scrollHeight : previousTop;
    historyStatus.textContent = entries.size ? 'Riwayat tersimpan di server.' : 'Belum ada obrolan. Mulai dengan pertanyaanmu.';
  }
  async function loadHistory() {
    try {
      const response = await fetch('/api/portfolio/history', { cache: 'no-store' });
      if (!response.ok) throw new Error();
      const data = await response.json();
      const status = data.aiStatus || {};
      aiState.textContent = status.state === 'ready' ? 'AI terhubung · jawaban terakhir berhasil dari OpenRouter.'
        : status.state === 'degraded' ? `${failureText(status.reason)}${status.retryAfterSec > 0 ? ` Coba lagi sekitar ${status.retryAfterSec} detik.` : ' Pertanyaan berikutnya akan mencoba AI lagi.'}`
          : status.state === 'disabled' ? 'Chat AI belum dikonfigurasi.' : 'AI siap dicoba · koneksi diperiksa saat kamu bertanya.';
      paint(data.messages || []);
    } catch { historyStatus.textContent = 'Riwayat belum bisa dimuat. Mencoba lagi sebentar.'; }
  }
  loadHistory();
  const historyTimer = setInterval(() => {
    if (!pane.isConnected) { clearInterval(historyTimer); return; }
    loadHistory();
  }, 15000);
  const chips = h.el('div', 'qchips');
  const controls = [];
  let busy = false;
  async function send(payload, label) {
    if (busy) return;
    busy = true;
    controls.forEach(control => { control.disabled = true; });
    pending = h.el('div', 'chat-pending');
    pending.appendChild(bubble({ role: 'user', text: label }));
    const typing = h.el('div', 'a typing-indicator');
    typing.setAttribute('role', 'status');
    typing.setAttribute('aria-label', 'Karo sedang mengetik');
    for (let i = 0; i < 3; i++) {
      const dot = h.el('span');
      dot.setAttribute('aria-hidden', 'true');
      typing.appendChild(dot);
    }
    pending.appendChild(typing);
    paint();
    chat.scrollTop = chat.scrollHeight;
    try {
      const r = await fetch('/api/portfolio/ask', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Gagal menjawab.');
      pending = null;
      paint(j.messages || []);
      await loadHistory();
    } catch {
      pending.replaceChildren(bubble({ role: 'assistant', kind: 'answer', text: 'Pertanyaan belum berhasil disimpan atau dijawab. Coba lagi sebentar.' }));
      paint();
    } finally {
      busy = false;
      controls.forEach(control => { control.disabled = false; });
    }
  }
  for (const [qid, label] of QUICK) {
    const b = h.el('button');
    b.textContent = label;
    b.setAttribute('type', 'button');
    controls.push(b);
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      send({ questionId: qid }, label);
    });
    chips.appendChild(b);
  }
  const tools = h.el('div', 'karo-chat-tools');
  const quick = h.el('details');
  quick.appendChild(h.t('summary', 'Pertanyaan cepat'));
  quick.appendChild(chips);
  tools.appendChild(quick);
  tools.appendChild(automatic);
  pane.appendChild(tools);

  const ask = h.el('form', 'askrow');
  const inp = document.createElement('input');
  const enabled = window.__ADVISOR_MODE__ === 'llm';
  inp.disabled = !enabled;
  inp.maxLength = 2000;
  inp.setAttribute('aria-label', 'Pertanyaan untuk Karo');
  inp.placeholder = enabled ? 'Tanya Karo tentang keuanganmu…' : 'Chat AI belum aktif';
  const btn = document.createElement('button');
  btn.disabled = !enabled;
  btn.textContent = 'Kirim';
  btn.setAttribute('type', 'submit');
  if (enabled) controls.push(inp, btn);
  ask.addEventListener('submit', (event) => {
    event.preventDefault();
    const question = inp.value.trim();
    if (!enabled || busy || !question) return;
    inp.value = '';
    send({ question }, question);
  });
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
  const data = portfolioData(snap);
  const money = n => portfolioMoney(n, data.currency);
  const t = portfolioSpending(snap);
  if (!Number.isFinite(t.today) || t.avg7 === null) return { title: 'Rapor harian: data belum lengkap', text: 'Data pengeluaran belum tersedia. Penilaian menunggu data lengkap.' };
  if (t.tone === 'warn') return { title: 'Rapor harian: boros', text: `Hari ini ${money(t.today)} (rata-rata ${money(t.avg7)}). Proyeksi ${money(t.projected)}. Rem pengeluarannya!` };
  if (t.tone === 'good') return { title: 'Rapor harian: hemat', text: `Hemat banget hari ini: ${money(t.today)} vs rata-rata ${money(t.avg7)}. Pertahankan!` };
  return { title: 'Rapor harian: stabil', text: `Pengeluaran stabil di ${money(t.today)}. Semua terkendali.` };
}

export { signedUsd };
