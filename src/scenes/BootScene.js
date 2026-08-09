import Phaser from 'phaser';
import { GAME_W, GAME_H, STADIUM_Y } from '../config.js';
import { textureFromMap, MAPS, PAL } from '../pixelart.js';
import { getCosmeticsByCategory, STARTER_COSMETICS } from '../data/cosmetics.js';
import { queueKickerSet } from '../data/kickerAssets.js';
import { PlatformService } from '../systems/PlatformService.js';
import { SaveManager } from '../systems/SaveManager.js';
import { AUDIO_SAMPLES, Audio } from '../systems/AudioSynth.js';
import { MenuMusic } from '../systems/MenuMusic.js';
import { applyDocumentSettings } from '../systems/SettingsPanel.js';
import { makePuppetTextures } from '../art/PuppetTextures.js';
import { CROWD_STAND } from '../data/crowdStand.js';
import { CROWD_MATCH_ANIMATION } from '../data/crowdMatchAnimation.js';

const KICKER_POSES = {
  idle: MAPS.kickerIdle,
  ready: MAPS.kickerReady,
  strike: MAPS.kickerStrike,
  celebrate: MAPS.kickerCelebrate
};
const BALL_ASSET_IDS = Object.freeze([
  'ball-snowball', 'ball-basketball', 'ball-golf',
  'ball-volleyball', 'ball-beachball', 'ball-tennis'
]);

