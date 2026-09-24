import { RENDER_SCALE } from '../config.js';

// Phaser is read from the global its module installs, not imported: this file
// is reached through ui.js, which node unit tests load without a DOM.
const phaser = () => globalThis.Phaser;

// One pixel grid for the whole world.
//
// The world art arrives as dense HD illustration and was drawn at four times
// the game's 480x270 grid, while the interface is chunky pixel type. The two
// never looked like the work of one hand. This pass renders the world camera
// through a box filter onto the true logical grid - each 4x4 block of the HD
// backing surface becomes one flat pixel - so the striker, keeper, crowd and
// pitch all share the same pixel size and read as authored pixel art.
//
// Text and interface stay on a second camera above it, untouched, so type
// remains crisp. Objects are routed per frame: anything at or above the
// scene's `uiDepth` is interface; `object.pixelLayer = 'world' | 'ui'`
// overrides the depth rule for the few objects that need it.

export const PIXEL_GRID_PIPELINE = 'PixelGridFX';
export const PIXEL_GRID_UI_CAMERA = 'pixel-grid-ui';

// Four taps, each on the corner shared by a 2x2 quad of backing texels. With
// the source sampled LINEAR, every tap returns that quad's average, so the four
// together are the exact 4x4 box average for a quarter of the texture reads.
// (If the driver ignores the filter change, the taps degrade to a 4-texel
// subsample, which still reads as the same pixel grid.)
const FRAGMENT_SHADER = `
#define SHADER_NAME PIXEL_GRID_FS
precision mediump float;
uniform sampler2D uMainSampler;
uniform vec2 uResolution;
uniform float uLevels;
varying vec2 outTexCoord;

void main() {
  vec2 texel = 1.0 / uResolution;
  vec2 origin = floor(outTexCoord * uResolution / ${RENDER_SCALE.toFixed(1)}) * ${RENDER_SCALE.toFixed(1)};
  vec4 color = (
    texture2D(uMainSampler, (origin + vec2(1.0, 1.0)) * texel) +
    texture2D(uMainSampler, (origin + vec2(3.0, 1.0)) * texel) +
    texture2D(uMainSampler, (origin + vec2(1.0, 3.0)) * texel) +
    texture2D(uMainSampler, (origin + vec2(3.0, 3.0)) * texel)
  ) * 0.25;
  // A light posterise folds the illustration's sub-pixel noise into flat
  // clusters, the way a hand-placed palette would.
  if (uLevels > 0.0) color.rgb = floor(color.rgb * uLevels + 0.5) / uLevels;
  gl_FragColor = color;
}
`;

// Software rasterisers (SwiftShader, llvmpipe) run the whole frame on the CPU;
// an extra full-screen pass there costs more than the look is worth, so those
// players get the plain renderer and a game that keeps up.
let softwareRenderer = null;
export function isSoftwareRenderer(gl) {
  if (softwareRenderer !== null) return softwareRenderer;
  try {
    const info = gl?.getExtension?.('WEBGL_debug_renderer_info');
    const name = String(info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl?.getParameter?.(gl.RENDERER) ?? '');
    softwareRenderer = /swiftshader|llvmpipe|softpipe|software|basic render/i.test(name);
  } catch {
    softwareRenderer = false;
  }
  return softwareRenderer;
}

let pipelineClass = null;

function pixelGridPipelineClass() {
  if (pipelineClass) return pipelineClass;
  const Base = phaser()?.Renderer?.WebGL?.Pipelines?.PostFXPipeline;
  if (!Base) return null;
  pipelineClass = class PixelGridFX extends Base {
    constructor(game) {
      super({ game, name: PIXEL_GRID_PIPELINE, fragShader: FRAGMENT_SHADER });
      this.levels = 36;
    }

    onDraw(target) {
      // Sample the camera frame LINEAR so each tap averages a 2x2 quad. Only
      // re-issued when the target texture changes (e.g. after a resize).
      if (target?.texture && this.linearSource !== target.texture) {
        this.renderer.setTextureFilter?.(target.texture, 0);
        this.linearSource = target.texture;
      }
      this.set2f('uResolution', target.width, target.height);
      this.set1f('uLevels', this.levels);
      this.bindAndDraw(target);
    }
  };
  return pipelineClass;
}

export function isInterfaceObject(object, uiDepth) {
  if (object?.pixelLayer === 'ui') return true;
  if (object?.pixelLayer === 'world') return false;
  return (Number(object?.depth) || 0) >= uiDepth;
}

/**
 * Put the scene's world on the pixel grid and give its interface a crisp
 * camera of its own. Returns null (and changes nothing) without WebGL.
 */
export function installPixelGrid(scene, { uiDepth } = {}) {
  const renderer = scene?.sys?.renderer ?? scene?.renderer;
  if (!renderer?.pipelines || renderer.type !== (phaser()?.WEBGL ?? 2)) return null;
  if (!Number.isFinite(uiDepth)) return null;
  if (isSoftwareRenderer(renderer.gl)) return null;
  const PipelineClass = pixelGridPipelineClass();
  if (!PipelineClass) return null;
  const pipelines = renderer.pipelines;
  if (!pipelines.postPipelineClasses?.has?.(PIXEL_GRID_PIPELINE)) {
    pipelines.addPostPipeline(PIXEL_GRID_PIPELINE, PipelineClass);
  }

  const world = scene.cameras.main;
  world.setPostPipeline(PIXEL_GRID_PIPELINE);
  const ui = scene.cameras.add(world.x, world.y, world.width, world.height, false, PIXEL_GRID_UI_CAMERA);
  ui.setZoom(world.zoom);
  ui.setScroll(world.scrollX, world.scrollY);
  ui.roundPixels = world.roundPixels;
  ui.transparent = true;

  const route = () => {
    // The interface camera holds the authored framing; only the world camera
    // shakes, so impacts rattle the pitch while the HUD stays readable.
    if (ui.zoom !== world.zoom) ui.setZoom(world.zoom);
    for (const object of scene.children.list) {
      object.cameraFilter = isInterfaceObject(object, uiDepth) ? world.id : ui.id;
    }
  };
  route();
  scene.events.on('prerender', route);
  scene.events.once('shutdown', () => scene.events.off('prerender', route));
  scene.pixelGrid = { world, ui, uiDepth, route };
  return scene.pixelGrid;
}
