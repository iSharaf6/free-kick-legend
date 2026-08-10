const WATCH = Object.freeze({
  id: 'watch',
  textureKey: 'crowd-watching-source-v1',
  activeTextureKey: 'crowd-watching-active-v1',
  assetPath: 'assets/hd/crowd-watching-sheet-v1.png',
  sourceWidth: 1024,
  sourceHeight: 1535,
  columns: 2,
  rows: 5,
  frameWidth: 512,
  frameHeight: 307,
  // The generated cell includes a tall dark concourse above the supporters.
  // This band keeps three readable face rows plus the permanent rail banners.
  crop: Object.freeze({ x: 0, y: 92, width: 512, height: 181 })
});

const GOAL = Object.freeze({
  id: 'goal',
  textureKey: 'crowd-goal-source-v1',
  activeTextureKey: 'crowd-goal-active-v1',
  assetPath: 'assets/hd/crowd-goal-sheet-v1.png',
  sourceWidth: 1086,
  sourceHeight: 1445,
  columns: 2,
  rows: 5,
  frameWidth: 543,
  frameHeight: 289,
  // Slightly higher than the watching crop so raised arms, flags and the tifo
  // remain visible while the front-rail banners stay anchored in every frame.
  crop: Object.freeze({ x: 0, y: 72, width: 543, height: 192 })
});

export const CROWD_ANIMATION = Object.freeze({
  sources: Object.freeze({ watch: WATCH, goal: GOAL }),
  frameCount: 10,
  panelCount: 3,
  displayWidth: 480,
  panelDisplayWidth: 160,
  top: 31.4375,
  depth: 1.1,
  // The two authored sheets have slightly different native cell proportions;
  // each uses one scalar derived from panel width, so neither can stretch.
  displayHeight: WATCH.crop.height * (160 / WATCH.crop.width),
  watchingFrameMs: 420,
  watchingTransitionMs: 150,
  goalFrameMs: 126,
  goalTransitionMs: 70,
  cheerFrameMs: 150,
  cheerTransitionMs: 78,
  reducedGoalHoldMs: 1120,
  reducedCheerHoldMs: 620,
  // Three phases keep the denser stand from moving in one mirrored block.
  panelPhaseOffsets: Object.freeze([0, 3, 6])
});

export function crowdSource(kind) {
  const source = CROWD_ANIMATION.sources[kind];
  if (!source) throw new RangeError(`Unknown crowd animation kind: ${kind}`);
  return source;
}

function requireFrame(index) {
  if (!Number.isInteger(index) || index < 0 || index >= CROWD_ANIMATION.frameCount) {
    throw new RangeError(`Crowd frame out of range: ${index}`);
  }
}

export function crowdFrameName(kind, index) {
  crowdSource(kind);
  requireFrame(index);
  return `crowd-${kind}-v1-${index}`;
}

export function crowdFrameRect(kind, index) {
  const source = crowdSource(kind);
  requireFrame(index);
  const column = index % source.columns;
  const row = Math.floor(index / source.columns);
  return Object.freeze({
    x: column * source.frameWidth + source.crop.x,
    y: row * source.frameHeight + source.crop.y,
    width: source.crop.width,
    height: source.crop.height
  });
}

export function crowdFrames(kind) {
  return Array.from({ length: CROWD_ANIMATION.frameCount }, (_, index) => Object.freeze({
    name: crowdFrameName(kind, index),
    index,
    ...crowdFrameRect(kind, index)
  }));
}

export function crowdDisplayScale(kind, viewWidth = CROWD_ANIMATION.displayWidth) {
  if (!Number.isFinite(viewWidth) || viewWidth <= 0) {
    throw new TypeError('Crowd display needs a positive view width');
  }
  return (viewWidth / CROWD_ANIMATION.panelCount) / crowdSource(kind).crop.width;
}

export function crowdPanelLayout(kind, viewWidth = CROWD_ANIMATION.displayWidth, x = 0) {
  if (!Number.isFinite(x)) throw new TypeError('Crowd display x must be finite');
  const source = crowdSource(kind);
  const scale = crowdDisplayScale(kind, viewWidth);
  const width = source.crop.width * scale;
  return Array.from({ length: CROWD_ANIMATION.panelCount }, (_, index) => Object.freeze({
    index,
    x: x + index * width,
    width,
    height: source.crop.height * scale,
    scale
  }));
}

export function crowdGoalSequence() {
  return Object.freeze(Array.from({ length: CROWD_ANIMATION.frameCount }, (_, index) => index));
}

export function crowdWatchingFrame(panelIndex, tick) {
  if (!Number.isInteger(panelIndex) || panelIndex < 0 || panelIndex >= CROWD_ANIMATION.panelCount) {
    throw new RangeError(`Crowd panel out of range: ${panelIndex}`);
  }
  const phase = CROWD_ANIMATION.panelPhaseOffsets[panelIndex];
  return (Math.abs(Math.trunc(tick)) + phase) % CROWD_ANIMATION.frameCount;
}
