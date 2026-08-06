import Phaser from 'phaser';
import { GAME_W, RENDER_W, RENDER_H } from '../config.js';
import { crispText, sceneIntro, PIXEL_TEXT_WEIGHT } from '../ui.js';
import { SaveManager } from '../systems/SaveManager.js';
import { MenuMusic } from '../systems/MenuMusic.js';
import { Audio } from '../systems/AudioSynth.js';
import { LEVELS, CUPS as CUP_DATA } from '../data/levels.js';
import { prefetchMatchPack } from '../data/matchAssets.js';
import { PAL } from '../pixelart.js';

const LEVELS_PER_CUP = 10;
const CUP_COUNT = 5;
const CUP_COLORS = [0x248c43, 0x2475b9, 0xb56a31, 0x67549a, 0xa9463b];
const DISPLAY_FONT = '"Pixelify Sans", "Courier New", monospace';
const PIXEL_FONT = '"Pixelify Sans", "Courier New", monospace';
const CREAM = '#f6e9c7';
const GOLD = 0xf4c84b;
const GOLD_HI = 0xffe47b;
const GOLD_DARK = 0x8f6326;
const BLUE_EDGE = 0x365874;
const BLUE_MID = 0x18334b;
const BLUE_DEEP = 0x081b2d;
const INK = 0x030a11;
const TOUR_H = 320;
const TOUR_ZOOM = RENDER_H / TOUR_H;
const TOUR_VIEW_W = RENDER_W / TOUR_ZOOM;
const TOUR_VIEW_X = (GAME_W - TOUR_VIEW_W) / 2;

const CUP_VIEWS = CUP_DATA.map((cup, index) => ({
  ...cup,
  roman: ['I', 'II', 'III', 'IV', 'V'][index],
  name: cup.name.toUpperCase(),
  place: cup.subtitle,
  color: CUP_COLORS[index]
}));

function stableId(level, index) {
  return level?.id ?? index;
}

function cssColor(value) {
  return `#${value.toString(16).padStart(6, '0')}`;
}

function shade(value, amount) {
  const r = Phaser.Math.Clamp((value >> 16) + amount, 0, 255);
  const g = Phaser.Math.Clamp(((value >> 8) & 0xff) + amount, 0, 255);
  const b = Phaser.Math.Clamp((value & 0xff) + amount, 0, 255);
  return (r << 16) | (g << 8) | b;
}

function configureTourCamera(scene) {
  const camera = scene.cameras.main;
  camera.setViewport(0, 0, RENDER_W, RENDER_H);
  camera.setZoom(TOUR_ZOOM);
  camera.centerOn(GAME_W / 2, TOUR_H / 2);
  camera.roundPixels = false;
  return camera;
}

function addAspectCoverImage(scene, key, width = TOUR_VIEW_W, height = TOUR_H) {
  const image = scene.add.image(GAME_W / 2, TOUR_H / 2, key).setOrigin(0.5);
  const sourceWidth = Math.max(1, Number(image.width) || width);
  const sourceHeight = Math.max(1, Number(image.height) || height);
  const uniformScale = Math.max(width / sourceWidth, height / sourceHeight);
  image.setScale(uniformScale);
  image.fklAspectCover = { sourceWidth, sourceHeight, scale: uniformScale };
  return image;
}

function addAspectCoverRegion(scene, key, x, y, width, height) {
  const image = scene.add.image(x, y, key).setOrigin(0.5);
  const sourceWidth = Math.max(1, Number(image.width) || width);
  const sourceHeight = Math.max(1, Number(image.height) || height);
  image.setScale(Math.max(width / sourceWidth, height / sourceHeight));
  return image;
}

