import Phaser from 'phaser';
import { GAME_W, GAME_H, STADIUM_Y } from '../config.js';
import {
  sceneIntro, formatCompact, configureHdCamera, crispText, PIXEL_TEXT_WEIGHT
} from '../ui.js';
import { SaveManager } from '../systems/SaveManager.js';
import { Audio } from '../systems/AudioSynth.js';
import { MenuMusic } from '../systems/MenuMusic.js';
import { SettingsPanel } from '../systems/SettingsPanel.js';
import { PlatformService } from '../systems/PlatformService.js';
import { LEVELS } from '../data/levels.js';
import { PAL } from '../pixelart.js';
import { Kicker } from '../objects/Kicker.js';
import { utcDateKey } from '../data/progression.js';
import { addMenuCrowd } from '../art/CrowdStand.js';
import { addPitchSurface } from '../art/PitchSurface.js';
import { getCosmetic } from '../data/cosmetics.js';
import { prefetchMatchPack } from '../data/matchAssets.js';

// Every menu role shares the settings face; hierarchy comes from size, colour
// and spacing instead of swapping type families.
const DISPLAY_FONT = '"Pixelify Sans", monospace';
const PIXEL_FONT = '"Pixelify Sans", monospace';
const NUMBER_FONT = '"Pixelify Sans", monospace';
const INK = 0x030714;
const NAVY = 0x07132c;
const PANEL = 0x0b2147;
const EDGE = 0x3478b8;
const CREAM = '#f7fbff';
const GOLD = 0xffc928;
const GOLD_HI = 0xffe56c;
const GOLD_DARK = 0xb77900;
const MENU_SHADOW_COLORS = Object.freeze({
  edge: 0x0b352c,
  body: 0x082a27,
  contact: 0x061f20
});

const MENU_SPONSOR_BOARDS = Object.freeze([
  Object.freeze({ width: 104, fill: 0x1760bd, shade: 0x0c3c7f, trim: 0x52b9ff, logo: 0xffffff }),
  Object.freeze({ width: 88, fill: 0x087b4c, shade: 0x045032, trim: 0x41e38f, logo: 0xffffff }),
  Object.freeze({ width: 96, fill: 0x604500, shade: 0x362600, trim: 0xffc928, logo: 0xffffff }),
  Object.freeze({ width: 82, fill: 0xa52f35, shade: 0x6e171d, trim: 0xff6b63, logo: 0xffffff }),
  Object.freeze({ width: 100, fill: 0x6135a4, shade: 0x3c1b73, trim: 0xb980ff, logo: 0xffffff }),
  Object.freeze({ width: 90, fill: 0x087286, shade: 0x054755, trim: 0x3ed9ed, logo: 0xffffff })
]);

function frozenPoint(x, y) {
  return Object.freeze({ x: Math.round(x), y: Math.round(y) });
}

/**
 * Compact scene-space shadow for the menu hero. The authored 10x4 shadow map
 * becomes a heavy rectangle when enlarged nearly eight times; this tapered
 * layout keeps the boots planted while letting pitch colour breathe through.
 */
export function buildMenuGroundShadowLayout({
  x = 116,
  y = 198,
  width = 46,
  height = 7
} = {}) {
  const centerX = Number.isFinite(x) ? x : 116;
  const centerY = Number.isFinite(y) ? y : 198;
  const resolvedWidth = Math.max(24, Math.round(Number.isFinite(width) ? width : 46));
  const resolvedHeight = Math.max(5, Math.round(Number.isFinite(height) ? height : 7));
  const halfWidth = resolvedWidth / 2;
  const halfHeight = resolvedHeight / 2;
  const left = centerX - halfWidth;
  const right = centerX + halfWidth;
  const top = centerY - halfHeight;
  const bottom = centerY + halfHeight;

  const layers = [
    Object.freeze({
      color: MENU_SHADOW_COLORS.edge,
      alpha: 0.24,
      points: Object.freeze([
        frozenPoint(left + 7, top),
        frozenPoint(right - 7, top),
        frozenPoint(right, centerY),
        frozenPoint(right - 8, bottom),
        frozenPoint(left + 8, bottom),
        frozenPoint(left, centerY)
      ])
    }),
    Object.freeze({
      color: MENU_SHADOW_COLORS.body,
      alpha: 0.28,
      points: Object.freeze([
        frozenPoint(left + 12, centerY - 2),
        frozenPoint(right - 12, centerY - 2),
        frozenPoint(right - 5, centerY),
        frozenPoint(right - 13, centerY + 2),
        frozenPoint(left + 13, centerY + 2),
        frozenPoint(left + 5, centerY)
      ])
    })
  ];

  const contacts = Object.freeze([
    Object.freeze({ x: Math.round(centerX - 11), y: Math.round(centerY - 2), width: 9, height: 3 }),
    Object.freeze({ x: Math.round(centerX + 3), y: Math.round(centerY - 2), width: 9, height: 3 })
  ]);
  const dither = Object.freeze([
    frozenPoint(left + 3, centerY - 1),
    frozenPoint(left + 7, centerY + 2),
    frozenPoint(left + 11, centerY - 3),
    frozenPoint(right - 11, centerY + 3),
    frozenPoint(right - 7, centerY - 2),
    frozenPoint(right - 3, centerY + 1)
  ]);

  return Object.freeze({
    bounds: Object.freeze({
      x: Math.round(left),
      y: Math.round(top),
      width: resolvedWidth,
      height: resolvedHeight
    }),
    colors: MENU_SHADOW_COLORS,
    layers: Object.freeze(layers),
    contacts,
    dither
  });
}

