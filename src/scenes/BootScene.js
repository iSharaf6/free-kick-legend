import Phaser from 'phaser';
import { GAME_W, GAME_H, STADIUM_Y } from '../config.js';
import { textureFromMap, MAPS, PAL } from '../pixelart.js';
import { getCosmeticsByCategory, kickerHdTextureKey } from '../data/cosmetics.js';
import { PlatformService } from '../systems/PlatformService.js';
import { SaveManager } from '../systems/SaveManager.js';
import { Audio } from '../systems/AudioSynth.js';
import { MenuMusic } from '../systems/MenuMusic.js';
import { makePuppetTextures } from '../art/PuppetTextures.js';
import { CROWD_PANORAMA } from '../data/crowdPanorama.js';
import { queueKeeperSheets } from '../data/keeperAssets.js';

const KICKER_POSES = {
  idle: MAPS.kickerIdle,
  ready: MAPS.kickerReady,
  strike: MAPS.kickerStrike,
  celebrate: MAPS.kickerCelebrate
};
const HD_KICKER_POSES = ['idle', 'ready', 'windup', 'strike', 'follow', 'recover', 'watch', 'celebrate'];

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

  preload() {
    const base = import.meta.env.BASE_URL;
    this.load.image('pitch-grass-pixel-v3', `${base}assets/hd/pitch-grass-pixel-v3.png`);
    this.load.image(CROWD_PANORAMA.textureKey, `${base}${CROWD_PANORAMA.assetPath}`);
    getCosmeticsByCategory('character').forEach((character) => {
      getCosmeticsByCategory('kit').forEach((kit) => {
        HD_KICKER_POSES.forEach((pose) => {
          const key = kickerHdTextureKey(character.id, kit.id, pose);
          this.load.image(key, `${base}assets/hd/${key}.png`);
        });
      });
    });
    queueKeeperSheets(this, { initial: true });
    this.load.image('defender-hd', `${base}assets/hd/defender-hd.png`);
    this.load.spritesheet('security-guards-hd', `${base}assets/hd/security-guards-sheet-hd.png`, {
      frameWidth: 88,
      frameHeight: 204
    });
    this.load.image('calynx-logo-pixel', `${base}assets/hd/calynx-logo-pixel.png`);
    this.load.image('ball-classic-hd', `${base}assets/hd/ball-classic-hd.png`);
  }

  create() {
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
        const settings = SaveManager.reload().settings;
        const muted = Boolean(settings.muted || PlatformService.shouldMuteAudio());
        Audio.setMuted(muted);
        Audio.setVolume(settings.sfxVolume);
        MenuMusic.configure({ muted, musicVolume: settings.musicVolume });
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

    PlatformService.init()
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

  // Trackside dressing. A handful of small silhouettes is enough to turn the
  // crowd/boards/pitch sandwich into a place with people working in it.
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

    const NAVY = 0x1c2b3d;
    const BODY = 0x0d1218;
    const METAL = 0x6d7c88;
    const GLASS = 0xe6eef3;

    // These are read at roughly sixteen logical pixels of visible height, above
    // the advertising boards, right next to a crowd whose faces are four pixels
    // wide. Painting skin tones at that size produces a flat blank face that
    // fights the panorama, so the pit crew are deliberately backlit
    // silhouettes: one strong shape each, with only the glass catching light.
    //
    // Both are authored at the exact aspect the scene displays them at, so the
    // runtime never stretches them.

    // Photographer at the boards, long lens trained on the goalmouth.
    bake('trackside-photographer', 12, 18, (px) => {
      px(BODY, 3, 0, 5, 3);            // cap
      px(BODY, 4, 3, 4, 3);            // head
      px(BODY, 3, 6, 6, 9);            // torso
      px(NAVY, 3, 6, 6, 1);            // rim light along the shoulders
      px(NAVY, 3, 3, 1, 3);
      px(BODY, 7, 7, 5, 4);            // camera body
      px(METAL, 9, 8, 3, 2);           // long lens barrel
      px(GLASS, 11, 8, 1, 2);          // front element catching the lights
      px(BODY, 3, 15, 6, 3);           // legs below the hoarding
    });

    // Broadcast camera position: box, hood and tripod.
    bake('trackside-camera', 12, 28, (px) => {
      px(BODY, 2, 2, 7, 7);            // camera body
      px(NAVY, 2, 2, 7, 1);
      px(BODY, 9, 3, 3, 4);            // lens hood
      px(GLASS, 11, 4, 1, 2);          // glass
      px(BODY, 3, 0, 4, 2);            // viewfinder block
      px(METAL, 5, 9, 2, 19);          // centre column
      px(METAL, 1, 16, 2, 12);         // left leg
      px(METAL, 9, 16, 2, 12);         // right leg
      px(METAL, 1, 26, 10, 1);         // spreader
      px(BODY, 0, 4, 2, 3);            // operator head
      px(BODY, 0, 7, 3, 10);           // operator body
      px(NAVY, 0, 7, 3, 1);
    });

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
  }

  makeSpark() {
    const g = this.add.graphics();
    g.fillStyle(0xffffff, 1);
    g.fillRect(1, 0, 1, 3);
    g.fillRect(0, 1, 3, 1);
    g.generateTexture('spark', 3, 3);
    g.destroy();
  }

  drawStadium(g, h, includeProceduralCrowd = true) {
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

    const crowdPalette = [
      0xd7a26b, 0x9c6548, 0xf0d7ad, 0x346c91, 0x244866,
      0xb44137, 0x6e3441, 0xd6b63d, 0x42794c, 0x727c91,
      0xe07a5f, 0x3d405b, 0x81b29a, 0xf2cc8f, 0x9b5de5
    ];
    const drawTier = (y0, y1, cell, seed) => {
      g.fillStyle(PAL.night, 1);
      g.fillRect(0, y0, GAME_W, y1 - y0);
      if (!includeProceduralCrowd) return;
      for (let y = y0 + 1; y < y1 - 1; y += cell) {
        // Vertical depth shading: back rows (near y0) are darker than front rows (near y1)
        const rowProgress = (y - y0) / (y1 - y0);
        const rowShade = 0.55 + rowProgress * 0.45;

        for (let x = 0; x < GAME_W; x += cell) {
          const r = hash01(x, y, seed);
          if (r < 0.12) continue;
          const color = crowdPalette[Math.floor(hash01(x + 9, y + 4, seed) * crowdPalette.length)];
          g.fillStyle(color, (0.68 + hash01(x + 3, y + 7, seed) * 0.3) * rowShade);
          g.fillRect(x, y, Math.max(1, cell - 2), Math.max(1, cell - 2));

          // Phone flash or bright highlight pixel (~3% chance)
          if (hash01(x + 19, y + 11, seed) > 0.97) {
            g.fillStyle(0xffffff, 0.85 * rowShade);
            g.fillRect(x, y, 1, 1);
          } else if (hash01(x + 13, y, seed) > 0.84) {
            g.fillStyle(PAL.cream, 0.55 * rowShade);
            g.fillRect(x, y - 1, Math.max(1, cell - 3), 1);
          }
        }
      }
    };

    drawTier(28, 55, 2, 41);
    
    // Roof overhang shadow band (casting shadow over top rows of upper stand)
    g.fillStyle(PAL.ink, 0.45);
    g.fillRect(0, 28, GAME_W, 6);

    // Tier break & structural ledge between upper and lower stands
    g.fillStyle(PAL.ink, 1);
    g.fillRect(0, 55, GAME_W, 4);
    g.fillStyle(PAL.borderDark, 1);
    g.fillRect(0, 55, GAME_W, 1);
    g.fillStyle(PAL.cream, 0.35);
    g.fillRect(0, 58, GAME_W, 1);

    drawTier(59, h - 8, 3, 83);

    // Balcony overhang shadow band (casting shadow over top rows of lower stand)
    g.fillStyle(PAL.ink, 0.38);
    g.fillRect(0, 59, GAME_W, 5);

    // Railings separate the stand into believable sections.
    g.lineStyle(1.2, PAL.borderDark, 0.7);
    for (const x of [96, 192, 288, 384]) {
      g.lineBetween(x - 5, 30, x + 1, 55);
      g.lineBetween(x + 1, 60, x + 5, h - 8);
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
    // Gameplay receives the authored panorama on top of this empty stand.
    this.drawStadium(g, STADIUM_Y, false);
    g.generateTexture('crowd', GAME_W, STADIUM_Y);
    g.destroy();
  }

  makeStadiumBackdrop() {
    const g = this.add.graphics();
    this.drawStadium(g, STADIUM_Y, false);

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
