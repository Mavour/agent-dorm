/**
 * Reaksi bos: SERVER yang memutuskan (dipicu report-director dari event).
 * State DAN bubble mencerminkan isi laporan (pair/simbol/angka/agen).
 * Bubble Bahasa Indonesia, maks 60 karakter.
 */

const PRIORITY = { sip: 1, approve: 2, think: 3, laugh: 3, shock: 4, angry: 4 };

/**
 * @param {string} state
 */
export function priorityOf(state) {
  return PRIORITY[state] ?? 0;
}

const AGENT_NAMES = { exitbot: 'ExitBot', portfolio: 'Karo', alert: 'Bot Alert', lpwatcher: 'LP Watcher' };
const REASONS = { take_profit: 'Take profit', stop_loss: 'Stop loss', out_of_range: 'Out of range', manual: 'Manual' };

/** @param {any} event */
function agentName(event) {
  return AGENT_NAMES[event.agentId] || event.agentId || 'Bot';
}

/** @param {string} s */
function cap(s) {
  return String(s).slice(0, 60);
}

/**
 * @param {() => number} [rnd=Math.random]
 */
export function idleReaction(rnd = Math.random) {
  const bubbles = ['Hmm... tehnya enak.', 'Ada kabar?', 'Semua aman, ya?'];
  return { state: 'sip', bubble: bubbles[Math.floor(rnd() * bubbles.length)], durationMs: 6000 };
}

/**
 * Tentukan reaksi bos untuk sebuah event (state + bubble dari data event).
 * @param {any} event {type, agentId, data}
 * @param {() => number} [rnd=Math.random]
 * @returns {{ state: string, bubble: string, durationMs: number } | null}
 */
export function reactionForEvent(event, rnd = Math.random) {
  if (!event || !event.type) return null;
  const t = event.type;
  const d = event.data || {};
  void rnd;

  if (t === 'coin_found') {
    const score = Number(d.score ?? 0);
    const symbol = d.symbol || '?';
    const flag = (d.riskFlags && d.riskFlags[0]) || '';
    let bubble;
    if (score >= 80) {
      bubble = flag ? `Skor ${score}, ${symbol} menarik. ${flag}.` : `Skor ${score}, ${symbol} menarik. Cek likuiditasnya!`;
    } else if (score >= 70) {
      bubble = flag ? `${symbol} skor ${score}... ${flag}.` : `${symbol} skor ${score}... lumayan, pantau dulu.`;
    } else {
      bubble = flag ? `${symbol} skor ${score}, ${flag}.` : `${symbol} skor ${score}, biasa saja.`;
    }
    return { state: 'think', bubble: cap(bubble), durationMs: 6000 };
  }
  if (t === 'position_closed') {
    const pnl = Number(d.pnlUsd ?? 0);
    const pair = d.pair || '?';
    const amt = Math.abs(pnl).toFixed(2);
    const reason = REASONS[d.reason] ? ` (${REASONS[d.reason]})` : '';
    if (pnl >= 40) return { state: 'laugh', bubble: cap(`Mantap! ${pair} +$${amt}${reason}.`), durationMs: 6000 };
    if (pnl >= 0) return { state: 'approve', bubble: cap(`${pair} profit kecil +$${amt}${reason}. Oke.`), durationMs: 6000 };
    if (pnl > -20) return { state: 'think', bubble: cap(`Rugi kecil ${pair} (-$${amt})${reason}. Evaluasi.`), durationMs: 6000 };
    return { state: 'angry', bubble: cap(`Cih, ${pair} rugi $${amt}${reason}!`), durationMs: 6000 };
  }
  if (t === 'position_out_of_range') {
    return { state: 'shock', bubble: cap(`${d.pair || 'Posisi'} keluar range! Cek sekarang.`), durationMs: 6000 };
  }
  if (t === 'position_back_in_range') {
    return { state: 'approve', bubble: cap(`${d.pair || 'Posisi'} sudah in range lagi.`), durationMs: 6000 };
  }
  if (t === 'report_ready') {
    const tone = d.tone || 'neutral';
    const title = d.title || 'Rapor harian';
    const phrase = String(d.text || '').split('.')[0].trim();
    const bubble = cap(phrase ? `${title}. ${phrase}.` : `${title}.`);
    if (tone === 'warn') return { state: 'angry', bubble, durationMs: 6000 };
    return { state: 'approve', bubble, durationMs: 6000 };
  }
  if (t === 'agent_offline') {
    return { state: 'shock', bubble: cap(`${agentName(event)} offline!`), durationMs: 6000 };
  }
  if (t === 'agent_online') {
    return { state: 'approve', bubble: cap(`${agentName(event)} sudah kembali.`), durationMs: 6000 };
  }
  return null;
}

/**
 * Gelembung acak saat bos diklik (berdasar situasi umum).
 * @param {boolean} hasCritical ada alert kritis terbuka?
 * @param {() => number} [rnd=Math.random]
 */
export function clickBubble(hasCritical, rnd = Math.random) {
  if (hasCritical) {
    const arr = ['Berhenti panik, cek datanya.', 'Fokus ke yang merah dulu.'];
    return arr[Math.floor(rnd() * arr.length)];
  }
  const arr = ['Santai... tapi tetap waspada.', 'Semua aman. Teh dulu.'];
  return arr[Math.floor(rnd() * arr.length)];
}
