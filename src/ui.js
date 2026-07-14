import { Audio } from './systems/AudioSynth.js';
import { PAL } from './pixelart.js';
import { GAME_W, GAME_H, RENDER_SCALE, RENDER_W, RENDER_H } from './config.js';

// Kept system-only so the portal build remains self-contained. Heavy weight,
// tight tracking and integer positioning make it read like late-90s broadcast UI.
export const FONT = '"Arial Black", "Trebuchet MS", sans-serif';
export const MONO_FONT = '"Courier New", monospace';

export const UI_DEPTH = {
  backdrop: 0,
  content: 100,
  chrome: 1000,
  overlay: 3000
};

function toCss(value) {
  return `#${value.toString(16).padStart(6, '0')}`;
}

export function configureHdCamera(scene) {
  const camera = scene.cameras.main;
  camera.setViewport(0, 0, RENDER_W, RENDER_H);
  camera.setZoom(RENDER_SCALE);
  camera.centerOn(GAME_W / 2, GAME_H / 2);
  camera.roundPixels = true;
  return camera;
}

export function crispText(text, resolution = RENDER_SCALE) {
  text.setResolution?.(resolution);
  return text;
}

function shade(color, amount) {
  const r = Math.max(0, Math.min(255, (color >> 16) + amount));
  const g = Math.max(0, Math.min(255, ((color >> 8) & 0xff) + amount));
  const b = Math.max(0, Math.min(255, (color & 0xff) + amount));
  return (r << 16) | (g << 8) | b;
}

export function drawPanel(g, x, y, w, h, opts = {}) {
  const fill = opts.fill ?? PAL.panel;
  const border = opts.border ?? PAL.border;
  const shadow = opts.shadow ?? PAL.ink;
  const alpha = opts.alpha ?? 0.98;

  g.fillStyle(shadow, 0.72 * alpha);
  g.fillRect(x + 3, y + 3, w, h);
  g.fillStyle(PAL.ink, alpha);
  g.fillRect(x, y, w, h);
  g.fillStyle(border, alpha);
  g.fillRect(x + 1, y + 1, w - 2, h - 2);
  g.fillStyle(fill, alpha);
  g.fillRect(x + 3, y + 3, w - 6, h - 6);

  // A one-pixel light source from the upper left, plus clipped brass corners.
  g.fillStyle(opts.highlight ?? PAL.panelHi, 0.92 * alpha);
  g.fillRect(x + 3, y + 3, w - 6, 1);
  g.fillRect(x + 3, y + 3, 1, h - 6);
  g.fillStyle(PAL.ink, 0.52 * alpha);
  g.fillRect(x + 3, y + h - 4, w - 6, 1);
  g.fillRect(x + w - 4, y + 3, 1, h - 6);

  const corner = opts.corner ?? PAL.goldDark;
  g.fillStyle(corner, 0.88 * alpha);
  g.fillRect(x + 1, y + 1, 4, 1);
  g.fillRect(x + 1, y + 1, 1, 4);
  g.fillRect(x + w - 5, y + 1, 4, 1);
  g.fillRect(x + w - 2, y + 1, 1, 4);
  g.fillRect(x + 1, y + h - 2, 4, 1);
  g.fillRect(x + 1, y + h - 5, 1, 4);
  g.fillRect(x + w - 5, y + h - 2, 4, 1);
  g.fillRect(x + w - 2, y + h - 5, 1, 4);
  return g;
}