function paintShadowPolygon(graphics, layer) {
  graphics.fillStyle(layer.color, layer.alpha);
  graphics.beginPath();
  graphics.moveTo(layer.points[0].x, layer.points[0].y);
  for (let index = 1; index < layer.points.length; index++) {
    graphics.lineTo(layer.points[index].x, layer.points[index].y);
  }
  graphics.closePath();
  graphics.fillPath();
}

export function addMenuGroundShadow(scene, options = {}) {
  const layout = buildMenuGroundShadowLayout(options);
  const graphics = scene.add.graphics();
  layout.layers.forEach((layer) => paintShadowPolygon(graphics, layer));
  graphics.fillStyle(layout.colors.contact, 0.34);
  layout.contacts.forEach((contact) => {
    graphics.fillRect(contact.x, contact.y, contact.width, contact.height);
  });
  graphics.fillStyle(layout.colors.edge, 0.16);
  layout.dither.forEach((pixel) => graphics.fillRect(pixel.x, pixel.y, 1, 1));
  graphics.setDepth(options.depth ?? 130);
  graphics.setName('menu-kicker-ground-shadow');
  graphics.menuGroundShadowLayout = layout;
  return graphics;
}

function levelId(level, index) {
  return level?.id ?? index;
}

function shade(value, amount) {
  const r = Phaser.Math.Clamp((value >> 16) + amount, 0, 255);
  const g = Phaser.Math.Clamp(((value >> 8) & 0xff) + amount, 0, 255);
  const b = Phaser.Math.Clamp((value & 0xff) + amount, 0, 255);
  return (r << 16) | (g << 8) | b;
}

function menuText(scene, x, y, value, opts = {}) {
  const text = crispText(scene.add.text(x, y, value, {
    fontFamily: opts.fontFamily ?? PIXEL_FONT,
    fontStyle: opts.fontStyle ?? PIXEL_TEXT_WEIGHT,
    fontSize: opts.fontSize ?? '8px',
    color: opts.color ?? CREAM,
    stroke: opts.stroke ?? '#02070d',
    strokeThickness: opts.strokeThickness ?? 1,
    align: opts.align ?? 'left',
    lineSpacing: opts.lineSpacing ?? 0,
    wordWrap: opts.wordWrap
  }).setOrigin(opts.originX ?? 0, opts.originY ?? 0.5));
  text.setLetterSpacing(opts.letterSpacing ?? 0.2);
  if (opts.shadow !== false) text.setShadow(1, 2, '#010408', 0, false, true);
  return text;
}

function drawPremiumPanel(g, x, y, w, h, opts = {}) {
  const border = opts.border ?? EDGE;
  const fill = opts.fill ?? PANEL;
  const bottom = opts.bottom ?? NAVY;
  g.fillStyle(INK, 0.52);
  g.fillRect(x + 4, y + 4, w, h);
  g.fillStyle(INK, 1);
  g.fillRect(x, y, w, h);
  g.fillStyle(border, 1);
  g.fillRect(x + 1, y + 1, w - 2, h - 2);
  g.fillGradientStyle(shade(fill, 18), shade(fill, 10), bottom, bottom, opts.alpha ?? 1);
  g.fillRect(x + 2, y + 2, w - 4, h - 4);
  g.fillStyle(shade(fill, 58), 0.75);
  g.fillRect(x + 2, y + 2, w - 4, 2);
  g.fillStyle(INK, 0.46);
  g.fillRect(x + 2, y + h - 4, w - 4, 2);
  g.fillStyle(opts.corner ?? border, 1);
  g.fillRect(x + 1, y + 1, 3, h - 2);
  g.fillRect(x + 4, y + 1, Math.min(w - 5, Math.max(18, Math.floor(w * 0.26))), 1);
  return g;
}

