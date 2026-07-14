import Phaser from 'phaser';
import { GAME_W, GAME_H, CAM } from '../config.js';
import { textureFromMap, MAPS, PAL } from '../pixelart.js';
import { getCosmeticsByCategory } from '../data/cosmetics.js';
import { PlatformService } from '../systems/PlatformService.js';
import { SaveManager } from '../systems/SaveManager.js';
import { Audio } from '../systems/AudioSynth.js';

const KICKER_POSES = {
  idle: MAPS.kickerIdle,
  ready: MAPS.kickerReady,
  strike: MAPS.kickerStrike,
  celebrate: MAPS.kickerCelebrate
};
const HD_KICKER_POSES = ['idle', 'ready', 'strike', 'follow', 'celebrate'];

const HOME_KIT = { B: 0x17365d, C: PAL.gold, D: 0x0e2038, Y: 0xf8f8f4 };

function hash01(x, y, seed = 97) {
  let n = (Math.imul(x + seed, 374761393) + Math.imul(y + seed * 3, 668265263)) >>> 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177) >>> 0;
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}

function darken(color, factor = 0.58) {
  const r = Math.round(((color >> 16) & 0xff) * factor);
  const g = Math.round(((color >> 8) & 0xff) * factor);
  const b = Math.round((color & 0xff) * factor);
  return (r << 16) | (g << 8) | b;
}

