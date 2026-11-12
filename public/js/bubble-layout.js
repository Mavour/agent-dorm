/** Tempatkan bubble dekat jangkar tanpa menutupi bubble yang sudah ditempatkan. */
export function layoutBubbles(items, bounds) {
  const gap = 10;
  const placed = [];
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(Math.max(lo, hi), v));
  for (const item of items) {
    const x = clamp(item.x - item.width / 2, bounds.x, bounds.x + bounds.width - item.width);
    const maxY = bounds.y + bounds.height - item.height;
    const desired = clamp(item.y - item.height, bounds.y, maxY);
    const candidates = [desired, bounds.y, maxY];
    for (const p of placed) candidates.push(p.y - item.height - gap, p.y + p.height + gap);
    const overlap = (y) => placed.reduce((sum, p) => {
      const w = Math.max(0, Math.min(x + item.width + gap, p.x + p.width) - Math.max(x - gap, p.x));
      const h = Math.max(0, Math.min(y + item.height + gap, p.y + p.height) - Math.max(y - gap, p.y));
      return sum + w * h;
    }, 0);
    const choices = candidates.map((y) => clamp(y, bounds.y, maxY));
    choices.sort((a, b) => overlap(a) - overlap(b) || Math.abs(a - desired) - Math.abs(b - desired));
    placed.push({ ...item, x, y: choices[0] });
  }
  return placed;
}
