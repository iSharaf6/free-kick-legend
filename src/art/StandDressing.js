import Phaser from 'phaser';
import { PAL } from '../pixelart.js';
import { CROWD_STAND, crowdRandom } from '../data/crowdStand.js';

// Everything in the supporters' end that is not a supporter: the concrete they
// stand on, the light falling on them, and the things they brought with them.
//
// A crowd made only of people reads as wallpaper. What sells a stand is the
// structure cutting across it - fascias, railings, the black mouths of the
// vomitories - and the fact that the light is not uniform. Both were missing
// from the plain tiled panorama, which is a large part of why the old stand
// read flat even before the repeat gave it away.
//
// Nothing here is authored art. Every prop is drawn from the palette the rest
// of the game already uses, so atmosphere costs no bytes on the boot path and
// cannot desynchronise from a checked-in PNG.

const FLAG_TEXTURE = 'crowd-flag-v1';
const GLOW_TEXTURE = 'crowd-glow-v1';

// Colours supporters actually bring to a ground: club colours, not a rainbow.
const FLAG_COLOURS = Object.freeze([
  0xd75a3a, 0xf3c449, 0x2d74b9, 0xf3e7c3, 0x49a760, 0xb4423a
]);
const BANNER_COLOURS = Object.freeze([
  Object.freeze({ cloth: 0x8d2f2a, stripe: 0xf3c449 }),
  Object.freeze({ cloth: 0x1c3f77, stripe: 0xf3e7c3 }),
  Object.freeze({ cloth: 0x1d5c3c, stripe: 0xf3e7c3 }),
  Object.freeze({ cloth: 0x6a4a17, stripe: 0xffe9a8 })
]);

// The floodlight bank positions baked into the stadium backdrop. Pools of light
// on the crowd have to line up with the lamps that cast them.
const FLOODLIGHTS = Object.freeze([42, 128, 332, 418]);

/**
 * Two tiny procedural textures, generated once.
 *
 * Kept out of src/data/matchAssets.js on purpose: that manifest's length is
 * asserted (test/asset-streaming.test.js), and more to the point a 10x8 flag
 * has no business being an HTTP request.
 */
export function makeStandPropTextures(scene) {
  if (!scene.textures.exists(FLAG_TEXTURE)) {
    const g = scene.add.graphics();
    // Three flutter frames, 10x8 each, drawn white so a per-instance tint is
    // the only thing that decides a flag's colour.
    // Pennants, not rectangles: a flag that reads as a solid block at this size
    // looks like a piece of interface floating in the stand. Each row is
    // [inset, width] so the cloth tapers and the fly end ripples per frame.
    const frames = [
      [[0, 8], [0, 8], [0, 7], [1, 5], [1, 3]],
      [[0, 6], [0, 8], [1, 7], [1, 6], [2, 3]],
      [[0, 7], [0, 6], [0, 8], [1, 6], [1, 4]]
    ];
    frames.forEach((rows, frame) => {
      const ox = frame * 10;
      g.fillStyle(0xffffff, 1);
      g.fillRect(ox, 1, 1, 7);                    // pole
      rows.forEach(([inset, width], row) => {
        if (width > 0) g.fillRect(ox + 1, row + inset, width, 1);
      });
    });
    g.generateTexture(FLAG_TEXTURE, 30, 8);
    g.destroy();
    const texture = scene.textures.get(FLAG_TEXTURE);
    for (let frame = 0; frame < 3; frame++) texture.add(frame, 0, frame * 10, 0, 10, 8);
  }

  if (!scene.textures.exists(GLOW_TEXTURE)) {
    const g = scene.add.graphics();
    // A stepped radial falloff: concentric circles rather than a gradient
    // shader, so the blob stays in the same chunky idiom as everything else.
    //
    // The per-ring alpha matters. Ten rings compositing at 0.11 accumulate to
    // roughly full opacity at the centre and fade to 0.11 at the rim; anything
    // much lower and the texture peaks so dim that a flare drawn from it is
    // invisible against the crowd no matter what alpha the caller asks for.
    for (let step = 10; step >= 1; step--) {
      g.fillStyle(0xffffff, 0.11);
      g.fillCircle(16, 16, step * 1.6);
    }
    g.generateTexture(GLOW_TEXTURE, 32, 32);
    g.destroy();
  }
}

/**
 * A concrete band with stanchions: what separates one tier from the next.
 *
 * Deliberately dull. A crisp, bright rail reads as interface chrome laid over
 * the crowd; what sells it as structure is a dark mass with one dim lit edge
 * and a shadow falling onto the supporters below.
 */
