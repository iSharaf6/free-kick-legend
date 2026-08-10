import { CROWD_ANIMATION } from '../data/crowdAnimation.js';

const DEFAULT_PALETTE = Object.freeze({
  primary: 0x17365d,
  secondary: 0xf2c832,
  trim: 0xf8f8f4
});

const activeSignatures = new WeakMap();

function hsv(r, g, b) {
  const rr = r / 255;
  const gg = g / 255;
  const bb = b / 255;
  const max = Math.max(rr, gg, bb);
  const min = Math.min(rr, gg, bb);
  const delta = max - min;
  let hue = 0;
  if (delta > 0) {
    if (max === rr) hue = 60 * (((gg - bb) / delta) % 6);
    else if (max === gg) hue = 60 * (((bb - rr) / delta) + 2);
    else hue = 60 * (((rr - gg) / delta) + 4);
  }
  if (hue < 0) hue += 360;
  return { h: hue, s: max === 0 ? 0 : delta / max, v: max };
}

export function classifyCrowdTeamPixel(r, g, b) {
  const { h, s, v } = hsv(r, g, b);
  // Electric-blue cloth is intentionally much brighter and more saturated
  // than the navy architecture. Acid lime is outside every natural skin/hair
  // ramp, so the people can be recoloured without touching their identities.
  if (h >= 195 && h <= 245 && s >= 0.52 && v >= 0.24) return 'primary';
  if (h >= 62 && h <= 128 && s >= 0.48 && v >= 0.3) return 'secondary';
  return null;
}

function unpack(color) {
  return {
    r: (color >> 16) & 0xff,
    g: (color >> 8) & 0xff,
    b: color & 0xff
  };
}

function recolour(base, sourceValue) {
  const shade = 0.38 + Math.min(1, sourceValue) * 0.72;
  const highlight = Math.max(0, sourceValue - 0.72) / 0.28;
  return {
    r: Math.round(Math.min(255, base.r * shade + (255 - base.r) * highlight * 0.12)),
    g: Math.round(Math.min(255, base.g * shade + (255 - base.g) * highlight * 0.12)),
    b: Math.round(Math.min(255, base.b * shade + (255 - base.b) * highlight * 0.12))
  };
}

export function recolorCrowdPixels(data, palette = DEFAULT_PALETTE) {
  const primary = unpack(palette.primary ?? DEFAULT_PALETTE.primary);
  const secondary = unpack(palette.secondary ?? DEFAULT_PALETTE.secondary);
  const counts = { primary: 0, secondary: 0 };
  for (let index = 0; index < data.length; index += 4) {
    if (data[index + 3] === 0) continue;
    const family = classifyCrowdTeamPixel(data[index], data[index + 1], data[index + 2]);
    if (!family) continue;
    const value = Math.max(data[index], data[index + 1], data[index + 2]) / 255;
    const mapped = recolour(family === 'primary' ? primary : secondary, value);
    data[index] = mapped.r;
    data[index + 1] = mapped.g;
    data[index + 2] = mapped.b;
    counts[family]++;
  }
  return counts;
}

function paletteSignature(kitId, palette) {
  return [kitId, palette.primary, palette.secondary, palette.trim].join(':');
}

/** Build only the equipped kit's two recoloured atlases in the shared cache. */
export function ensureCrowdPaletteTextures(scene, kitId = 'kit-home', palette = DEFAULT_PALETTE) {
  const manager = scene.textures;
  const resolved = { ...DEFAULT_PALETTE, ...(palette || {}) };
  const signature = paletteSignature(kitId, resolved);
  if (activeSignatures.get(manager) === signature && Object.values(CROWD_ANIMATION.sources).every(
    (source) => manager.exists(source.activeTextureKey)
  )) return signature;

  for (const source of Object.values(CROWD_ANIMATION.sources)) {
    if (manager.exists(source.activeTextureKey)) manager.remove(source.activeTextureKey);
    const sourceTexture = manager.get(source.textureKey);
    const image = sourceTexture?.getSourceImage?.();
    if (!image) continue;
    const texture = manager.createCanvas(source.activeTextureKey, source.sourceWidth, source.sourceHeight);
    const context = texture.getContext();
    context.clearRect(0, 0, source.sourceWidth, source.sourceHeight);
    context.drawImage(image, 0, 0, source.sourceWidth, source.sourceHeight);
    const pixels = context.getImageData(0, 0, source.sourceWidth, source.sourceHeight);
    recolorCrowdPixels(pixels.data, resolved);
    context.putImageData(pixels, 0, 0);
    texture.refresh();
    // Phaser.Textures.FilterMode.NEAREST = 1. Keeping the tiny palette helper
    // renderer-agnostic also lets its pixel classification run in Node tests.
    texture.setFilter(1);
  }
  activeSignatures.set(manager, signature);
  return signature;
}

export { DEFAULT_PALETTE as DEFAULT_CROWD_PALETTE };