function wireButton(container, render, onClick, enabled = true) {
  let active = enabled;
  let over = false;
  let down = false;
  const paint = () => render(!active ? 'disabled' : down ? 'pressed' : over ? 'hover' : 'idle');
  if (active) container.setInteractive({ useHandCursor: true });
  container.on('pointerover', () => { over = true; paint(); });
  container.on('pointerout', () => { over = false; down = false; paint(); });
  container.on('pointerdown', () => { if (active) { over = true; down = true; paint(); } });
  container.on('pointerupoutside', () => { over = false; down = false; paint(); });
  container.on('pointerup', () => {
    if (!active || !down) return;
    const fire = over;
    down = false;
    paint();
    if (fire) {
      Audio.ui();
      onClick?.();
    }
  });
  container.setButtonEnabled = (value) => {
    active = Boolean(value);
    over = false;
    down = false;
    if (active) container.setInteractive({ useHandCursor: true });
    else container.disableInteractive();
    paint();
    return container;
  };
  paint();
  return container;
}

function drawActionFace(g, w, h, color, accent, state, featured = false) {
  const pressed = state === 'pressed';
  const disabled = state === 'disabled';
  const y = pressed ? 2 : 0;
  const face = disabled ? 0x172532 : color;
  g.clear();

  if (featured && !disabled && !pressed) {
    g.fillStyle(accent, 0.16);
    g.fillRect(-w / 2 - 3, -h / 2 - 3, w + 6, h + 6);
  }
  if (!pressed) {
    g.fillStyle(INK, 0.64);
    g.fillRect(-w / 2 + 4, -h / 2 + 5, w, h);
  }
  g.fillStyle(INK, 1);
  g.fillRect(-w / 2, -h / 2 + y, w, h);
  g.fillStyle(disabled ? 0x324653 : accent, 1);
  g.fillRect(-w / 2 + 1, -h / 2 + 1 + y, w - 2, h - 2);
  g.fillGradientStyle(shade(face, 28), shade(face, 14), shade(face, -4), shade(face, -18), 1);
  g.fillRect(-w / 2 + 2, -h / 2 + 2 + y, w - 4, h - 4);

  const iconCellW = featured ? 42 : 39;
  g.fillStyle(INK, disabled ? 0.2 : 0.3);
  g.fillRect(-w / 2 + 3, -h / 2 + 3 + y, iconCellW - 3, h - 6);
  g.fillStyle(accent, disabled ? 0.3 : 0.92);
  g.fillRect(-w / 2 + iconCellW, -h / 2 + 2 + y, 2, h - 4);
  g.fillStyle(shade(face, 68), disabled ? 0.18 : 0.62);
  g.fillRect(-w / 2 + 2, -h / 2 + 2 + y, w - 4, 2);
  g.fillStyle(accent, disabled ? 0.15 : 0.75);
  g.fillRect(-w / 2 + 2, h / 2 - 4 + y, w - 4, 2);
}

function makeActionIcon(scene, type, color) {
  if (type === 'career') return scene.add.image(0, 0, 'icon-cup').setScale(1.35);
  const g = scene.add.graphics();
  const dark = shade(color, -80);
  g.lineStyle(2, color, 1);
  g.fillStyle(dark, 0.82);

  if (type === 'play') {
    g.fillStyle(color, 1);
    g.fillTriangle(-6, -9, -6, 9, 8, 0);
    g.fillStyle(0xffffff, 0.35);
    g.fillTriangle(-4, -6, -4, 0, 2, -2);
  } else if (type === 'daily') {
    g.fillRect(-8, -7, 16, 15);
    g.strokeRect(-8, -7, 16, 15);
    g.fillStyle(color, 1);
    g.fillRect(-8, -7, 16, 4);
    g.fillRect(-5, -10, 2, 5);
    g.fillRect(3, -10, 2, 5);
    const star = Array.from({ length: 10 }, (_, index) => {
      const angle = -Math.PI / 2 + index * Math.PI / 5;
      const radius = index % 2 === 0 ? 5 : 2.2;
      return new Phaser.Geom.Point(Math.cos(angle) * radius, 1 + Math.sin(angle) * radius);
    });
    g.fillPoints(star, true);
  } else if (type === 'time') {
    g.fillCircle(0, 2, 8);
    g.strokeCircle(0, 2, 8);
    g.fillStyle(color, 1);
    g.fillRect(-3, -9, 6, 3);
    g.fillRect(5, -6, 4, 2);
    g.lineStyle(2, color, 1);
    g.beginPath().moveTo(0, 2).lineTo(0, -3).moveTo(0, 2).lineTo(4, 4).strokePath();
    g.fillCircle(0, 2, 2);
  } else {
    g.beginPath();
    g.moveTo(-4, -8);
    g.lineTo(-9, -4);
    g.lineTo(-6, 1);
    g.lineTo(-4, -1);
    g.lineTo(-4, 8);
    g.lineTo(4, 8);
    g.lineTo(4, -1);
    g.lineTo(6, 1);
    g.lineTo(9, -4);
    g.lineTo(4, -8);
    g.lineTo(2, -5);
    g.lineTo(-2, -5);
    g.closePath();
    g.fillPath();
    g.strokePath();
    g.fillStyle(color, 1);
    g.fillRect(-2, -4, 4, 2);
  }
  return g;
}

