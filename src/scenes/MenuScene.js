import Phaser from 'phaser';
import { GAME_W, GAME_H } from '../config.js';
import {
  makeButton, makeIconButton, makeStatChip, titleText, bodyText,
  drawPanel, addScanlines, sceneIntro, formatCompact, configureHdCamera, FONT
} from '../ui.js';
import { SaveManager } from '../systems/SaveManager.js';
import { Audio } from '../systems/AudioSynth.js';
import { LEVELS } from '../data/levels.js';
import { PAL } from '../pixelart.js';
import { Kicker } from '../objects/Kicker.js';

function levelId(level, index) {
  return level?.id ?? index;
}

export class MenuScene extends Phaser.Scene {
  constructor() {
    super('Menu');
  }

  create() {
    configureHdCamera(this);
    this.add.image(0, 0, 'stadium-menu').setOrigin(0).setDepth(0);
    this.drawComposition();

    const settings = SaveManager.getSettings?.() || {};
    const muted = settings.muted ?? settings.audioMuted ?? false;
    Audio.setMuted(muted);

    const unlocked = SaveManager.unlockedCount(LEVELS.length);
    const totalStars = SaveManager.getTotalStars?.()
      ?? LEVELS.reduce((sum, level, index) => sum + SaveManager.getStars(levelId(level, index)), 0);
    const coins = SaveManager.getCoins?.() ?? 0;
    const lastPlayed = SaveManager.getLastPlayed?.();
    const continueIndex = this.resolveContinueIndex(lastPlayed, unlocked);
    const equippedKit = SaveManager.getEquippedCosmetic?.('kit') ?? 'kit-home';

    this.makeHeader(totalStars, coins, muted);
    this.makeHero(equippedKit, totalStars);
    this.makeLogo();
    this.makeActions(continueIndex);

    bodyText(this, GAME_W / 2, GAME_H - 8,
      'SWIPE UP  ·  BEND LATE  ·  FIND THE CORNER', {
        originX: 0.5,
        fontSize: '7px',
        color: '#b9c6c5',
        strokeThickness: 1,
        letterSpacing: 0.65
      }).setDepth(310);

    addScanlines(this, 900, 0.035);
    sceneIntro(this);
  }

  resolveContinueIndex(lastPlayed, unlocked) {
    if (lastPlayed?.mode === 'career') {
      const index = LEVELS.findIndex((level, i) => String(levelId(level, i)) === String(lastPlayed.levelId));
      if (index >= 0 && index < unlocked) return index;
    }
    return Phaser.Math.Clamp(unlocked - 1, 0, Math.max(LEVELS.length - 1, 0));
  }

  drawComposition() {
    const shade = this.add.graphics().setDepth(10);
    shade.fillStyle(PAL.ink, 0.18);
    shade.fillRect(0, 0, GAME_W, GAME_H);
    shade.fillStyle(PAL.ink, 0.58);
    shade.fillRect(210, 30, 270, 227);
    shade.fillStyle(PAL.night, 0.72);
    shade.fillTriangle(180, 30, 260, 30, 260, 257);

    // Broadcast framing and a lit touchline behind the player.
    shade.lineStyle(1, PAL.goldDark, 0.6);
    shade.lineBetween(210, 32, 210, 256);
    shade.fillStyle(PAL.flood, 0.12);
    shade.fillTriangle(24, 30, 176, 30, 123, 235);
  }

  makeHeader(totalStars, coins, muted) {
    const bar = this.add.graphics().setDepth(200);
    drawPanel(bar, 7, 5, GAME_W - 14, 25, {
      fill: PAL.panel,
      border: PAL.borderDark,
      corner: PAL.goldDark
    });
    bodyText(this, 47, 17, "NIGHT MATCH '98", {
      originX: 0,
      fontFamily: FONT,
      fontSize: '8px',
      color: '#f3c449',
      letterSpacing: 0.65
    }).setDepth(202);

    makeStatChip(this, 340, 17, 66, 'icon-star', `${totalStars}/${LEVELS.length * 3}`, {
      height: 19,
      fill: PAL.night,
      border: PAL.borderDark,
      fontSize: '8px',
      iconScale: 0.8
    }).setDepth(202);
    makeStatChip(this, 412, 17, 66, 'icon-coin', formatCompact(coins), {
      height: 19,
      fill: PAL.night,
      border: PAL.borderDark,
      fontSize: '8px',
      iconScale: 0.8
    }).setDepth(202);

    this.soundButton = makeIconButton(this, 25, 17, 19,
      muted ? 'icon-mute' : 'icon-sound', () => this.toggleSound(), {
        color: PAL.panelHi,
        hover: PAL.blue,
        border: PAL.borderDark,
        iconScale: 0.75,
        hitWidth: 30,
        hitHeight: 27
      }).setDepth(203);
  }