function drawButton(g, w, h, fill, state, opts) {
  const pressed = state === 'pressed';
  const disabled = state === 'disabled';
  const y = pressed ? 1 : 0;
  const border = opts.border ?? (opts.selected ? PAL.gold : PAL.border);

  g.clear();
  if (!pressed) {
    g.fillStyle(PAL.ink, 0.78);
    g.fillRect(-w / 2 + 2, -h / 2 + 3, w, h);
  }
  g.fillStyle(PAL.ink, disabled ? 0.62 : 1);
  g.fillRect(-w / 2, -h / 2 + y, w, h);
  g.fillStyle(disabled ? PAL.borderDark : border, 1);
  g.fillRect(-w / 2 + 1, -h / 2 + 1 + y, w - 2, h - 2);
  g.fillStyle(disabled ? PAL.panelMuted : fill, 1);
  g.fillRect(-w / 2 + 3, -h / 2 + 3 + y, w - 6, h - 6);

  if (!disabled) {
    g.fillStyle(opts.highlight ?? shade(fill, 28), 0.9);
    g.fillRect(-w / 2 + 3, -h / 2 + 3 + y, w - 6, 1);
    g.fillRect(-w / 2 + 3, -h / 2 + 3 + y, 1, h - 6);
    g.fillStyle(opts.lowlight ?? shade(fill, -30), 0.95);
    g.fillRect(-w / 2 + 3, h / 2 - 4 + y, w - 6, 1);
    g.fillRect(w / 2 - 4, -h / 2 + 3 + y, 1, h - 6);
  }

  if (opts.selected) {
    g.fillStyle(PAL.gold, 1);
    g.fillRect(-w / 2 + 1, -h / 2 + 1 + y, 3, 3);
    g.fillRect(w / 2 - 4, -h / 2 + 1 + y, 3, 3);
  }
}

// Tactile pixel button. Actions fire only when the pointer is released inside,
// preventing accidental navigation after a swipe or drag.
export function makeButton(scene, x, y, w, h, label, onClick, opts = {}) {
  const base = opts.color ?? PAL.blue;
  const hover = opts.hover ?? shade(base, 18);
  const pressed = opts.pressed ?? shade(base, -18);
  const bg = scene.add.graphics();
  const txt = crispText(scene.add.text(opts.icon ? 7 : 0, opts.labelY ?? 0, label, {
    fontFamily: opts.fontFamily ?? FONT,
    fontStyle: opts.fontStyle ?? 'bold',
    fontSize: opts.fontSize ?? '10px',
    color: opts.textColor ?? toCss(PAL.cream),
    stroke: opts.stroke ?? toCss(PAL.ink),
    strokeThickness: opts.strokeThickness ?? 1,
    align: 'center'
  }).setOrigin(0.5));
  txt.setLetterSpacing(opts.letterSpacing ?? 0.25);

  const children = [bg];
  let icon = null;
  if (opts.icon) {
    icon = scene.add.image(-(w / 2) + (opts.iconX ?? 16), opts.iconY ?? 0, opts.icon)
      .setScale(opts.iconScale ?? 1);
    children.push(icon);
  }
  children.push(txt);

  const c = scene.add.container(x, y, children);
  let enabled = opts.disabled !== true;
  let isOver = false;
  let isDown = false;

  const render = (state = enabled ? (isDown ? 'pressed' : (isOver ? 'hover' : 'idle')) : 'disabled') => {
    const fill = state === 'hover' ? hover : state === 'pressed' ? pressed : base;
    drawButton(bg, w, h, fill, state, opts);
    const offset = state === 'pressed' ? 1 : 0;
    txt.setY((opts.labelY ?? 0) + offset).setAlpha(enabled ? 1 : 0.48);
    if (icon) icon.setY((opts.iconY ?? 0) + offset).setAlpha(enabled ? 1 : 0.42);
  };

  const hitW = opts.hitWidth ?? Math.max(w, 44);
  const hitH = opts.hitHeight ?? Math.max(h, 28);
  c.setSize(hitW, hitH);
  if (enabled) c.setInteractive({ useHandCursor: true });
  render();

  c.on('pointerover', () => {
    isOver = true;
    render();
  });
  c.on('pointerout', () => {
    isOver = false;
    isDown = false;
    render();
  });
  c.on('pointerdown', () => {
    if (!enabled) return;
    isOver = true;
    isDown = true;
    render();
  });
  c.on('pointerup', () => {
    if (!enabled || !isDown) return;
    const shouldFire = isOver;
    isDown = false;
    render();
    if (shouldFire) {
      Audio.ui();
      onClick?.();
    }
  });
  c.on('pointerupoutside', () => {
    isDown = false;
    isOver = false;
    render();
  });

  c.setButtonEnabled = (value) => {
    enabled = Boolean(value);
    isDown = false;
    isOver = false;
    if (enabled) c.setInteractive({ useHandCursor: true });
    else c.disableInteractive();
    render();
    return c;
  };
  c.buttonLabel = txt;
  c.buttonIcon = icon;
  c.buttonWidth = w;
  c.buttonHeight = h;
  return c;
}

