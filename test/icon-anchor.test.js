import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { placeIcon } from '../public/js/icon-anchor.js';

describe('icon-anchor: posisi emote di samping kepala', () => {
  const base = {
    spriteW: 200,
    spriteH: 220,
    headLeft: 60,
    headRight: 140,
    iconW: 30,
    iconH: 40,
    feetX: 600,
    stageW: 1376,
  };
  it('sisi kanan: tepi kiri di headRight + 6', () => {
    const r = placeIcon({ ...base, side: 'right' });
    assert.equal(r.side, 'right');
    assert.equal(r.left, -100 + 140 + 6);
  });
  it('tengah vertikal di 20% dari atas sprite', () => {
    const r = placeIcon({ ...base, side: 'right' });
    assert.equal(r.bottom, 220 * 0.8 - 40 / 2);
  });
  it('sisi kiri: tepi kanan di headLeft - 6', () => {
    const r = placeIcon({ ...base, side: 'left' });
    assert.equal(r.side, 'left');
    assert.equal(r.left, -100 + 60 - 6 - 30);
  });
  it('auto-flip ke kiri bila ikon keluar kanan stage', () => {
    const r = placeIcon({ ...base, side: 'right', feetX: 1350 });
    assert.equal(r.side, 'left');
    assert.ok(1350 + r.left + 30 <= 1376 || r.side === 'left');
  });
  it('auto-flip ke kanan bila ikon keluar kiri stage', () => {
    const r = placeIcon({ ...base, side: 'left', feetX: 40 });
    assert.equal(r.side, 'right');
  });
  it('tetap di sisi yang diminta bila muat', () => {
    assert.equal(placeIcon({ ...base, side: 'right' }).side, 'right');
    assert.equal(placeIcon({ ...base, side: 'left' }).side, 'left');
  });
  it('ukuran ikon berskala dipakai apa adanya', () => {
    const small = placeIcon({ ...base, side: 'right', iconW: 18, iconH: 24 });
    assert.equal(small.left, -100 + 140 + 6);
    assert.equal(small.bottom, 220 * 0.8 - 24 / 2);
  });
});