function tourText(scene, x, y, value, opts = {}) {
  const text = crispText(scene.add.text(x, y, value, {
    fontFamily: opts.fontFamily ?? PIXEL_FONT,
    fontStyle: opts.fontStyle ?? PIXEL_TEXT_WEIGHT,
    fontSize: opts.fontSize ?? '9px',
    color: opts.color ?? CREAM,
    stroke: opts.stroke ?? '#030a11',
    strokeThickness: opts.strokeThickness ?? 1,
    align: opts.align ?? 'left',
    lineSpacing: opts.lineSpacing ?? 0,
    wordWrap: opts.wordWrap
  }).setOrigin(opts.originX ?? 0, opts.originY ?? 0.5));
  text.setLetterSpacing(opts.letterSpacing ?? 0.25);
  if (opts.shadow !== false) text.setShadow(1, 2, '#02070c', 0, false, true);
  return text;
}

function drawCornerBrackets(g, x, y, w, h, color = GOLD, size = 7) {
  g.fillStyle(color, 1);
  g.fillRect(x, y, size, 1);
  g.fillRect(x, y, 1, size);
  g.fillRect(x + w - size, y, size, 1);
  g.fillRect(x + w - 1, y, 1, size);
  g.fillRect(x, y + h - 1, size, 1);
  g.fillRect(x, y + h - size, 1, size);
  g.fillRect(x + w - size, y + h - 1, size, 1);
  g.fillRect(x + w - 1, y + h - size, 1, size);

  g.fillStyle(GOLD_DARK, 1);
  g.fillRect(x + 1, y + 1, 2, 2);
  g.fillRect(x + w - 3, y + 1, 2, 2);
  g.fillRect(x + 1, y + h - 3, 2, 2);
  g.fillRect(x + w - 3, y + h - 3, 2, 2);
}

function drawTourPanel(g, x, y, w, h, opts = {}) {
  const border = opts.border ?? BLUE_EDGE;
  const inner = opts.inner ?? BLUE_MID;
  const bottom = opts.bottom ?? BLUE_DEEP;
  const corner = opts.corner ?? GOLD_DARK;

  g.fillStyle(INK, 0.78);
  g.fillRect(x + 3, y + 4, w, h);
  g.fillStyle(INK, 1);
  g.fillRect(x, y, w, h);
  g.fillStyle(border, 1);
  g.fillRect(x + 1, y + 1, w - 2, h - 2);
  g.fillStyle(0x081522, 1);
  g.fillRect(x + 2, y + 2, w - 4, h - 4);
  g.fillGradientStyle(inner, inner, bottom, bottom, opts.alpha ?? 1);
  g.fillRect(x + 4, y + 4, w - 8, h - 8);

  g.fillStyle(shade(inner, 34), 0.78);
  g.fillRect(x + 4, y + 4, w - 8, 1);
  g.fillRect(x + 4, y + 4, 1, h - 8);
  g.fillStyle(INK, 0.68);
  g.fillRect(x + 4, y + h - 5, w - 8, 1);
  g.fillRect(x + w - 5, y + 4, 1, h - 8);

  // Sparse horizontal weave gives the large fields the textured fabric finish
  // of the reference without softening the deliberately hard pixel edges.
  g.fillStyle(0x6d93ae, 0.055);
  for (let row = y + 8; row < y + h - 5; row += 5) {
    g.fillRect(x + 6, row, w - 12, 1);
  }
  drawCornerBrackets(g, x + 1, y + 1, w - 2, h - 2, corner, opts.cornerSize ?? 7);
  return g;
}

