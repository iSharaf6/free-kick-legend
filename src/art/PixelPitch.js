// The turf, painted one logical pixel at a time from the camera's own
// perspective. Every pixel is resolved back to the metre of grass it covers,
// so the mown bands narrow correctly toward the goal, the cross-cut lanes
// converge on the vanishing point, and the wear sits where players actually
// stand: the goalmouth, the penalty spot and the free-kick spot.
//
// Transitions are ordered-dithered rather than blended: two greens meeting
// on a Bayer pattern is how a pixel artist shades a distant stripe, and it
// keeps the turf in the same hand as the sprites.

export const PIXEL_PITCH_PALETTE = Object.freeze({
  bandLight: [0x3a, 0x93, 0x4b],
  bandDark: [0x2a, 0x7a, 0x3e],
  speckLight: [0x52, 0xa9, 0x5a],
  speckDark: [0x21, 0x63, 0x34],
  haze: [0x2c, 0x6a, 0x4a],
  shadow: [0x1c, 0x52, 0x33],
  worn: [0x7c, 0x93, 0x45],
  wornDeep: [0x8f, 0x86, 0x4a],
  soil: [0x6d, 0x5e, 0x3a]
});

const BAYER4 = [
  0, 8, 2, 10,
  12, 4, 14, 6,
  3, 11, 1, 9,
  15, 7, 13, 5
].map((value) => (value + 0.5) / 16);

function bayer(x, y) {
  return BAYER4[(y & 3) * 4 + (x & 3)];
}

// Integer hash -> [0, 1). Deterministic, so the turf never shimmers between
// scene rebuilds.
function hash2(x, y, seed) {
  let h = (Math.imul(x, 0x27d4eb2d) ^ Math.imul(y, 0x165667b1) ^ seed) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// Smooth value noise in world metres, for irregular wear edges.
function valueNoise(x, y, seed) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const a = hash2(x0, y0, seed);
  const b = hash2(x0 + 1, y0, seed);
  const c = hash2(x0, y0 + 1, seed);
  const d = hash2(x0 + 1, y0 + 1, seed);
  const top = a + (b - a) * sx;
  return top + ((c + (d - c) * sx) - top) * sy;
}

function mix(a, b, t) {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t
  ];
}

