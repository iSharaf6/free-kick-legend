import { SHOT } from '../config.js';

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function getPointerId(pointer) {
  return pointer?.id ?? pointer?.pointerId ?? 0;
}

function eventTime(pointer, fallback = 0) {
  const value = pointer?.event?.timeStamp ?? pointer?.time ?? fallback;
  return Number.isFinite(value) ? value : fallback;
}

function logicalPoint(pointer) {
  return {
    x: Number.isFinite(pointer?.worldX) ? pointer.worldX : Number(pointer?.x),
    y: Number.isFinite(pointer?.worldY) ? pointer.worldY : Number(pointer?.y)
  };
}

function pathLength(points) {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  }
  return total;
}

function resample(points, count) {
  if (points.length <= 2 || count <= 2) return points.map((point) => ({ ...point }));

  const cumulative = [0];
  for (let i = 1; i < points.length; i++) {
    cumulative.push(cumulative[i - 1] + Math.hypot(
      points[i].x - points[i - 1].x,
      points[i].y - points[i - 1].y
    ));
  }

  const total = cumulative[cumulative.length - 1];
  if (total <= 0) return [points[0], points[points.length - 1]].map((point) => ({ ...point }));

  const output = [];
  let segment = 1;
  for (let i = 0; i < count; i++) {
    const target = total * (i / (count - 1));
    while (segment < cumulative.length - 1 && cumulative[segment] < target) segment++;
    const a = points[segment - 1];
    const b = points[segment];
    const span = cumulative[segment] - cumulative[segment - 1];
    const t = span > 0 ? (target - cumulative[segment - 1]) / span : 0;
    output.push({
      x: a.x + (b.x - a.x) * t,
      y: a.y + (b.y - a.y) * t,
      t: a.t + (b.t - a.t) * t
    });
  }
  return output;
}

function smooth(points) {
  if (points.length < 3) return points;
  return points.map((point, i) => {
    if (i === 0 || i === points.length - 1) return point;
    const previous = points[i - 1];
    const next = points[i + 1];
    return {
      x: previous.x * 0.2 + point.x * 0.6 + next.x * 0.2,
      y: previous.y * 0.2 + point.y * 0.6 + next.y * 0.2,
      t: point.t
    };
  });
}

// The single canonical gesture-to-shot mapping. Everything that describes a
// shot to the player (live meters, trajectory previews, tutorials) and
// everything that executes one (release physics, scoring) must go through
// this function so what you see is exactly what you get.
// Returns { shot } on success or { invalid: reason }. With { preview: true }
// the length/direction minimums are skipped so a partial in-progress gesture
// still reports the exact shot it would produce if released right now.
export function computeShotFromPath(rawPoints, { preview = false } = {}) {
  const points = (rawPoints || []).filter((point) => (
    Number.isFinite(point?.x) && Number.isFinite(point?.y) && Number.isFinite(point?.t)
  ));
  if (points.length < 2) return { invalid: 'not-enough-points' };

  const a = points[0];
  const b = points[points.length - 1];
  const dx = b.x - a.x;
  const dy = b.y - a.y; // negative = upward swipe
  const chord = Math.hypot(dx, dy);
  if (!preview) {
    if (chord < SHOT.minSwipePx) return { invalid: 'too-short' };
    if (-dy < SHOT.minSwipePx * 0.55) return { invalid: 'swipe-up' };
  }
  if (chord <= 0) return { invalid: 'too-short' };

  const sampled = smooth(resample(points, SHOT.resampleCount));
  const duration = Math.max(b.t - a.t, 40);
  const distance = Math.max(pathLength(sampled), chord);
  const pxPerMs = distance / duration;
  const power = clamp(
    (pxPerMs - SHOT.minSpeedPxMs) / (SHOT.maxSpeedPxMs - SHOT.minSpeedPxMs),
    0,
    1
  );

  // Aggregate signed deviation across the whole gesture. Smoothing plus a
  // weighted mean rejects single noisy/coalesced pointer samples.
  let weightedDeviation = 0;
  let totalWeight = 0;
  for (let i = 1; i < sampled.length - 1; i++) {
    const point = sampled[i];
    const px = point.x - a.x;
    const py = point.y - a.y;
    const deviation = (dx * py - dy * px) / chord;
    const weight = Math.sin(Math.PI * i / (sampled.length - 1));
    weightedDeviation += deviation * weight;
    totalWeight += weight;
  }
  const curve = totalWeight > 0 ? weightedDeviation / totalWeight : 0;
  // Follow the visible gesture: a path bowed to screen-right curls right.
  const rawSpin = clamp(curve / SHOT.spinPx, -1, 1) * SHOT.maxSpin;
  const spin = Math.abs(rawSpin) < 1e-8 ? 0 : rawSpin;

  const directionScale = 0.78 + power * 0.22;
  const vx = clamp(dx * SHOT.vxPerPx * directionScale, -SHOT.maxVx, SHOT.maxVx);
  const vy = clamp(
    -dy * SHOT.vyPerPx * (0.9 + power * 0.1),
    SHOT.minVy,
    SHOT.maxVy
  );

  return {
    shot: {
      vx,
      vy,
      vz: SHOT.minVz + power * (SHOT.maxVz - SHOT.minVz),
      spin,
      power,
      gesture: { duration, distance, curve }
    }
  };
}

