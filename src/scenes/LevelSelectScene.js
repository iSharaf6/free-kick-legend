import Phaser from 'phaser';
import { GAME_W, RENDER_W, RENDER_H, CAM } from '../config.js';
import { crispText, sceneIntro, PIXEL_TEXT_WEIGHT, UI, PRIMARY_BUTTON } from '../ui.js';
import { SaveManager } from '../systems/SaveManager.js';
import { MenuMusic } from '../systems/MenuMusic.js';
import { Audio } from '../systems/AudioSynth.js';
import { LEVELS, CUPS as CUP_DATA } from '../data/levels.js';
import { prefetchMatchPack } from '../data/matchAssets.js';
import { PAL } from '../pixelart.js';
import { addPitchSurface } from '../art/PitchSurface.js';
import { addPixelPitch } from '../art/PixelPitch.js';
import { addCrowdStand } from '../art/CrowdStand.js';
import { installPixelGrid } from '../rendering/PixelGrid.js';

const LEVELS_PER_CUP = 10;
const CUP_COUNT = 5;
const CUP_COLORS = [0x087b4c, 0x1760bd, 0xc87312, 0x6238ae, 0xa52f35];
const DISPLAY_FONT = '"Pixelify Sans", monospace';
const PIXEL_FONT = '"Pixelify Sans", monospace';
const CREAM = '#f7fbff';
const MUTED = '#86aac6';
// A selected cup or match is marked in cream. Gold is the Play Match key's
// alone, so the eye has exactly one gold thing to find on this screen.
const SELECTED_EDGE = UI.cream;
const BLUE_EDGE = UI.edge;
const BLUE_MID = 0x164379;
const BLUE_DEEP = 0x071a38;
const INK = 0x030714;
const TOUR_H = 320;
const TOUR_ZOOM = RENDER_H / TOUR_H;
const TOUR_VIEW_W = RENDER_W / TOUR_ZOOM;
const TOUR_VIEW_X = (GAME_W - TOUR_VIEW_W) / 2;