function makeMenuAction(scene, x, y, w, h, spec, onClick) {
  const bg = scene.add.graphics();
  const icon = makeActionIcon(scene, spec.iconType, spec.subtitleColorValue ?? spec.accent)
    .setPosition(-w / 2 + (spec.featured ? 21 : 20), 0);
  const labelX = -w / 2 + (spec.featured ? 51 : 48);
  const label = menuText(scene, labelX, spec.featured ? -6 : -5, spec.label, {
    fontFamily: DISPLAY_FONT,
    fontSize: spec.featured ? '16px' : '14px',
    color: CREAM,
    strokeThickness: 1,
    letterSpacing: 0.25
  });
  const subtitle = menuText(scene, labelX + 1, spec.featured ? 9 : 8, spec.subtitle, {
    fontFamily: PIXEL_FONT,
    fontSize: spec.featured ? '10px' : '9px',
    color: spec.subtitleColor,
    strokeThickness: 1,
    letterSpacing: 0.65
  });
  const chevron = scene.add.graphics().setPosition(w / 2 - 14, 0);
  const container = scene.add.container(x, y, [bg, icon, label, subtitle, chevron]);
  container.setSize(w, h + 3);
  const render = (state) => {
    drawActionFace(bg, w, h, spec.color, spec.accent, state, spec.featured);
    const offset = state === 'pressed' ? 2 : 0;
    const alpha = state === 'disabled' ? 0.42 : 1;
    icon.setY(offset).setAlpha(alpha);
    label.setY((spec.featured ? -6 : -5) + offset).setAlpha(alpha);
    subtitle.setY((spec.featured ? 9 : 8) + offset).setAlpha(alpha);
    chevron.clear().setY(offset).setAlpha(alpha);
    chevron.lineStyle(spec.featured ? 3 : 2, spec.subtitleColorValue ?? spec.accent, 1);
    chevron.beginPath().moveTo(-3, -6).lineTo(3, 0).lineTo(-3, 6).strokePath();
  };
  wireButton(container, render, onClick, spec.disabled !== true);
  container.buttonLabel = label;
  container.buttonSubtitle = subtitle;
  container.buttonIcon = icon;
  container.buttonWidth = w;
  container.buttonHeight = h;
  return container;
}

function makeHeaderControl(scene, x, y, w, h, opts, onClick) {
  const bg = scene.add.graphics();
  const children = [bg];
  let icon = null;
  let gear = null;
  if (opts.icon) {
    icon = scene.add.image(opts.label ? -w / 2 + 14 : 0, 0, opts.icon).setScale(opts.iconScale ?? 1);
    children.push(icon);
  } else if (opts.gear) {
    gear = scene.add.graphics().setPosition(-w / 2 + 14, 0);
    children.push(gear);
  }
  const label = opts.label ? menuText(scene, opts.labelX ?? (opts.icon || opts.gear ? -w / 2 + 27 : 0), 0, opts.label, {
    originX: opts.icon || opts.gear ? 0 : 0.5,
    fontFamily: DISPLAY_FONT,
    fontSize: opts.fontSize ?? '7px',
    color: CREAM,
    strokeThickness: 1,
    letterSpacing: opts.letterSpacing ?? 0.2
  }) : null;
  if (label) children.push(label);
  const container = scene.add.container(x, y, children).setSize(w, h);
  const render = (state) => {
    const pressed = state === 'pressed';
    const fill = state === 'hover' ? shade(opts.color ?? PANEL, 18) : state === 'pressed' ? shade(opts.color ?? PANEL, -20) : (opts.color ?? PANEL);
    bg.clear();
    drawPremiumPanel(bg, -w / 2, -h / 2 + (pressed ? 2 : 0), w, h, {
      fill,
      bottom: shade(fill, -20),
      border: opts.border ?? EDGE,
      corner: opts.corner ?? GOLD_DARK,
      cornerSize: 4
    });
    if (gear) {
      const oy = pressed ? 2 : 0;
      gear.clear().setY(oy);
      gear.fillStyle(0xf7edd2, 1);
      gear.fillCircle(0, 0, 5);
      gear.fillRect(-2, -7, 4, 14);
      gear.fillRect(-7, -2, 14, 4);
      gear.fillRect(-5, -5, 3, 3);
      gear.fillRect(2, -5, 3, 3);
      gear.fillRect(-5, 2, 3, 3);
      gear.fillRect(2, 2, 3, 3);
      gear.fillStyle(0x173047, 1);
      gear.fillCircle(0, 0, 2);
    }
    const oy = pressed ? 2 : 0;
    if (icon) icon.setY(oy);
    if (label) label.setY(oy);
  };
  wireButton(container, render, onClick, true);
  container.buttonIcon = icon;
  container.buttonLabel = label;
  container.buttonWidth = w;
  container.buttonHeight = h;
  return container;
}

