import { it } from 'node:test';
import assert from 'node:assert/strict';

async function fixture(t, suffix) {
  const original = { Audio: globalThis.Audio, document: globalThis.document };
  const players = [];
  const handlers = new Map();
  globalThis.document = { hidden: false, addEventListener: (name, fn) => handlers.set(name, fn) };
  globalThis.Audio = class {
    paused = true;
    currentTime = 42;
    plays = 0;
    pauses = 0;
    constructor() { players.push(this); }
    play() { this.plays++; this.paused = false; return Promise.resolve(); }
    pause() { this.pauses++; this.paused = true; }
  };
  t.after(() => {
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) delete globalThis[key];
      else globalThis[key] = value;
    }
  });
  const sound = await import(`../public/js/sound.js?${suffix}`);
  return { sound, players, visibility: hidden => { globalThis.document.hidden = hidden; handlers.get('visibilitychange')(); } };
}

it('background recording loads only after interaction, loops, and does not restart or layer music during duel', async t => {
  const { sound, players } = await fixture(t, 'recording');
  sound.setMuted(false);
  assert.equal(players.length, 0);
  assert.equal(sound.unlock(), true);
  const track = players[0];
  assert.equal(track.preload, 'none');
  assert.equal(track.loop, true);
  assert.equal(track.src, '/audio/japan-rock-loop.mp3');
  assert.ok(track.volume > 0 && track.volume < 0.5);
  sound.unlock();
  sound.duelMode(true); sound.duelMode(false);
  assert.equal(players.length, 1);
  assert.equal(track.plays, 1);
  assert.equal(track.currentTime, 42);
});

it('mute and tab visibility pause/resume the same recording without resetting playback position', async t => {
  const { sound, players, visibility } = await fixture(t, 'visibility');
  sound.setMuted(true);
  sound.unlock();
  const track = players[0];
  assert.equal(track.plays, 0);
  sound.setMuted(false); assert.equal(track.paused, false);
  visibility(true); assert.equal(track.paused, true);
  visibility(false); assert.equal(track.paused, false);
  sound.setMuted(true); assert.equal(track.paused, true);
  visibility(true); visibility(false);
  assert.equal(track.paused, true, 'a hidden/visible transition must not override mute');
  sound.setMuted(false);
  assert.equal(track.currentTime, 42);
});
