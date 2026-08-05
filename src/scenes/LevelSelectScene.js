import Phaser from 'phaser';
import { GAME_W, GAME_H } from '../config.js';
import {
  makeButton, makeIconButton, makeStatChip, makeStars, titleText,
  bodyText, drawPanel, addScanlines, sceneIntro, configureHdCamera, FONT
} from '../ui.js';
import { SaveManager } from '../systems/SaveManager.js';
import { MenuMusic } from '../systems/MenuMusic.js';
import { LEVELS, CUPS as CUP_DATA } from '../data/levels.js';
import { PAL } from '../pixelart.js';

const LEVELS_PER_CUP = 10;
const CUP_COUNT = 5;
const CUP_COLORS = [PAL.green, PAL.blue, PAL.orange, 0x67549a, PAL.red];
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

function addAspectCoverImage(scene, key, width = GAME_W, height = GAME_H) {
  const image = scene.add.image(width / 2, height / 2, key).setOrigin(0.5);
  const sourceWidth = Math.max(1, Number(image.width) || width);
  const sourceHeight = Math.max(1, Number(image.height) || height);
  const uniformScale = Math.max(width / sourceWidth, height / sourceHeight);
  image.setScale(uniformScale);
  image.fklAspectCover = {
    sourceWidth,
    sourceHeight,
    scale: uniformScale
  };
  return image;
}

export class LevelSelectScene extends Phaser.Scene {
  constructor() {
    super('LevelSelect');
  }

  create() {
    configureHdCamera(this);
    MenuMusic.enterMenu();
    // Cover the 16:9 canvas from the source dimensions with one uniform scale.
    // Even if the stadium art changes aspect later, it may crop at the edges
    // but can never be stretched wider or taller than its authored proportions.
    this.backgroundImage = addAspectCoverImage(this, 'stadium-menu').setDepth(0);
    const wash = this.add.graphics().setDepth(1);
    wash.fillStyle(PAL.ink, 0.68);
    wash.fillRect(0, 0, GAME_W, GAME_H);

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

    addScanlines(this, 2600, 0.03);
    sceneIntro(this);
  }

  drawHeader() {
    const g = this.add.graphics().setDepth(100);
    drawPanel(g, 6, 4, GAME_W - 12, 32, {
      fill: PAL.panel,
      border: PAL.borderDark,
      corner: PAL.gold
    });
    makeIconButton(this, 23, 20, 23, 'icon-back', () => this.scene.start('Menu'), {
      color: PAL.panelHi,
      hover: PAL.blue,
      border: PAL.borderDark,
      iconScale: 0.88,
      hitWidth: 34,
      hitHeight: 32
    }).setDepth(104);
    titleText(this, GAME_W / 2, 20, 'FIVE CUP TOUR', '16px', '#f3e7c3').setDepth(104);

    const totalStars = SaveManager.getTotalStars?.()
      ?? LEVELS.reduce((sum, level, index) => sum + SaveManager.getStars(stableId(level, index)), 0);
    makeStatChip(this, 427, 20, 80, 'icon-star', `${totalStars}/${LEVELS.length * 3}`, {
      height: 23,
      fill: PAL.night,
      border: PAL.goldDark,
      fontSize: '9px',
      iconScale: 0.88
    }).setDepth(104);
  }

  drawPanels() {
    const g = this.add.graphics().setDepth(80);
    drawPanel(g, 7, 76, 294, 188, {
      fill: PAL.panel,
      border: PAL.borderDark,
      corner: PAL.gold
    });
    drawPanel(g, 305, 76, 168, 188, {
      fill: PAL.panel,
      border: PAL.goldDark,
      corner: PAL.gold
    });
  }

