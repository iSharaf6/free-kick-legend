import Phaser from 'phaser';
import { GAME_W, GAME_H } from '../config.js';
import {
  makeButton, makeIconButton, makeStatChip, makeStars, titleText,
  bodyText, drawPanel, addScanlines, sceneIntro, configureHdCamera, FONT
} from '../ui.js';
import { SaveManager } from '../systems/SaveManager.js';
import { LEVELS, CUPS as CUP_DATA } from '../data/levels.js';
import { PAL } from '../pixelart.js';
import { GAMEPLAY_LAYOUT } from '../gameplayLayout.js';

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

export class LevelSelectScene extends Phaser.Scene {
  constructor() {
    super('LevelSelect');
  }

  create() {
    configureHdCamera(this);
    this.add.image(0, 0, 'stadium-menu').setOrigin(0).setDepth(0);
    const wash = this.add.graphics().setDepth(1);
    wash.fillStyle(PAL.ink, 0.76);
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
    drawPanel(g, 7, 5, GAME_W - 14, 27, {
      fill: PAL.panel,
      border: PAL.borderDark,
      corner: PAL.goldDark
    });
    makeIconButton(this, 23, 18, 20, 'icon-back', () => this.scene.start('Menu'), {
      color: PAL.panelHi,
      hover: PAL.blue,
      border: PAL.borderDark,
      iconScale: 0.78,
      hitWidth: 31,
      hitHeight: 29
    }).setDepth(104);
    titleText(this, 106, 18, 'FIVE CUP TOUR', '14px', '#f3e7c3').setOrigin(0, 0.5).setDepth(104);

    const totalStars = SaveManager.getTotalStars?.()
      ?? LEVELS.reduce((sum, level, index) => sum + SaveManager.getStars(stableId(level, index)), 0);
    makeStatChip(this, 424, 18, 82, 'icon-star', `${totalStars}/${LEVELS.length * 3}`, {
      height: 21,
      fill: PAL.night,
      border: PAL.borderDark,
      fontSize: '8px',
      iconScale: 0.8
    }).setDepth(104);
  }