export class MenuScene extends Phaser.Scene {
  constructor() {
    super('Menu');
  }

  create() {
    configureHdCamera(this);
    this.compactMenu = Number(globalThis.innerHeight) <= 520 &&
      Number(globalThis.innerWidth) > Number(globalThis.innerHeight);
    this.add.image(0, 0, 'stadium-menu').setOrigin(0).setDepth(0);
    addPitchSurface(this, {
      x: 0,
      y: STADIUM_Y,
      width: GAME_W,
      height: GAME_H - STADIUM_Y,
      horizon: { x: GAME_W / 2, y: 76 },
      seed: 0x4d454e55,
      depth: 1,
      name: 'menu-procedural-pitch'
    });
    const settings = SaveManager.getSettings?.() || {};
    this.reducedMotion = Boolean(settings.reducedMotion);
    const equippedKit = SaveManager.getEquippedCosmetic?.('kit') ?? 'kit-home';
    const equippedCharacter = SaveManager.getEquippedCosmetic?.('character') ?? 'character-mica';
    const equippedKitPalette = getCosmetic(equippedKit)?.palette;
    // Kept on the scene so its ambient timer is torn down explicitly rather
    // than being left for Phaser's shutdown to collect.
    this.crowdStand = addMenuCrowd(this, {
      depth: 2,
      reducedMotion: this.reducedMotion,
      kitId: equippedKit,
      palette: equippedKitPalette
    });
    this.events.once('shutdown', () => {
      this.crowdStand?.destroy?.();
      this.crowdStand = null;
    });
    this.makeSponsorBoards();
    this.drawComposition();

    const muted = Boolean((settings.muted ?? settings.audioMuted ?? false) || PlatformService.shouldMuteAudio());
    Audio.setMuted(muted);
    Audio.setVolume(settings.sfxVolume ?? 1);
    MenuMusic.configure({ muted, musicVolume: settings.musicVolume });
    MenuMusic.enterMenu();

    const unlocked = SaveManager.unlockedCount(LEVELS.length);
    const totalStars = SaveManager.getTotalStars?.()
      ?? LEVELS.reduce((sum, level, index) => sum + SaveManager.getStars(levelId(level, index)), 0);
    const coins = SaveManager.getCoins?.() ?? 0;
    const lastPlayed = SaveManager.getLastPlayed?.();
    const continueIndex = this.resolveContinueIndex(lastPlayed, unlocked);
    const today = utcDateKey();
    const daily = SaveManager.ensureDaily(today);
    const readyClaims = [
      ...SaveManager.getDailyMissionStates(today),
      ...SaveManager.getAchievementStates()
    ].filter((state) => state.completed && !state.claimed).length;

    this.makeHeader(totalStars, coins, muted, readyClaims);
    this.makeHero(equippedKit, equippedCharacter, totalStars);
    this.makeActions(continueIndex, daily, today);

    if (!this.reducedMotion) sceneIntro(this);

    // The menu is the player's thinking time, so spend it warming the match.
    // Deferred by a beat so the first painted frame is never sharing bandwidth
    // with 4 MB of goalkeeper atlases. This only fills the HTTP cache - the
    // match scene stays the sole owner of those texture keys.
    this.time.delayedCall(240, () => {
      if (this.scene.isActive()) prefetchMatchPack();
    });
  }

  resolveContinueIndex(lastPlayed, unlocked) {
    if (lastPlayed?.mode === 'career') {
      const index = LEVELS.findIndex((level, i) => String(levelId(level, i)) === String(lastPlayed.levelId));
      if (index >= 0 && index < unlocked) return index;
    }
    return Phaser.Math.Clamp(unlocked - 1, 0, Math.max(LEVELS.length - 1, 0));
  }

  drawComposition() {
    this.add.image(0, 0, 'menu-lighting').setOrigin(0).setDepth(10);
    const wash = this.add.graphics().setDepth(11);
    wash.fillGradientStyle(0x03122c, 0x03122c, 0x03122c, 0x03122c, 0, 0.24, 0, 0.44);
    wash.fillRect(215, 41, 260, 202);
    wash.fillStyle(0x041127, 0.22);
    wash.fillRect(0, 0, GAME_W, 43);

    const lights = this.add.graphics().setDepth(12);
    for (const x of [47, 433]) {
      lights.fillStyle(0x42bcff, 0.15);
      lights.fillCircle(x, 57, 16);
      for (let row = 0; row < 2; row++) {
        for (let col = 0; col < 4; col++) {
          lights.fillStyle(0xe8fbff, 0.9);
          lights.fillRect(x - 7 + col * 5, 52 + row * 5, 3, 3);
        }
      }
    }
  }

