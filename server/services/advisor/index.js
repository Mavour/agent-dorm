/**
 * Titik masuk advisor: pilih rules (aktif) atau LLM (slot, fallback ke rules).
 */
import * as rules from './rules-advisor.js';
import * as llm from './llm-advisor.js';

/**
 * @param {{ advisorMode?: string, anthropicKey?: string }} [opts]
 */
export function getAdvisor(opts = {}) {
  const mode = (opts.advisorMode || process.env.ADVISOR_MODE || 'rules').toLowerCase();
  const key = opts.anthropicKey ?? process.env.ANTHROPIC_API_KEY ?? '';
  if (mode === 'llm' && key) {
    try {
      // Panggil sekali untuk memastikan stub melempar; kalau tidak melempar, pakai llm.
      llm.advise();
      return llm;
    } catch (err) {
      console.warn('[advisor] ' + (err && err.message ? err.message : err) + ' — fallback ke rules.');
      return rules;
    }
  }
  if (mode === 'llm' && !key) {
    console.warn('[advisor] ADVISOR_MODE=llm tapi ANTHROPIC_API_KEY kosong — fallback ke rules.');
  }
  return rules;
}

export { rules };
export const QUESTIONS = rules.QUESTIONS;