function drawTourButton(g, w, h, fill, state, opts = {}) {
  const pressed = state === 'pressed';
  const disabled = state === 'disabled';
  const selected = opts.selected && !disabled;
  const y = pressed ? 2 : 0;
  const edge = selected ? GOLD_HI : (opts.border ?? BLUE_EDGE);
  const face = disabled ? 0x162634 : fill;

  g.clear();
  if (!pressed) {
    g.fillStyle(INK, 0.88);
    g.fillRect(-w / 2 + 3, -h / 2 + 4, w, h);
  }
  if (selected) {
    g.fillStyle(GOLD, 0.18);
    g.fillRect(-w / 2 - 2, -h / 2 - 2 + y, w + 4, h + 4);
  }
  g.fillStyle(INK, 1);
  g.fillRect(-w / 2, -h / 2 + y, w, h);
  g.fillStyle(edge, 1);
  g.fillRect(-w / 2 + 1, -h / 2 + 1 + y, w - 2, h - 2);
  g.fillStyle(selected ? GOLD_DARK : 0x0b1723, 1);
  g.fillRect(-w / 2 + 2, -h / 2 + 2 + y, w - 4, h - 4);
  g.fillGradientStyle(shade(face, disabled ? 2 : 24), shade(face, disabled ? 2 : 24), shade(face, -18), shade(face, -18), 1);
  g.fillRect(-w / 2 + 4, -h / 2 + 4 + y, w - 8, h - 8);

  g.fillStyle(disabled ? 0x294053 : shade(face, 52), disabled ? 0.45 : 0.95);
  g.fillRect(-w / 2 + 4, -h / 2 + 4 + y, w - 8, 1);
  g.fillRect(-w / 2 + 4, -h / 2 + 4 + y, 1, h - 8);
  g.fillStyle(INK, 0.56);
  g.fillRect(-w / 2 + 4, h / 2 - 5 + y, w - 8, 1);
  g.fillRect(w / 2 - 5, -h / 2 + 4 + y, 1, h - 8);

  if (!disabled) {
    g.fillStyle(shade(face, 46), 0.11);
    for (let row = -h / 2 + 8 + y; row < h / 2 - 5 + y; row += 4) {
      g.fillRect(-w / 2 + 6, row, w - 12, 1);
    }
  }
  drawCornerBrackets(g, -w / 2 + 1, -h / 2 + 1 + y, w - 2, h - 2, selected ? GOLD_HI : shade(edge, -16), 5);
}

function makeTourButton(scene, x, y, w, h, label, onClick, opts = {}) {
  const bg = scene.add.graphics();
  const labelOffset = opts.icon ? 7 : 0;
  const text = tourText(scene, labelOffset, opts.labelY ?? 0, label, {
    originX: 0.5,
    fontFamily: opts.fontFamily ?? DISPLAY_FONT,
    fontSize: opts.fontSize ?? '10px',
    color: opts.textColor ?? CREAM,
    strokeThickness: opts.strokeThickness ?? 1,
    letterSpacing: opts.letterSpacing ?? 0.1
  });
  const children = [bg];
  let icon = null;
  if (opts.icon) {
    icon = scene.add.image(-(w / 2) + (opts.iconX ?? 17), opts.iconY ?? 0, opts.icon)
      .setScale(opts.iconScale ?? 1);
    children.push(icon);
  }
  children.push(text);

  const container = scene.add.container(x, y, children);
  let enabled = opts.disabled !== true;
  let over = false;
  let down = false;
  const render = () => {
    const state = !enabled ? 'disabled' : down ? 'pressed' : over ? 'hover' : 'idle';
    const fill = state === 'hover' ? shade(opts.color, 18) : state === 'pressed' ? shade(opts.color, -28) : opts.color;
    drawTourButton(bg, w, h, fill, state, opts);
    const offset = state === 'pressed' ? 2 : 0;
    text.setY((opts.labelY ?? 0) + offset).setAlpha(enabled ? 1 : 0.45);
    if (icon) icon.setY((opts.iconY ?? 0) + offset).setAlpha(enabled ? 1 : 0.32);
  };

  container.setSize(opts.hitWidth ?? Math.max(44, w), opts.hitHeight ?? Math.max(30, h));
  if (enabled) container.setInteractive({ useHandCursor: true });
  container.on('pointerover', () => { over = true; render(); });
  container.on('pointerout', () => { over = false; down = false; render(); });
  container.on('pointerdown', () => { if (enabled) { over = true; down = true; render(); } });
  container.on('pointerupoutside', () => { over = false; down = false; render(); });
  container.on('pointerup', () => {
    if (!enabled || !down) return;
    const fire = over;
    down = false;
    render();
    if (fire) {
      Audio.ui();
      onClick?.();
    }
  });
  container.setButtonEnabled = (value) => {
    enabled = Boolean(value);
    down = false;
    over = false;
    if (enabled) container.setInteractive({ useHandCursor: true });
    else container.disableInteractive();
    render();
    return container;
  };
  container.buttonLabel = text;
  container.buttonIcon = icon;
  container.buttonWidth = w;
  container.buttonHeight = h;
  render();
  return container;
}

