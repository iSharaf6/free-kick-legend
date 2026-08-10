import { Audio } from './systems/AudioSynth.js';
import { PAL } from './pixelart.js';
import { GAME_W, GAME_H, RENDER_SCALE, RENDER_W, RENDER_H } from './config.js';

// One authored face keeps every menu, HUD and information label aligned with
// the settings chrome. Pixelify is intentionally loaded at its open-C 400 cut.
export const FONT = '"Pixelify Sans", monospace';
export const MONO_FONT = '"Pixelify Sans", monospace';

// Pixelify Sans ships only one usable cut here (400, loaded in main.js). Asking
// a canvas for `bold` in that family synthesises a faux-bold that thickens the
// stems into the counters: uppercase C becomes indistinguishable from O, so
// "KICK DISTRICT" renders as "KIOK DISTRIOT". Every Pixelify text style must
// therefore pass this weight rather than 'bold'.
export const PIXEL_TEXT_WEIGHT = '400';

export const UI_DEPTH = {
  backdrop: 0,
  content: 100,
  chrome: 1000,
  overlay: 3000
};

const BUTTON_NAVIGATION = Symbol('fkl-button-navigation');
const CANVAS_FOCUS_BRIDGE = Symbol('fkl-canvas-focus-bridge');

function gameCanvas(scene, documentRef = globalThis.document) {
  return scene?.game?.canvas ?? documentRef?.querySelector?.('#app canvas') ?? null;
}

export function canvasHasKeyboardFocus(scene, documentRef = globalThis.document) {
  const canvas = gameCanvas(scene, documentRef);
  if (!canvas) return true;
  // Lightweight embeds and renderer tests do not always expose activeElement.
  // In a browser, however, canvas controls must not hijack keys while focus is
  // still on the page, browser chrome, or the native settings dialog.
  const activeElement = documentRef?.activeElement;
  return !activeElement || activeElement === canvas;
}

function configureCanvasAccessibility(scene) {
  const canvas = gameCanvas(scene);
  if (!canvas?.setAttribute) return false;
  canvas.setAttribute('tabindex', '0');
  canvas.setAttribute('role', 'application');
  canvas.setAttribute(
    'aria-label',
    'Kick District game. Press Tab to enter game controls, then use Tab and arrow keys to choose, and Enter or Space to select.'
  );
  // Some browsers do not focus a canvas when it is pointer-operated. Give
  // pointer and keyboard users the same explicit ownership boundary, without
  // installing one listener per scene on Phaser's persistent canvas.
  if (!canvas[CANVAS_FOCUS_BRIDGE] && canvas.addEventListener) {
    const focusCanvas = () => canvas.focus?.({ preventScroll: true });
    canvas.addEventListener('pointerdown', focusCanvas);
    canvas[CANVAS_FOCUS_BRIDGE] = focusCanvas;
  }
  return true;
}

function accessibleButtonLabel(label, icon) {
  const text = String(label || '').replace(/\s+/g, ' ').trim();
  if (text) return text;
  const iconLabel = String(icon || '')
    .replace(/^icon-/, '')
    .replace(/-/g, ' ')
    .trim();
  if (iconLabel === 'mute' || iconLabel === 'sound') return 'Sound';
  return iconLabel
    ? iconLabel.replace(/\b\w/g, (character) => character.toUpperCase())
    : 'Game control';
}

function announceButtonFocus(button, documentRef = globalThis.document) {
  const status = documentRef?.getElementById?.('game-status');
  if (!status) return false;
  status.textContent = `${button.buttonAccessibleLabel || 'Game control'} button`;
  return true;
}

function hasActiveDomDialog(documentRef = globalThis.document) {
  const dialog = documentRef?.querySelector?.('[role="dialog"][aria-modal="true"]');
  if (!dialog) return false;
  // The settings dialog remains mounted while closed, with `hidden` on its
  // section. Only hand keyboard ownership to the DOM while that ancestor is
  // actually visible.
  return !dialog.closest?.('[hidden]');
}

function isVisibleInTree(object) {
  for (let current = object; current; current = current.parentContainer) {
    if (current.active === false || current.visible === false) return false;
    if (typeof current.alpha === 'number' && current.alpha <= 0) return false;
  }
  return true;
}

function isButtonFocusable(button) {
  return Boolean(
    button?.buttonEnabled &&
    isVisibleInTree(button) &&
    button.input?.enabled !== false
  );
}

function buttonPosition(button) {
  const matrix = button?.getWorldTransformMatrix?.();
  if (Number.isFinite(matrix?.tx) && Number.isFinite(matrix?.ty)) {
    return { x: matrix.tx, y: matrix.ty };
  }
  return {
    x: Number(button?.x) || 0,
    y: Number(button?.y) || 0
  };
}