  makeSponsorBoards() {
    const y = 83;
    const h = STADIUM_Y - y;
    const board = this.add.graphics().setDepth(6);
    board.fillStyle(INK, 1).fillRect(0, y - 2, GAME_W, h + 3);

    let x = -34;
    let index = 0;
    while (x < GAME_W) {
      const spec = MENU_SPONSOR_BOARDS[index % MENU_SPONSOR_BOARDS.length];
      const w = spec.width;
      board.fillStyle(spec.fill, 1).fillRect(x + 1, y, w - 2, h);
      board.fillStyle(spec.shade, 1).fillRect(x + 1, y + h - 4, w - 2, 3);
      board.fillStyle(spec.trim, 0.82).fillRect(x + 2, y + 1, w - 4, 1);
      board.fillStyle(spec.trim, 0.5).fillRect(x + 3, y + h - 6, w - 6, 1);
      board.fillStyle(INK, 1).fillRect(x + w - 1, y - 1, 2, h + 1);

      const centreX = x + w / 2;
      if (centreX - 28 >= 1 && centreX + 28 <= GAME_W - 1 &&
          this.textures.exists('calynx-logo-pixel')) {
        this.add.image(centreX, y + h / 2, 'calynx-logo-pixel')
          .setScale(0.8)
          .setTint(spec.logo)
          .setDepth(7);
      }
      x += w;
      index++;
    }
  }

  makeHeader(totalStars, coins, muted, readyClaims) {
    const bar = this.add.graphics().setDepth(200);
    drawPremiumPanel(bar, 5, 4, GAME_W - 10, 37, {
      fill: 0x0b244a,
      bottom: 0x06142d,
      border: 0x3478b8,
      corner: 0x27b8f4,
      cornerSize: 8
    });

    menuText(this, 15, 16, 'KICK DISTRICT', {
      fontFamily: DISPLAY_FONT,
      fontSize: '17px',
      color: CREAM,
      strokeThickness: 1,
      letterSpacing: -0.2
    }).setDepth(205);
    menuText(this, 16, 32, 'OWN THE CURVE.', {
      fontFamily: PIXEL_FONT,
      fontSize: '6px',
      color: '#ffc928',
      letterSpacing: 0.72
    }).setDepth(205);
    menuText(this, 87, 32, '·', {
      originX: 0.5,
      fontSize: '6px',
      color: '#587287'
    }).setDepth(205);
    const calynx = this.add.image(110, 32, 'calynx-logo-pixel').setScale(0.48).setDepth(205);
    calynx.setTint(0x64d7ff);
    menuText(this, 128, 32, 'STUDIO', {
      fontSize: '5px',
      color: '#9ccce8',
      letterSpacing: 0.35
    }).setDepth(205);

    this.soundButton = makeHeaderControl(this, 188, 22, 19, 23, {
      icon: muted ? 'icon-mute' : 'icon-sound',
      iconScale: 0.78,
      color: 0x13365f,
      border: 0x3478b8,
      corner: 0x27b8f4
    }, () => this.toggleSound()).setDepth(206);

    this.settingsButton = makeHeaderControl(this, 230, 22, 62, 23, {
      gear: true,
      label: 'SETTINGS',
      labelX: -5.5,
      letterSpacing: 0,
      fontSize: '6px',
      color: 0x13365f,
      border: 0x3478b8,
      corner: 0x27b8f4
    }, () => {
      SettingsPanel.open({
        onChange: (nextSettings) => {
          this.syncAmbientMotion(Boolean(nextSettings.reducedMotion));
        }
      });
    }).setDepth(206);

    makeHeaderControl(this, 280, 22, 30, 23, {
      icon: 'icon-cup',
      iconScale: 1.05,
      color: readyClaims ? 0x087b4c : 0x13365f,
      border: readyClaims ? GOLD : GOLD_DARK,
      corner: readyClaims ? GOLD : GOLD_DARK
    }, () => this.scene.start('Progress')).setDepth(206);

    this.headerStatPanels = [
      this.makeHeaderStat(337, 22, 72, 'icon-star', `${totalStars}/${LEVELS.length * 3}`, 0x0b244a),
      this.makeHeaderStat(423, 22, 80, 'icon-coin', formatCompact(coins), 0x0b244a)
    ];

    if (readyClaims) {
      const badge = this.add.graphics().setDepth(208);
      badge.fillStyle(PAL.red, 1);
      badge.fillCircle(291, 10, 5);
      menuText(this, 291, 10, String(Math.min(readyClaims, 9)), {
        originX: 0.5,
        fontFamily: DISPLAY_FONT,
        fontSize: '7px',
        color: '#ffffff',
        strokeThickness: 0,
        shadow: false
      }).setDepth(209);
    }
  }