function clamp01(value) {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

// Fraction of a pixel's footprint [u - w/2, u + w/2] that falls on the "on"
// half of a square wave with period `period`.
function stripeCoverage(u, footprint, period) {
  const half = period / 2;
  const integral = (x) => {
    const cycles = Math.floor(x / period);
    const rest = x - cycles * period;
    return cycles * half + Math.min(rest, half);
  };
  const w = Math.max(footprint, 1e-6);
  return clamp01((integral(u + w / 2) - integral(u - w / 2)) / w);
}

/**
 * Describe the turf for a camera. All inputs are the scene's projection
 * constants; the result is pure data, testable without a renderer.
 */
export function pixelPitchSpec({
  left = 0,
  top,
  width,
  height,
  horizonX,
  horizonY,
  focal,
  cameraHeight,
  cameraX = 0,
  goalZ = null,
  penaltyZ = null,
  spot = null,
  markings = [],
  seed = 0x4b49434b,
  bandDepth = 2.6,
  laneWidth = 4.2
} = {}) {
  if (![top, width, height, horizonX, horizonY, focal, cameraHeight].every(Number.isFinite)) {
    throw new TypeError('pixelPitchSpec needs finite projection values');
  }
  if (horizonY >= top) throw new RangeError('the horizon must sit above the turf');
  return Object.freeze({
    left,
    top,
    width: Math.round(width),
    height: Math.round(height),
    horizonX,
    horizonY,
    focal,
    cameraHeight,
    cameraX,
    goalZ: Number.isFinite(goalZ) ? goalZ : null,
    penaltyZ: Number.isFinite(penaltyZ) ? penaltyZ : (Number.isFinite(goalZ) ? goalZ - 11 : null),
    markings: Object.freeze((markings || []).map((mark) => Object.freeze({ ...mark }))),
    spot: spot && Number.isFinite(spot.x) && Number.isFinite(spot.z) ? Object.freeze({ ...spot }) : null,
    seed: seed >>> 0,
    bandDepth,
    laneWidth
  });
}

/** Colour of one turf pixel as [r, g, b] (0-255). */
export function pitchPixel(spec, col, row, palette = PIXEL_PITCH_PALETTE) {
  const sx = spec.left + col + 0.5;
  const sy = spec.top + row + 0.5;
  const dy = sy - spec.horizonY;
  const k = spec.focal * spec.cameraHeight;
  const z = k / dy;
  const s = spec.focal / z;
  const wx = (sx - spec.horizonX) / s + spec.cameraX;
  // Footprint of this pixel in metres, for anti-aliased (dithered) stripes.
  const footZ = k / (dy * dy);
  const footX = 1 / s;
  const d = bayer(col, row);

  // Mown bands across the pitch, and fainter lanes cut along it.
  const band = stripeCoverage(z + 0.9, footZ, spec.bandDepth * 2);
  let color = band > d ? palette.bandLight : palette.bandDark;
  const lane = stripeCoverage(wx + 40, footX, spec.laneWidth * 2);
  const laneShade = lane > d ? 1.035 : 0.975;
  color = [color[0] * laneShade, color[1] * laneShade, color[2] * laneShade];

  // Blades: sparse one-pixel speckle, denser close to the camera where a
  // pixel covers less grass and individual tufts would resolve.
  const near = clamp01((dy - 20) / 150);
  const speck = hash2(col + spec.left, row, spec.seed);
  if (speck < 0.03 + near * 0.035) color = mix(color, palette.speckLight, 0.5);
  else if (speck > 0.97 - near * 0.03) color = mix(color, palette.speckDark, 0.55);

  // Wear: goalmouth and penalty spot in front of the goal, and the scuffed
  // patch the free kick is taken from.
  let wear = 0;
  if (spec.goalZ !== null) {
    const dz = spec.goalZ - z;
    const mouth = clamp01(1 - Math.abs(wx) / 3.4) * clamp01(1 - Math.abs(dz - 1.6) / 2.4);
    const spotWear = spec.penaltyZ === null ? 0 : clamp01(1 - Math.hypot(wx, z - spec.penaltyZ) / 1.1);
    wear = Math.max(wear, mouth * 0.9, spotWear * 0.8);
  }
  if (spec.spot) {
    // The run-up scuff trails back toward the striker's mark, not a disc.
    const along = Math.hypot((wx - spec.spot.x + 0.35) * 1.4, (z - spec.spot.z + 0.15) * 1.1);
    wear = Math.max(wear, clamp01(1 - along / 0.95) * 0.9);
  }
  if (wear > 0) {
    const grain = valueNoise(wx * 3.1, z * 3.1, spec.seed ^ 0x5bd1e995);
    const w = wear * (0.35 + grain * 1.1);
    if (w > 0.5 + d * 0.5) color = mix(color, w > 1 ? palette.wornDeep : palette.worn, 0.38);
    if (w > 1.1 && speck < 0.15) color = mix(color, palette.soil, 0.5);
  }

  // Atmosphere: the far turf cools toward the stand, and the roof throws a
  // dithered shadow across the goal end.
  const far = clamp01((z - 9) / 22);
  color = mix(color, palette.haze, far * far * 0.55);
  if (spec.goalZ !== null) {
    const shadowEdge = spec.goalZ - 4.6 + wx * 0.16;
    const shadowCover = clamp01((z - shadowEdge) / Math.max(footZ * 2.5, 0.6));
    if (shadowCover > d) color = mix(color, palette.shadow, 0.42);
  }
  // A soft darkening toward the frame edges, dithered, keeps the eye centred.
  const edge = Math.abs(col + 0.5 - spec.width / 2) / (spec.width / 2);
  if (edge > 0.72 && ((edge - 0.72) / 0.28) * 0.6 > d) color = mix(color, palette.shadow, 0.28);

  return [Math.round(color[0]), Math.round(color[1]), Math.round(color[2])];
}

const LINE_PAINT = [0xee, 0xf2, 0xe4];

function blendPixel(pixels, spec, col, row, color, alpha) {
  if (col < 0 || row < 0 || col >= spec.width || row >= spec.height) return;
  const index = (row * spec.width + col) * 4;
  pixels[index] = Math.round(pixels[index] + (color[0] - pixels[index]) * alpha);
  pixels[index + 1] = Math.round(pixels[index + 1] + (color[1] - pixels[index + 1]) * alpha);
  pixels[index + 2] = Math.round(pixels[index + 2] + (color[2] - pixels[index + 2]) * alpha);
}

// Bresenham, on the logical grid: one clean pixel per step, the way a line is
// placed by hand. Lines close to the camera are two pixels thick.
function paintLine(pixels, spec, mark) {
  let x0 = Math.round(mark.x1 - spec.left - 0.5);
  let y0 = Math.round(mark.y1 - spec.top - 0.5);
  const x1 = Math.round(mark.x2 - spec.left - 0.5);
  const y1 = Math.round(mark.y2 - spec.top - 0.5);
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  const alpha = mark.alpha ?? 0.9;
  const thick = mark.thickness ?? 1;
  let err = dx + dy;
  for (let guard = 0; guard < 4096; guard++) {
    blendPixel(pixels, spec, x0, y0, LINE_PAINT, alpha);
    if (thick > 1) blendPixel(pixels, spec, x0, y0 + 1, LINE_PAINT, alpha * 0.8);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}

/** Paint the turf and its markings into an RGBA buffer (width * height * 4). */
export function paintPixelPitch(spec, pixels = new Uint8ClampedArray(spec.width * spec.height * 4)) {
  for (let row = 0; row < spec.height; row++) {
    for (let col = 0; col < spec.width; col++) {
      const [r, g, b] = pitchPixel(spec, col, row);
      const index = (row * spec.width + col) * 4;
      pixels[index] = r;
      pixels[index + 1] = g;
      pixels[index + 2] = b;
      pixels[index + 3] = 255;
    }
  }
  for (const mark of spec.markings) {
    if (mark.type === 'spot') {
      const size = Math.max(1, Math.round(mark.size ?? 1));
      const c0 = Math.round(mark.x - spec.left - size / 2);
      const r0 = Math.round(mark.y - spec.top - size / 2);
      for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) blendPixel(pixels, spec, c0 + c, r0 + r, LINE_PAINT, 0.9);
    } else {
      paintLine(pixels, spec, mark);
    }
  }
  return pixels;
}

/**
 * Add the turf to a scene as one nearest-filtered image on the logical grid.
 * Returns the image, or null when the scene cannot create canvas textures.
 */
export function addPixelPitch(scene, options = {}) {
  const spec = pixelPitchSpec(options);
  const textures = scene?.textures;
  if (!textures?.createCanvas || !scene.add?.image) return null;
  const key = options.textureKey ?? `pixel-pitch-${scene.sys?.settings?.key ?? 'scene'}`;
  if (textures.exists(key)) textures.remove(key);
  const canvasTexture = textures.createCanvas(key, spec.width, spec.height);
  const context = canvasTexture.getContext();
  const image = context.createImageData(spec.width, spec.height);
  paintPixelPitch(spec, image.data);
  context.putImageData(image, 0, 0);
  canvasTexture.refresh();
  releaseCanvasCopies(canvasTexture);
  const turf = scene.add.image(spec.left, spec.top, key).setOrigin(0, 0);
  turf.setDepth?.(options.depth ?? 1);
  turf.setName?.(options.name ?? 'pixel-pitch');
  turf.pixelPitchSpec = spec;
  scene.events?.once?.('shutdown', () => {
    if (textures.exists(key)) textures.remove(key);
  });
  return turf;
}

// Phaser's CanvasTexture keeps a JavaScript copy of every pixel (imageData,
// plus 8- and 32-bit views of it) for getPixel(). These textures are painted
// once and never read back, so the copies are pure memory - megabytes on a
// phone - once the canvas has been uploaded.
function releaseCanvasCopies(canvasTexture) {
  canvasTexture.imageData = null;
  canvasTexture.data = null;
  canvasTexture.pixels = null;
  canvasTexture.buffer = null;
}