function drawFascia(gfx, y, height, { stanchionStep = 26, lit = 0.16 } = {}) {
  gfx.fillStyle(PAL.ink, 0.96).fillRect(0, y, 480, height);
  gfx.fillStyle(PAL.borderDark, 0.5).fillRect(0, y, 480, 1);
  gfx.fillStyle(PAL.border, lit).fillRect(0, y + 1, 480, 1);
  for (let x = 6; x < 480; x += stanchionStep) {
    gfx.fillStyle(PAL.borderDark, 0.32).fillRect(x, y + 2, 1, height - 2);
  }
  // The shadow the barrier throws down onto the tier in front of it. Without
  // it the band floats; with it the two tiers are lit by the same lamps.
  gfx.fillStyle(PAL.ink, 0.5).fillRect(0, y + height, 480, 1);
  gfx.fillStyle(PAL.ink, 0.24).fillRect(0, y + height + 1, 480, 1);
}

/** Draped tifo. No lettering: a misspelt banner is worse than a blank one. */
function drawBanners(gfx, y, random, count) {
  for (let i = 0; i < count; i++) {
    const width = 24 + Math.floor(random() * 40);
    const x = Math.floor(random() * (480 - width));
    const { cloth, stripe } = BANNER_COLOURS[Math.floor(random() * BANNER_COLOURS.length)];
    gfx.fillStyle(cloth, 0.92).fillRect(x, y, width, 4);
    // One dim band across the cloth, and folds where it hangs off its fixings.
    gfx.fillStyle(stripe, 0.34).fillRect(x + 2, y + 1, width - 4, 1);
    gfx.fillStyle(PAL.ink, 0.42).fillRect(x, y + 3, width, 1);
    for (let fold = x + 6; fold < x + width - 4; fold += 9 + Math.floor(random() * 7)) {
      gfx.fillStyle(PAL.ink, 0.26).fillRect(fold, y, 1, 3);
    }
  }
}

/**
 * A vomitory: the dark mouth of a stairwell cutting up through the tiers.
 *
 * The stand this replaces drew these as flat 9x26 black rectangles holding five
 * grey ticks, which read as a rendering fault rather than an opening. A real
 * one narrows as it goes back, shows lit treads, and spills a little warm light
 * from the concourse behind it.
 */
function drawVomitory(gfx, x, top, bottom) {
  const height = bottom - top;
  const halfTop = 3.5;
  const halfBottom = 5.5;

  const wedge = (half0, half1, colour, alpha) => {
    gfx.fillStyle(colour, alpha);
    gfx.beginPath();
    gfx.moveTo(x - half1, bottom);
    gfx.lineTo(x + half1, bottom);
    gfx.lineTo(x + half0, top);
    gfx.lineTo(x - half0, top);
    gfx.closePath();
    gfx.fillPath();
  };

  wedge(halfTop + 1, halfBottom + 1, PAL.ink, 1);      // surround
  wedge(halfTop, halfBottom, 0x060d15, 1);             // the opening itself

  // Concourse light spilling out of the back of the tunnel.
  gfx.fillStyle(PAL.flood, 0.1).fillRect(x - halfTop + 0.5, top + 1, halfTop * 2 - 1, 4);
  gfx.fillStyle(PAL.flood, 0.05).fillRect(x - halfTop, top + 5, halfTop * 2, 3);

  // Treads, brightening towards the front where the floodlights reach them.
  const steps = 7;
  for (let step = 0; step < steps; step++) {
    const t = step / (steps - 1);
    const half = halfTop + (halfBottom - halfTop) * t;
    gfx.fillStyle(PAL.border, 0.1 + t * 0.16);
    gfx.fillRect(x - half + 1, top + 2 + t * (height - 4), half * 2 - 2, 1);
  }

  // Handrails down both walls.
  gfx.fillStyle(PAL.borderDark, 0.75);
  gfx.fillRect(x - halfBottom, bottom - height * 0.55, 1, height * 0.55);
  gfx.fillRect(x + halfBottom - 1, bottom - height * 0.55, 1, height * 0.55);
}

/**
 * Build the stand's structure, lighting and props.
 *
 * Returns the handles the crowd controller animates on a goal; everything else
 * is static geometry drawn once.
 */