  renderCupTabs() {
    if (this.tabLayer) {
      this.tabLayer.removeAll(true);
      this.tabLayer.destroy();
    }
    this.tabLayer = this.add.container(0, 0).setDepth(110);

    const xs = [70, 155, 240, 325, 410];
    CUP_VIEWS.forEach((cup, index) => {
      const firstLevel = index * LEVELS_PER_CUP;
      const hasLevels = firstLevel < LEVELS.length;
      const available = hasLevels && firstLevel < this.unlocked;
      const selected = index === this.cupIndex;
      const btn = makeButton(this, xs[index], 56, 78, 30, cup.roman, () => {
        this.cupIndex = index;
        const start = index * LEVELS_PER_CUP;
        const end = Math.min(start + LEVELS_PER_CUP, LEVELS.length);
        this.selectedIndex = Phaser.Math.Clamp(Math.max(start, Math.min(this.unlocked - 1, end - 1)), start, Math.max(start, end - 1));
        this.renderCupTabs();
        this.renderCupContent();
      }, {
        color: selected ? cup.color : PAL.panelHi,
        hover: cup.color,
        border: selected ? PAL.gold : PAL.borderDark,
        selected,
        disabled: !available,
        icon: available ? 'icon-cup' : 'icon-cup-locked',
        iconScale: 0.72,
        iconX: 17,
        fontSize: '11px',
        letterSpacing: 0.5,
        hitHeight: 34
      });
      this.tabLayer.add(btn);
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

    const cupName = bodyText(this, 20, 93, cup.name, {
      fontFamily: FONT,
      fontSize: '10px',
      color: '#f3c449',
      letterSpacing: 0.4
    });
    const divider = bodyText(this, 20 + cupName.displayWidth + 8, 93, '/', {
      fontFamily: FONT,
      fontSize: '9px',
      color: '#f3e7c3'
    });
    const cupPlace = bodyText(this, divider.x + divider.displayWidth + 8, 93, cup.place, {
      fontSize: '8px',
      color: '#9fb3ba',
      letterSpacing: 0.25
    });
    this.contentLayer.add([cupName, divider, cupPlace]);

    if (cupLevels.length === 0) {
      const soon = bodyText(this, 154, 171, 'QUALIFY IN THE PREVIOUS CUP', {
        originX: 0.5,
        fontSize: '8px',
        color: '#7f929d',
        letterSpacing: 0.4
      });
      const lock = this.add.image(154, 143, 'icon-lock').setScale(1.7);
      this.contentLayer.add([soon, lock]);
      this.renderEmptyDetail(cup);
      return;
    }

    cupLevels.forEach((level, localIndex) => {
      const index = start + localIndex;
      const col = localIndex % 5;
      const row = Math.floor(localIndex / 5);
      const x = 43 + col * 55;
      const y = 139 + row * 68;
      this.contentLayer.add(this.makeLevelTile(x, y, index, level));
    });

    const selected = LEVELS[this.selectedIndex] || cupLevels[0];
    const selectedIndex = LEVELS.indexOf(selected);
    this.renderDetail(selected, selectedIndex);
  }

  makeLevelTile(x, y, index, level) {
    const unlocked = index < this.unlocked;
    const selected = index === this.selectedIndex;
    const stars = SaveManager.getStars(stableId(level, index));
    const cupColor = CUP_VIEWS[this.cupIndex].color;
    const tile = makeButton(this, x, y, 49, 56, unlocked ? String(index + 1).padStart(2, '0') : '', () => {
      this.selectedIndex = index;
      this.renderCupContent();
    }, {
      color: selected ? cupColor : 0x203b36,
      hover: cupColor,
      border: selected ? PAL.gold : PAL.borderDark,
      selected,
      disabled: !unlocked,
      fontFamily: FONT,
      fontSize: '12px',
      labelY: -9,
      letterSpacing: 0.3,
      hitWidth: 51,
      hitHeight: 60
    });

    if (unlocked) {
      const rating = makeStars(this, 0, 15, stars, { scale: 0.66, gap: 13 });
      tile.add(rating);
    } else {
      tile.add(this.add.image(0, 0, 'icon-lock').setScale(0.9).setAlpha(0.55));
    }
    return tile;
  }

  renderEmptyDetail(cup) {
    const icon = this.add.image(389, 118, 'icon-cup-locked').setScale(2.4).setAlpha(0.55);
    const name = titleText(this, 389, 153, cup.name, '11px', '#7f929d');
    const copy = bodyText(this, 389, 181, 'WIN THE PREVIOUS CUP\nTO OPEN THIS STAGE', {
      originX: 0.5,
      fontSize: '7px',
      color: '#7f929d',
      align: 'center',
      lineSpacing: 2
    });
    this.contentLayer.add([icon, name, copy]);
  }

  renderDetail(level, index) {
    if (!level || index < 0) return;
    const unlocked = index < this.unlocked;
    const stars = SaveManager.getStars(stableId(level, index));
    const cup = CUP_VIEWS[Math.floor(index / LEVELS_PER_CUP)] ?? CUP_VIEWS[0];

    const label = bodyText(this, 317, 92, `MATCH ${String(index + 1).padStart(2, '0')}  ·  CUP ${cup.roman}`, {
      fontSize: '7px',
      color: '#86a8c4',
      letterSpacing: 0.4
    });
    const name = titleText(this, 389, 116, String(level.name || 'Unnamed kick').toUpperCase(), '12px', '#f3e7c3');
    name.setWordWrapWidth(146, true).setAlign('center');
    const rating = makeStars(this, 389, 140, stars, { scale: 0.94, gap: 18 });

    const detailRules = this.add.graphics();
    detailRules.fillStyle(PAL.borderDark, 0.75);
    detailRules.fillRect(316, 151, 146, 1);
    detailRules.fillRect(316, 209, 146, 1);
    this.contentLayer.add(detailRules);

    const metrics = [
      ['distance', 'DISTANCE', `${Math.round(level.distance || 0)} M`],
      ['wall', 'WALL', `${level.wall || 0} PLAYER${level.wall === 1 ? '' : 'S'}`],
      ['keeper', 'KEEPER', this.keeperLabel(level.keeper)]
    ];
    metrics.forEach(([type, metric, value], row) => {
      const y = 162 + row * 19;
      const icon = this.makeMetricIcon(type, 320, y);
      const left = bodyText(this, 333, y, metric, {
        fontSize: '7px',
        color: '#86a8c4',
        letterSpacing: 0.3
      });
      const right = bodyText(this, 460, y, value, {
        originX: 1,
        fontFamily: FONT,
        fontSize: '7px',
        color: '#f3e7c3'
      });
      this.contentLayer.add([icon, left, right]);
    });

    const reward = level.rewardCoins ?? level.reward?.coins ?? 0;
    if (reward > 0) {
      const rewardIcon = this.add.image(320, 218, 'icon-coin').setScale(0.78);
      const rewardText = bodyText(this, 332, 218, `${reward} FIRST-WIN`, {
        fontSize: '7px',
        color: '#f3c449'
      });
      this.contentLayer.add([rewardIcon, rewardText]);
    }

    const play = makeButton(this, 389, 246, 148, 29, unlocked ? 'PLAY MATCH' : 'LOCKED', () => {
      SaveManager.setLastPlayed?.({ mode: 'career', levelId: stableId(level, index) });
      this.scene.start('Game', { mode: 'career', levelIndex: index });
    }, {
      color: cup.color,
      hover: cup.color === PAL.green ? PAL.greenHi : Phaser.Display.Color.IntegerToColor(cup.color).brighten(14).color,
      border: PAL.goldDark,
      icon: unlocked ? 'icon-play' : 'icon-lock',
      iconScale: 0.72,
      iconX: 18,
      fontSize: '10px',
      disabled: !unlocked,
      hitHeight: 34
    });

    this.contentLayer.add([label, name, rating, play]);
  }

  makeMetricIcon(type, x, y) {
    const g = this.add.graphics().setPosition(x, y);
    const hi = 0x86a8c4;
    const shade = 0x3d6483;
    g.fillStyle(shade, 1);

    if (type === 'distance') {
      g.fillRect(-5, -2, 10, 5);
      g.fillStyle(hi, 1);
      g.fillRect(-5, -3, 10, 3);
      g.fillStyle(PAL.panel, 1);
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
      // Compact goalkeeper glove silhouette: four fingers, palm and cuff.
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