export class LevelSelectScene extends Phaser.Scene {
  constructor() {
    super('LevelSelect');
  }

  create() {
    configureTourCamera(this);
    MenuMusic.enterMenu();
    this.backgroundImage = addAspectCoverImage(this, 'stadium-menu').setDepth(0);
    this.crowdBackdrop = addAspectCoverRegion(
      this, 'crowd-panorama-v3', GAME_W / 2, 69, TOUR_VIEW_W, 96
    ).setDepth(0.2);
    this.pitchBackdrop = addAspectCoverRegion(
      this, 'pitch-grass-pixel-v3', GAME_W / 2, 209, TOUR_VIEW_W, 222
    ).setDepth(0.3);

    const wash = this.add.graphics().setDepth(1);
    wash.fillStyle(PAL.ink, 0.48);
    wash.fillRect(TOUR_VIEW_X, 0, TOUR_VIEW_W, TOUR_H);
    wash.fillGradientStyle(0x071018, 0x071018, 0x03110c, 0x03110c, 0.5, 0.5, 0.2, 0.2);
    wash.fillRect(TOUR_VIEW_X, 0, TOUR_VIEW_W, TOUR_H);

    this.unlocked = SaveManager.unlockedCount(LEVELS.length);
    const lastPlayed = SaveManager.getLastPlayed?.();
    const lastIndex = lastPlayed?.mode === 'career'
      ? LEVELS.findIndex((level, i) => String(stableId(level, i)) === String(lastPlayed.levelId))
      : -1;
    const fallback = Phaser.Math.Clamp(this.unlocked - 1, 0, Math.max(LEVELS.length - 1, 0));
    this.selectedIndex = lastIndex >= 0 ? lastIndex : fallback;
    this.cupIndex = Phaser.Math.Clamp(Math.floor(this.selectedIndex / LEVELS_PER_CUP), 0, CUP_COUNT - 1);

    this.drawHeader();
    this.drawPanels();
    this.renderCupTabs();
    this.renderCupContent();

    const scanlines = this.add.graphics().setDepth(2600);
    scanlines.fillStyle(PAL.ink, 0.022);
    for (let y = 1; y < TOUR_H; y += 4) scanlines.fillRect(TOUR_VIEW_X, y, TOUR_VIEW_W, 1);
    scanlines.setBlendMode('MULTIPLY');
    sceneIntro(this);

    // Choosing a level is the last quiet moment before kick-off. Warm the match
    // atlases here too, so arriving from a cold Career tap is as instant as
    // arriving from Continue.
    this.time.delayedCall(200, () => {
      if (this.scene.isActive()) prefetchMatchPack();
    });
  }

  drawHeader() {
    const chrome = this.add.graphics().setDepth(100);
    drawTourPanel(chrome, 16, 7, 450, 32, {
      border: 0x294860,
      inner: 0x142c42,
      bottom: 0x0a1a29,
      corner: GOLD_DARK,
      cornerSize: 7
    });

    makeTourButton(this, 34, 23, 25, 23, '', () => this.scene.start('Menu'), {
      color: 0x1d3e58,
      border: 0x426884,
      icon: 'icon-back',
      iconScale: 1.02,
      iconX: 12.5,
      hitWidth: 34,
      hitHeight: 32
    }).setDepth(104);

    tourText(this, GAME_W / 2, 23, 'FIVE CUP TOUR', {
      originX: 0.5,
      fontFamily: DISPLAY_FONT,
      fontSize: '17px',
      color: CREAM,
      strokeThickness: 2,
      letterSpacing: 0.1
    }).setDepth(104);

    const totalStars = SaveManager.getTotalStars?.()
      ?? LEVELS.reduce((sum, level, index) => sum + SaveManager.getStars(stableId(level, index)), 0);
    const chip = this.add.graphics();
    drawTourPanel(chip, -44, -11.5, 88, 23, {
      border: GOLD_DARK,
      inner: 0x102439,
      bottom: 0x071725,
      corner: GOLD_DARK,
      cornerSize: 5
    });
    const star = this.add.image(-29, 0, 'icon-star').setScale(1.25);
    const value = tourText(this, -16, 0, `${totalStars}/${LEVELS.length * 3}`, {
      fontFamily: DISPLAY_FONT,
      fontSize: '10px',
      color: CREAM,
      letterSpacing: 0.05
    });
    this.add.container(417, 23, [chip, star, value]).setDepth(104);
  }

