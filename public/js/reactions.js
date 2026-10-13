/**
 * Mapping event -> ikon + status sibuk untuk karakter agen.
 * Dipisah dari agent.js agar tiap file tetap kecil.
 */
import { bubbleForEvent } from './bubbles.js';

/**
 * Terapkan reaksi visual untuk satu event milik agen ini.
 * @param {{ S: any, id: string, w: number, h: number, badge: HTMLElement, showIcon: (n: string, ms: number) => void, hideIcon: () => void, busy: (icon: string, ms: number, now: number) => void, bubbles: any, REDUCED: boolean }} ctx
 * @param {any} event
 */
export function reactToEvent(ctx, event) {
  const { S, id, bubbles } = ctx;
  if (event.agentId !== id) return;
  const d = event.data || {};
  bubbles.say(id, bubbleForEvent(event));
  const now = performance.now();
  if (event.type === 'position_out_of_range') {
    S.unacked += 1;
    ctx.badge.textContent = String(S.unacked);
    ctx.badge.style.display = 'block';
    ctx.badge.style.left = ctx.w / 2 - 8 + 'px';
    ctx.badge.style.bottom = ctx.h - 10 + 'px';
    if (!ctx.REDUCED) ctx.showIcon('alert', 60000);
  } else if (event.type === 'position_back_in_range') {
    S.unacked = 0;
    ctx.badge.style.display = 'none';
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
      S.state = 'busy';
    }, ctx.REDUCED ? 0 : 2500);
  } else if (event.type === 'coin_found') {
    if (!ctx.REDUCED) ctx.showIcon('think', 3000);
    S.busyUntil = now + 3000;
    S.state = 'busy';
    setTimeout(() => {
      if (!ctx.REDUCED) ctx.showIcon('sparkle', 3000);
      S.busyUntil = performance.now() + 3000;
      S.state = 'busy';
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
    S.unacked = 0;
    ctx.badge.style.display = 'none';
    S.busyUntil = now + 2000;
    S.state = 'busy';
  }
}