// Captures one pointer gesture in Phaser's logical game coordinates and maps
// it to a bounded, device-independent shot. The third argument may be an
// invalid-shot callback or { onInvalidShot }.
export class SwipeInput {
  constructor(scene, onShot, invalidOptions = null) {
    this.scene = scene;
    this.onShot = onShot;
    this.onInvalidShot = typeof invalidOptions === 'function'
      ? invalidOptions
      : invalidOptions?.onInvalidShot ?? null;
    this.enabled = false;
    this.samples = [];
    this.activePointerId = null;
    this.lastInvalidReason = null;

    scene.input.on('pointerdown', this._onDown, this);
    scene.input.on('pointermove', this._onMove, this);
    scene.input.on('pointerup', this._onUp, this);
    scene.input.on('pointercancel', this._onPointerCancel, this);
    scene.input.on('gameout', this._onGameOut, this);

    this._blurTarget = globalThis.window ?? null;
    this._onBlur = () => this.cancel();
    this._blurTarget?.addEventListener?.('blur', this._onBlur);

    this._onShutdown = () => this.destroy();
    scene.events.once('shutdown', this._onShutdown);
  }

  _onDown(pointer) {
    if (!this.enabled || this.activePointerId !== null) return;
    if (logicalPoint(pointer).y < 35) return; // HUD strip - don't let button taps start a swipe

    this.activePointerId = getPointerId(pointer);
    this.samples = [];
    this._append(pointer, true);
  }

  _onMove(pointer) {
    if (!this.enabled || getPointerId(pointer) !== this.activePointerId) return;
    this._append(pointer);
  }

  _onUp(pointer) {
    if (!this.enabled || getPointerId(pointer) !== this.activePointerId) return;
    this._append(pointer, true);

    const completedPath = this.samples.map((sample) => ({ ...sample }));
    const shot = this._computeShot();
    const reason = this.lastInvalidReason;
    this.cancel();

    if (shot) this.onShot(shot);
    else this.onInvalidShot?.(reason, completedPath);
  }

  _onPointerCancel(pointer) {
    if (this.activePointerId === null) return;
    if (pointer && getPointerId(pointer) !== this.activePointerId) return;
    this.cancel();
  }

  _onGameOut() {
    this.cancel();
  }

  _append(pointer, endpoint = false) {
    const fallbackTime = this.samples.length > 0
      ? this.samples[this.samples.length - 1].t + (endpoint ? 1 : 0)
      : this.scene.time?.now ?? 0;
    const logical = logicalPoint(pointer);
    const sample = {
      x: logical.x,
      y: logical.y,
      t: eventTime(pointer, fallbackTime)
    };
    if (!Number.isFinite(sample.x) || !Number.isFinite(sample.y)) return;

    const last = this.samples[this.samples.length - 1];
    if (last && last.x === sample.x && last.y === sample.y) {
      if (endpoint || sample.t > last.t) last.t = Math.max(last.t, sample.t);
      return;
    }

    this.samples.push(sample);
    if (this.samples.length > SHOT.maxSamples) this._downsampleInPlace();
  }

  // Keeps both gesture endpoints and samples the interior evenly; unlike
  // shift(), long/high-refresh-rate swipes never lose their original aim point.
  _downsampleInPlace() {
    const source = this.samples;
    const output = [source[0]];
    const interiorSlots = SHOT.maxSamples - 2;
    let previousIndex = 0;
    for (let slot = 1; slot <= interiorSlots; slot++) {
      const index = Math.round(slot * (source.length - 1) / (interiorSlots + 1));
      if (index > previousIndex && index < source.length - 1) {
        output.push(source[index]);
        previousIndex = index;
      }
    }
    output.push(source[source.length - 1]);
    this.samples = output;
  }

  cancel() {
    this.samples = [];
    this.activePointerId = null;
  }

  destroy() {
    this.cancel();
    this.scene.input.off('pointerdown', this._onDown, this);
    this.scene.input.off('pointermove', this._onMove, this);
    this.scene.input.off('pointerup', this._onUp, this);
    this.scene.input.off('pointercancel', this._onPointerCancel, this);
    this.scene.input.off('gameout', this._onGameOut, this);
    this._blurTarget?.removeEventListener?.('blur', this._onBlur);
  }

  get activePath() {
    return this.samples;
  }

  _invalid(reason) {
    this.lastInvalidReason = reason;
    return null;
  }

  _computeShot() {
    this.lastInvalidReason = null;
    const result = computeShotFromPath(this.samples);
    if (result.invalid) return this._invalid(result.invalid);
    return result.shot;
  }
}
