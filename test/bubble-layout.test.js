import { it } from 'node:test';
import assert from 'node:assert/strict';
import { layoutBubbles } from '../public/js/bubble-layout.js';

it('bubble berdekatan tidak bertumpuk dan tetap di dalam viewport ponsel', () => {
  const bounds = { x: 4, y: 4, width: 382, height: 700 };
  const items = [0, 1, 2, 3, 4].map((id) => ({ id, x: 195 + id * 8, y: 400, width: 230, height: 52 }));
  const placed = layoutBubbles(items, bounds);
  for (let i = 0; i < placed.length; i++) {
    const a = placed[i];
    assert.ok(a.x >= bounds.x && a.x + a.width <= bounds.x + bounds.width);
    assert.ok(a.y >= bounds.y && a.y + a.height <= bounds.y + bounds.height);
    for (const b of placed.slice(i + 1)) {
      assert.ok(a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y);
    }
  }
});

it('bubble dekat tepi atas dan kanan tetap terbaca di dalam viewport', () => {
  const [p] = layoutBubbles([{ x: 390, y: 0, width: 240, height: 60 }], { x: 4, y: 4, width: 382, height: 300 });
  assert.equal(p.x, 146);
  assert.equal(p.y, 4);
});
