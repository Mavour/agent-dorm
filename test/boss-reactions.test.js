import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { reactionForEvent } from '../server/services/boss-reactions.js';
import { createBossController } from '../server/services/boss-controller.js';

/** @param {string} type @param {string} agentId @param {any} data */
function evt(type, agentId, data = {}) {
  return { id: `e-${type}-${Math.random()}`, ts: new Date().toISOString(), type, level: 'info', message: 'x', agentId, data };
}

describe('boss-reactions: coin_found menyebut skor dan simbol', () => {
  it('skor >= 80 -> think + baris skor', () => {
    const r = reactionForEvent(evt('coin_found', 'alert', { symbol: 'NEKOZ', score: 84 }));
    assert.equal(r.state, 'think');
    assert.ok(r.bubble.includes('Skor 84') && r.bubble.includes('NEKOZ'));
  });
  it('batas 80/79/70/69', () => {
    assert.ok(reactionForEvent(evt('coin_found', 'alert', { symbol: 'A', score: 80 })).bubble.startsWith('Skor 80'));
    assert.ok(reactionForEvent(evt('coin_found', 'alert', { symbol: 'A', score: 79 })).bubble.includes('79...'));
    assert.ok(reactionForEvent(evt('coin_found', 'alert', { symbol: 'A', score: 70 })).bubble.includes('70...'));
    assert.ok(reactionForEvent(evt('coin_found', 'alert', { symbol: 'A', score: 69 })).bubble.includes('biasa saja'));
  });
  it('riskFlags pertama mengganti kalimat kedua', () => {
    const r = reactionForEvent(evt('coin_found', 'alert', { symbol: 'NEKOZ', score: 84, riskFlags: ['Likuiditas tipis'] }));
    assert.ok(r.bubble.includes('Likuiditas tipis'));
    assert.ok(!r.bubble.includes('Cek likuiditasnya'));
  });
});

describe('boss-reactions: position_closed menyebut pair dan angka', () => {
  it('pnl >= 40 -> laugh', () => {
    const r = reactionForEvent(evt('position_closed', 'exitbot', { pair: 'SOL/USDC', pnlUsd: 62.4, reason: 'take_profit' }));
    assert.equal(r.state, 'laugh');
    assert.ok(r.bubble.includes('SOL/USDC') && r.bubble.includes('62.40') && r.bubble.includes('Take profit'));
  });
  it('batas 40 / 0 / -20', () => {
    assert.equal(reactionForEvent(evt('position_closed', 'exitbot', { pair: 'A/B', pnlUsd: 40 })).state, 'laugh');
    assert.equal(reactionForEvent(evt('position_closed', 'exitbot', { pair: 'A/B', pnlUsd: 39.99 })).state, 'approve');
    assert.equal(reactionForEvent(evt('position_closed', 'exitbot', { pair: 'A/B', pnlUsd: 0 })).state, 'approve');
    assert.equal(reactionForEvent(evt('position_closed', 'exitbot', { pair: 'A/B', pnlUsd: -0.01 })).state, 'think');
    assert.equal(reactionForEvent(evt('position_closed', 'exitbot', { pair: 'A/B', pnlUsd: -19.99 })).state, 'think');
    assert.equal(reactionForEvent(evt('position_closed', 'exitbot', { pair: 'A/B', pnlUsd: -20 })).state, 'angry');
  });
  it('rugi menyebut angka absolut + alasan', () => {
    const r = reactionForEvent(evt('position_closed', 'exitbot', { pair: 'MEW/USDC', pnlUsd: -23.8, reason: 'stop_loss' }));
    assert.equal(r.state, 'angry');
    assert.ok(r.bubble.includes('MEW/USDC') && r.bubble.includes('23.80') && r.bubble.includes('Stop loss'));
  });
});

