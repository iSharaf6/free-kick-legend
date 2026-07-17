const AMBIENT_FRAMES = Object.freeze([0, 1, 2, 3, 4, 5]);
const GOAL_FRAMES = Object.freeze([6, 7, 8]);

export const CROWD_ANIMATION = Object.freeze({
  textureKey: 'crowd-animation-hd',
  assetPath: 'assets/hd/crowd-animation-sheet-hd.png',
  frameWidth: 512,
  frameHeight: 342,
  columns: 3,
  rows: 3,
  ambientFrames: AMBIENT_FRAMES,
  goalFrames: GOAL_FRAMES,
  ambientKey: 'crowd-ambient',
  goalKey: 'crowd-goal-jump',
  ambientFrameRate: 2.5,
  goalFrameRate: 9,
  sectionCount: 6,
  sectionScale: 0.16
});
