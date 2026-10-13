/**
 * Rapor harian untuk mode http/file: bot asli tidak mengirim report_ready,
 * jadi dashboard menerbitkannya dari advisor.dailyReport(snapshot portfolio).
 * Terbit pada snapshot pertama setelah boot dan tiap pergantian hari/nada,
 * dedupe by id report-YYYY-MM-DD-<tone> agar nada selalu dari fungsi yang sama.
 */
import { getAdvisor } from './advisor/index.js';

/**
 * @param {any} store
 * @param {{ advisorMode?: string, anthropicKey?: string }} [opts]
 * @returns {() => void} unsubscribe
 */
export function startReportScheduler(store, opts = {}) {
  let lastId = null;
  return store.subscribe((msg) => {
    if (msg.type !== 'agent_update' || msg.agentId !== 'portfolio') return;
    const snap = msg.snapshot;
    if (!snap || snap.status === 'offline') return;
    let rep;
    try {
      rep = getAdvisor({ advisorMode: opts.advisorMode, anthropicKey: opts.anthropicKey }).dailyReport(snap);
    } catch {
      return;
    }
    const day = new Date().toISOString().slice(0, 10);
    const id = `report-${day}-${rep.tone}`;
    if (id === lastId) return;
    lastId = id;
    store.publishEvent({
      id,
      ts: new Date().toISOString(),
      type: 'report_ready',
      level: 'info',
      message: 'Rapor harian sudah siap.',
      agentId: 'portfolio',
      data: { tone: rep.tone, title: rep.title, text: rep.text },
    });
  });
}