function createButtonNavigation(scene) {
  const keyboard = scene?.input?.keyboard;
  if (!keyboard?.on) return null;
  configureCanvasAccessibility(scene);

  const buttons = [];
  let focused = null;
  let blocked = false;
  let cleaned = false;
  let lastHandledKeyEvent = null;
  let lastHandledKeySignature = null;

  const keySignature = (event) => {
    const stamp = Number(event?.timeStamp);
    const code = event?.code ?? event?.key ?? event?.keyCode;
    return Number.isFinite(stamp) && code !== undefined
      ? `${event?.type ?? 'keydown'}:${String(code)}:${stamp}`
      : null;
  };

  // Phaser can fan one modified DOM key event through the paused Scene input
  // queue more than once. Without an identity guard a single Shift+Tab may
  // traverse three buttons. Event.cancelled cannot serve as the guard because
  // the KeyboardPlugin resets it between those deliveries.
  const isRepeatedKeyEvent = (event) => {
    if (!event) return false;
    const signature = keySignature(event);
    return event === lastHandledKeyEvent || Boolean(signature && signature === lastHandledKeySignature);
  };

  const rememberKeyEvent = (event) => {
    lastHandledKeyEvent = event ?? null;
    lastHandledKeySignature = keySignature(event);
  };

  const availableButtons = () => {
    const available = buttons.filter(isButtonFocusable);
    if (focused && !available.includes(focused)) setFocused(null);
    return available;
  };

  const setFocused = (button) => {
    const next = isButtonFocusable(button) ? button : null;
    if (focused === next) return next;
    focused?.setButtonFocused?.(false);
    focused = next;
    focused?.setButtonFocused?.(true);
    if (focused) announceButtonFocus(focused);
    return focused;
  };

  const cycle = (direction) => {
    const available = availableButtons();
    if (!available.length) return false;
    const currentIndex = available.indexOf(focused);
    const nextIndex = currentIndex < 0
      ? (direction > 0 ? 0 : available.length - 1)
      : (currentIndex + direction + available.length) % available.length;
    setFocused(available[nextIndex]);
    return true;
  };

  const move = (dx, dy) => {
    const available = availableButtons();
    if (!available.length) return false;
    if (!focused || !available.includes(focused)) {
      setFocused(available[0]);
      return true;
    }

    const origin = buttonPosition(focused);
    let best = null;
    let bestScore = Infinity;
    available.forEach((candidate) => {
      if (candidate === focused) return;
      const point = buttonPosition(candidate);
      const deltaX = point.x - origin.x;
      const deltaY = point.y - origin.y;
      const forward = deltaX * dx + deltaY * dy;
      if (forward <= 0) return;
      const cross = Math.abs(deltaX * dy - deltaY * dx);
      // Prefer the intended axis, then the nearest option on that axis. This
      // keeps rows and columns stable without making diagonal layouts inert.
      const score = forward + cross * 2;
      if (score < bestScore) {
        best = candidate;
        bestScore = score;
      }
    });
    if (!best) return false;
    setFocused(best);
    return true;
  };

  const activate = (event) => {
    if (event?.repeat || !isButtonFocusable(focused)) return false;
    return focused.activateButton?.() === true;
  };

  const handle = (event, action) => {
    if (hasActiveDomDialog()) return;
    if (!canvasHasKeyboardFocus(scene)) return;
    if (isRepeatedKeyEvent(event)) {
      event?.preventDefault?.();
      if (event) event.cancelled = 1;
      return;
    }
    if (blocked) {
      event?.preventDefault?.();
      if (event) event.cancelled = 1;
      return;
    }
    if (!action()) return;
    rememberKeyEvent(event);
    event?.preventDefault?.();
    if (event) event.cancelled = 1;
  };

  const handlers = new Map([
    ['keydown-TAB', (event) => handle(event, () => (
      event?.repeat || event?.cancelled ? false : cycle(event?.shiftKey ? -1 : 1)
    ))],
    ['keydown-UP', (event) => handle(event, () => move(0, -1))],
    ['keydown-DOWN', (event) => handle(event, () => move(0, 1))],
    ['keydown-LEFT', (event) => handle(event, () => move(-1, 0))],
    ['keydown-RIGHT', (event) => handle(event, () => move(1, 0))],
    ['keydown-ENTER', (event) => handle(event, () => activate(event))],
    ['keydown-SPACE', (event) => handle(event, () => activate(event))]
  ]);
  handlers.forEach((handler, eventName) => keyboard.on(eventName, handler));

  const remove = (button) => {
    const index = buttons.indexOf(button);
    if (index >= 0) buttons.splice(index, 1);
    if (focused === button) {
      if (button.active !== false) button.setButtonFocused?.(false);
      focused = null;
    }
  };

  const navigation = {
    register(button) {
      if (!button || buttons.includes(button)) return button;
      buttons.push(button);
      button.once?.('destroy', () => remove(button));
      return button;
    },
    focus: setFocused,
    blur(button) {
      if (!button || focused === button) setFocused(null);
    },
    setBlocked(value) {
      blocked = Boolean(value);
      if (blocked) setFocused(null);
      return blocked;
    },
    cleanup() {
      if (cleaned) return;
      cleaned = true;
      handlers.forEach((handler, eventName) => keyboard.off?.(eventName, handler));
      setFocused(null);
      buttons.length = 0;
      if (scene[BUTTON_NAVIGATION] === navigation) delete scene[BUTTON_NAVIGATION];
    }
  };
  scene.events?.once?.('shutdown', navigation.cleanup);
  return navigation;
}

