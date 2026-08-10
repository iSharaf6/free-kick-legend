import * as THREE from 'three';
import { RENDER_H, RENDER_W } from '../config.js';

export const PIXEL_OUTPUT_W = RENDER_W;
export const PIXEL_OUTPUT_H = RENDER_H;

const VERTEX_SHADER = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const FRAGMENT_SHADER = `
  precision highp float;
  uniform sampler2D sourceFrame;
  varying vec2 vUv;

  void main() {
    // The sprites already contain their intended palette, ramps, clusters and
    // selective dithering. Three presents those colours without replacing them.
    gl_FragColor = texture2D(sourceFrame, vUv);
  }
`;

export function integerPixelViewport(availableWidth, availableHeight, {
  virtualWidth = PIXEL_OUTPUT_W,
  virtualHeight = PIXEL_OUTPUT_H
} = {}) {
  const width = Math.max(1, Number(availableWidth) || virtualWidth);
  const height = Math.max(1, Number(availableHeight) || virtualHeight);
  const scale = Math.min(width / virtualWidth, height / virtualHeight);
  return {
    scale,
    width: Math.max(1, virtualWidth * scale),
    height: Math.max(1, virtualHeight * scale),
    integer: Number.isInteger(scale)
  };
}

export function frameTimingSnapshot(samples = []) {
  const ordered = samples
    .map(Number)
    .filter((value) => Number.isFinite(value) && value >= 0)
    .sort((a, b) => a - b);
  if (!ordered.length) return Object.freeze({ count: 0, average: 0, p95: 0, p99: 0, max: 0 });
  const percentile = (value) => ordered[Math.min(
    ordered.length - 1,
    Math.max(0, Math.ceil(ordered.length * value) - 1)
  )];
  return Object.freeze({
    count: ordered.length,
    average: ordered.reduce((sum, value) => sum + value, 0) / ordered.length,
    p95: percentile(0.95),
    p99: percentile(0.99),
    max: ordered[ordered.length - 1]
  });
}

/**
 * Keep Phaser's DOM-to-game pointer transform registered to the canvas box
 * that the Three.js presentation pipeline actually presents.
 *
 * ScaleManager's FIT pass records its own fractional CSS box before this
 * pipeline replaces it with its final aspect-fit viewport. Updating the DOM
 * bounds alone is not enough: displayScale is the cached base-to-CSS ratio
 * used by InputManager.transformPointer.
 */
export function syncPhaserInputScale(scaleManager) {
  if (!scaleManager?.updateBounds || !scaleManager?.displayScale?.set) return false;
  scaleManager.updateBounds();
  const width = Number(scaleManager.canvasBounds?.width);
  const height = Number(scaleManager.canvasBounds?.height);
  const baseWidth = Number(scaleManager.baseSize?.width);
  const baseHeight = Number(scaleManager.baseSize?.height);
  if (!(width > 0 && height > 0 && baseWidth > 0 && baseHeight > 0)) return false;
  scaleManager.displayScale.set(baseWidth / width, baseHeight / height);
  return true;
}

/**
 * Persistent Three.js final-frame renderer.
 *
 * Phaser remains the mature scene/state/input authoring layer, but the canvas
 * a player actually sees is produced every frame by THREE.WebGLRenderer. The
 * source and output remain full HD; there is no CPU readback, palette reduction
 * or low-resolution intermediate between the art and the player.
 */
export class ThreePixelPipeline {
  constructor(game, {
    virtualWidth = PIXEL_OUTPUT_W,
    virtualHeight = PIXEL_OUTPUT_H
  } = {}) {
    this.game = game;
    this.sourceCanvas = game?.canvas ?? null;
    this.virtualWidth = virtualWidth;
    this.virtualHeight = virtualHeight;
    this.renderer = null;
    this.frameTexture = null;
    this.scene = null;
    this.camera = null;
    this.screen = null;
    this.running = false;
    this.contextLost = false;
    this.frameDurations = [];
    this.frameIntervals = [];
    this.frameCount = 0;
    this.lastFrameStarted = null;
    this.lastAvailableWidth = 0;
    this.lastAvailableHeight = 0;
    this.onPostRender = () => this.renderFrame();
    this.onResize = () => this.syncViewport(true);
    this.onContextLost = (event) => {
      event?.preventDefault?.();
      this.contextLost = true;
      this.lastFrameStarted = null;
      if (this.renderer?.domElement?.style) this.renderer.domElement.style.display = 'none';
    };
    this.onContextRestored = () => {
      this.contextLost = false;
      if (this.renderer?.domElement?.style) this.renderer.domElement.style.display = 'block';
      this.syncViewport(true);
      this.renderFrame();
    };
  }

