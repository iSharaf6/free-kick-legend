// A pitch is large enough that a repeated bitmap immediately gives itself away.
// This module keeps the turf in scene space: every band, mower lane and divot is
// drawn by Phaser Graphics at the size it will actually appear on screen.

export const PITCH_SURFACE_PALETTE = Object.freeze({
  base: 0x16713e,
  cutLight: 0x27884a,
  cutDark: 0x0d5934,
  laneLight: 0x43a157,
  laneDark: 0x07482e,
  edge: 0x052d25,
  lightPool: 0x76bd63,
  bladeLight: 0x62b45d,
  bladeDark: 0x083d2a,
  fleckLight: 0x93c66b,
  fleckDark: 0x09432c,
  soil: 0x695a35,
  wear: 0x9a8a4f,
  wearLight: 0xb7a765
});

const DEFAULT_SEED = 0x4b49434b;

function assertFinite(name, value) {
  if (!Number.isFinite(value)) throw new TypeError(`${name} must be a finite number`);
  return value;
}

function assertPositive(name, value) {
  assertFinite(name, value);
  if (value <= 0) throw new RangeError(`${name} must be greater than zero`);
  return value;
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

// Mulberry32 is tiny, deterministic across JS engines and has more than enough
// quality for scattered one-pixel material accents. No frame-time randomness
// means the pitch cannot shimmer as scenes are rebuilt.
function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function pointOnVanishingLine(nearX, nearY, farY, horizonX, horizonY) {
  const progress = (farY - horizonY) / (nearY - horizonY);
  return horizonX + (nearX - horizonX) * progress;
}

function resolveHorizon(options, x, y, width, height) {
  const horizon = options.horizon;
  const horizonX = assertFinite(
    'horizon.x',
    typeof horizon === 'object' && horizon !== null
      ? (horizon.x ?? x + width / 2)
      : (options.horizonX ?? x + width / 2)
  );
  const horizonY = assertFinite(
    'horizon.y',
    typeof horizon === 'number'
      ? horizon
      : (typeof horizon === 'object' && horizon !== null
          ? (horizon.y ?? y - Math.max(8, height * 0.16))
          : (options.horizonY ?? y - Math.max(8, height * 0.16)))
  );

  // A vanishing point inside the turf makes the lanes turn back on themselves.
  if (horizonY >= y) {
    throw new RangeError('horizon.y must sit above the pitch region');
  }
  if (horizonX < x || horizonX > x + width) {
    throw new RangeError('horizon.x must sit inside the pitch region');
  }
  return Object.freeze({ x: horizonX, y: horizonY });
}

function freezePoint(x, y) {
  return Object.freeze({ x, y });
}

/**
 * Produce a renderer-independent description of a perspective pixel pitch.
 *
 * `horizon` accepts either a y coordinate or `{ x, y }`. Keeping the layout
 * pure makes it straightforward for menu, level-select and gameplay scenes to
 * share exactly the same surface language at different dimensions.
 */
export function buildPitchSurfaceLayout(options = {}) {
  const x = assertFinite('x', options.x ?? 0);
  const y = assertFinite('y', options.y ?? 0);
  const width = assertPositive('width', options.width ?? 480);
  const height = assertPositive('height', options.height ?? 166);
  const bottom = y + height;
  const right = x + width;
  const horizon = resolveHorizon(options, x, y, width, height);
  const palette = Object.freeze({ ...PITCH_SURFACE_PALETTE, ...(options.palette ?? {}) });
  const laneCount = clamp(Math.round(options.laneCount ?? 12), 6, 18);
  const cutBandCount = clamp(Math.round(options.cutBandCount ?? 8), 5, 12);
  const seed = (options.seed ?? DEFAULT_SEED) >>> 0;
  const random = seededRandom(seed);

  // Horizontal mower passes widen toward camera. Each pass is one continuous,
  // very low-contrast wash bounded by a shared hand-cut contour. This matters
  // at the game's 4x presentation scale: a row of filled rectangles reads as a
  // quilt immediately, while these interlocking polygons retain the broad cut
  // direction without adding internal ends or vertical cell seams.
  const cutBoundaries = [];
  for (let index = 0; index <= cutBandCount; index++) {
    const t = index / cutBandCount;
    cutBoundaries.push(index === cutBandCount
      ? bottom
      : Math.round(y + height * Math.pow(t, 1.56)));
  }

  // Keep turf/scuff placement byte-for-byte stable while changing only the
  // mower geometry. Those accepted details historically followed the random
  // samples consumed by the old segmented pass, so consume that same sequence
  // here and use an isolated stream for the new contours.
  for (let index = 0; index < cutBandCount; index++) {
    const bandHeight = cutBoundaries[index + 1] - cutBoundaries[index];
    const legacySegmentCount = clamp(Math.round(width / 72), 4, 9);
    for (let segmentIndex = 0; segmentIndex < legacySegmentCount; segmentIndex++) {
      if (segmentIndex !== 0) random();
      if (segmentIndex !== legacySegmentCount - 1) random();
      if (bandHeight >= 4) random();
      if (bandHeight >= 5) random();
      random();
    }
  }

  const cutRandom = seededRandom(seed ^ 0x4d4f5745);
  const contourAnchorCount = clamp(Math.round(width / 48), 9, 15);
  const cutContours = cutBoundaries.map((baseY, boundaryIndex) => {
    // The outer contours are clipped by the pitch bounds. Only internal mower
    // joins meander; their amplitude grows gently toward the camera.
    const internal = boundaryIndex > 0 && boundaryIndex < cutBoundaries.length - 1;
    const previousGap = internal ? baseY - cutBoundaries[boundaryIndex - 1] : 0;
    const nextGap = internal ? cutBoundaries[boundaryIndex + 1] - baseY : 0;
    const amplitude = internal
      ? clamp(Math.floor(Math.min(previousGap, nextGap) * 0.22), 1, 3)
      : 0;
    const points = [];
    let previousX = x - 1;

    for (let anchor = 0; anchor <= contourAnchorCount; anchor++) {
      const endpoint = anchor === 0 || anchor === contourAnchorCount;
      const nominalX = x + width * anchor / contourAnchorCount;
      const anchorStep = width / contourAnchorCount;
      const stagger = endpoint
        ? 0
        : ((boundaryIndex % 2 === 0 ? -0.24 : 0.26) + (cutRandom() - 0.5) * 0.18) * anchorStep;
      const remainingAnchors = contourAnchorCount - anchor;
      const pointX = endpoint
        ? Math.round(nominalX)
        : clamp(
            Math.round(nominalX + stagger),
            previousX + 2,
            right - remainingAnchors * 2
          );

      let pointY = baseY;
      if (internal && !endpoint) {
        const alternatingBias = (anchor + boundaryIndex) % 2 === 0 ? -0.48 : 0.48;
        const organicBias = (cutRandom() - 0.5) * 1.18;
        pointY = Math.round(baseY + (alternatingBias + organicBias) * amplitude);
        pointY = clamp(pointY, baseY - amplitude, baseY + amplitude);

        // Do not allow a long ruler-straight run. Alternating a one-pixel step
        // is enough to preserve crisp pixel art without forming a hard bar.
        if (points.length > 1 && pointY === points.at(-1).y) {
          const nudge = (anchor + boundaryIndex) % 2 === 0 ? -1 : 1;
          pointY = clamp(pointY + nudge, baseY - amplitude, baseY + amplitude);
        }
      }

      points.push(freezePoint(pointX, pointY));
      previousX = pointX;
    }
    return Object.freeze(points);
  });

  const cutBands = [];
  for (let index = 0; index < cutBandCount; index++) {
    const top = cutBoundaries[index];
    const bandBottom = cutBoundaries[index + 1];
    if (bandBottom <= top) continue;
    const bandHeight = bandBottom - top;
    const topContour = cutContours[index];
    const bottomContour = cutContours[index + 1];
    cutBands.push(Object.freeze({
      x,
      y: top,
      width,
      height: bandHeight,
      color: index % 2 === 0 ? palette.cutDark : palette.cutLight,
      alpha: index % 2 === 0 ? 0.135 : 0.095,
      topContour,
      bottomContour,
      points: Object.freeze([
        ...topContour,
        ...bottomContour.slice().reverse()
      ])
    }));
  }

  // Sparse tapered crossover shards soften the shared joins in a way that
  // still belongs to the low-resolution art language. They are deliberately
  // short and scattered, never rectangular or aligned into another strip.
  const cutFeather = [];
  for (let boundaryIndex = 1; boundaryIndex < cutContours.length - 1; boundaryIndex++) {
    const contour = cutContours[boundaryIndex];
    const fragmentCount = clamp(Math.round(width / 82), 4, 8);
    for (let fragmentIndex = 0; fragmentIndex < fragmentCount; fragmentIndex++) {
      const guideIndex = 1 + Math.floor(
        (fragmentIndex + 0.35 + cutRandom() * 0.3) /
        fragmentCount * (contour.length - 2)
      );
      const guide = contour[clamp(guideIndex, 1, contour.length - 2)];
      const fragmentWidth = 2 + Math.floor(cutRandom() * 3);
      const fragmentX = clamp(
        Math.round(guide.x + (cutRandom() - 0.5) * 10),
        x,
        right - fragmentWidth
      );
      const fragmentY = clamp(guide.y, y + 1, bottom - 1);
      const direction = fragmentIndex % 2 === 0 ? -1 : 1;
      const tipY = clamp(fragmentY + direction, y, bottom);
      cutFeather.push(Object.freeze({
        color: boundaryIndex % 2 === 0 ? palette.cutLight : palette.cutDark,
        alpha: 0.022 + cutRandom() * 0.008,
        points: Object.freeze([
          freezePoint(fragmentX, fragmentY),
          freezePoint(fragmentX + fragmentWidth, tipY),
          freezePoint(fragmentX + 1, tipY)
        ])
      }));
    }
  }

  // Mower lanes are true trapezoids. Their edges all extrapolate through the
  // same vanishing point instead of merely narrowing by an arbitrary amount.
  const lanes = [];
  for (let index = 0; index < laneCount; index++) {
    const nearLeft = x + width * index / laneCount;
    const nearRight = x + width * (index + 1) / laneCount;
    const farLeft = pointOnVanishingLine(nearLeft, bottom, y, horizon.x, horizon.y);
    const farRight = pointOnVanishingLine(nearRight, bottom, y, horizon.x, horizon.y);
    lanes.push(Object.freeze({
      color: index % 2 === 0 ? palette.laneLight : palette.laneDark,
      alpha: index % 2 === 0 ? 0.058 : 0.046,
      leftGuide: Object.freeze({ nearX: nearLeft, farX: farLeft }),
      rightGuide: Object.freeze({ nearX: nearRight, farX: farRight }),
      points: Object.freeze([
        freezePoint(Math.round(farLeft), y),
        freezePoint(Math.round(farRight), y),
        freezePoint(Math.round(nearRight), bottom),
        freezePoint(Math.round(nearLeft), bottom)
      ])
    }));
  }

  // The dark side cuts are a restrained stadium-light falloff, not a soft
  // gradient. Their converging shape reinforces the same perspective grid.
  const edgeNear = Math.max(5, width * 0.045);
  const edgeFar = Math.max(2, width * 0.012);
  const edgeShadows = Object.freeze([
    Object.freeze({
      color: palette.edge,
      alpha: 0.18,
      points: Object.freeze([
        freezePoint(x, y), freezePoint(x + edgeFar, y),
        freezePoint(x + edgeNear, bottom), freezePoint(x, bottom)
      ])
    }),
    Object.freeze({
      color: palette.edge,
      alpha: 0.18,
      points: Object.freeze([
        freezePoint(right - edgeFar, y), freezePoint(right, y),
        freezePoint(right, bottom), freezePoint(right - edgeNear, bottom)
      ])
    })
  ]);

  // Two extremely low-opacity floodlight washes follow the same perspective
  // grid as the mower lanes. Their asymmetrical ten-point edges and detached
  // fragments prevent a readable rectangular boundary at 4x output. A private
  // RNG keeps this lighting dither from changing any accepted turf/scuff data.
  const lightPools = [];
  if (options.lightPools !== false) {
    const lightRandom = seededRandom(seed ^ 0x4c495447);
    for (const [poolIndex, centerRatio] of [0.27, 0.73].entries()) {
      const farY = y + height * (0.19 + poolIndex * 0.015);
      const upperY = y + height * (0.42 - poolIndex * 0.018);
      const lowerY = y + height * (0.7 + poolIndex * 0.012);
      const nearY = bottom - height * (0.035 + poolIndex * 0.01);
      const nearCenterX = x + width * centerRatio;
      const nearHalfWidth = width * (0.125 + poolIndex * 0.008);
      const nearLeft = nearCenterX - nearHalfWidth;
      const nearRight = nearCenterX + nearHalfWidth;
      const farLeft = pointOnVanishingLine(nearLeft, nearY, farY, horizon.x, horizon.y);
      const farRight = pointOnVanishingLine(nearRight, nearY, farY, horizon.x, horizon.y);
      const leftUpper = pointOnVanishingLine(nearLeft, nearY, upperY, horizon.x, horizon.y);
      const leftLower = pointOnVanishingLine(nearLeft, nearY, lowerY, horizon.x, horizon.y);
      const rightUpper = pointOnVanishingLine(nearRight, nearY, upperY, horizon.x, horizon.y);
      const rightLower = pointOnVanishingLine(nearRight, nearY, lowerY, horizon.x, horizon.y);
      const farCenterX = (farLeft + farRight) / 2;

      const fragments = [];
      for (let fragmentIndex = 0; fragmentIndex < 7; fragmentIndex++) {
        const progress = 0.2 + fragmentIndex * 0.105;
        const fragmentY = farY + (nearY - farY) * progress;
        const edgeNearX = fragmentIndex % 2 === 0 ? nearLeft : nearRight;
        const edgeX = pointOnVanishingLine(
          edgeNearX,
          nearY,
          fragmentY,
          horizon.x,
          horizon.y
        );
        const outward = fragmentIndex % 2 === 0 ? -1 : 1;
        fragments.push(Object.freeze({
          x: clamp(Math.round(edgeX + outward * (2 + lightRandom() * 3)), x, right - 3),
          y: clamp(Math.round(fragmentY + (lightRandom() - 0.5) * 4), y, bottom - 1),
          width: 1 + Math.floor(lightRandom() * 3),
          height: 1,
          color: palette.lightPool,
          alpha: 0.009 + lightRandom() * 0.003
        }));
      }

      lightPools.push(Object.freeze({
        color: palette.lightPool,
        alpha: poolIndex === 0 ? 0.014 : 0.013,
        leftGuide: Object.freeze({ nearX: nearLeft, nearY, farX: farLeft, farY }),
        rightGuide: Object.freeze({ nearX: nearRight, nearY, farX: farRight, farY }),
        points: Object.freeze([
          freezePoint(Math.round(farLeft), Math.round(farY + 2)),
          freezePoint(Math.round(farCenterX + (poolIndex === 0 ? -2 : 2)), Math.round(farY)),
          freezePoint(Math.round(farRight), Math.round(farY + 1)),
          freezePoint(Math.round(rightUpper + 1), Math.round(upperY - 1)),
          freezePoint(Math.round(rightLower - 1), Math.round(lowerY + 1)),
          freezePoint(Math.round(nearRight), Math.round(nearY - 1)),
          freezePoint(Math.round(nearCenterX + (poolIndex === 0 ? 3 : -3)), Math.round(nearY + 1)),
          freezePoint(Math.round(nearLeft), Math.round(nearY)),
          freezePoint(Math.round(leftLower + 1), Math.round(lowerY - 1)),
          freezePoint(Math.round(leftUpper - 1), Math.round(upperY + 1))
        ]),
        fragments: Object.freeze(fragments)
      }));
    }
  }

  // Goal-mouth wear is a loose family of small scuffs rather than a symmetrical
  // ladder. Each mark is generated once from the scene seed, so it has the
  // irregularity of played turf without becoming photographic noise.
  const goalmouthWear = [];
  if (options.goalmouthWear !== false) {
    const wearCount = clamp(Math.round(width * height / 4300), 12, 30);
    for (let index = 0; index < wearCount; index++) {
      const depth = Math.sqrt(random());
      const wearY = Math.floor(y + height * (0.055 + depth * 0.225));
      const spread = width * (0.018 + depth * 0.07);
      const markWidth = 1 + Math.floor(random() * (2 + depth * 4));
      const markX = clamp(
        Math.floor(horizon.x + (random() - 0.5) * spread - markWidth / 2),
        x,
        right - markWidth
      );
      goalmouthWear.push(Object.freeze({
        x: markX,
        y: wearY,
        width: markWidth,
        height: random() > 0.84 ? 2 : 1,
        color: index % 5 === 0 ? palette.wearLight : palette.wear,
        alpha: index % 5 === 0 ? 0.15 : 0.105
      }));
    }
  }

  const area = width * height;

  // A narrow trail of alternating studs and disturbed turf projects from the
  // near field toward the goal. It localises the wear instead of washing the
  // entire surface in beige specks.
  const trafficOriginX = clamp(
    assertFinite('trafficOriginX', options.trafficOriginX ?? horizon.x),
    x,
    right
  );
  const footWear = [];
  if (options.footWear !== false) {
    const footstepCount = clamp(Math.round(height / 10), 10, 20);
    for (let index = 0; index < footstepCount; index++) {
      const progress = (index + 0.35 + random() * 0.3) / footstepCount;
      const wearY = Math.floor(y + height * (0.36 + progress * 0.61));
      const centerX = pointOnVanishingLine(
        trafficOriginX,
        bottom,
        wearY,
        horizon.x,
        horizon.y
      );
      const perspective = (wearY - y) / height;
      const side = index % 2 === 0 ? -1 : 1;
      const separation = 1 + perspective * 3.2;
      const markWidth = 1 + Math.floor(perspective * 3 + random());
      const markX = clamp(
        Math.round(centerX + side * separation + (random() - 0.5) * 2 - markWidth / 2),
        x,
        right - markWidth
      );
      footWear.push(Object.freeze({
        x: markX,
        y: wearY,
        width: markWidth,
        height: perspective > 0.78 && index % 4 === 0 ? 2 : 1,
        lipX: clamp(markX - side, x, right - Math.max(1, markWidth - 1)),
        lipY: Math.max(y, wearY - 1),
        color: index % 4 === 0 ? palette.soil : palette.wear,
        lip: palette.bladeLight,
        alpha: index % 4 === 0 ? 0.2 : 0.15
      }));
    }
  }

  // Tiny paired blade shapes create the first texture scale. They are short,
  // contrast-controlled fragments, frozen into the layout and large enough to
  // survive the game's exact 4x output without becoming glitter.
  const microTuftCount = clamp(Math.round(area / 720), 48, 150);
  const microTufts = [];
  for (let index = 0; index < microTuftCount; index++) {
    const vertical = Math.pow(random(), 0.68);
    const tuftY = Math.floor(y + 1 + vertical * Math.max(1, height - 3));
    const direction = random() < 0.5 ? -1 : 1;
    const paired = vertical > 0.42 && random() > 0.57;
    const tuftX = Math.floor(x + 1 + random() * Math.max(1, width - 3));
    microTufts.push(Object.freeze({
      x: tuftX,
      y: tuftY,
      tipX: clamp(tuftX + direction, x, right - 1),
      tipY: Math.max(y, tuftY - 1),
      paired,
      color: index % 3 === 0 ? palette.bladeLight : palette.bladeDark,
      alpha: index % 3 === 0 ? 0.21 : 0.23
    }));
  }

  // Coherent clumps are the second texture scale. A low-contrast base and four
  // to seven nearby blades read as one tuft from a full-HD viewing distance,
  // filling the foreground without distributing noise uniformly everywhere.
  const grassClusterCount = clamp(Math.round(area / 2800), 16, 42);
  const grassClusters = [];
  for (let index = 0; index < grassClusterCount; index++) {
    const vertical = 0.28 + Math.pow(random(), 0.58) * 0.7;
    const centerX = Math.floor(x + 3 + random() * Math.max(1, width - 6));
    const centerY = Math.floor(y + 2 + vertical * Math.max(1, height - 5));
    const radiusX = 2 + Math.floor(vertical * 4 + random() * 2);
    const bladeCount = 4 + Math.floor(random() * 4);
    const strokes = [];
    for (let blade = 0; blade < bladeCount; blade++) {
      const strokeX = clamp(
        centerX + Math.round((random() - 0.5) * radiusX * 2),
        x,
        right - 2
      );
      const strokeY = clamp(centerY - Math.floor(random() * 3), y, bottom - 2);
      const strokeWidth = vertical > 0.62 && random() > 0.7 ? 2 : 1;
      const strokeHeight = vertical > 0.54 && random() > 0.58 ? 2 : 1;
      strokes.push(Object.freeze({
        x: strokeX,
        y: strokeY,
        width: strokeWidth,
        height: strokeHeight,
        color: blade % 3 === 0 ? palette.bladeLight : palette.bladeDark,
        alpha: blade % 3 === 0 ? 0.23 : 0.21
      }));
    }
    const baseWidth = 3 + Math.floor(vertical * 4 + random() * 2);
    grassClusters.push(Object.freeze({
      base: Object.freeze({
        x: clamp(Math.round(centerX - baseWidth / 2), x, right - baseWidth),
        y: clamp(centerY + 1, y, bottom - 1),
        width: baseWidth,
        height: 1,
        color: palette.bladeDark,
        alpha: 0.095
      }),
      strokes: Object.freeze(strokes)
    }));
  }

  const fleckCount = clamp(
    Math.round(options.fleckCount ?? area / 920),
    36,
    140
  );
  const flecks = [];
  for (let index = 0; index < fleckCount; index++) {
    const fleckWidth = random() > 0.86 ? 2 : 1;
    const vertical = Math.sqrt(random()); // sparse detail favours the near field
    flecks.push(Object.freeze({
      x: Math.floor(x + random() * Math.max(1, width - fleckWidth)),
      y: Math.floor(y + vertical * Math.max(1, height - 1)),
      width: fleckWidth,
      height: 1,
      color: index % 4 === 0 ? palette.fleckLight : palette.fleckDark,
      alpha: index % 4 === 0 ? 0.16 : 0.18
    }));
  }

  // A divot is three pixels of information: the dark cut, a warm soil core and
  // the displaced turf lip. That tiny light/dark relationship reads far more
  // naturally than a large black rectangle.
  const divotCount = clamp(Math.round(area / 9000), 4, 18);
  const divots = [];
  for (let index = 0; index < divotCount; index++) {
    const divotWidth = 2 + Math.floor(random() * 3);
    const vertical = 0.46 + random() * 0.52;
    const divotX = Math.floor(x + 1 + random() * Math.max(1, width - divotWidth - 2));
    const divotY = Math.floor(y + 1 + vertical * Math.max(1, height - 3));
    const direction = random() < 0.5 ? -1 : 1;
    divots.push(Object.freeze({
      x: divotX,
      y: divotY,
      width: divotWidth,
      height: 1,
      color: palette.fleckDark,
      soil: palette.soil,
      lip: palette.bladeLight,
      lipX: clamp(divotX + direction, x, right - Math.max(1, divotWidth - 1)),
      lipY: Math.max(y, divotY - 1),
      alpha: 0.24
    }));
  }

  const rectArea = (rect) => rect.width * rect.height;
  const detailPixels =
    goalmouthWear.reduce((total, mark) => total + rectArea(mark), 0) +
    footWear.reduce((total, mark) => total + rectArea(mark) + Math.max(1, mark.width - 1), 0) +
    microTufts.reduce((total, tuft) => total + 1 + Number(tuft.paired), 0) +
    grassClusters.reduce((total, cluster) => total + rectArea(cluster.base) +
      cluster.strokes.reduce((strokeTotal, stroke) => strokeTotal + rectArea(stroke), 0), 0) +
    flecks.reduce((total, fleck) => total + rectArea(fleck), 0) +
    divots.reduce((total, divot) => total + rectArea(divot) +
      Math.max(1, divot.width - 2) + Math.max(1, divot.width - 1), 0);

  return Object.freeze({
    bounds: Object.freeze({ x, y, width, height, right, bottom }),
    horizon,
    palette,
    seed,
    cutBands: Object.freeze(cutBands),
    cutFeather: Object.freeze(cutFeather),
    lanes: Object.freeze(lanes),
    edgeShadows,
    lightPools: Object.freeze(lightPools),
    goalmouthWear: Object.freeze(goalmouthWear),
    footWear: Object.freeze(footWear),
    microTufts: Object.freeze(microTufts),
    grassClusters: Object.freeze(grassClusters),
    flecks: Object.freeze(flecks),
    divots: Object.freeze(divots),
    detailBudget: Object.freeze({ pixels: detailPixels, coverage: detailPixels / area })
  });
}

function fillPolygon(graphics, shape) {
  graphics.fillStyle(shape.color, shape.alpha);
  graphics.beginPath();
  graphics.moveTo(shape.points[0].x, shape.points[0].y);
  for (let index = 1; index < shape.points.length; index++) {
    graphics.lineTo(shape.points[index].x, shape.points[index].y);
  }
  graphics.closePath();
  graphics.fillPath();
}

/** Paint a prepared or newly-built pitch layout into an existing Graphics. */
export function paintPitchSurface(graphics, options = {}) {
  if (!graphics || typeof graphics.fillRect !== 'function') {
    throw new TypeError('paintPitchSurface requires a Phaser Graphics object');
  }
  const layout = options.layout ?? buildPitchSurfaceLayout(options);
  const { bounds, palette } = layout;

  graphics.fillStyle(palette.base, 1);
  graphics.fillRect(bounds.x, bounds.y, bounds.width, bounds.height);
  layout.cutBands.forEach((band) => fillPolygon(graphics, band));
  layout.cutFeather.forEach((fragment) => fillPolygon(graphics, fragment));
  layout.lightPools.forEach((pool) => {
    fillPolygon(graphics, pool);
    pool.fragments.forEach((fragment) => {
      graphics.fillStyle(fragment.color, fragment.alpha);
      graphics.fillRect(
        fragment.x,
        fragment.y,
        fragment.width,
        fragment.height
      );
    });
  });
  layout.lanes.forEach((lane) => fillPolygon(graphics, lane));
  layout.edgeShadows.forEach((edge) => fillPolygon(graphics, edge));
  layout.goalmouthWear.forEach((mark) => {
    graphics.fillStyle(mark.color, mark.alpha);
    graphics.fillRect(mark.x, mark.y, mark.width, mark.height);
  });
  layout.footWear.forEach((mark) => {
    graphics.fillStyle(mark.color, mark.alpha);
    graphics.fillRect(mark.x, mark.y, mark.width, mark.height);
    graphics.fillStyle(mark.lip, mark.alpha * 0.58);
    graphics.fillRect(mark.lipX, mark.lipY, Math.max(1, mark.width - 1), 1);
  });
  layout.microTufts.forEach((tuft) => {
    graphics.fillStyle(tuft.color, tuft.alpha);
    graphics.fillRect(tuft.x, tuft.y, 1, 1);
    if (tuft.paired) graphics.fillRect(tuft.tipX, tuft.tipY, 1, 1);
  });
  layout.grassClusters.forEach((cluster) => {
    graphics.fillStyle(cluster.base.color, cluster.base.alpha);
    graphics.fillRect(
      cluster.base.x,
      cluster.base.y,
      cluster.base.width,
      cluster.base.height
    );
    cluster.strokes.forEach((stroke) => {
      graphics.fillStyle(stroke.color, stroke.alpha);
      graphics.fillRect(stroke.x, stroke.y, stroke.width, stroke.height);
    });
  });
  layout.flecks.forEach((fleck) => {
    graphics.fillStyle(fleck.color, fleck.alpha);
    graphics.fillRect(fleck.x, fleck.y, fleck.width, fleck.height);
  });
  layout.divots.forEach((divot) => {
    graphics.fillStyle(divot.color, divot.alpha);
    graphics.fillRect(divot.x, divot.y, divot.width, divot.height);
    graphics.fillStyle(divot.soil, divot.alpha * 0.72);
    graphics.fillRect(divot.x + 1, divot.y, Math.max(1, divot.width - 2), 1);
    graphics.fillStyle(divot.lip, divot.alpha * 0.58);
    graphics.fillRect(divot.lipX, divot.lipY, Math.max(1, divot.width - 1), 1);
  });

  return layout;
}

/**
 * Scene convenience wrapper. The returned Graphics can be destroyed or
 * depth-reordered exactly like any other Phaser game object.
 */
export function addPitchSurface(scene, options = {}) {
  if (!scene?.add || typeof scene.add.graphics !== 'function') {
    throw new TypeError('addPitchSurface requires a Phaser scene');
  }
  const graphics = scene.add.graphics();
  const layout = paintPitchSurface(graphics, options);
  graphics.setDepth?.(options.depth ?? 1);
  graphics.setName?.(options.name ?? 'procedural-pitch-surface');
  graphics.pitchSurfaceLayout = layout;
  return graphics;
}