  drawPanels() {
    const panels = this.add.graphics().setDepth(80);
    drawTourPanel(panels, 16, 82, 279, 219, {
      border: 0x44637a,
      inner: 0x15324a,
      bottom: 0x071c2e,
      corner: GOLD_DARK,
      cornerSize: 7
    });
    drawTourPanel(panels, 301, 82, 164, 219, {
      border: GOLD_DARK,
      inner: 0x15324a,
      bottom: 0x071c2e,
      corner: GOLD,
      cornerSize: 7
    });
  }

  renderCupTabs() {
    if (this.tabLayer) {
      this.tabLayer.removeAll(true);
      this.tabLayer.destroy();
    }
    this.tabLayer = this.add.container(0, 0).setDepth(110);

    const xs = [85, 162, 240, 318, 395];
    CUP_VIEWS.forEach((cup, index) => {
      const firstLevel = index * LEVELS_PER_CUP;
      const hasLevels = firstLevel < LEVELS.length;
      const available = hasLevels && firstLevel < this.unlocked;
      const selected = index === this.cupIndex;
      const button = makeTourButton(this, xs[index], 60, 72, 32, cup.roman, () => {
        this.cupIndex = index;
        const start = index * LEVELS_PER_CUP;
        const end = Math.min(start + LEVELS_PER_CUP, LEVELS.length);
        this.selectedIndex = Phaser.Math.Clamp(Math.max(start, Math.min(this.unlocked - 1, end - 1)), start, Math.max(start, end - 1));
        this.renderCupTabs();
        this.renderCupContent();
      }, {
        color: selected ? cup.color : 0x173148,
        border: selected ? GOLD_HI : 0x365873,
        selected,
        disabled: !available,
        icon: available ? 'icon-cup' : 'icon-cup-locked',
        iconScale: 1.3,
        iconX: 21,
        fontSize: '15px',
        letterSpacing: 0.1,
        hitHeight: 36
      });
      this.tabLayer.add(button);
    });
  }

  renderCupContent() {
    if (this.contentLayer) {
      this.contentLayer.removeAll(true);
      this.contentLayer.destroy();
    }
    this.contentLayer = this.add.container(0, 0).setDepth(120);

    const cup = CUP_VIEWS[this.cupIndex];
    const start = this.cupIndex * LEVELS_PER_CUP;
    const end = Math.min(start + LEVELS_PER_CUP, LEVELS.length);
    const cupLevels = LEVELS.slice(start, end);

    const cupName = tourText(this, 29, 103, cup.name, {
      fontFamily: DISPLAY_FONT,
      fontSize: '14px',
      color: '#f5c94b',
      strokeThickness: 1,
      letterSpacing: 0
    });
    const divider = tourText(this, 29 + cupName.displayWidth + 7, 103, '/', {
      fontFamily: DISPLAY_FONT,
      fontSize: '12px',
      color: CREAM,
      strokeThickness: 1
    });
    const cupPlace = tourText(this, divider.x + divider.displayWidth + 7, 103, cup.place, {
      fontSize: '9px',
      color: '#aac1d3',
      strokeThickness: 1,
      letterSpacing: 0.2
    });
    this.contentLayer.add([cupName, divider, cupPlace]);

    if (cupLevels.length === 0) {
      const lock = this.add.image(155, 166, 'icon-cup-locked').setScale(3.2).setAlpha(0.62);
      const soon = tourText(this, 155, 202, 'QUALIFY IN THE PREVIOUS CUP', {
        originX: 0.5,
        fontSize: '10px',
        color: '#7792a5',
        letterSpacing: 0.25
      });
      this.contentLayer.add([lock, soon]);
      this.renderEmptyDetail(cup);
      return;
    }

    cupLevels.forEach((level, localIndex) => {
      const index = start + localIndex;
      const col = localIndex % 5;
      const row = Math.floor(localIndex / 5);
      this.contentLayer.add(this.makeLevelTile(48 + col * 53, 150 + row * 71, index, level));
    });

    const selected = LEVELS[this.selectedIndex] || cupLevels[0];
    this.renderDetail(selected, LEVELS.indexOf(selected));
  }

