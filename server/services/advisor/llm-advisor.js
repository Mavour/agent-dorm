/**
 * Slot LLM advisor (BELUM diimplementasikan di fase ini).
 *
 * Desain masa depan:
 * - Hanya kirim angka agregat (net worth, cashflow, budget) ke LLM,
 *   JANGAN PERNAH kirim alamat wallet mentah atau data sensitif.
 * - Cache satu rapor per hari agar hemat.
 * - Pakai model kecil yang murah (lihat ANTHROPIC_MODEL).
 * - Batasi token keluaran dengan ADVISOR_MAX_TOKENS.
 * - Kalau ada error apa pun, fallback ke rules-advisor.
 * Fase ini: TIDAK ADA panggilan jaringan ke penyedia LLM mana pun.
 */

/**
 * Stub yang selalu gagal dengan jelas.
 */
export function advise() {
  throw new Error('LLM advisor belum diimplementasikan');
}

/** @param {string} _q @param {any} _s */
export function answer(_q, _s) {
  throw new Error('LLM advisor belum diimplementasikan');
}

/** @param {any} _s */
export function dailyReport(_s) {
  throw new Error('LLM advisor belum diimplementasikan');
}