describe('boss-reactions: range, rapor, online/offline', () => {
  it('out_of_range -> shock menyebut pair', () => {
    const r = reactionForEvent(evt('position_out_of_range', 'lpwatcher', { pair: 'WIF/SOL' }));
    assert.equal(r.state, 'shock');
    assert.ok(r.bubble.includes('WIF/SOL'));
  });
  it('back_in_range -> approve', () => {
    const r = reactionForEvent(evt('position_back_in_range', 'lpwatcher', { pair: 'WIF/SOL' }));
    assert.equal(r.state, 'approve');
    assert.ok(r.bubble.includes('WIF/SOL'));
  });
  it('report_ready: good/neutral approve, warn angry; bubble = judul + frasa', () => {
    const g = reactionForEvent(evt('report_ready', 'portfolio', { tone: 'good', title: 'Rapor harian: hemat', text: 'Hemat banget. Pertahankan!' }));
    assert.equal(g.state, 'approve');
    assert.ok(g.bubble.startsWith('Rapor harian: hemat'));
    const n = reactionForEvent(evt('report_ready', 'portfolio', { tone: 'neutral', title: 'Rapor harian: stabil', text: 'Stabil.' }));
    assert.equal(n.state, 'approve');
    const w = reactionForEvent(evt('report_ready', 'portfolio', { tone: 'warn', title: 'Rapor harian: boros', text: 'Boros. Rem!' }));
    assert.equal(w.state, 'angry');
    assert.ok(w.bubble.startsWith('Rapor harian: boros'));
  });
  it('offline/online menyebut nama agen', () => {
    assert.equal(reactionForEvent(evt('agent_offline', 'portfolio')).bubble, 'Karo offline!');
    assert.equal(reactionForEvent(evt('agent_online', 'alert')).bubble, 'Bot Alert sudah kembali.');
    assert.equal(reactionForEvent(evt('agent_offline', 'exitbot')).state, 'shock');
    assert.equal(reactionForEvent(evt('agent_online', 'lpwatcher')).state, 'approve');
  });
  it('info -> null', () => {
    assert.equal(reactionForEvent(evt('info', 'x')), null);
  });
});

describe('boss-reactions: bubble maks 60 karakter', () => {
  it('input panjang tetap dipotong 60', () => {
    const long = 'SUPERPANJANGTOKENNAMAXYZABCDEFGHIJ';
    const cases = [
      reactionForEvent(evt('coin_found', 'alert', { symbol: long, score: 99, riskFlags: ['Risiko yang sangat panjang sekali melebihi batas normal banget'] })),
      reactionForEvent(evt('position_closed', 'exitbot', { pair: long + '/' + long, pnlUsd: -12345.67, reason: 'stop_loss' })),
      reactionForEvent(evt('report_ready', 'portfolio', { tone: 'warn', title: 'Rapor harian: boros dan sangat panjang sekali', text: 'Kalimat pertama yang amat sangat panjang melebihi enam puluh karakter.' })),
    ];
    for (const r of cases) {
      assert.ok(r.bubble.length <= 60, r.bubble);
    }
  });
});

describe('boss-controller: play langsung + meta', () => {
  it('play menyiarkan sekali dengan sourceEventId dan agentId', () => {
    const out = [];
    const boss = createBossController({ schedule: () => 0, cancel: () => {} });
    boss.onBoss((b) => out.push({ ...b }));
    boss.play({ state: 'laugh', bubble: 'Mantap!', durationMs: 6000 }, { sourceEventId: 'e-1', agentId: 'exitbot' });
    assert.equal(out.length, 1);
    assert.equal(out[0].state, 'laugh');
    assert.equal(out[0].sourceEventId, 'e-1');
    assert.equal(out[0].agentId, 'exitbot');
    assert.equal(out[0].seq, 1);
    assert.equal(boss.get().state, 'laugh');
  });
  it('idleTick saat idle memainkan sip', () => {
    const out = [];
    const boss = createBossController({ schedule: () => 0, cancel: () => {} });
    boss.onBoss((b) => out.push({ ...b }));
    boss.idleTick();
    assert.equal(out.length, 1);
    assert.equal(out[0].state, 'sip');
  });
});