export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload() {
    const base = import.meta.env.BASE_URL;
    getCosmeticsByCategory('kit').forEach((kit) => {
      HD_KICKER_POSES.forEach((pose) => {
        this.load.image(`kicker-hd-${kit.id}-${pose}`, `${base}assets/hd/kicker-hd-${kit.id}-${pose}.png`);
      });
    });
    this.load.image('keeper-hd', `${base}assets/hd/keeper-idle-hd.png`);
    this.load.image('keeper-dive-hd', `${base}assets/hd/keeper-dive-hd.png`);
    this.load.image('keeper-dive-right-hd', `${base}assets/hd/keeper-dive-right-hd.png`);
    this.load.image('keeper-catch-hd', `${base}assets/hd/keeper-catch-hd.png`);
    this.load.image('defender-hd', `${base}assets/hd/defender-hd.png`);
    this.load.image('ball-classic-hd', `${base}assets/hd/ball-classic-hd.png`);
  }

  create() {
    this.makeCoreSprites();
    this.makeCosmeticSprites();
    this.makeIcons();
    this.makeSpark();
    this.makeCrowd();
    this.makeStadiumBackdrop();
    this.makeGrassNoise();

    PlatformService.loadingStart();
    PlatformService.init().finally(() => {
      const settings = SaveManager.reload().settings;
      Audio.setMuted(Boolean(settings.muted || PlatformService.shouldMuteAudio()));
      Audio.setVolume(settings.sfxVolume);
      PlatformService.loadingStop();
      document.getElementById('loading')?.classList.add('is-hidden');
      this.scene.start('Menu');
    });
  }

  makeCoreSprites() {
    textureFromMap(this, 'ball', MAPS.ball);
    textureFromMap(this, 'defender', MAPS.defender);
    textureFromMap(this, 'defender2', MAPS.defender, {
      S: 0x855238,
      L: 0xb87550,
      T: 0x593522,
      M: 0xa13d36,
      D: 0x662622,
      H: 0x120d0b
    });
    textureFromMap(this, 'keeper', MAPS.keeperIdle);
    textureFromMap(this, 'keeper-dive', MAPS.keeperDive);
    textureFromMap(this, 'keeper-catch', MAPS.keeperCatch);
    textureFromMap(this, 'shadow', MAPS.shadow);

    Object.entries(KICKER_POSES).forEach(([pose, map]) => {
      textureFromMap(this, `kicker-${pose}`, map, HOME_KIT);
    });
  }

  makeCosmeticSprites() {
    getCosmeticsByCategory('kit').forEach((cosmetic) => {
      const swatch = {
        B: cosmetic.palette.primary,
        C: cosmetic.palette.secondary,
        D: darken(cosmetic.palette.primary),
        Y: cosmetic.palette.trim
      };
      Object.entries(KICKER_POSES).forEach(([pose, map]) => {
        textureFromMap(this, `kicker-${cosmetic.id}-${pose}`, map, swatch);
      });
      textureFromMap(this, `icon-${cosmetic.id}`, MAPS.iconKit, swatch);
    });

    getCosmeticsByCategory('ball').forEach((cosmetic) => {
      textureFromMap(this, cosmetic.id, MAPS.ball, {
        W: cosmetic.palette.base,
        K: cosmetic.palette.panels,
        G: cosmetic.palette.accent
      });
    });

    getCosmeticsByCategory('trail').forEach((cosmetic) => {
      textureFromMap(this, `icon-${cosmetic.id}`, MAPS.iconTrail, {
        C: cosmetic.palette.start
      });
    });
  }

  makeIcons() {
    const icons = {
      'icon-star': MAPS.iconStar,
      'icon-coin': MAPS.iconCoin,
      'icon-lock': MAPS.iconLock,
      'icon-cup': MAPS.iconCup,
      'icon-locker': MAPS.iconLocker,
      'icon-play': MAPS.iconPlay,
      'icon-clock': MAPS.iconClock,
      'icon-sound': MAPS.iconSound,
      'icon-mute': MAPS.iconMute,
      'icon-back': MAPS.iconBack,
      'icon-check': MAPS.iconCheck,
      'icon-kit': MAPS.iconKit,
      'icon-trail': MAPS.iconTrail
    };
    Object.entries(icons).forEach(([key, map]) => textureFromMap(this, key, map));
    textureFromMap(this, 'icon-star-empty', MAPS.iconStar, { Y: PAL.borderDark });
    textureFromMap(this, 'icon-cup-locked', MAPS.iconCup, { Y: PAL.borderDark });
  }

  makeSpark() {
    const g = this.add.graphics();
    g.fillStyle(0xffffff, 1);
    g.fillRect(1, 0, 1, 3);
    g.fillRect(0, 1, 3, 1);
    g.generateTexture('spark', 3, 3);
    g.destroy();
  }

  drawStadium(g, h) {
    // Cool dawn sky behind a hard-edged roof and two deep crowd tiers.
    g.fillStyle(PAL.sky, 1);
    g.fillRect(0, 0, GAME_W, h);
    g.fillStyle(PAL.skyHi, 0.7);
    g.fillRect(0, 16, GAME_W, 14);

    // Roof cap, cantilever lip and structural trusses.
    g.fillStyle(PAL.ink, 1);
    g.fillRect(0, 0, GAME_W, 11);
    g.fillStyle(PAL.nightHi, 1);
    g.fillRect(0, 11, GAME_W, 3);
    g.lineStyle(2, PAL.borderDark, 1);
    for (let x = -20; x < GAME_W + 30; x += 58) {
      g.lineBetween(x, 12, x + 28, 31);
      g.lineBetween(x + 28, 31, x + 56, 12);
    }

    // Floodlights are asymmetric enough to feel like a real venue.
    for (const x of [42, 128, 332, 418]) {
      g.fillStyle(PAL.flood, 0.18);
      g.fillRect(x - 8, 14, 28, 10);
      g.fillStyle(PAL.flood, 1);
      g.fillRect(x, 12, 13, 3);
      for (let i = 0; i < 4; i++) g.fillRect(x + i * 3, 16, 2, 2);
    }

    const crowdPalette = [
      0xd7a26b, 0x9c6548, 0xf0d7ad, 0x346c91, 0x244866,
      0xb44137, 0x6e3441, 0xd6b63d, 0x42794c, 0x727c91
    ];
    const drawTier = (y0, y1, cell, seed) => {
      g.fillStyle(PAL.night, 1);
      g.fillRect(0, y0, GAME_W, y1 - y0);
      for (let y = y0 + 1; y < y1 - 1; y += cell) {
        for (let x = 2; x < GAME_W - 2; x += cell) {
          const r = hash01(x, y, seed);
          if (r < 0.12) continue;
          const color = crowdPalette[Math.floor(hash01(x + 9, y + 4, seed) * crowdPalette.length)];
          g.fillStyle(color, 0.68 + hash01(x + 3, y + 7, seed) * 0.3);
          g.fillRect(x, y, Math.max(1, cell - 2), Math.max(1, cell - 2));
          if (hash01(x + 13, y, seed) > 0.84) {
            g.fillStyle(PAL.cream, 0.55);
            g.fillRect(x, y - 1, Math.max(1, cell - 3), 1);
          }
        }
      }
    };

    drawTier(30, 55, 4, 41);
    g.fillStyle(PAL.ink, 1);
    g.fillRect(0, 55, GAME_W, 5);
    g.fillStyle(PAL.borderDark, 1);
    g.fillRect(0, 55, GAME_W, 1);
    drawTier(60, h - 8, 5, 83);

    // Aisles and railings separate the mosaic into believable stand sections.
    g.lineStyle(2, PAL.borderDark, 0.9);
    for (const x of [72, 156, 240, 324, 408]) {
      g.lineBetween(x - 7, 30, x, 55);
      g.lineBetween(x, 60, x + 6, h - 8);
    }
    g.fillStyle(PAL.border, 0.72);
    g.fillRect(0, 58, GAME_W, 1);

    // Fictional sponsor rhythm; no real-world branding.
    g.fillStyle(PAL.ink, 1);
    g.fillRect(0, h - 8, GAME_W, 8);
    const boardColors = [PAL.blue, PAL.red, PAL.green, PAL.goldDark];
    for (let x = 3, i = 0; x < GAME_W; x += 50, i++) {
      g.fillStyle(boardColors[i % boardColors.length], 1);
      g.fillRect(x, h - 6, 43, 4);
      g.fillStyle(PAL.cream, 0.8);
      g.fillRect(x + 5, h - 5, 14 + (i % 3) * 5, 1);
    }
  }

  makeCrowd() {
    const g = this.add.graphics();
    this.drawStadium(g, CAM.horizonY);
    g.generateTexture('crowd', GAME_W, CAM.horizonY);
    g.destroy();
  }

  makeStadiumBackdrop() {
    const g = this.add.graphics();
    this.drawStadium(g, CAM.horizonY);

    // Matchday pitch, with perspective mowing bands and converging touchlines.
    g.fillStyle(PAL.grass, 1);
    g.fillRect(0, CAM.horizonY, GAME_W, GAME_H - CAM.horizonY);
    const bands = [
      [95, 106, PAL.grassDark], [106, 120, PAL.grass], [120, 138, PAL.grassDark],
      [138, 160, PAL.grass], [160, 189, PAL.grassDark], [189, 225, PAL.grass],
      [225, 270, PAL.grassDark]
    ];
    bands.forEach(([y, y2, color]) => {
      g.fillStyle(color, 1);
      g.fillRect(0, y, GAME_W, y2 - y);
    });
    g.lineStyle(1, PAL.line, 0.7);
    g.lineBetween(105, CAM.horizonY, 0, GAME_H);
    g.lineBetween(GAME_W - 105, CAM.horizonY, GAME_W, GAME_H);
    g.lineBetween(GAME_W / 2, CAM.horizonY, GAME_W / 2, GAME_H);
    g.lineBetween(0, 216, GAME_W, 216);
    g.strokeEllipse(GAME_W / 2, 216, 96, 31);

    // Deterministic grass flecks are concentrated in the near field.
    for (let i = 0; i < 950; i++) {
      const x = Math.floor(hash01(i, 7, 131) * GAME_W);
      const y = CAM.horizonY + Math.floor(Math.pow(hash01(i, 17, 197), 0.55) * (GAME_H - CAM.horizonY));
      g.fillStyle(i % 3 ? PAL.grassDither : PAL.grassShadow, 0.58);
      g.fillRect(x, y, 1, 1);
    }
    g.generateTexture('stadium-menu', GAME_W, GAME_H);
    g.destroy();
  }

  makeGrassNoise() {
    const h = GAME_H - CAM.horizonY;
    const g = this.add.graphics();
    for (let i = 0; i < 2600; i++) {
      const x = Math.floor(hash01(i, 23, 271) * GAME_W);
      const y = Math.floor(Math.pow(hash01(i, 47, 313), 0.7) * h);
      g.fillStyle(i % 5 < 3 ? PAL.grassDither : PAL.grassShadow, 1);
      g.fillRect(x, y, 1, 1);
    }
    g.generateTexture('grass-noise', GAME_W, h);
    g.destroy();
  }
}