const CUP_VIEWS = CUP_DATA.map((cup, index) => ({
  ...cup,
  roman: ['I', 'II', 'III', 'IV', 'V'][index],
  name: cup.name.toUpperCase(),
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
  // The stadium behind the cup browser sits on the same pixel grid as a match;
  // the browser itself stays crisp above it.
  installPixelGrid(scene, { uiDepth: 50 });
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

function drawTourPanel(g, x, y, w, h, opts = {}) {
  const border = opts.border ?? BLUE_EDGE;
  const inner = opts.inner ?? BLUE_MID;
  const bottom = opts.bottom ?? BLUE_DEEP;

  g.fillStyle(INK, 0.62);
  g.fillRect(x, y + UI.shadowDrop, w, h);
  g.fillStyle(border, 1);
  g.fillRect(x, y, w, h);
  g.fillGradientStyle(inner, inner, bottom, bottom, opts.alpha ?? 1);
  g.fillRect(x + 1, y + 1, w - 2, h - 2);

  g.fillStyle(shade(inner, 34), 0.78);
  g.fillRect(x + 1, y + 1, w - 2, 1);
  g.fillStyle(INK, 0.68);
  g.fillRect(x + 1, y + h - 2, w - 2, 1);
  return g;
}

function drawTourButton(g, w, h, fill, state, opts = {}) {
  const pressed = state === 'pressed';
  const disabled = state === 'disabled';
  const selected = opts.selected && !disabled;
  const y = pressed ? 2 : 0;
  const edge = selected ? SELECTED_EDGE : (opts.border ?? BLUE_EDGE);
  const face = disabled ? 0x162634 : fill;

  g.clear();
  if (!pressed) g.fillStyle(INK, 0.7).fillRect(-w / 2, -h / 2 + UI.shadowDrop, w, h);
  if (selected) {
    g.fillStyle(SELECTED_EDGE, 0.1);
    g.fillRect(-w / 2 - 2, -h / 2 - 2 + y, w + 4, h + 4);
  }
  g.fillStyle(edge, 1);
  g.fillRect(-w / 2, -h / 2 + y, w, h);
  g.fillGradientStyle(shade(face, disabled ? 2 : 24), shade(face, disabled ? 2 : 24), shade(face, -18), shade(face, -18), 1);
  g.fillRect(-w / 2 + 1, -h / 2 + 1 + y, w - 2, h - 2);

  g.fillStyle(disabled ? 0x294053 : shade(face, 52), disabled ? 0.45 : 0.95);
  g.fillRect(-w / 2 + 1, -h / 2 + 1 + y, w - 2, 1);
  g.fillStyle(INK, 0.56);
  g.fillRect(-w / 2 + 1, h / 2 - 2 + y, w - 2, 1);

  if (selected) {
    g.fillStyle(SELECTED_EDGE, 1);
    g.fillRect(-w / 2 + 2, h / 2 - 3 + y, w - 4, 2);
  }
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
    shadow: opts.textShadow,
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
    this.reducedMotion = Boolean(SaveManager.getSettings().reducedMotion);
    MenuMusic.enterMenu();
    this.backgroundImage = addAspectCoverImage(this, 'stadium-menu').setDepth(0);
    this.crowdBackdrop = addCrowdStand(this, {
      viewWidth: TOUR_VIEW_W,
      x: TOUR_VIEW_X,
      top: 5,
      depthOffset: -0.9,
      reducedMotion: this.reducedMotion,
      dressed: false
    });
    this.pitchBackdrop = addPixelPitch(this, {
      left: Math.floor(TOUR_VIEW_X),
      top: 98,
      width: Math.ceil(TOUR_VIEW_W),
      height: TOUR_H - 98,
      horizonX: GAME_W / 2,
      horizonY: CAM.horizonY,
      focal: CAM.focal,
      cameraHeight: CAM.height,
      goalZ: CAM.ballDist + 22,
      seed: 0x43555035,
      depth: 0.3,
      name: 'tour-pixel-pitch'
    }) ?? addPitchSurface(this, {
      x: TOUR_VIEW_X,
      y: 98,
      width: TOUR_VIEW_W,
      height: TOUR_H - 98,
      horizon: { x: GAME_W / 2, y: 76 },
      seed: 0x43555035,
      depth: 0.3,
      name: 'tour-procedural-pitch'
    });
    this.events.once('shutdown', () => {
      this.crowdBackdrop?.destroy?.();
      this.crowdBackdrop = null;
    });

    const wash = this.add.graphics().setDepth(1);
    wash.fillStyle(PAL.ink, 0.32);
    wash.fillRect(TOUR_VIEW_X, 0, TOUR_VIEW_W, TOUR_H);
    wash.fillGradientStyle(0x071b3b, 0x071b3b, 0x03170f, 0x03170f, 0.34, 0.34, 0.12, 0.12);
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

    if (!this.reducedMotion) sceneIntro(this);

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
      inner: 0x123b70,
      bottom: 0x071a38
    });

    makeTourButton(this, 34, 23, 25, 23, '', () => this.scene.start('Menu'), {
      color: 0x164379,
      border: UI.edgeHi,
      icon: 'icon-back',
      iconScale: 1.02,
      iconX: 12.5,
      hitWidth: 34,
      hitHeight: 32
    }).setDepth(104);

    // Named after the menu button that leads here.
    tourText(this, GAME_W / 2, 23, 'CAREER', {
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
      inner: 0x123b70,
      bottom: 0x071a38
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
      inner: 0x123b70,
      bottom: 0x071a38
    });
    drawTourPanel(panels, 301, 82, 164, 219, {
      inner: 0x123b70,
      bottom: 0x071a38
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
        color: selected ? cup.color : 0x123b70,
        border: UI.edge,
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
      color: UI.creamText,
      strokeThickness: 1,
      letterSpacing: 0
    });
    this.contentLayer.add(cupName);

    if (cupLevels.length === 0) {
      const lock = this.add.image(155, 166, 'icon-cup-locked').setScale(3.2).setAlpha(0.62);
      const soon = tourText(this, 155, 202, 'Win the previous cup to play here.', {
        originX: 0.5,
        fontSize: '10px',
        color: '#7792a5',
        letterSpacing: 0.1
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
      border: 0x31504e,
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
    const copy = tourText(this, 383, 207, 'Win the previous cup\nto open this one.', {
      originX: 0.5,
      fontSize: '10px',
      color: '#7891a2',
      align: 'center',
      lineSpacing: 1,
      letterSpacing: 0.1
    });
    this.contentLayer.add([icon, name, copy]);
  }

  renderDetail(level, index) {
    if (!level || index < 0) return;
    const unlocked = index < this.unlocked;
    const stars = SaveManager.getStars(stableId(level, index));
    const left = 313;
    const width = 141;

    // Name, how it went, what the kick asks of you, then the setup. The old
    // panel was a DISTANCE / WALL / KEEPER table that never said what the
    // level actually wanted.
    const name = tourText(this, left, 96, String(level.name || 'Unnamed kick').toUpperCase(), {
      originY: 0,
      fontFamily: DISPLAY_FONT,
      fontSize: '13px',
      color: CREAM,
      strokeThickness: 2,
      letterSpacing: 0.1,
      lineSpacing: 1,
      wordWrap: { width, useAdvancedWrap: true }
    });
    let y = name.y + name.displayHeight + 4;
    // Three dark outlines under a level nobody has played yet say nothing, so
    // the rating only appears once there is one.
    if (stars > 0) {
      y += 3;
      this.contentLayer.add(this.makeStars(left + 20, y, stars, { scale: 1.1, gap: 15 }));
      y += 11;
    }

    const rule = this.add.graphics();
    rule.fillStyle(0x36546b, 0.9);
    rule.fillRect(311, y, 144, 1);
    y += 8;

    const objective = tourText(this, left, y, level.objective?.label || 'Score from the free kick', {
      originY: 0,
      fontSize: '9px',
      color: '#e3ecf3',
      letterSpacing: 0.1,
      lineSpacing: 2,
      wordWrap: { width, useAdvancedWrap: true }
    });
    y += objective.displayHeight + 6;

    const facts = tourText(this, left, y, [
      `${Math.round(level.distance || 0)} m, ${this.wallCopy(level.wall || 0)}`,
      `${this.keeperLabel(level.keeper)} keeper`
    ].join('\n'), {
      originY: 0,
      fontSize: '8px',
      color: MUTED,
      letterSpacing: 0.1,
      lineSpacing: 2
    });
    this.contentLayer.add([name, rule, objective, facts]);

    // First clear pays the level reward; after that the only coins left are
    // the three-star bonus. Show whichever is still on the table.
    const reward = level.rewardCoins ?? level.reward?.coins ?? 0;
    const bonus = level.reward?.threeStarBonus ?? 0;
    const rewardCopy = stars === 0 && reward > 0
      ? `+${reward} coins`
      : stars > 0 && stars < 3 && bonus > 0
        ? `+${bonus} coins for 3 stars`
        : null;
    if (rewardCopy) {
      const rewardIcon = this.add.image(left + 4, 238, 'icon-coin').setScale(1.1);
      const rewardText = tourText(this, left + 14, 238, rewardCopy, {
        fontSize: '9px',
        color: CREAM,
        letterSpacing: 0.1
      });
      this.contentLayer.add([rewardIcon, rewardText]);
    }

    const play = makeTourButton(this, 381, 273, 143, 37, unlocked ? 'PLAY MATCH' : 'LOCKED', () => {
      SaveManager.setLastPlayed?.({ mode: 'career', levelId: stableId(level, index) });
      this.scene.start('Game', { mode: 'career', levelIndex: index });
    }, {
      // The screen's one primary action: the same gold key as the menu's
      // Continue, rather than a face that changed colour with every cup. Ink
      // lettering only while unlocked - the disabled face is dark, where ink
      // text would disappear.
      color: PRIMARY_BUTTON.color,
      border: 0xffe08a,
      textColor: unlocked ? PRIMARY_BUTTON.textColor : CREAM,
      strokeThickness: unlocked ? 0 : 2,
      textShadow: !unlocked,
      icon: unlocked ? 'icon-play' : 'icon-lock',
      iconScale: 1.25,
      iconX: 20,
      fontSize: '13px',
      disabled: !unlocked,
      hitHeight: 41
    });
    if (unlocked) play.buttonIcon?.setTint(0x1b1303);

    this.contentLayer.add(play);
  }

  wallCopy(count = 0) {
    return count > 0 ? `${count} in the wall` : 'no wall';
  }

  keeperLabel(skill = 0) {
    if (skill < 0.28) return 'Rookie';
    if (skill < 0.48) return 'Sharp';
    if (skill < 0.66) return 'Elite';
    return 'Legend';
  }
}