function getButtonNavigation(scene) {
  if (!scene) return null;
  if (!scene[BUTTON_NAVIGATION]) {
    const navigation = createButtonNavigation(scene);
    if (navigation) scene[BUTTON_NAVIGATION] = navigation;
  }
  return scene[BUTTON_NAVIGATION] ?? null;
}

export function setCanvasButtonNavigationBlocked(scene, blocked) {
  const navigation = scene?.[BUTTON_NAVIGATION];
  if (!navigation?.setBlocked) return false;
  navigation.setBlocked(blocked);
  return true;
}

function toCss(value) {
  return `#${value.toString(16).padStart(6, '0')}`;
}

export function configureHdCamera(scene) {
  configureCanvasAccessibility(scene);
  const camera = scene.cameras.main;
  camera.setViewport(0, 0, RENDER_W, RENDER_H);
  camera.setZoom(RENDER_SCALE);
  camera.centerOn(GAME_W / 2, GAME_H / 2);
  // Static art stays crisp, but motion resolves on quarter-logical-pixel steps
  // through the HD backing surface. The supplied sprites were authored for
  // this density and lose both silhouette and shading when snapped to 480p.
  camera.roundPixels = false;
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

  g.fillStyle(shadow, 0.54 * alpha);
  g.fillRect(x + 4, y + 4, w, h);
  g.fillStyle(border, alpha);
  g.fillRect(x, y, w, h);
  g.fillStyle(fill, 0.96 * alpha);
  g.fillRect(x + 1, y + 1, w - 2, h - 2);

  // A clean top light and a saturated team-colour rail mirror the shading on
  // the native player sprites without introducing faux-aged brass details.
  g.fillStyle(opts.highlight ?? PAL.panelHi, 0.92 * alpha);
  g.fillRect(x + 1, y + 1, w - 2, 1);
  g.fillStyle(PAL.ink, 0.52 * alpha);
  g.fillRect(x + 1, y + h - 2, w - 2, 1);

  const accent = opts.corner ?? opts.accent ?? PAL.blueHi;
  g.fillStyle(accent, 0.96 * alpha);
  g.fillRect(x, y, 2, h);
  return g;
}

/** Shared full-screen/menu chrome with clean pixel-sports hierarchy. */
export function drawBroadcastFrame(g, x, y, w, h, opts = {}) {
  drawPanel(g, x, y, w, h, {
    fill: opts.fill ?? 0x0d2236,
    border: opts.border ?? PAL.blue,
    corner: opts.corner ?? PAL.blueHi,
    highlight: opts.highlight ?? 0x2b67a1,
    alpha: opts.alpha
  });
  const railY = y + (opts.railY ?? 13);
  g.fillStyle(PAL.blueHi, 0.78).fillRect(x + 8, railY, w - 16, 1);
  return g;
}

function drawButton(g, w, h, fill, state, opts, focused = false) {
  const pressed = state === 'pressed';
  const disabled = state === 'disabled';
  // Short travel and a clean colour rail keep interaction obvious at every
  // scale while letting the detailed sprite art remain the visual lead.
  const y = pressed ? 2 : 0;
  const border = opts.border ?? (opts.selected ? PAL.gold : PAL.border);

  g.clear();
  if (!pressed) {
    g.fillStyle(PAL.ink, 0.62);
    g.fillRect(-w / 2 + 3, -h / 2 + 4, w, h);
  }
  g.fillStyle(disabled ? PAL.borderDark : border, 1);
  g.fillRect(-w / 2, -h / 2 + y, w, h);
  g.fillStyle(disabled ? PAL.panelMuted : fill, 1);
  g.fillRect(-w / 2 + 1, -h / 2 + 1 + y, w - 2, h - 2);

  if (!disabled) {
    g.fillStyle(opts.highlight ?? shade(fill, 28), 0.9);
    g.fillRect(-w / 2 + 1, -h / 2 + 1 + y, w - 2, 1);
    g.fillStyle(opts.lowlight ?? shade(fill, -30), 0.95);
    g.fillRect(-w / 2 + 1, h / 2 - 2 + y, w - 2, 1);
    g.fillStyle(border, 1);
    g.fillRect(-w / 2, -h / 2 + y, 2, h);
  }

  if (opts.selected) {
    g.fillStyle(PAL.gold, 1);
    g.fillRect(-w / 2 + 2, h / 2 - 3 + y, w - 4, 2);
  }

  if (focused && !disabled) {
    const left = -w / 2 - 2;
    const top = -h / 2 - 2 + y;
    const right = w / 2 + 1;
    const bottom = h / 2 + 1 + y;
    const focus = opts.focusColor ?? PAL.cream;
    g.fillStyle(PAL.ink, 0.94);
    g.fillRect(left - 1, top - 1, w + 6, 1);
    g.fillRect(left - 1, bottom + 1, w + 6, 1);
    g.fillRect(left - 1, top, 1, h + 4);
    g.fillRect(right + 1, top, 1, h + 4);
    g.fillStyle(focus, 1);
    g.fillRect(left, top, w + 4, 1);
    g.fillRect(left, bottom, w + 4, 1);
    g.fillRect(left, top, 1, h + 4);
    g.fillRect(right, top, 1, h + 4);
  }
}

