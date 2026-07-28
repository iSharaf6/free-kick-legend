const AMBIENT_FRAMES = Object.freeze([0, 1, 0]);
const GOAL_FRAMES = Object.freeze([2, 3, 4, 5, 4, 3, 2, 1, 0]);

export const CROWD_ANIMATION = Object.freeze({
  textureKey: 'crowd-animation-hd',
  assetPath: 'assets/hd/crowd-animation-sheet-hd.png',
  frameWidth: 768,
  frameHeight: 341,
  columns: 2,
  rows: 3,
  ambientFrames: AMBIENT_FRAMES,
  goalFrames: GOAL_FRAMES,
  ambientKey: 'crowd-ambient',
  goalKey: 'crowd-goal-jump',
  ambientFrameRate: 1.6,
  goalFrameRate: 8,
  displayWidth: 480,
  displayHeight: 48,
  menuDisplayHeight: 42
});
