/**
 * Reaksi visual agen: bubble/ikon/busy mengikuti "cue" terserial dari
 * report-director (satu dalam satu waktu). Badge merah + ikon alert/sleep
 * persisten tetap mengikuti event mentah/snapshot (real-time).
 */
import { bubbleForEvent } from './bubbles.js';

/**
 * Pembukuan badge dari event mentah. Tanpa bubble/ikon di sini.
 * @param {{ S: any, id: string, showBadge: (n: number) => void, hideBadge: () => void }} ctx
 * @param {any} event
 */
export function noteEvent(ctx, event) {
  const { S, id } = ctx;
  if (event.agentId !== id) return;
  if (event.type === 'position_out_of_range') {
    S.unacked += 1;
    ctx.showBadge(S.unacked);
  } else if (event.type === 'position_back_in_range' || event.type === 'agent_online') {
    S.unacked = 0;
    ctx.hideBadge();
  }
}

/**
 * Presentasi penuh satu cue terserial.
 * @param {{ S: any, id: string, showIcon: (n: string, ms: number) => void, hideIcon: () => void, busy: (icon: string, ms: number, now: number) => void, bubbles: any, REDUCED: boolean, isActive?: () => boolean }} ctx
 * @param {{ cueId: string, agentId: string, event: any, durationMs: number }} cue
 */
export function reactToCue(ctx, cue) {
  const event = cue && cue.event;
  if (!event || event.agentId !== ctx.id) return;
  const { S, id, bubbles } = ctx;
  const d = event.data || {};
  bubbles.say(id, bubbleForEvent(event));
  const now = performance.now();
  if (event.type === 'position_out_of_range') {
    if (!ctx.REDUCED) ctx.showIcon('alert', 60000);
  } else if (event.type === 'position_back_in_range') {
    ctx.hideIcon();
    ctx.busy('sparkle', 3000, now);
  } else if (event.type === 'position_closed') {
    if (!ctx.REDUCED) ctx.showIcon('sweat', 2500);
    S.busyUntil = now + 2500;
    S.state = 'busy';
    const pnl = Number(d.pnlUsd ?? 0);
    setTimeout(() => {
      if (!ctx.REDUCED) ctx.showIcon(pnl >= 0 ? 'sparkle' : 'anger', 4000);
      S.busyUntil = performance.now() + 4000;
      // Jangan rebut state aktivitas yang sedang main.
      if (!ctx.isActive || !ctx.isActive()) S.state = 'busy';
    }, ctx.REDUCED ? 0 : 2500);
  } else if (event.type === 'coin_found') {
    if (!ctx.REDUCED) ctx.showIcon('think', 3000);
    S.busyUntil = now + 3000;
    S.state = 'busy';
    setTimeout(() => {
      if (!ctx.REDUCED) ctx.showIcon('sparkle', 3000);
      S.busyUntil = performance.now() + 3000;
      if (!ctx.isActive || !ctx.isActive()) S.state = 'busy';
    }, ctx.REDUCED ? 0 : 3000);
  } else if (event.type === 'report_ready') {
    const tone = d.tone || 'neutral';
    if (!ctx.REDUCED) ctx.showIcon(tone === 'warn' ? 'anger' : 'sparkle', 4000);
    S.busyUntil = now + 3000;
    S.state = 'busy';
  } else if (event.type === 'agent_offline') {
    if (!ctx.REDUCED) ctx.showIcon('sleep', 60000);
  } else if (event.type === 'agent_online') {
    ctx.hideIcon();
    if (!ctx.REDUCED) ctx.showIcon('sparkle', 3000);
    S.busyUntil = now + 2000;
    S.state = 'busy';
  }
}