// Tactile pixel button. Actions fire only when the pointer is released inside,
// preventing accidental navigation after a swipe or drag.
export function makeButton(scene, x, y, w, h, label, onClick, opts = {}) {
  const base = opts.color ?? PAL.blue;
  const hover = opts.hover ?? shade(base, 18);
  const pressed = opts.pressed ?? shade(base, -36);
  const bg = scene.add.graphics();
  // Centring a long label inside an iconed button walks it straight over the
  // icon. `labelAlign: 'left'` parks the text in a reserved column instead, so
  // the icon gutter is guaranteed clear however long the copy gets.
  const leftAligned = opts.labelAlign === 'left';
  const labelX = leftAligned
    ? -(w / 2) + (opts.labelX ?? 30)
    : (opts.icon ? 7 : 0);
  const txt = crispText(scene.add.text(labelX, opts.labelY ?? 0, label, {
    fontFamily: opts.fontFamily ?? FONT,
    fontStyle: opts.fontStyle ?? PIXEL_TEXT_WEIGHT,
    fontSize: opts.fontSize ?? '10px',
    color: opts.textColor ?? toCss(PAL.cream),
    stroke: opts.stroke ?? toCss(PAL.ink),
    strokeThickness: opts.strokeThickness ?? 1,
    align: leftAligned ? 'left' : 'center'
  }).setOrigin(leftAligned ? 0 : 0.5, 0.5));
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
  let hasKeyboardFocus = false;
  const navigation = getButtonNavigation(scene);

  const render = (state = enabled ? (isDown ? 'pressed' : (isOver ? 'hover' : 'idle')) : 'disabled') => {
    const fill = state === 'hover' ? hover : state === 'pressed' ? pressed : base;
    drawButton(bg, w, h, fill, state, opts, hasKeyboardFocus);
    const offset = state === 'pressed' ? 2 : 0;
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
    navigation?.focus(c);
    isOver = true;
    isDown = true;
    render();
  });
  c.on('pointerup', () => {
    if (!enabled || !isDown) return;
    const shouldFire = isOver;
    isDown = false;
    render();
    if (shouldFire) c.activateButton();
  });
  c.on('pointerupoutside', () => {
    isDown = false;
    isOver = false;
    render();
  });

  c.setButtonEnabled = (value) => {
    enabled = Boolean(value);
    c.buttonEnabled = enabled;
    isDown = false;
    isOver = false;
    if (enabled) c.setInteractive({ useHandCursor: true });
    else {
      c.disableInteractive();
      navigation?.blur(c);
    }
    render();
    return c;
  };
  c.setButtonFocused = (value) => {
    hasKeyboardFocus = Boolean(value) && enabled;
    c.buttonFocused = hasKeyboardFocus;
    render();
    return c;
  };
  c.activateButton = () => {
    if (!isButtonFocusable(c)) return false;
    Audio.ui();
    onClick?.();
    return true;
  };
  c.buttonEnabled = enabled;
  c.buttonFocused = false;
  c.buttonAccessibleLabel = opts.accessibleLabel ?? accessibleButtonLabel(label, opts.icon);
  c.buttonLabel = txt;
  c.buttonIcon = icon;
  c.buttonWidth = w;
  c.buttonHeight = h;
  navigation?.register(c);
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
    fontStyle: PIXEL_TEXT_WEIGHT,
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
    fontStyle: opts.fontStyle ?? PIXEL_TEXT_WEIGHT,
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
  // Kept as an API-compatible presentation layer for existing scenes. Full-
  // frame filters muddied the detailed sprite work, so this stays clean.
  const g = scene.add.graphics().setDepth(depth);
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
