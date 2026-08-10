const FRAME_COUNT = 10;
const FRAMES = Object.freeze(Array.from({ length: FRAME_COUNT }, (_, index) => index));

function clip(id, {
  frameRate,
  repeat,
  reactionFrame = 0
}) {
  return Object.freeze({
    id,
    textureKey: `crowd-${id}-v3`,
    assetPath: `assets/hd/crowd-${id}-sheet-v3.png`,
    animationKey: `crowd-${id}-v3-animation`,
    frames: FRAMES,
    frameRate,
    repeat,
    reactionFrame
  });
}

const STATES = Object.freeze({
  // Ten subtle, independently moving poses form the permanent match loop.
  moving: clip('moving', { frameRate: 4.5, repeat: -1 }),
  // Goal and out are authored one-shots. Their final frame is an identity-matched
  // one-pixel settle, so switching back remains clean without recycling a sprite.
  goal: clip('goal', { frameRate: 10, repeat: 0, reactionFrame: 6 }),
  out: clip('out', { frameRate: 9, repeat: 0, reactionFrame: 4 })
});

export const CROWD_ANIMATION = Object.freeze({
  frameWidth: 960,
  frameHeight: 196,
  columns: 2,
  rows: 5,
  frameCount: FRAME_COUNT,
  displayScale: 0.5,
  displayWidth: 480,
  displayHeight: 98,
  depth: 1.1,
  states: STATES
});

export function crowdClip(state) {
  const clip = CROWD_ANIMATION.states[state];
  if (!clip) throw new RangeError(`Unknown crowd animation state: ${state}`);
  return clip;
}