export function makeIconButton(scene, x, y, size, icon, onClick, opts = {}) {
  return makeButton(scene, x, y, size, size, '', onClick, {
    ...opts,
    icon,
    iconX: size / 2,
    iconY: 0,
    iconScale: opts.iconScale ?? 1,
    hitWidth: opts.hitWidth ?? Math.max(size, 30),
    hitHeight: opts.hitHeight ?? Math.max(size, 30)
  });
}

export function titleText(scene, x, y, str, size = '26px', color = toCss(PAL.cream)) {
  const text = crispText(scene.add.text(x, y, str, {
    fontFamily: FONT,
    fontStyle: 'bold',
    fontSize: size,
    color,
    stroke: toCss(PAL.ink),
    strokeThickness: 3,
    align: 'center'
  }).setOrigin(0.5));
  text.setLetterSpacing(-0.5);
  return text;
}

export function bodyText(scene, x, y, str, opts = {}) {
  const text = crispText(scene.add.text(x, y, str, {
    fontFamily: opts.fontFamily ?? MONO_FONT,
    fontStyle: opts.fontStyle ?? 'bold',
    fontSize: opts.fontSize ?? '9px',
    color: opts.color ?? toCss(PAL.cream),
    stroke: opts.stroke ?? toCss(PAL.ink),
    strokeThickness: opts.strokeThickness ?? 1,
    align: opts.align ?? 'left',
    lineSpacing: opts.lineSpacing ?? 1,
    wordWrap: opts.wordWrap
  }).setOrigin(opts.originX ?? 0, opts.originY ?? 0.5));
  text.setLetterSpacing(opts.letterSpacing ?? 0.2);
  return text;
}

export function makeStatChip(scene, x, y, w, iconKey, value, opts = {}) {
  const h = opts.height ?? 22;
  const g = scene.add.graphics();
  drawPanel(g, -w / 2, -h / 2, w, h, {
    fill: opts.fill ?? PAL.panel,
    border: opts.border ?? PAL.borderDark,
    corner: opts.corner ?? PAL.goldDark
  });
  const icon = scene.add.image(-w / 2 + 13, 0, iconKey).setScale(opts.iconScale ?? 1);
  const txt = bodyText(scene, -w / 2 + 25, 0, String(value), {
    fontFamily: FONT,
    fontSize: opts.fontSize ?? '9px',
    color: opts.color ?? toCss(PAL.cream)
  });
  const c = scene.add.container(x, y, [g, icon, txt]);
  c.valueText = txt;
  return c;
}

export function makeStars(scene, x, y, count, opts = {}) {
  const scale = opts.scale ?? 1;
  const gap = opts.gap ?? 11;
  const stars = [];
  for (let i = 0; i < 3; i++) {
    const star = scene.add.image((i - 1) * gap, 0, i < count ? 'icon-star' : 'icon-star-empty')
      .setScale(scale);
    stars.push(star);
  }
  return scene.add.container(x, y, stars);
}

export function addScanlines(scene, depth = 2500, alpha = 0.045) {
  const g = scene.add.graphics().setDepth(depth);
  g.fillStyle(PAL.ink, alpha);
  for (let y = 1; y < 270; y += 4) g.fillRect(0, y, 480, 1);
  g.setBlendMode('MULTIPLY');
  return g;
}

export function sceneIntro(scene, duration = 180) {
  scene.cameras.main.fadeIn(duration, (PAL.ink >> 16) & 0xff, (PAL.ink >> 8) & 0xff, PAL.ink & 0xff);
}

export function formatCompact(value) {
  const n = Math.max(0, Number(value) || 0);
  if (n >= 1000000) return `${(n / 1000000).toFixed(n >= 10000000 ? 0 : 1)}M`;
  if (n >= 10000) return `${(n / 1000).toFixed(n >= 100000 ? 0 : 1)}K`;
  return Math.floor(n).toLocaleString('en-US');
}
