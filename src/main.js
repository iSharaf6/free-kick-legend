import Phaser from 'phaser';
import { RENDER_W, RENDER_H } from './config.js';
import { BootScene } from './scenes/BootScene.js';
import { MenuScene } from './scenes/MenuScene.js';
import { LevelSelectScene } from './scenes/LevelSelectScene.js';
import { LockerScene } from './scenes/LockerScene.js';
import { ProgressScene } from './scenes/ProgressScene.js';
import { GameScene } from './scenes/GameScene.js';
import { PuppetLabScene } from './scenes/PuppetLabScene.js';

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'app',
  backgroundColor: '#071018',
  pixelArt: true,
  render: {
    antialias: false,
    roundPixels: true,
    powerPreference: 'high-performance'
  },
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: RENDER_W,
    height: RENDER_H
  },
  input: {
    activePointers: 2
  },
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
  },
  scene: [BootScene, MenuScene, LevelSelectScene, LockerScene, ProgressScene, GameScene, PuppetLabScene]
});
