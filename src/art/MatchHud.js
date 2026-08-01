// Broadcast-match chrome shared by GameScene and its regression tests.
// Every coordinate is in the 480x270 logical canvas; Phaser scales the final
// image with nearest-neighbour sampling, keeping the one-pixel bevels crisp.

export const MATCH_HUD_LAYOUT = Object.freeze({
  topLeft: Object.freeze({ x: 66, y: 4, w: 91, h: 27 }),
  topCenter: Object.freeze({ x: 162, y: 3, w: 156, h: 30 }),
  topRight: Object.freeze({ x: 323, y: 4, w: 91, h: 27 }),
  badgeLeft: Object.freeze({ x: 132, y: 36, w: 102, h: 13 }),
  badgeRight: Object.freeze({ x: 241, y: 36, w: 107, h: 13 }),
  result: Object.freeze({ x: 137, y: 58, w: 206, h: 35 }),
  pressureIcon: Object.freeze({ x: 8, y: 247, w: 28, h: 19 }),
  pressureMeter: Object.freeze({ x: 43, y: 250, w: 134, h: 14 }),
  objectiveLabel: Object.freeze({ x: 290, y: 247, w: 87, h: 19 }),
  objectiveValue: Object.freeze({ x: 382, y: 247, w: 90, h: 19 })
});

export const RESULT_THEMES = Object.freeze({
  GOAL: Object.freeze({ fill: 0x155f35, inner: 0x2d874b, border: 0xf3c449, edge: 0xffedbd, glow: 0xf3c449, color: '#fff0a8' }),
  SAVE: Object.freeze({ fill: 0x7b1717, inner: 0xa72316, border: 0xe3722c, edge: 0xffb347, glow: 0xff5a36, color: '#ffb347' }),
  WALL: Object.freeze({ fill: 0x7b1717, inner: 0xa72316, border: 0xe3722c, edge: 0xffb347, glow: 0xff5a36, color: '#ffb347' }),
  POST: Object.freeze({ fill: 0x794011, inner: 0xa75a18, border: 0xf3c449, edge: 0xffd27a, glow: 0xffab40, color: '#ffd27a' }),
  MISS: Object.freeze({ fill: 0x243342, inner: 0x30465b, border: 0x667b88, edge: 0xb0bec5, glow: 0x74bde8, color: '#d7dfda' })
});

export function getResultTheme(outcome = 'MISS') {
  const key = outcome === 'CAUGHT' ? 'SAVE' : outcome;
  return RESULT_THEMES[key] || RESULT_THEMES.MISS;
}

function bevelPoints({ x, y, w, h }, cut = 5, tail = 0) {
  const points = [
    { x: x + cut, y }, { x: x + w - cut, y },
    { x: x + w, y: y + cut }, { x: x + w, y: y + h - cut },
    { x: x + w - cut, y: y + h },
  ];
  if (tail > 0) {
    points.push({ x: x + w / 2 + tail, y: y + h });
    points.push({ x: x + w / 2, y: y + h + tail });
    points.push({ x: x + w / 2 - tail, y: y + h });
  }
  points.push(
    { x: x + cut, y: y + h }, { x, y: y + h - cut }, { x, y: y + cut }
  );
  return points;
}

