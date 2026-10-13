/**
 * Reaksi bos: SERVER yang memutuskan (dipicu tiap event + idle tick).
 * Mengirim {type:"boss", state, bubble, durationMs}. Prioritas tinggi menyela rendah.
 */

const PRIORITY = { sip: 1, approve: 2, think: 3, laugh: 3, shock: 4, angry: 4 };

/**
 * @param {string} state
 */
export function priorityOf(state) {
  return PRIORITY[state] ?? 0;
}

const TABLE = {
  coin_found: { state: 'think', bubbles: ['Koin apa itu? Cek dulu.', 'Hmm, menarik... tapi hati-hati.'] },
  position_out_of_range: { state: 'shock', bubbles: ['Hah?! Posisinya keluar range?!', 'Waduh, LP-nya keluar range!'] },
  position_back_in_range: { state: 'approve', bubbles: ['Oke, sudah balik lagi.'] },
  agent_offline: { state: 'shock', bubbles: ['Bot-nya mati?!', 'Kok ada yang offline?'] },
  agent_online: { state: 'approve', bubbles: ['Bagus, sudah jalan lagi.'] },
};

/**
 * @param {() => number} [rnd=Math.random]
 */
export function idleReaction(rnd = Math.random) {
  const bubbles = ['Hmm... tehnya enak.', 'Ada kabar?', 'Semua aman, ya?'];
  return { state: 'sip', bubble: bubbles[Math.floor(rnd() * bubbles.length)], durationMs: 6000 };
}

/**
 * Tentukan reaksi bos untuk sebuah event.
 * @param {any} event {type, data}
 * @param {() => number} [rnd=Math.random]
 * @returns {{ state: string, bubble: string, durationMs: number } | null}
 */
export function reactionForEvent(event, rnd = Math.random) {
  if (!event || !event.type) return null;
  const t = event.type;
  const d = event.data || {};
  const pickA = (arr) => arr[Math.floor(rnd() * arr.length)];

  if (t === 'position_closed') {
    const pnl = Number(d.pnlUsd ?? 0);
    if (pnl >= 0) return { state: 'laugh', bubble: pickA(['Mantap! Tebasan bersih!', 'Profit! Lanjutkan.']), durationMs: 6000 };
    return { state: 'angry', bubble: pickA(['Cih, rugi lagi.', 'Stop loss kena... evaluasi!']), durationMs: 6000 };
  }
  if (t === 'report_ready') {
    const tone = d.tone || 'neutral';
    if (tone === 'good') return { state: 'approve', bubble: pickA(['Bagus, pertahankan.', 'Nggak boros. Mantap.']), durationMs: 6000 };
    if (tone === 'warn') return { state: 'angry', bubble: pickA(['Boros banget...', 'Kurangi jajan!']), durationMs: 6000 };
    return { state: 'approve', bubble: 'Oke, noted.', durationMs: 6000 };
  }
  const row = TABLE[t];
  if (row) return { state: row.state, bubble: pickA(row.bubbles), durationMs: 6000 };
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