  drawPanels() {
    const g = this.add.graphics().setDepth(80);
    drawPanel(g, 9, 73, 281, 187, {
      fill: PAL.panel,
      border: PAL.borderDark,
      corner: PAL.goldDark
    });
    drawPanel(g, 298, 73, 173, 187, {
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

    const xs = [87, 164, 241, 318, 395];
    CUP_VIEWS.forEach((cup, index) => {
      const firstLevel = index * LEVELS_PER_CUP;
      const hasLevels = firstLevel < LEVELS.length;
      const available = hasLevels && firstLevel < this.unlocked;
      const selected = index === this.cupIndex;
      const btn = makeButton(this, xs[index], 51, 69, 29, cup.roman, () => {
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
        iconScale: 0.62,
        iconX: 14,
        fontSize: '10px',
        letterSpacing: 0.5,
        hitHeight: 31
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

    const cupTitle = bodyText(this, 21, 88, `${cup.name}  /  ${cup.place}`, {
      fontFamily: FONT,
      fontSize: '8px',
      color: '#f3c449',
      letterSpacing: 0.4
    });
    this.contentLayer.add(cupTitle);

    if (cupLevels.length === 0) {
      const soon = bodyText(this, 149, 165, 'QUALIFY IN THE PREVIOUS CUP', {
        originX: 0.5,
        fontSize: '8px',
        color: '#7f929d',
        letterSpacing: 0.4
      });
      const lock = this.add.image(149, 137, 'icon-lock').setScale(1.7);
      this.contentLayer.add([soon, lock]);
      this.renderEmptyDetail(cup);
      return;
    }

    cupLevels.forEach((level, localIndex) => {
      const index = start + localIndex;
      const col = localIndex % 5;
      const row = Math.floor(localIndex / 5);
      const x = 34 + col * 54;
      const y = 125 + row * 59;
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
    const tile = makeButton(this, x, y, 48, 47, unlocked ? String(index + 1).padStart(2, '0') : '', () => {
      this.selectedIndex = index;
      this.renderCupContent();
    }, {
      color: selected ? cupColor : 0x203b36,
      hover: cupColor,
      border: selected ? PAL.gold : PAL.borderDark,
      selected,
      disabled: !unlocked,
      fontFamily: FONT,
      fontSize: '10px',
      labelY: -7,
      letterSpacing: 0.3,
      hitWidth: 50,
      hitHeight: 51
    });

    if (unlocked) {
      const rating = makeStars(this, 0, 11, stars, { scale: 0.58, gap: 13 });
      tile.add(rating);
    } else {
      tile.add(this.add.image(0, 0, 'icon-lock').setScale(0.9).setAlpha(0.55));
    }
    return tile;
  }

  renderEmptyDetail(cup) {
    const icon = this.add.image(384, 113, 'icon-cup-locked').setScale(2.4).setAlpha(0.55);
    const name = titleText(this, 384, 149, cup.name, '11px', '#7f929d');
    const copy = bodyText(this, 384, 175, 'WIN THE PREVIOUS CUP\nTO OPEN THIS STAGE', {
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

    const label = bodyText(this, 313, 88, `MATCH ${String(index + 1).padStart(2, '0')}  ·  CUP ${cup.roman}`, {
      fontSize: '7px',
      color: '#9fb3ba',
      letterSpacing: 0.4
    });
    const name = titleText(this, 384, 111, String(level.name || 'Unnamed kick').toUpperCase(), '12px', '#f3e7c3');
    name.setWordWrapWidth(144, true).setAlign('center');
    const rating = makeStars(this, 384, 135, stars, { scale: 0.9, gap: 17 });

    const displayedWallPlayers = level.wall > 0
      ? Math.max(GAMEPLAY_LAYOUT.wall.minPlayers, level.wall)
      : 0;
    const metrics = [
      ['DISTANCE', `${Math.round(level.distance || 0)} M`],
      ['WALL', `${displayedWallPlayers} PLAYERS`],
      ['KEEPER', this.keeperLabel(level.keeper)]
    ];
    metrics.forEach(([metric, value], row) => {
      const y = 157 + row * 17;
      const left = bodyText(this, 313, y, metric, {
        fontSize: '7px',
        color: '#7f929d',
        letterSpacing: 0.3
      });
      const right = bodyText(this, 456, y, value, {
        originX: 1,
        fontFamily: FONT,
        fontSize: '7px',
        color: '#f3e7c3'
      });
      this.contentLayer.add([left, right]);
    });

    const reward = level.rewardCoins ?? level.reward?.coins ?? 0;
    if (reward > 0) {
      const rewardIcon = this.add.image(316, 208, 'icon-coin').setScale(0.7);
      const rewardText = bodyText(this, 326, 208, `${reward} FIRST-WIN`, {
        fontSize: '6px',
        color: '#f3c449'
      });
      this.contentLayer.add([rewardIcon, rewardText]);
    }

    const play = makeButton(this, 384, 236, 142, 29, unlocked ? 'PLAY MATCH' : 'LOCKED', () => {
      SaveManager.setLastPlayed?.({ mode: 'career', levelId: stableId(level, index) });
      this.scene.start('Game', { mode: 'career', levelIndex: index });
    }, {
      color: cup.color,
      hover: cup.color === PAL.green ? PAL.greenHi : Phaser.Display.Color.IntegerToColor(cup.color).brighten(14).color,
      border: PAL.goldDark,
      icon: unlocked ? 'icon-play' : 'icon-lock',
      iconScale: 0.72,
      iconX: 16,
      fontSize: '9px',
      disabled: !unlocked,
      hitHeight: 32
    });

    this.contentLayer.add([label, name, rating, play]);
  }

  keeperLabel(skill = 0) {
    if (skill < 0.28) return 'ROOKIE';
    if (skill < 0.48) return 'SHARP';
    if (skill < 0.66) return 'ELITE';
    return 'LEGEND';
  }
}