  start() {
    const documentRef = globalThis.document;
    const app = documentRef?.getElementById?.('app');
    if (!app || !this.sourceCanvas || !documentRef?.createElement) return false;
    try {
      // Upload the full-HD source canvas directly. No intermediate canvas or
      // CPU readback is allowed to flatten the authored sprite ramps.
      this.frameTexture = new THREE.CanvasTexture(this.sourceCanvas);
      this.frameTexture.colorSpace = THREE.NoColorSpace;
      this.frameTexture.magFilter = THREE.NearestFilter;
      this.frameTexture.minFilter = THREE.NearestFilter;
      this.frameTexture.generateMipmaps = false;

      this.renderer = new THREE.WebGLRenderer({
        antialias: false,
        alpha: false,
        depth: false,
        stencil: false,
        powerPreference: 'high-performance'
      });
      this.renderer.setPixelRatio(1);
      this.renderer.setSize(this.virtualWidth, this.virtualHeight, false);
      this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
      this.renderer.toneMapping = THREE.NoToneMapping;
      this.renderer.domElement.className = 'three-pixel-output';
      this.renderer.domElement.setAttribute('aria-hidden', 'true');
      this.renderer.domElement.setAttribute('data-renderer', 'threejs-sprite-presentation');
      this.renderer.domElement.addEventListener('webglcontextlost', this.onContextLost, false);
      this.renderer.domElement.addEventListener('webglcontextrestored', this.onContextRestored, false);

      const material = new THREE.ShaderMaterial({
        uniforms: {
          sourceFrame: { value: this.frameTexture }
        },
        vertexShader: VERTEX_SHADER,
        fragmentShader: FRAGMENT_SHADER,
        depthTest: false,
        depthWrite: false,
        transparent: false
      });
      this.scene = new THREE.Scene();
      this.camera = new THREE.Camera();
      this.screen = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
      this.scene.add(this.screen);
      app.appendChild(this.renderer.domElement);

      this.running = true;
      this.syncViewport(true);
      this.game?.events?.on?.('postrender', this.onPostRender);
      globalThis.window?.addEventListener?.('resize', this.onResize, { passive: true });
      globalThis.window?.addEventListener?.('orientationchange', this.onResize, { passive: true });
      this.renderFrame();
      return true;
    } catch (error) {
      console.warn('[Three pixel pipeline] using the direct Phaser canvas fallback', error);
      this.destroy();
      return false;
    }
  }

