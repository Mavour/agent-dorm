import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { noteFreq, swordClash, dashWhoosh, duelMode, unlock, isMuted, setMuted } from '../public/js/sound.js';

describe('sound: synth tanpa AudioContext = no-op aman', () => {
  it('noteFreq MIDI benar', () => {
    assert.equal(noteFreq(69), 440);
    assert.equal(noteFreq(81), 880);
    assert.ok(Math.abs(noteFreq(60) - 261.63) < 0.01);
  });
  it('tanpa AudioContext tak berbunyi tapi tak crash', () => {
    assert.equal(unlock(), false);
    assert.equal(swordClash(), false);
    assert.equal(dashWhoosh(), false);
    duelMode(true);
    duelMode(false);
  });
  it('mute on/off tersimpan', () => {
    setMuted(true);
    assert.equal(isMuted(), true);
    setMuted(false);
    assert.equal(isMuted(), false);
  });
});
