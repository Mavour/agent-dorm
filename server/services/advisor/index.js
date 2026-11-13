/**
 * Karo uses OpenRouter for user questions and local rules for automatic reports.
 */
import * as rules from './rules-advisor.js';
import { createOpenRouterAdvisor, DEFAULT_MODEL } from './llm-advisor.js';

/**
 * @param {{ advisorMode?: string, openrouterKey?: string, openrouterModel?: string, advisorMaxTokens?: number }} [opts]
 */
export function getAdvisor(opts = {}) {
  const mode = (opts.advisorMode || process.env.ADVISOR_MODE || 'rules').toLowerCase();
  const apiKey = opts.openrouterKey ?? process.env.OPENROUTER_API_KEY ?? '';
  if (mode === 'llm' && apiKey.trim()) {
    return createOpenRouterAdvisor({ apiKey: apiKey.trim(), model: opts.openrouterModel || process.env.OPENROUTER_MODEL || DEFAULT_MODEL, maxTokens: opts.advisorMaxTokens || 1536 });
  }
  return { ...rules, mode: 'rules' };
}

export { rules };
export const QUESTIONS = rules.QUESTIONS;