export function addStandDressing(scene, {
  viewWidth = 480,
  reducedMotion = false,
  depthOffset = 0,
  seed = 0x1d3f77
} = {}) {
  makeStandPropTextures(scene);
  const random = crowdRandom(seed);
  const [back, mid, front] = CROWD_STAND.tiers;
  const objects = [];
  const track = (object) => { objects.push(object); return object; };
  const at = (depth) => depth + depthOffset;

  // --------------------------------------------------------------- structure
  //
  // Every barrier sits in the strip of stand a tier leaves visible above the
  // tier in front of it, and is drawn ABOVE the tier it belongs to. Putting one
  // behind that tier - the obvious reading of "the fascia is further away" -
  // buries it under the next bank of heads and the stand goes back to being a
  // single undifferentiated wall of people.
  const upperBarrier = track(scene.add.graphics().setDepth(at(1.16)));
  drawFascia(upperBarrier, mid.top - 4, 4);
  drawBanners(upperBarrier, mid.top - 4, random, 3);

  const lowerBarrier = track(scene.add.graphics().setDepth(at(1.25)));
  drawFascia(lowerBarrier, front.top - 4, 4, { stanchionStep: 34, lit: 0.4 });
  drawBanners(lowerBarrier, front.top - 4, random, 2);

  // Vomitories cut up through the back tier and stop at its barrier. Carrying
  // them further down only ever showed fragments between the front rows' heads,
  // which read as holes in the render rather than as openings in the stand.
  const vomitories = track(scene.add.graphics().setDepth(at(1.15)));
  for (const x of [64, 186, 302, 424]) drawVomitory(vomitories, x, back.top - 1, mid.top - 3);

  // ------------------------------------------------------------------- light
  // The shading pass goes over every tier and under every prop, so the crowd
  // falls away into the corners while the flags and flares stay lit.
  const shade = track(scene.add.graphics().setDepth(at(1.302)));
  // Roof shadow over the back rows.
  shade.fillGradientStyle(PAL.ink, PAL.ink, PAL.ink, PAL.ink, 0.9, 0.9, 0, 0);
  shade.fillRect(0, back.top - 8, viewWidth, 14);
  // General falloff: the higher up the stand, the further from the lamps.
  shade.fillGradientStyle(PAL.ink, PAL.ink, PAL.ink, PAL.ink, 0.4, 0.4, 0, 0);
  shade.fillRect(0, back.top, viewWidth, front.top - back.top);
  // The corners of a stand are always darker than the halfway line.
  shade.fillGradientStyle(PAL.ink, PAL.ink, PAL.ink, PAL.ink, 0.5, 0, 0.5, 0);
  shade.fillRect(0, back.top - 8, 96, front.bottom - back.top + 8);
  shade.fillGradientStyle(PAL.ink, PAL.ink, PAL.ink, PAL.ink, 0, 0.5, 0, 0.5);
  shade.fillRect(viewWidth - 96, back.top - 8, 96, front.bottom - back.top + 8);

  const pools = FLOODLIGHTS.map((x) => track(scene.add.image(x + 6, mid.top + 4, GLOW_TEXTURE)
    .setDisplaySize(160, 104)
    .setTint(PAL.flood)
    // Floodlight spill has to stay under the threshold where it starts washing
    // faces out; the crowd must never compete with the ball and the goal.
    .setAlpha(0.05)
    .setDepth(at(1.303))
    .setBlendMode(Phaser.BlendModes.ADD)));

  // -------------------------------------------------------------- atmosphere
  // Props draw above every tier. A raised flag is above the heads around it, so
  // occluding one behind the next bank of supporters - which is what happens if
  // it shares its tier's depth - turns it into a coloured speck in the crowd.
  const flags = [];
  for (let i = 0; i < 12; i++) {
    const inBack = i % 3 === 0;
    const tier = inBack ? back : mid;
    // Raised towards the top of their tier: cloth held above the heads in front
    // of it, not a coloured square buried at chest height among them.
    flags.push(track(scene.add
      .image(12 + random() * (viewWidth - 24),
        tier.top + (tier.bottom - tier.top) * (0.34 + random() * 0.22),
        FLAG_TEXTURE, Math.floor(random() * 3))
      .setOrigin(0.5, 1)
      .setScale(inBack ? 0.7 : 0.95)
      .setTint(FLAG_COLOURS[Math.floor(random() * FLAG_COLOURS.length)])
      // Kept under full opacity so a flag sits in the same night light as the
      // supporters holding it rather than punching out of the stand.
      .setAlpha(inBack ? 0.6 : 0.78)
      .setFlipX(random() < 0.5)
      .setDepth(at(1.305))));
  }

  // Flares: the one thing in the stand allowed to be brighter than the pitch,
  // and only just. Smoke column, additive bloom, hot core.
  const flares = [];
  const flareTiers = [back, mid, mid];
  for (let i = 0; i < flareTiers.length; i++) {
    const tier = flareTiers[i];
    const x = 52 + random() * (viewWidth - 104);
    const y = Math.round(tier.top + (tier.bottom - tier.top) * 0.55);
    const hot = i % 2 === 0 ? 0xff7a3c : 0xff4326;
    flares.push({
      baseY: y,
      hot,
      smoke: track(scene.add.image(x + 1, y - 6, GLOW_TEXTURE)
        .setDisplaySize(20, 28).setTint(0x8a4a3c).setAlpha(0.22).setDepth(at(1.306))),
      bloom: track(scene.add.image(x, y, GLOW_TEXTURE)
        .setDisplaySize(30, 26).setTint(hot).setAlpha(0.5).setDepth(at(1.31))
        .setBlendMode(Phaser.BlendModes.ADD)),
      core: track(scene.add.image(x, y, GLOW_TEXTURE)
        .setDisplaySize(6, 6).setTint(0xffe2b4).setAlpha(0.9).setDepth(at(1.312))
        .setBlendMode(Phaser.BlendModes.ADD))
    });
  }

  // Camera flashes. A ground at night is never without them, and a single white
  // pixel is the cheapest possible signal that the crowd is alive.
  const flashes = [];
  for (let i = 0; i < 18; i++) {
    const tier = i % 2 === 0 ? back : mid;
    // The fill is opaque and the *object* alpha starts at zero, because that is
    // the property the flash tween animates. Building these with a zero fill
    // alpha instead leaves them invisible no matter what the tween does to the
    // object, which is how they shipped nowhere at all the first time.
    flashes.push(track(scene.add.rectangle(
      8 + random() * (viewWidth - 16),
      tier.top + 3 + random() * (tier.bottom - tier.top - 6),
      1, 1, 0xffffff, 1
    ).setAlpha(0).setDepth(at(1.304)).setBlendMode(Phaser.BlendModes.ADD)));
  }

  const tweens = [];
  let motionReduced = Boolean(reducedMotion);

  const resetAmbientPose = () => {
    flags.forEach((flag) => flag?.setAngle?.(0));
    flares.forEach((flare) => {
      flare.bloom?.setAlpha?.(0.32);
      flare.smoke?.setY?.(flare.baseY - 6).setAlpha?.(0.16);
    });
    flashes.forEach((flash) => flash?.setAlpha?.(0));
  };

  const stopAmbient = () => {
    tweens.forEach((tween) => tween?.remove?.());
    tweens.length = 0;
    scene.tweens?.killTweensOf?.([
      ...flags,
      ...pools,
      ...flares.flatMap((flare) => [flare.bloom, flare.smoke, flare.core]),
      ...flashes
    ]);
    resetAmbientPose();
  };

  const startAmbient = () => {
    if (motionReduced || tweens.length) return;
    flags.forEach((flag, index) => {
      tweens.push(scene.tweens.add({
        targets: flag,
        angle: { from: -7, to: 7 },
        duration: 900 + index * 130,
        delay: index * 90,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut'
      }));
    });
    flares.forEach((flare, index) => {
      tweens.push(scene.tweens.add({
        targets: flare.bloom,
        alpha: { from: 0.24, to: 0.4 },
        duration: 420 + index * 90,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut'
      }));
      tweens.push(scene.tweens.add({
        targets: flare.smoke,
        y: flare.baseY - 22,
        alpha: 0,
        duration: 2600 + index * 400,
        repeat: -1,
        ease: 'Sine.easeOut',
        onRepeat: () => {
          if (flare.smoke.active) flare.smoke.setY(flare.baseY - 6).setAlpha(0.16);
        }
      }));
    });
    flashes.forEach((flash, index) => {
      tweens.push(scene.tweens.add({
        targets: flash,
        alpha: { from: 0, to: 0.95 },
        duration: 70,
        yoyo: true,
        repeat: -1,
        repeatDelay: 1400 + index * 430,
        delay: index * 260,
        ease: 'Quad.easeOut'
      }));
    });
  };

  if (motionReduced) resetAmbientPose();
  else startAmbient();

  return {
    objects,
    flags,
    flares,
    flashes,
    pools,
    tweens,

    /** Surge the props for the length of a goal celebration. */
    celebrate() {
      if (motionReduced) return;
      flares.forEach((flare) => {
        scene.tweens.add({
          targets: flare.bloom,
          alpha: 0.7,
          displayWidth: 52,
          displayHeight: 46,
          duration: 150,
          hold: 520,
          yoyo: true,
          ease: 'Quad.easeOut'
        });
      });
      pools.forEach((pool) => {
        scene.tweens.add({
          targets: pool,
          alpha: 0.3,
          duration: 130,
          hold: 540,
          yoyo: true,
          ease: 'Quad.easeOut'
        });
      });
      flags.forEach((flag, index) => {
        scene.tweens.add({
          targets: flag,
          angle: { from: -16, to: 16 },
          duration: 150 + index * 12,
          yoyo: true,
          repeat: 3,
          ease: 'Sine.easeInOut'
        });
      });
    },

    setReducedMotion(reduced) {
      const next = Boolean(reduced);
      if (next === motionReduced) return;
      motionReduced = next;
      if (motionReduced) stopAmbient();
      else startAmbient();
    },

    destroy() {
      stopAmbient();
      objects.forEach((object) => object?.destroy?.());
      objects.length = 0;
      flags.length = 0;
      flares.length = 0;
      flashes.length = 0;
    }
  };
}
