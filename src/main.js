import Phaser from 'phaser';
// Pixelify Sans is loaded at weight 400 deliberately. Its 700 cut draws an
// uppercase C that is bitmap-identical to O, so the wordmark rendered as
// "KIOK DISTRIOT" and every CUP/CAREER/ACCURACY label lost its C. Faux-bold
// synthesised from 400 closes the same aperture, which is why no UI text may
// ask for `bold` in this family - see PIXEL_TEXT_WEIGHT in the pixel scenes.
import '@fontsource/pixelify-sans/latin-400.css';
import '@fontsource/silkscreen/latin-400.css';
import { RENDER_W, RENDER_H } from './config.js';
import { BootScene } from './scenes/BootScene.js';
import { MenuScene } from './scenes/MenuScene.js';
import { LevelSelectScene } from './scenes/LevelSelectScene.js';
import { LockerScene } from './scenes/LockerScene.js';
import { ProgressScene } from './scenes/ProgressScene.js';
import { GameScene } from './scenes/GameScene.js';
import { PuppetLabScene } from './scenes/PuppetLabScene.js';
import { MenuMusic } from './systems/MenuMusic.js';

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'app',
  backgroundColor: '#071018',
  pixelArt: true,
  render: {
    antialias: false,
    // Subpixel motion: sprites keep their chunky nearest-neighbour texels but
    // their POSITIONS resolve on the 4x HD backing grid instead of snapping
    // to whole logical pixels, so flight, dives and swipes move 4x finer.
    roundPixels: false,
    powerPreference: 'high-performance'
  },
  scale: {
    mode: Phaser.Scale.FIT,
    // #app owns centering through flexbox. Letting ScaleManager add canvas
    // margins as well double-centered letterboxed sizes (notably 1440x900),
    // leaving a large top gap and a much smaller one below the game.
    autoCenter: Phaser.Scale.NO_CENTER,
    width: RENDER_W,
    height: RENDER_H
  },
  input: {
    activePointers: 2
  },
  // Match physics is a bespoke deterministic pseudo-3D integrator (Ball.js,
  // Goalkeeper.js, GoalNetPhysics.js) - no engine body is ever created during
  // play. Matter exists purely for PuppetLabScene, the dev-only rig playground.
  // Declaring it globally spun up and stepped an empty Matter world on every
  // frame of every shipped match, so it is now dev-only alongside its one user.
  ...(import.meta.env.DEV
    ? {
      physics: {
        default: 'matter',
        matter: {
          gravity: { x: 0, y: 0.82 },
          enableSleeping: true,
          positionIterations: 8,
          velocityIterations: 6,
          constraintIterations: 4,
          debug: false
        }
      }
    }
    : {}),
  scene: [
    BootScene, MenuScene, LevelSelectScene, LockerScene, ProgressScene, GameScene,
    // Internal physics playground: registered in dev builds only so the whole
    // scene module is tree-shaken out of production bundles.
    ...(import.meta.env.DEV ? [PuppetLabScene] : [])
  ]
});

// Debug handle used by automated playtests; stripped from production builds.
if (import.meta.env.DEV) {
  window.__game = game;
  window.__menuMusic = MenuMusic;
}