  makeHeaderStat(x, y, w, iconKey, value, fill) {
    const panel = this.add.graphics();
    drawPremiumPanel(panel, -w / 2, -11.5, w, 23, {
      fill,
      bottom: 0x06142d,
      border: 0x3478b8,
      corner: 0x27b8f4,
      cornerSize: 4
    });
    const icon = this.add.image(-w / 2 + 15, 0, iconKey).setScale(1.05);
    const label = menuText(this, -w / 2 + 28, 0, String(value), {
      fontFamily: NUMBER_FONT,
      fontStyle: PIXEL_TEXT_WEIGHT,
      fontSize: '8px',
      color: CREAM,
      letterSpacing: 0
    });
    const container = this.add.container(x, y, [panel, icon, label]).setDepth(206);
    container.panelWidth = w;
    container.valueLabel = label;
    return container;
  }

  toggleSound() {
    const muted = Audio.toggleMuted();
    MenuMusic.setMuted(muted);
    SaveManager.setSetting?.('muted', muted);
    this.soundButton.buttonIcon?.setTexture(muted ? 'icon-mute' : 'icon-sound');
  }

  makeHero(equippedKit, equippedCharacter, totalStars) {
    const player = getCosmetic(equippedCharacter) || getCosmetic('character-mica');
    const card = this.add.graphics().setDepth(150);
    drawPremiumPanel(card, 28, 202, 192, 65, {
      fill: 0x0b244a,
      bottom: 0x06142d,
      border: 0x3478b8,
      corner: 0x27b8f4,
      cornerSize: 7
    });

    drawPremiumPanel(card, 37, 207, 31, 30, {
      fill: 0x163d7a,
      bottom: 0x0a2454,
      border: 0x4ebeff,
      corner: GOLD,
      cornerSize: 4
    });
    menuText(this, 52.5, 222, String(player.number), {
      originX: 0.5,
      fontFamily: DISPLAY_FONT,
      fontSize: '16px',
      color: CREAM,
      strokeThickness: 1
    }).setDepth(154);
    menuText(this, 75, 212, `${player.name.toUpperCase()}  ·  #${player.number}`, {
      fontFamily: DISPLAY_FONT,
      fontSize: '10px',
      color: CREAM,
      letterSpacing: 0.35
    }).setDepth(154);
    if (this.compactMenu) {
      menuText(this, 75, 229, player.archetype.toUpperCase(), {
        fontFamily: DISPLAY_FONT,
        fontSize: '8px',
        color: '#f3c449',
        letterSpacing: 0.18
      }).setDepth(154);
    } else {
      menuText(this, 75, 228, 'CUP RUN', {
        fontFamily: PIXEL_FONT,
        fontSize: '6px',
        color: '#c5d2dc',
        letterSpacing: 0.4
      }).setDepth(154);
      menuText(this, 108, 228, `${totalStars} STARS`, {
        fontFamily: PIXEL_FONT,
        fontSize: '6px',
        color: '#6ee1df',
        letterSpacing: 0.35
      }).setDepth(154);

      const progress = Phaser.Math.Clamp(totalStars / Math.max(LEVELS.length * 3, 1), 0, 1);
      card.fillStyle(INK, 1);
      card.fillRect(164, 224, 46, 6);
      card.fillStyle(0x2e4b62, 1);
      card.fillRect(165, 225, 44, 4);
      card.fillStyle(GOLD, 1);
      card.fillRect(165, 225, Math.floor(44 * progress), 4);
      card.fillStyle(0x43657c, 0.65);
      card.fillRect(36, 236, 176, 1);

      const rows = [
        ['ROLE', player.archetype.toUpperCase(), 0xf3c449],
        ['SIGNATURE', player.gameplay.ability.toUpperCase(), 0x6ee1df],
        ['SHOT', player.gameplay.summary.toUpperCase(), 0xc5d2dc]
      ];
      rows.forEach(([label, value, color], index) => {
        const y = 243 + index * 8;
        menuText(this, 38, y, label, {
          fontFamily: PIXEL_FONT,
          fontSize: '5px',
        color: '#86b6d4',
          letterSpacing: 0.2
        }).setDepth(154);
        menuText(this, 76, y, String(value), {
          fontFamily: PIXEL_FONT,
          fontSize: index === 2 ? '5px' : '5.5px',
          color: `#${color.toString(16).padStart(6, '0')}`,
          letterSpacing: index === 2 ? 0 : 0.12
        }).setDepth(154);
      });
    }

    this.kicker = new Kicker(this, 116, 198, {
      kitId: equippedKit,
      characterId: equippedCharacter,
      scale: this.compactMenu ? 5.6 : 5.8,
      depth: 130,
      shadowAlpha: 0.66,
      // The front-menu hero is an identity card, so his planted root remains
      // static in both motion modes; reducedMotion still propagates into the
      // shared Kicker contract and any explicit pose work.
      ambient: false,
      reducedMotion: this.reducedMotion
    });
    // The shared 10x4 shadow is correct beside a small gameplay sprite but
    // becomes an opaque slab under this large menu portrait. Retain the object
    // for Kicker's transform contract, make it invisible, and render a bespoke
    // tapered/dithered contact shadow at the same grounded root.
    this.kicker.shadow?.setVisible?.(false);
    this.kicker.shadow?.setAlpha?.(0);
    const shadowWidth = (this.compactMenu ? 43 : 47) * Math.max(
      0.9,
      Math.min(1.12, this.kicker.characterScale || 1)
    );
    this.menuKickerShadow = addMenuGroundShadow(this, {
      x: 116,
      y: 198,
      width: shadowWidth,
      height: this.compactMenu ? 6 : 7,
      depth: 130
    });
    // Phaser can finish registering the final queued HD texture on the same
    // turn Menu.create runs. Re-resolve once on the next game tick so the hero
    // can never remain on the old 24x27 procedural fallback despite the real
    // 256px sheet being available.
    this.time.delayedCall(0, () => {
      if (this.scene.isActive()) this.kicker?.applyPoseTexture?.();
    });
  }

