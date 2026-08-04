import Phaser from 'phaser';
import { GAME_W, GAME_H, STADIUM_Y } from '../config.js';
import {
  makeButton, makeIconButton, makeStatChip, titleText, bodyText,
  drawPanel, addScanlines, sceneIntro, formatCompact, configureHdCamera, FONT
} from '../ui.js';
import { SaveManager } from '../systems/SaveManager.js';
import { Audio } from '../systems/AudioSynth.js';
import { MenuMusic } from '../systems/MenuMusic.js';
import { PlatformService } from '../systems/PlatformService.js';
import { LEVELS } from '../data/levels.js';
import { PAL } from '../pixelart.js';
import { Kicker } from '../objects/Kicker.js';
import { utcDateKey } from '../data/progression.js';
import { addAnimatedCrowdPanorama } from '../art/CrowdPanorama.js';
import { getCosmetic } from '../data/cosmetics.js';

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
    this.add.image(0, STADIUM_Y, 'pitch-grass-pixel-v3')
      .setOrigin(0)
      .setDisplaySize(GAME_W, GAME_H - STADIUM_Y)
      .setDepth(1);
    const settings = SaveManager.getSettings?.() || {};
    addAnimatedCrowdPanorama(this, {
      depth: 2,
      reducedMotion: Boolean(settings.reducedMotion)
    });
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
    const equippedKit = SaveManager.getEquippedCosmetic?.('kit') ?? 'kit-home';
    const equippedCharacter = SaveManager.getEquippedCosmetic?.('character') ?? 'character-mica';
    const today = utcDateKey();
    const daily = SaveManager.ensureDaily(today);
    const readyClaims = [
      ...SaveManager.getDailyMissionStates(today),
      ...SaveManager.getAchievementStates()
    ].filter((state) => state.completed && !state.claimed).length;

    this.makeHeader(totalStars, coins, muted, readyClaims);
    this.makeHero(equippedKit, equippedCharacter, totalStars);
    this.makeLogo();
    this.makeActions(continueIndex, daily, today);

    bodyText(this, GAME_W / 2, GAME_H - 8,
      'SWIPE UP  ·  BEND LATE  ·  FIND THE CORNER', {
        originX: 0.5,
        fontSize: '7px',
        color: '#b9c6c5',
        strokeThickness: 1,
        letterSpacing: 0.65
      }).setDepth(310);

    // Internal physics playground - dev builds only, never shipped to players.
    if (import.meta.env.DEV) {
      makeButton(this, 439, GAME_H - 9, 68, 16, 'PUPPET LAB', () => {
        this.scene.start('PuppetLab');
      }, {
        color: PAL.panelHi,
        hover: PAL.blue,
        border: PAL.goldDark,
        fontSize: '5px',
        hitWidth: 76,
        hitHeight: 22
      }).setDepth(320);
    }

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
    // A radial flood pool and long feathered action-side falloff provide the
    // same focus as the former triangular wedges without reading as pitch
    // markings or perspective geometry.
    this.add.image(0, 0, 'menu-lighting').setOrigin(0).setDepth(10);
  }

  makeHeader(totalStars, coins, muted, readyClaims) {
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

    makeIconButton(this, 288, 17, 19, 'icon-cup', () => this.scene.start('Progress'), {
      color: readyClaims ? PAL.green : PAL.panelHi,
      hover: PAL.blue,
      border: readyClaims ? PAL.gold : PAL.borderDark,
      iconScale: 0.68,
      hitWidth: 31,
      hitHeight: 27
    }).setDepth(203);
    if (readyClaims) {
      const badge = this.add.graphics().setDepth(205);
      badge.fillStyle(PAL.red, 1);
      badge.fillCircle(296, 9, 5);
      bodyText(this, 296, 9, String(Math.min(readyClaims, 9)), {
        originX: 0.5,
        fontSize: '6px',
        color: '#ffffff',
        strokeThickness: 0
      }).setDepth(206);
    }
  }

  toggleSound() {
    const muted = Audio.toggleMuted();
    MenuMusic.setMuted(muted);
    SaveManager.setSetting?.('muted', muted);
    this.soundButton.buttonIcon?.setTexture(muted ? 'icon-mute' : 'icon-sound');
  }

  makeHero(equippedKit, equippedCharacter, totalStars) {
    const plate = this.add.graphics().setDepth(150);
    drawPanel(plate, 17, 206, 180, 44, {
      fill: PAL.panel,
      border: PAL.goldDark,
      corner: PAL.gold
    });
    const player = getCosmetic(equippedCharacter) || getCosmetic('character-mica');
    bodyText(this, 27, 218, `${player.name.toUpperCase()}  ·  #${player.number}`, {
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

    // The plate is drawn at depth 150 and the striker at 130, so his boots used
    // to disappear behind it and he read as cropped off mid-shin. He now stands
    // on the turf just above the plate, which also gives the shadow somewhere
    // believable to fall.
    this.kicker = new Kicker(this, 104, 202, {
      kitId: equippedKit,
      characterId: equippedCharacter,
      scale: 4.4,
      depth: 130
    });
    const ballKey = SaveManager.getEquippedCosmetic?.('ball') || 'ball-snowball';
    const texture = this.textures.exists(ballKey) ? ballKey : 'ball-snowball';
    const ball = this.add.image(158, 196, texture).setDepth(160);
    ball.setScale(17 / (ball.texture.source[0]?.width || 12));
    this.tweens.add({
      targets: ball,
      y: 189,
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

  makeActions(continueIndex, daily, today) {
    const actionX = 344;
    const actionW = 198;
    const actionH = 25;
    // Left-aligned labels in a reserved column: the previous centred labels ran
    // straight over the icon gutter once the copy got long ("DAILY KICK · NEW
    // CHALLENGE" collided with its own star).
    const make = (y, label, icon, cb, color, hover) => makeButton(
      this, actionX, y, actionW, actionH, label, cb, {
        color,
        hover,
        icon,
        iconScale: 0.82,
        iconX: 16,
        labelAlign: 'left',
        labelX: 31,
        fontSize: '9px',
        letterSpacing: 0.4,
        hitHeight: 28
      }
    ).setDepth(230);

    let continueButton = null;
    let continuePending = false;
    continueButton = make(112, `CONTINUE  ·  LV ${String(continueIndex + 1).padStart(2, '0')}`, 'icon-play', () => {
      if (continuePending) return;
      continuePending = true;
      continueButton?.setButtonEnabled(false);
      continueButton?.buttonLabel?.setText('KICKING OFF...');
      const level = LEVELS[continueIndex];
      SaveManager.setLastPlayed?.({ mode: 'career', levelId: levelId(level, continueIndex) });
      const started = this.kicker.previewStrike(() => {
        this.scene.start('Game', { mode: 'career', levelIndex: continueIndex });
      });
      if (started === false) {
        continuePending = false;
        continueButton?.setButtonEnabled(true);
        continueButton?.buttonLabel?.setText(`CONTINUE  ·  LV ${String(continueIndex + 1).padStart(2, '0')}`);
      }
    }, PAL.green, PAL.greenHi);

    make(141, 'CAREER  ·  FIVE CUP TOUR', 'icon-cup', () => {
      this.scene.start('LevelSelect');
    }, PAL.blue, PAL.blueHi);

    const dailyLabel = daily.completed
      ? `DAILY KICK  ·  BEST ${formatCompact(SaveManager.getBestDaily(today))}`
      : daily.streak > 0
        ? `DAILY KICK  ·  ${daily.streak} DAY STREAK`
        : 'DAILY KICK  ·  NEW CHALLENGE';
    make(170, dailyLabel, 'icon-star', () => {
      SaveManager.setLastPlayed?.({ mode: 'daily', levelId: LEVELS[continueIndex]?.id });
      this.scene.start('Game', { mode: 'daily', dailyDate: today });
    }, PAL.goldDark, PAL.gold);

    make(199, 'TIME ATTACK  ·  60 SEC', 'icon-clock', () => {
      SaveManager.setLastPlayed?.({ mode: 'arcade', levelId: null });
      this.scene.start('Game', { mode: 'arcade' });
    }, PAL.orange, 0xe47c3e);

    make(228, 'LOCKER  ·  MAKE IT YOURS', 'icon-locker', () => {
      this.scene.start('Locker');
    }, 0x594b82, 0x7664a2);
  }
}