const HOME_KIT = { B: 0x17365d, C: PAL.gold, D: 0x0e2038, Y: 0xf8f8f4 };
// Hard ceiling on the boot screen, whatever the platform SDK decides to do.
const BOOT_HANDOFF_FAILSAFE_MS = 6000;

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

  // Boot loads the main menu and nothing else. Every striker frame the player
  // is not currently wearing, plus the goalkeeper and defender atlases, are
  // streamed later by the scene that first needs them - see kickerAssets.js and
  // matchAssets.js. That is the difference between 214 requests / 13 MB before
  // first paint and roughly a tenth of it.
  preload() {
    const base = import.meta.env.BASE_URL;
    this.load.image('pitch-grass-pixel-v3', `${base}assets/hd/pitch-grass-pixel-v3.png`);
    this.load.image(CROWD_STAND.textureKey, `${base}${CROWD_STAND.assetPath}`);
    this.load.spritesheet(
      CROWD_MATCH_ANIMATION.idle.textureKey,
      `${base}${CROWD_MATCH_ANIMATION.idle.assetPath}`,
      {
        frameWidth: CROWD_MATCH_ANIMATION.frameWidth,
        frameHeight: CROWD_MATCH_ANIMATION.frameHeight,
        endFrame: CROWD_MATCH_ANIMATION.frameCount - 1
      }
    );
    this.load.image('calynx-logo-pixel', `${base}assets/hd/calynx-logo-pixel.png`);

    // The menu hero wears exactly one striker. Reading the save this early is
    // best-effort: corrupt storage must not stop the game from booting, and the
    // starter combination is a correct fallback in every failure mode.
    let characterId = STARTER_COSMETICS.character;
    let kitId = STARTER_COSMETICS.kit;
    try {
      characterId = SaveManager.getEquippedCosmetic('character') || characterId;
      kitId = SaveManager.getEquippedCosmetic('kit') || kitId;
    } catch (error) {
      console.warn('[Boot] equipped loadout unavailable, booting the starter kit', error);
    }
    queueKickerSet(this, characterId, kitId);

    // Balls stay on the boot path: the whole set is 0.6 MB, the menu draws the
    // equipped one, and BootScene.makeCosmeticSprites bakes a procedural
    // stand-in under the same key when a file is missing - so deferring them
    // would let the fallback win the key and permanently mask the real art.
    this.load.image('ball-classic', `${base}assets/hd/ball-classic-hd.png`);
    BALL_ASSET_IDS.forEach((id) => this.load.image(id, `${base}assets/balls/${id}.png`));
    Object.values(AUDIO_SAMPLES).forEach((sample) => {
      this.load.audio(sample.key, `${base}${sample.path}`);
    });
  }

  create() {
    Audio.bindSoundManager(this.sound);
    this.makeCoreSprites();
    makePuppetTextures(this);
    this.makeCosmeticSprites();
    this.makeIcons();
    this.makeTracksideSprites();
    this.makeSpark();
    this.makeCrowd();
    this.makeStadiumBackdrop();
    this.makeGrassNoise();
    this.makeVignette();
    this.makeMenuLighting();

    // Handing off to the menu must be unconditional and happen exactly once.
    // Anything that can throw here - corrupt save JSON, a portal SDK that never
    // settles, a browser that denies audio - previously left the player on the
    // loading card with no way forward, which is indistinguishable from a crash.
    let handedOff = false;
    let platformLoadingActive = false;
    const enterMenu = () => {
      if (handedOff || !this.scene.isActive('Boot')) return;
      handedOff = true;
      try {
        SaveManager.reload();
        const settings = SaveManager.getSettings();
        const muted = Boolean(settings.muted || PlatformService.shouldMuteAudio());
        Audio.setMuted(muted);
        Audio.setVolume(settings.sfxVolume);
        MenuMusic.configure({ muted, musicVolume: settings.musicVolume });
        applyDocumentSettings(settings);
      } catch (error) {
        console.warn('[Boot] settings unavailable, continuing with defaults', error);
      }
      if (platformLoadingActive) {
        PlatformService.loadingStop();
        platformLoadingActive = false;
      }
      document.getElementById('loading')?.classList.add('is-hidden');
      this.scene.start('Menu');
    };

    const bootNote = document.querySelector('.boot-note');
    if (bootNote) bootNote.textContent = 'Syncing matchday';
    // The public GitHub Pages build is standalone. Asking the CrazyGames SDK
    // to initialize on that origin adds a dead loading tail and can emit a
    // minified GeneralError; portal-hosted builds keep automatic detection.
    const platformOptions = globalThis.location?.hostname?.endsWith('.github.io')
      ? { sdk: null }
      : {};
    PlatformService.init(platformOptions)
      .then(async (available) => {
        // SDK methods are unusable until init resolves. If the fail-safe has
        // already handed off, do not start an orphaned loading interval.
        if (!available || handedOff) return;
        const started = await PlatformService.loadingStart();
        if (handedOff || !this.scene.isActive('Boot')) {
          if (started) PlatformService.loadingStop();
          return;
        }
        platformLoadingActive = started;
      })
      .catch((error) => console.warn('[Boot] platform init failed', error))
      .finally(enterMenu);
    // Belt and braces: even if the promise above is never settled by the SDK,
    // the match starts.
    this.time.delayedCall(BOOT_HANDOFF_FAILSAFE_MS, enterMenu);
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
      // The selectable ball collection is generated pixel art. Keep this
      // procedural fallback so an interrupted asset load never breaks Boot.
      if (!this.textures.exists(cosmetic.id)) {
        const map = cosmetic.id === 'ball-basketball'
          ? MAPS.ballBasketball
          : cosmetic.id === 'ball-golf'
            ? MAPS.ballGolf
            : MAPS.ball;
        textureFromMap(this, cosmetic.id, map, {
          W: cosmetic.palette.base,
          K: cosmetic.palette.panels,
          G: cosmetic.palette.accent
        });
      }
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

  // The generated trackside media crew streams with the match pack. Boot only
  // retains the tiny projected pitch props used before and during a match.
  makeTracksideSprites() {
    const bake = (key, w, h, paint) => {
      const g = this.add.graphics();
      paint((color, x, y, rw = 1, rh = 1, alpha = 1) => {
        g.fillStyle(color, alpha);
        g.fillRect(x, y, rw, rh);
      });
      g.generateTexture(key, w, h);
      g.destroy();
    };

    // Corner flag: pole plus pennant, drawn at the display aspect so the
    // runtime never has to stretch it.
    bake('corner-flag', 12, 24, (px) => {
      px(PAL.ink, 1, 2, 3, 22);
      px(0xd8dee3, 2, 2, 1, 22);       // pole
      px(PAL.ink, 3, 2, 9, 6);         // pennant keyline
      px(PAL.gold, 4, 3, 7, 2);
      px(PAL.red, 4, 5, 5, 2);
      px(PAL.ink, 1, 22, 5, 2);        // socket in the turf
    });

    // Tall, permanent goal-line fountain rig. The black steel body and gold
    // collars are visible before a shot; the authored spark plume is only
    // placed over its nozzle after a goal.
    bake('goal-pyro-rig-v3', 16, 48, (px) => {
      px(PAL.ink, 4, 1, 8, 7);
      px(0x3c4650, 5, 2, 6, 5);
      px(PAL.goldDark, 5, 4, 6, 2);
      px(PAL.ink, 6, 8, 5, 33);
      px(0x2d3944, 7, 9, 3, 31);
      px(PAL.goldDark, 6, 17, 5, 3);
      px(PAL.gold, 7, 17, 3, 1);
      px(PAL.goldDark, 6, 31, 5, 3);
      px(PAL.ink, 3, 40, 11, 6);
      px(0x3c4650, 4, 41, 9, 3);
      px(PAL.goldDark, 4, 44, 9, 2);
      px(PAL.ink, 1, 46, 15, 2);
    });
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
      g.fillStyle(PAL.flood, 0.055);
      g.fillRect(x - 8, 14, 28, 10);
      g.fillStyle(PAL.flood, 0.34);
      g.fillRect(x, 12, 13, 3);
      for (let i = 0; i < 4; i++) g.fillRect(x + i * 3, 16, 2, 1);
    }

    // The empty stand the supporters sit on. One continuous mass now, rather
    // than two slabs with a lit ledge baked between them at y=55: the fascias,
    // railings and vomitories are drawn per scene by StandDressing at the tier
    // boundaries the new crowd actually uses, and a baked ledge at the old
    // position would run straight through the middle of a tier of faces.
    //
    // The per-pixel procedural supporters that used to live here went with it.
    // Both call sites had passed `false` since the authored panorama landed, so
    // that generator had been unreachable for its entire remaining life.
    g.fillStyle(PAL.night, 1);
    g.fillRect(0, 14, GAME_W, h - 22);

    // Rear wall under the roof, and the shadow it throws down the back rows.
    g.fillStyle(PAL.ink, 0.9);
    g.fillRect(0, 14, GAME_W, 8);
    g.fillStyle(PAL.ink, 0.5);
    g.fillRect(0, 22, GAME_W, 5);
    g.fillStyle(PAL.ink, 0.28);
    g.fillRect(0, 27, GAME_W, 4);

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
    // Gameplay receives the authored supporters on top of this empty stand.
    this.drawStadium(g, STADIUM_Y);
    g.generateTexture('crowd', GAME_W, STADIUM_Y);
    g.destroy();
  }

  makeStadiumBackdrop() {
    const g = this.add.graphics();
    this.drawStadium(g, STADIUM_Y);

    // Matchday pitch, with perspective mowing bands and converging touchlines.
    g.fillStyle(PAL.grass, 1);
    g.fillRect(0, STADIUM_Y, GAME_W, GAME_H - STADIUM_Y);
    const bands = [
      [STADIUM_Y, 115, PAL.grassDark], [115, 129, PAL.grass], [129, 147, PAL.grassDark],
      [147, 169, PAL.grass], [169, 198, PAL.grassDark], [198, 233, PAL.grass],
      [233, 270, PAL.grassDark]
    ];
    bands.forEach(([y, y2, color]) => {
      g.fillStyle(color, 1);
      g.fillRect(0, y, GAME_W, y2 - y);
    });

    // Deterministic grass flecks are concentrated in the near field.
    for (let i = 0; i < 950; i++) {
      const x = Math.floor(hash01(i, 7, 131) * GAME_W);
      const y = STADIUM_Y + Math.floor(Math.pow(hash01(i, 17, 197), 0.55) * (GAME_H - STADIUM_Y));
      g.fillStyle(i % 3 ? PAL.grassDither : PAL.grassShadow, 0.58);
      g.fillRect(x, y, 1, 1);
    }
    g.generateTexture('stadium-menu', GAME_W, GAME_H);
    g.destroy();
  }

  makeGrassNoise() {
    const h = GAME_H - STADIUM_Y;
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

  // Soft radial darkening toward the corners. Reads as stadium lighting and
  // pulls the eye to the goalmouth; drawn under the HUD, over the pitch.
  makeVignette() {
    const c = this.textures.createCanvas('vignette', GAME_W, GAME_H);
    const ctx = c.context;
    const grd = ctx.createRadialGradient(GAME_W / 2, 148, 88, GAME_W / 2, 148, 306);
    grd.addColorStop(0, 'rgba(4,8,14,0)');
    grd.addColorStop(0.72, 'rgba(4,8,14,0.10)');
    grd.addColorStop(1, 'rgba(4,8,14,0.42)');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, GAME_W, GAME_H);
    c.refresh();
  }

  // Feathered menu lighting replaces the old hard spotlight polygons. Keeping
  // it in one static CanvasTexture is both cheaper than several live Graphics
  // objects and consistent in Phaser's WebGL and Canvas renderers.
  makeMenuLighting() {
    const c = this.textures.createCanvas('menu-lighting', GAME_W, GAME_H);
    const ctx = c.context;

    const flood = ctx.createRadialGradient(102, 78, 0, 102, 78, 178);
    flood.addColorStop(0, 'rgba(184,218,228,0.10)');
    flood.addColorStop(0.52, 'rgba(184,218,228,0.035)');
    flood.addColorStop(1, 'rgba(184,218,228,0)');
    ctx.fillStyle = flood;
    ctx.fillRect(0, 24, GAME_W, GAME_H - 24);

    const actionShade = ctx.createLinearGradient(82, 0, GAME_W, 0);
    actionShade.addColorStop(0, 'rgba(4,8,14,0)');
    actionShade.addColorStop(0.48, 'rgba(4,8,14,0.09)');
    actionShade.addColorStop(1, 'rgba(4,8,14,0.60)');
    ctx.fillStyle = actionShade;
    ctx.fillRect(0, 30, GAME_W, GAME_H - 30);

    const pitchFalloff = ctx.createLinearGradient(0, STADIUM_Y, 0, GAME_H);
    pitchFalloff.addColorStop(0, 'rgba(3,9,13,0)');
    pitchFalloff.addColorStop(1, 'rgba(3,9,13,0.18)');
    ctx.fillStyle = pitchFalloff;
    ctx.fillRect(0, STADIUM_Y, GAME_W, GAME_H - STADIUM_Y);

    c.refresh();
  }
}