  syncAmbientMotion(reduced) {
    this.reducedMotion = Boolean(reduced);
    this.crowdStand?.setReducedMotion?.(this.reducedMotion);
    if (this.kicker) {
      this.kicker.reducedMotion = this.reducedMotion;
      if (this.reducedMotion) this.kicker.pauseAmbient?.();
      else this.kicker.resumeAmbient?.();
      this.kicker.applyTransform?.();
    }
  }

  makeActions(continueIndex, daily, today) {
    const actionX = 350;
    const actionW = 210;
    this.menuActionButtons = [];
    let continueButton = null;
    let continuePending = false;
    continueButton = makeMenuAction(this, actionX, 65, actionW, 37, {
      label: 'CONTINUE',
      subtitle: `LEVEL ${String(continueIndex + 1).padStart(2, '0')}`,
      subtitleColor: '#7dffb0',
      color: 0x08703e,
      accent: 0x39df83,
      iconType: 'play',
      subtitleColorValue: 0x7dffb0,
      featured: true
    }, () => {
      if (continuePending) return;
      continuePending = true;
      continueButton?.setButtonEnabled(false);
      continueButton?.buttonLabel?.setText('KICKING OFF...').setFontSize('11px');
      const level = LEVELS[continueIndex];
      SaveManager.setLastPlayed?.({ mode: 'career', levelId: levelId(level, continueIndex) });
      const started = this.kicker.previewStrike(() => {
        this.scene.start('Game', { mode: 'career', levelIndex: continueIndex });
      });
      if (started === false) {
        continuePending = false;
        continueButton?.setButtonEnabled(true);
        continueButton?.buttonLabel?.setText('CONTINUE').setFontSize('16px');
      }
    }).setDepth(230);
    this.menuActionButtons.push(continueButton);

    this.menuActionButtons.push(makeMenuAction(this, actionX, 107, actionW, 35, {
      label: 'CAREER',
      subtitle: 'FIVE CUP TOUR',
      subtitleColor: '#7ad5ff',
      color: 0x0b4f9c,
      accent: 0x38adff,
      iconType: 'career',
      subtitleColorValue: 0x58c6ff
    }, () => this.scene.start('LevelSelect')).setDepth(230));

    const dailySubtitle = daily.completed
      ? `BEST ${formatCompact(SaveManager.getBestDaily(today))}`
      : daily.streak > 0
        ? `${daily.streak} DAY STREAK`
        : 'NEW CHALLENGE';
    this.menuActionButtons.push(makeMenuAction(this, actionX, 147, actionW, 35, {
      label: 'DAILY KICK',
      subtitle: dailySubtitle,
      subtitleColor: '#ffe06a',
      color: 0x855b00,
      accent: 0xffc928,
      iconType: 'daily',
      subtitleColorValue: 0xf5c94b
    }, () => {
      SaveManager.setLastPlayed?.({ mode: 'daily', levelId: LEVELS[continueIndex]?.id });
      this.scene.start('Game', { mode: 'daily', dailyDate: today });
    }).setDepth(230));

    this.menuActionButtons.push(makeMenuAction(this, actionX, 187, actionW, 35, {
      label: 'TIME ATTACK',
      subtitle: '60 SEC',
      subtitleColor: '#ff9b9d',
      color: 0x942c36,
      accent: 0xff5e68,
      iconType: 'time',
      subtitleColorValue: 0xff8551
    }, () => {
      SaveManager.setLastPlayed?.({ mode: 'arcade', levelId: null });
      this.scene.start('Game', { mode: 'arcade' });
    }).setDepth(230));

    this.menuActionButtons.push(makeMenuAction(this, actionX, 227, actionW, 35, {
      label: 'LOCKER',
      subtitle: 'MAKE IT YOURS',
      subtitleColor: '#d1b2ff',
      color: 0x5630a0,
      accent: 0xa976ff,
      iconType: 'locker',
      subtitleColorValue: 0xda83ff
    }, () => this.scene.start('Locker')).setDepth(230));
  }

}