  syncViewport(force = false) {
    if (!this.running || !this.renderer?.domElement || !this.sourceCanvas) return null;
    const app = this.sourceCanvas.parentElement;
    const availableWidth = app?.clientWidth || globalThis.innerWidth || this.virtualWidth;
    const availableHeight = app?.clientHeight || globalThis.innerHeight || this.virtualHeight;
    const dimensionsChanged = force || availableWidth !== this.lastAvailableWidth ||
      availableHeight !== this.lastAvailableHeight || !this.viewport;
    if (dimensionsChanged) {
      this.lastAvailableWidth = availableWidth;
      this.lastAvailableHeight = availableHeight;
      this.viewport = integerPixelViewport(availableWidth, availableHeight, {
        virtualWidth: this.virtualWidth,
        virtualHeight: this.virtualHeight,
        devicePixelRatio: globalThis.devicePixelRatio || 1
      });
    }
    const cssWidth = `${this.viewport.width}px`;
    const cssHeight = `${this.viewport.height}px`;
    // Keep the real input/accessibility canvas and the visible Three.js canvas
    // perfectly registered. The Three canvas ignores pointer events; every
    // gesture continues through the battle-tested input path below it.
    // ScaleManager can rewrite the source style during its own resize pass.
    // Reassert the shared box on every post-render even when the viewport did
    // not change, otherwise the hidden source and visible output drift apart.
    const sourceBoxChanged = this.sourceCanvas.style.width !== cssWidth ||
      this.sourceCanvas.style.height !== cssHeight;
    this.sourceCanvas.classList?.add?.('three-pixel-source');
    this.sourceCanvas.style.width = cssWidth;
    this.sourceCanvas.style.height = cssHeight;
    this.renderer.domElement.style.width = cssWidth;
    this.renderer.domElement.style.height = cssHeight;
    // Phaser's FIT calculation happened before this presentation canvas
    // asserted the final box. Refresh just the cached input transform.
    // updateBounds() forces layout, so pay for it only after a real resize or
    // when ScaleManager has rewritten the source box—not on every animation
    // frame. This keeps the compositor well inside a 60 Hz budget.
    if (dimensionsChanged || sourceBoxChanged) syncPhaserInputScale(this.game?.scale);
    return this.viewport;
  }

  renderFrame() {
    if (!this.running || this.contextLost || !this.renderer || !this.sourceCanvas) return;
    const performanceRef = globalThis.performance;
    const started = typeof performanceRef?.now === 'function' ? performanceRef.now() : null;
    if (started !== null && this.lastFrameStarted !== null) {
      const interval = Math.max(0, started - this.lastFrameStarted);
      // Ignore tab suspension/devtools pauses; this metric describes active
      // presentation cadence, not how long the browser was deliberately idle.
      if (interval <= 250) this.frameIntervals.push(interval);
      if (this.frameIntervals.length > 240) this.frameIntervals.splice(0, this.frameIntervals.length - 240);
    }
    this.lastFrameStarted = started;
    this.syncViewport(false);
    this.frameTexture.needsUpdate = true;
    this.renderer.render(this.scene, this.camera);
    if (started !== null) {
      this.frameDurations.push(Math.max(0, performanceRef.now() - started));
      if (this.frameDurations.length > 240) this.frameDurations.splice(0, this.frameDurations.length - 240);
      this.frameCount++;
      if (this.frameCount % 60 === 0) {
        const snapshot = this.getPerformanceSnapshot();
        const dataset = this.renderer.domElement.dataset;
        dataset.renderP95Ms = snapshot.render.p95.toFixed(2);
        dataset.cadenceP95Ms = snapshot.cadence.p95.toFixed(2);
        dataset.cadenceP99Ms = snapshot.cadence.p99.toFixed(2);
      }
    }
  }

  getPerformanceSnapshot() {
    return Object.freeze({
      render: frameTimingSnapshot(this.frameDurations),
      cadence: frameTimingSnapshot(this.frameIntervals)
    });
  }

  destroy() {
    this.running = false;
    this.game?.events?.off?.('postrender', this.onPostRender);
    globalThis.window?.removeEventListener?.('resize', this.onResize);
    globalThis.window?.removeEventListener?.('orientationchange', this.onResize);
    this.sourceCanvas?.classList?.remove?.('three-pixel-source');
    if (this.sourceCanvas?.style) {
      this.sourceCanvas.style.removeProperty('width');
      this.sourceCanvas.style.removeProperty('height');
    }
    this.screen?.geometry?.dispose?.();
    this.screen?.material?.dispose?.();
    this.frameTexture?.dispose?.();
    this.renderer?.domElement?.removeEventListener?.('webglcontextlost', this.onContextLost, false);
    this.renderer?.domElement?.removeEventListener?.('webglcontextrestored', this.onContextRestored, false);
    this.renderer?.domElement?.remove?.();
    this.renderer?.dispose?.();
    this.renderer?.forceContextLoss?.();
    this.renderer = null;
  }
}
