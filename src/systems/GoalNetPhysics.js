const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const DEFAULTS = Object.freeze({
  depth: 2.2,
  backHeightRatio: 0.92,
  columns: 15,
  rows: 7,
  stiffness: 31,
  coupling: 25,
  damping: 6.6,
  maxDisplacement: 0.82,
  fixedStep: 1 / 120,
  maxFrameDt: 0.05
});

/**
 * Small spring-membrane simulation for the goal's back net.
 *
 * Nodes stay in their world-space x/y positions and move along z. Projecting
 * that depth offset through the game's camera bends the otherwise straight
 * mesh without needing a texture or a Phaser physics body per knot.
 */
export class GoalNetPhysics {
  constructor({
    goalWidth,
    goalHeight,
    goalZ,
    depth = DEFAULTS.depth,
    backHeightRatio = DEFAULTS.backHeightRatio,
    columns = DEFAULTS.columns,
    rows = DEFAULTS.rows,
    stiffness = DEFAULTS.stiffness,
    coupling = DEFAULTS.coupling,
    damping = DEFAULTS.damping,
    maxDisplacement = DEFAULTS.maxDisplacement,
    fixedStep = DEFAULTS.fixedStep,
    maxFrameDt = DEFAULTS.maxFrameDt
  }) {
    if (!(goalWidth > 0) || !(goalHeight > 0) || !Number.isFinite(goalZ)) {
      throw new TypeError('GoalNetPhysics requires positive goal dimensions and a finite goalZ');
    }

    this.goalWidth = goalWidth;
    this.goalHeight = goalHeight;
    this.goalZ = goalZ;
    this.depth = Math.max(0.2, depth);
    this.backHeight = goalHeight * clamp(backHeightRatio, 0.5, 1);
    this.columns = Math.max(3, Math.round(columns));
    this.rows = Math.max(3, Math.round(rows));
    this.stiffness = Math.max(0, stiffness);
    this.coupling = Math.max(0, coupling);
    this.damping = Math.max(0, damping);
    this.maxDisplacement = Math.max(0.05, maxDisplacement);
    this.fixedStep = clamp(fixedStep, 1 / 300, 1 / 30);
    this.maxFrameDt = clamp(maxFrameDt, this.fixedStep, 0.1);

    const nodeCount = (this.columns + 1) * (this.rows + 1);
    this.displacement = new Float32Array(nodeCount);
    this.velocity = new Float32Array(nodeCount);
    this.nextDisplacement = new Float32Array(nodeCount);
    this.nextVelocity = new Float32Array(nodeCount);
    this.active = false;
    this.needsRedraw = true;
  }

  index(column, row) {
    return row * (this.columns + 1) + column;
  }

  isBoundary(column, row) {
    return column === 0 || row === 0 || column === this.columns || row === this.rows;
  }

  node(column, row) {
    const c = clamp(Math.round(column), 0, this.columns);
    const r = clamp(Math.round(row), 0, this.rows);
    const i = this.index(c, r);
    return {
      x: -this.goalWidth / 2 + (c / this.columns) * this.goalWidth,
      y: (r / this.rows) * this.backHeight,
      z: this.goalZ + this.depth + this.displacement[i],
      displacement: this.displacement[i],
      velocity: this.velocity[i],
      pinned: this.isBoundary(c, r)
    };
  }

  reset() {
    this.displacement.fill(0);
    this.velocity.fill(0);
    this.nextDisplacement.fill(0);
    this.nextVelocity.fill(0);
    this.active = false;
    this.needsRedraw = true;
  }

  /**
   * Push the membrane at a world-space goal crossing point.
   * `speed` is the ball speed in world units/sec; `strength` is an optional
   * multiplier useful for glancing or especially forceful impacts.
   */
  impact({ x = 0, y = this.goalHeight * 0.5, speed = 22, strength = 1, radius = 1.05 } = {}) {
    const hitX = clamp(x, -this.goalWidth / 2, this.goalWidth / 2);
    const hitY = clamp(y * (this.backHeight / this.goalHeight), 0, this.backHeight);
    const spread = Math.max(0.3, radius);
    const impulse = clamp(speed * 0.16, 1.2, 5.2) * clamp(strength, 0, 2);
    if (impulse <= 0) return;

    let affected = false;
    for (let row = 1; row < this.rows; row++) {
      const nodeY = (row / this.rows) * this.backHeight;
      for (let column = 1; column < this.columns; column++) {
        const nodeX = -this.goalWidth / 2 + (column / this.columns) * this.goalWidth;
        const distanceSq = (nodeX - hitX) ** 2 + (nodeY - hitY) ** 2;
        const weight = Math.exp(-distanceSq / (2 * spread * spread));
        if (weight < 0.008) continue;
        this.velocity[this.index(column, row)] += impulse * weight;
        affected = true;
      }
    }
    this.active ||= affected;
    this.needsRedraw ||= affected;
  }