export function drawBroadcastPlate(g, bounds, opts = {}) {
  const fill = opts.fill ?? 0x13263a;
  const inner = opts.inner ?? 0x173047;
  const border = opts.border ?? 0xa28758;
  const edge = opts.edge ?? 0xf3e7c3;
  const tail = opts.tail ?? 0;
  const cut = opts.cut ?? 5;
  const alpha = opts.alpha ?? 0.98;
  const shadowBounds = { ...bounds, x: bounds.x + 2, y: bounds.y + 3 };

  g.fillStyle(0x071018, 0.8 * alpha).fillPoints(bevelPoints(shadowBounds, cut, tail), true);
  g.fillStyle(0x071018, alpha).fillPoints(bevelPoints(bounds, cut, tail), true);
  const frame = { x: bounds.x + 1, y: bounds.y + 1, w: bounds.w - 2, h: bounds.h - 2 };
  g.fillStyle(border, alpha).fillPoints(bevelPoints(frame, Math.max(3, cut - 1), tail), true);
  const face = { x: bounds.x + 3, y: bounds.y + 3, w: bounds.w - 6, h: bounds.h - 6 };
  g.fillStyle(fill, alpha).fillPoints(bevelPoints(face, Math.max(2, cut - 2), Math.max(0, tail - 2)), true);
  g.fillStyle(inner, 0.72 * alpha).fillRect(face.x + 2, face.y + 2, face.w - 4, Math.max(1, face.h - 5));

  // Metal lip, lowlight and tiny brass fasteners sell the arcade cabinet feel.
  g.fillStyle(edge, 0.72 * alpha).fillRect(face.x + 3, face.y, Math.max(1, face.w - 6), 1);
  g.fillStyle(0x071018, 0.62 * alpha).fillRect(face.x + 3, face.y + face.h - 2, Math.max(1, face.w - 6), 1);
  g.fillStyle(0xf3c449, alpha);
  g.fillRect(bounds.x + 4, bounds.y + 4, 2, 2);
  g.fillRect(bounds.x + bounds.w - 6, bounds.y + 4, 2, 2);
  g.fillRect(bounds.x + 4, bounds.y + bounds.h - 6, 2, 2);
  g.fillRect(bounds.x + bounds.w - 6, bounds.y + bounds.h - 6, 2, 2);
  return g;
}

export function drawHudBadge(g, bounds, opts = {}) {
  const fill = opts.fill ?? 0x795000;
  const border = opts.border ?? 0xf3c449;
  const highlight = opts.highlight ?? 0xffedbd;
  const radius = Math.max(2, Math.floor(bounds.h / 2));
  g.fillStyle(0x071018, 0.76).fillRoundedRect(bounds.x + 2, bounds.y + 2, bounds.w, bounds.h, radius);
  g.fillStyle(0x071018, 1).fillRoundedRect(bounds.x, bounds.y, bounds.w, bounds.h, radius);
  g.fillStyle(border, 1).fillRoundedRect(bounds.x + 1, bounds.y + 1, bounds.w - 2, bounds.h - 2, radius - 1);
  g.fillStyle(fill, 1).fillRoundedRect(bounds.x + 3, bounds.y + 3, bounds.w - 6, bounds.h - 6, Math.max(1, radius - 2));
  g.fillStyle(highlight, 0.72).fillRect(bounds.x + radius, bounds.y + 3, bounds.w - radius * 2, 1);
  return g;
}

export function pressureSegmentColor(index, count = 10) {
  const progress = count <= 1 ? 1 : index / (count - 1);
  if (progress < 0.28) return 0x49a760;
  if (progress < 0.5) return 0xb7c928;
  if (progress < 0.7) return 0xf3c449;
  if (progress < 0.86) return 0xe78324;
  return 0xd73324;
}

export function drawSegmentedPressureMeter(g, bounds, amount, count = 10) {
  const value = Math.max(0, Math.min(1, Number(amount) || 0));
  g.fillStyle(0x071018, 0.84).fillRect(bounds.x + 2, bounds.y + 2, bounds.w, bounds.h);
  g.fillStyle(0x071018, 1).fillRect(bounds.x, bounds.y, bounds.w, bounds.h);
  g.fillStyle(0x667b88, 1).fillRect(bounds.x + 1, bounds.y + 1, bounds.w - 2, bounds.h - 2);
  g.fillStyle(0x13263a, 1).fillRect(bounds.x + 3, bounds.y + 3, bounds.w - 6, bounds.h - 6);

  const gap = 1;
  const usable = bounds.w - 8;
  const segmentW = (usable - gap * (count - 1)) / count;
  const lit = Math.round(value * count);
  for (let index = 0; index < count; index++) {
    const x = bounds.x + 4 + index * (segmentW + gap);
    const color = pressureSegmentColor(index, count);
    g.fillStyle(index < lit ? color : 0x24313c, index < lit ? 1 : 0.66)
      .fillRect(Math.round(x), bounds.y + 4, Math.max(2, Math.floor(segmentW)), bounds.h - 8);
    if (index < lit) g.fillStyle(0xffffff, 0.24).fillRect(Math.round(x), bounds.y + 4, Math.max(2, Math.floor(segmentW)), 1);
  }
  return g;
}

export function drawResultPlate(g, bounds, theme) {
  return drawBroadcastPlate(g, bounds, {
    fill: theme.fill,
    inner: theme.inner,
    border: theme.border,
    edge: theme.edge,
    cut: 6
  });
}