  toggleSound() {
    const muted = Audio.toggleMuted();
    SaveManager.setSetting?.('muted', muted);
    this.soundButton.buttonIcon?.setTexture(muted ? 'icon-mute' : 'icon-sound');
  }

  makeHero(equippedKit, totalStars) {
    const plate = this.add.graphics().setDepth(150);
    drawPanel(plate, 17, 206, 180, 44, {
      fill: PAL.panel,
      border: PAL.goldDark,
      corner: PAL.gold
    });
    bodyText(this, 27, 218, 'MICA VALE  ·  #17', {
      fontFamily: FONT,
      fontSize: '9px',
      color: '#f3e7c3'
    }).setDepth(154);
    bodyText(this, 27, 235, `CUP RUN  ${totalStars} STARS`, {
      fontSize: '7px',
      color: '#9fb3ba',
      letterSpacing: 0.35
    }).setDepth(154);

    const progress = Phaser.Math.Clamp(totalStars / Math.max(LEVELS.length * 3, 1), 0, 1);
    plate.fillStyle(PAL.ink, 1);
    plate.fillRect(101, 231, 84, 6);
    plate.fillStyle(PAL.borderDark, 1);
    plate.fillRect(102, 232, 82, 4);
    plate.fillStyle(PAL.gold, 1);
    plate.fillRect(102, 232, Math.floor(82 * progress), 4);

    this.kicker = new Kicker(this, 111, 220, {
      kitId: equippedKit,
      scale: 4.8,
      depth: 130
    });
    const ballKey = SaveManager.getEquippedCosmetic?.('ball') || 'ball-classic';
    const texture = ballKey === 'ball-classic' && this.textures.exists('ball-classic-hd')
      ? 'ball-classic-hd'
      : (this.textures.exists(ballKey) ? ballKey : 'ball');
    const ball = this.add.image(174, 218, texture).setDepth(160);
    ball.setScale(19 / (ball.texture.source[0]?.width || 12));
    this.tweens.add({
      targets: ball,
      y: 211,
      rotation: Math.PI * 2,
      duration: 1800,
      ease: 'Sine.easeInOut',
      yoyo: true,
      repeat: -1
    });
  }

  makeLogo() {
    titleText(this, 343, 54, 'FREE KICK', '24px', '#f8f2df').setDepth(220);
    titleText(this, 343, 78, 'LEGEND', '25px', '#f3c449').setDepth(220);

    const tag = this.add.graphics().setDepth(219);
    tag.fillStyle(PAL.ink, 0.9);
    tag.fillRect(295, 88, 96, 11);
    tag.fillStyle(PAL.goldDark, 1);
    tag.fillRect(295, 88, 96, 1);
    bodyText(this, 343, 94, 'FIVE CUPS. ONE LEGEND.', {
      originX: 0.5,
      fontSize: '6px',
      color: '#b9c6c5',
      letterSpacing: 0.45
    }).setDepth(221);
  }

  makeActions(continueIndex) {
    const actionX = 344;
    const actionW = 198;
    const actionH = 29;
    const make = (y, label, icon, cb, color, hover) => makeButton(
      this, actionX, y, actionW, actionH, label, cb, {
        color,
        hover,
        icon,
        iconScale: 0.82,
        iconX: 17,
        fontSize: '10px',
        letterSpacing: 0.45,
        hitHeight: 31
      }
    ).setDepth(230);

    make(116, `CONTINUE  ·  LV ${String(continueIndex + 1).padStart(2, '0')}`, 'icon-play', () => {
      const level = LEVELS[continueIndex];
      SaveManager.setLastPlayed?.({ mode: 'career', levelId: levelId(level, continueIndex) });
      this.kicker.previewStrike(() => {
        this.scene.start('Game', { mode: 'career', levelIndex: continueIndex });
      });
    }, PAL.green, PAL.greenHi);

    make(150, 'CAREER  ·  FIVE CUP TOUR', 'icon-cup', () => {
      this.scene.start('LevelSelect');
    }, PAL.blue, PAL.blueHi);

    make(184, 'TIME ATTACK  ·  60 SEC', 'icon-clock', () => {
      SaveManager.setLastPlayed?.({ mode: 'arcade', levelId: null });
      this.scene.start('Game', { mode: 'arcade' });
    }, PAL.orange, 0xe47c3e);

    make(218, 'LOCKER  ·  MAKE IT YOURS', 'icon-locker', () => {
      this.scene.start('Locker');
    }, 0x594b82, 0x7664a2);
  }
}
