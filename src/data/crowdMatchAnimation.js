export const CROWD_MATCH_ANIMATION = Object.freeze({
  frameWidth: 960,
  frameHeight: 218,
  frameCount: 30,
  displayScale: 0.5,
  displayWidth: 480,
  displayHeight: 109,
  idle: Object.freeze({
    textureKey: 'crowd-match-animated-v1',
    animationKey: 'crowd-match-idle-v1',
    assetPath: 'assets/hd/crowd-match-animated-v1.png',
    frameRate: 12,
    repeat: -1
  }),
  goal: Object.freeze({
    textureKey: 'crowd-match-goal-v1',
    animationKey: 'crowd-match-goal-v1',
    assetPath: 'assets/hd/crowd-match-goal-v1.png',
    frameRate: 18,
    repeat: 0
  }),
  out: Object.freeze({
    textureKey: 'crowd-match-out-v1',
    animationKey: 'crowd-match-out-v1',
    assetPath: 'assets/hd/crowd-match-out-v1.png',
    frameRate: 15,
    repeat: 0
  })
});