  makeLevelTile(x, y, index, level) {
    const unlocked = index < this.unlocked;
    const selected = index === this.selectedIndex;
    const stars = SaveManager.getStars(stableId(level, index));
    const cupColor = CUP_VIEWS[this.cupIndex].color;
    const tile = makeTourButton(this, x, y, 47, 62, unlocked ? String(index + 1).padStart(2, '0') : '', () => {
      this.selectedIndex = index;
      this.renderCupContent();
    }, {
      color: selected ? cupColor : 0x123c35,
      border: selected ? GOLD_HI : 0x31504e,
      selected,
      disabled: !unlocked,
      fontSize: '16px',
      labelY: -10,
      strokeThickness: 2,
      hitWidth: 51,
      hitHeight: 66
    });

    if (unlocked) {
      tile.add(this.makeStars(0, 18, stars, { scale: 1.0, gap: 14 }));
    } else {
      tile.add(this.add.image(0, 1, 'icon-lock').setScale(1.02).setAlpha(0.62));
    }
    return tile;
  }

  makeStars(x, y, count, opts = {}) {
    const stars = [];
    for (let index = 0; index < 3; index++) {
      stars.push(this.add.image((index - 1) * (opts.gap ?? 13), 0,
        index < count ? 'icon-star' : 'icon-star-empty').setScale(opts.scale ?? 1));
    }
    return this.add.container(x, y, stars);
  }

  renderEmptyDetail(cup) {
    const icon = this.add.image(383, 137, 'icon-cup-locked').setScale(3.2).setAlpha(0.58);
    const name = tourText(this, 383, 174, cup.name, {
      originX: 0.5,
      fontFamily: DISPLAY_FONT,
      fontSize: '13px',
      color: '#70899a'
    });
    const copy = tourText(this, 383, 207, 'WIN THE PREVIOUS CUP\nTO OPEN THIS STAGE', {
      originX: 0.5,
      fontSize: '10px',
      color: '#7891a2',
      align: 'center',
      lineSpacing: 1
    });
    this.contentLayer.add([icon, name, copy]);
  }