  update(deltaSeconds) {
    if (!this.active || !(deltaSeconds > 0)) return false;

    let remaining = Math.min(deltaSeconds, this.maxFrameDt);
    while (remaining > 1e-8) {
      const dt = Math.min(this.fixedStep, remaining);
      this.step(dt);
      remaining -= dt;
    }
    return this.active;
  }

  step(dt) {
    let peakMotion = 0;
    const stride = this.columns + 1;

    for (let row = 0; row <= this.rows; row++) {
      for (let column = 0; column <= this.columns; column++) {
        const i = this.index(column, row);
        if (this.isBoundary(column, row)) {
          this.nextDisplacement[i] = 0;
          this.nextVelocity[i] = 0;
          continue;
        }

        const offset = this.displacement[i];
        const neighbourAverage = (
          this.displacement[i - 1] +
          this.displacement[i + 1] +
          this.displacement[i - stride] +
          this.displacement[i + stride]
        ) * 0.25;
        const acceleration =
          -this.stiffness * offset +
          this.coupling * (neighbourAverage - offset) -
          this.damping * this.velocity[i];
        const velocity = this.velocity[i] + acceleration * dt;
        const displacement = clamp(
          offset + velocity * dt,
          -this.maxDisplacement * 0.36,
          this.maxDisplacement
        );

        this.nextVelocity[i] = velocity;
        this.nextDisplacement[i] = displacement;
        peakMotion = Math.max(peakMotion, Math.abs(velocity), Math.abs(displacement) * 4);
      }
    }

    [this.displacement, this.nextDisplacement] = [this.nextDisplacement, this.displacement];
    [this.velocity, this.nextVelocity] = [this.nextVelocity, this.velocity];
    this.needsRedraw = true;

    if (peakMotion < 0.0025) this.reset();
  }

  /**
   * Draw the deforming back panel plus the fixed side/roof ties. `graphics`
   * is a Phaser Graphics-like object and `project` is the game's world-to-
   * screen projector, keeping this simulation usable in headless tests.
   */
  draw(graphics, project, {
    color = 0xe8eef4,
    alpha = 0.3,
    lineWidth = 1,
    clear = true,
    pixelSnap = true
  } = {}) {
    if (!graphics || typeof project !== 'function') return;
    if (clear) graphics.clear?.();
    graphics.lineStyle?.(lineWidth, color, alpha);

    const snap = (screen) => pixelSnap
      ? { x: Math.round(screen.x) + 0.5, y: Math.round(screen.y) + 0.5 }
      : screen;
    const screenPoint = (column, row) => {
      const point = this.node(column, row);
      const screen = project(point.x, point.y, point.z);
      return pixelSnap
        ? { x: Math.round(screen.x) + 0.5, y: Math.round(screen.y) + 0.5 }
        : screen;
    };
    const segment = (a, b) => graphics.lineBetween?.(a.x, a.y, b.x, b.y);

    for (let column = 0; column <= this.columns; column++) {
      for (let row = 0; row < this.rows; row++) {
        segment(screenPoint(column, row), screenPoint(column, row + 1));
      }
    }
    for (let row = 0; row <= this.rows; row++) {
      for (let column = 0; column < this.columns; column++) {
        segment(screenPoint(column, row), screenPoint(column + 1, row));
      }
    }

    // Tie the back corners to the posts/crossbar to preserve the goal's depth.
    for (const column of [0, this.columns]) {
      const side = column === 0 ? -this.goalWidth / 2 : this.goalWidth / 2;
      for (let row = 1; row <= this.rows; row++) {
        const frontY = (row / this.rows) * this.goalHeight;
        segment(snap(project(side, frontY, this.goalZ)), screenPoint(column, row));
      }
    }
    for (let column = 0; column <= this.columns; column++) {
      const x = -this.goalWidth / 2 + (column / this.columns) * this.goalWidth;
      segment(snap(project(x, this.goalHeight, this.goalZ)), screenPoint(column, this.rows));
    }
    this.needsRedraw = false;
  }
}

export default GoalNetPhysics;