  renderDetail(level, index) {
    if (!level || index < 0) return;
    const unlocked = index < this.unlocked;
    const stars = SaveManager.getStars(stableId(level, index));
    const cup = CUP_VIEWS[Math.floor(index / LEVELS_PER_CUP)] ?? CUP_VIEWS[0];

    const label = tourText(this, 313, 100, `MATCH ${String(index + 1).padStart(2, '0')}  ·  CUP ${cup.roman}`, {
      fontSize: '10px',
      color: '#86aac6',
      letterSpacing: 0.3
    });
    const name = tourText(this, 383, 123, String(level.name || 'Unnamed kick').toUpperCase(), {
      originX: 0.5,
      fontFamily: DISPLAY_FONT,
      fontSize: '13px',
      color: CREAM,
      strokeThickness: 2,
      align: 'center',
      wordWrap: { width: 145, useAdvancedWrap: true }
    });
    const rating = this.makeStars(383, 145, stars, { scale: 1.3, gap: 20 });

    const rules = this.add.graphics();
    rules.fillStyle(0x36546b, 0.9);
    rules.fillRect(311, 159, 144, 1);
    rules.fillRect(311, 221, 144, 1);
    rules.fillStyle(0x7897ad, 0.16);
    rules.fillRect(311, 160, 144, 1);
    this.contentLayer.add(rules);

    const metrics = [
      ['distance', 'DISTANCE', `${Math.round(level.distance || 0)} M`],
      ['wall', 'WALL', `${level.wall || 0} PLAYERS`],
      ['keeper', 'KEEPER', this.keeperLabel(level.keeper)]
    ];
    metrics.forEach(([type, metric, value], row) => {
      const y = 175 + row * 20;
      const icon = this.makeMetricIcon(type, 316, y);
      const left = tourText(this, 328, y, metric, {
        fontSize: '10px',
        color: '#86aac6',
        letterSpacing: 0.2
      });
      const right = tourText(this, 452, y, value, {
        originX: 1,
        fontFamily: DISPLAY_FONT,
        fontSize: '9px',
        color: CREAM,
        letterSpacing: 0
      });
      this.contentLayer.add([icon, left, right]);
    });

    const reward = level.rewardCoins ?? level.reward?.coins ?? 0;
    if (reward > 0) {
      const rewardIcon = this.add.image(317, 237, 'icon-coin').setScale(1.2);
      const rewardText = tourText(this, 330, 237, `${reward} FIRST-WIN`, {
        fontFamily: DISPLAY_FONT,
        fontSize: '10px',
        color: '#f5c94b',
        letterSpacing: 0.15
      });
      this.contentLayer.add([rewardIcon, rewardText]);
    }

    const play = makeTourButton(this, 381, 273, 143, 37, unlocked ? 'PLAY MATCH' : 'LOCKED', () => {
      SaveManager.setLastPlayed?.({ mode: 'career', levelId: stableId(level, index) });
      this.scene.start('Game', { mode: 'career', levelIndex: index });
    }, {
      color: cup.color,
      border: GOLD_HI,
      selected: unlocked,
      icon: unlocked ? 'icon-play' : 'icon-lock',
      iconScale: 1.25,
      iconX: 20,
      fontSize: '13px',
      strokeThickness: 2,
      disabled: !unlocked,
      hitHeight: 41
    });

    this.contentLayer.add([label, name, rating, play]);
  }

  makeMetricIcon(type, x, y) {
    const g = this.add.graphics().setPosition(x, y);
    const hi = 0x86aac6;
    const shadeColor = 0x3e6789;
    g.fillStyle(shadeColor, 1);

    if (type === 'distance') {
      g.fillRect(-5, -2, 10, 5);
      g.fillStyle(hi, 1);
      g.fillRect(-5, -3, 10, 3);
      g.fillStyle(BLUE_DEEP, 1);
      [-3, 0, 3].forEach((mark) => g.fillRect(mark, -2, 1, 2));
      g.setAngle(-35);
    } else if (type === 'wall') {
      g.fillRect(-6, -5, 12, 10);
      g.fillStyle(hi, 1);
      g.fillRect(-6, -5, 5, 3);
      g.fillRect(1, -5, 5, 3);
      g.fillRect(-4, -1, 5, 3);
      g.fillRect(3, -1, 3, 3);
      g.fillRect(-6, 3, 5, 2);
      g.fillRect(1, 3, 5, 2);
    } else {
      g.fillRect(-4, -2, 9, 7);
      g.fillRect(-5, -6, 2, 5);
      g.fillRect(-2, -7, 2, 6);
      g.fillRect(1, -6, 2, 5);
      g.fillRect(4, -5, 2, 6);
      g.fillStyle(hi, 1);
      g.fillRect(-3, -1, 7, 5);
      g.fillRect(-3, 5, 7, 2);
    }
    return g;
  }

  keeperLabel(skill = 0) {
    if (skill < 0.28) return 'ROOKIE';
    if (skill < 0.48) return 'SHARP';
    if (skill < 0.66) return 'ELITE';
    return 'LEGEND';
  }
}
