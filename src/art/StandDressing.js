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
// The crowd panorama is the visual authority. These props only frame that art:
// they use its navy, gold and warm-white family without grading the supporters
// into a different palette or laying a fake hardware treatment over them.

const FLAG_TEXTURE = 'crowd-flag-v1';
const GLOW_TEXTURE = 'crowd-glow-v2';

// Flag movement is a short sprite animation, matching the authored crowd's
// deliberate poses while avoiding continuously warped pixel edges.
const FLAG_FLUTTER_FRAMES = Object.freeze([0, 1, 2, 1]);
const FLAG_FLUTTER_MS = 96;

// One coherent fictional club identity: midnight navy, matchday gold and warm
// scarf cream. Keeping every flag in this family makes the end read as a home
// support rather than a row of unrelated racing markers.
const FLAG_COLOURS = Object.freeze([
  0x17365d, 0xf3c449, 0x17365d, 0xf3e7c3, 0xf3c449, 0x254f7a
]);
const BANNER_COLOURS = Object.freeze([
  Object.freeze({ cloth: 0x17365d, stripe: 0xf3c449, trim: 0xf3e7c3 }),
  Object.freeze({ cloth: 0xf3c449, stripe: 0x17365d, trim: 0xf3e7c3 }),
  Object.freeze({ cloth: 0xf3e7c3, stripe: 0x17365d, trim: 0xf3c449 })
]);

// Wide light zones imply modern roof-mounted LED arrays without drawing a
// competing floodlight prop over the supporters.
const STADIUM_LIGHT_COLUMNS = Object.freeze([80, 240, 400]);

/** Smooth, neutral exposure falloff that leaves the authored colours intact. */
function drawModernStandShade(gfx, viewWidth, back, front) {
  const top = back.top - 8;
  const height = front.bottom - top;

  // A shallow roof falloff establishes depth without crushing the back row.
  gfx.fillGradientStyle(PAL.ink, PAL.ink, PAL.ink, PAL.ink, 0.24, 0.24, 0.015, 0.015);
  gfx.fillRect(0, top, viewWidth, height);

  // Soft edge falloff keeps the light centred on the pitch. There are no
  // palette steps or dither patterns, only neutral luminance over the sprites.
  const edgeWidth = Math.min(92, viewWidth * 0.2);
  gfx.fillGradientStyle(PAL.ink, PAL.ink, PAL.ink, PAL.ink, 0.13, 0, 0.07, 0);
  gfx.fillRect(0, top, edgeWidth, height);
  gfx.fillGradientStyle(PAL.ink, PAL.ink, PAL.ink, PAL.ink, 0, 0.13, 0, 0.07);
  gfx.fillRect(viewWidth - edgeWidth, top, edgeWidth, height);
}

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
    // Lighting is intentionally smooth even though the people remain crisp.
    // That separation mirrors late-1990s arcade art: detailed sprite sheets sit
    // inside richer, higher-resolution atmosphere instead of being globally
    // forced through the same low-colour treatment.
    const texture = scene.textures.createCanvas(GLOW_TEXTURE, 96, 96);
    const context = texture.getContext();
    const gradient = context.createRadialGradient(48, 48, 1, 48, 48, 47);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(0.16, 'rgba(255,255,255,0.9)');
    gradient.addColorStop(0.42, 'rgba(255,255,255,0.42)');
    gradient.addColorStop(0.72, 'rgba(255,255,255,0.12)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, 96, 96);
    texture.refresh();
    texture.setFilter(Phaser.Textures.FilterMode.LINEAR);
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
  // The thin safety rail is separated from the concrete by one row of air.
  // That negative line makes the structure occlude supporters instead of
  // looking like another coloured stripe painted across them.
  gfx.fillStyle(PAL.borderDark, 0.62).fillRect(0, y - 2, 480, 1);
  for (let x = 6; x < 480; x += stanchionStep) {
    gfx.fillStyle(PAL.borderDark, 0.7).fillRect(x, y - 2, 1, 3);
  }
  gfx.fillStyle(PAL.ink, 0.96).fillRect(0, y, 480, height);
  gfx.fillStyle(PAL.borderDark, 0.5).fillRect(0, y, 480, 1);
  gfx.fillStyle(PAL.border, lit).fillRect(0, y + 1, 480, 1);
  for (let x = 6; x < 480; x += stanchionStep) {
    gfx.fillStyle(PAL.borderDark, 0.32).fillRect(x, y + 2, 1, height - 2);
  }
  // The shadow the barrier throws down onto the tier in front of it. Without
  // it the band floats; with it the two tiers are lit by the same lamps.
  gfx.fillStyle(PAL.ink, 0.7).fillRect(0, y + height, 480, 1);
  gfx.fillStyle(PAL.ink, 0.38).fillRect(0, y + height + 1, 480, 1);
}

/** Proper club tifos: scarf hoops, shirt stripes, checks and a tiny crest. */
function drawBanners(gfx, y, random, count) {
  for (let i = 0; i < count; i++) {
    const width = 34 + Math.floor(random() * 28);
    const x = Math.floor(random() * (480 - width));
    const { cloth, stripe, trim } = BANNER_COLOURS[i % BANNER_COLOURS.length];
    const pattern = i % 3;

    // Dark stitched outline, two hanging corners and visible rail ties.
    gfx.fillStyle(PAL.ink, 0.96).fillRect(x - 1, y - 1, width + 2, 9);
    gfx.fillStyle(cloth, 0.98).fillRect(x, y, width, 7);
    gfx.fillStyle(trim, 0.9).fillRect(x, y, width, 1);
    gfx.fillStyle(PAL.goldDark, 1).fillRect(x + 2, y - 1, 2, 1);
    gfx.fillStyle(PAL.goldDark, 1).fillRect(x + width - 4, y - 1, 2, 1);

    if (pattern === 0) {
      // Football-shirt vertical stripes.
      for (let sx = x + 3; sx < x + width - 2; sx += 7) {
        gfx.fillStyle(stripe, 0.94).fillRect(sx, y + 1, 3, 6);
      }
    } else if (pattern === 1) {
      // Supporters' scarf hoops.
      gfx.fillStyle(stripe, 0.96).fillRect(x, y + 2, width, 2);
      gfx.fillStyle(trim, 0.88).fillRect(x, y + 5, width, 1);
    } else {
      // Large checks that remain readable at the authored 480x270 canvas.
      for (let cx = 0; cx < width; cx += 6) {
        gfx.fillStyle(stripe, 0.96).fillRect(x + cx, y + 1, Math.min(3, width - cx), 3);
        gfx.fillStyle(stripe, 0.96).fillRect(x + cx + 3, y + 4, Math.min(3, width - cx - 3), 3);
      }
    }

    // A small shield motif in the middle gives every cloth a club identity.
    const crestX = x + Math.floor(width / 2) - 2;
    gfx.fillStyle(PAL.ink, 1).fillRect(crestX - 1, y + 1, 6, 6);
    gfx.fillStyle(trim, 1).fillRect(crestX, y + 1, 4, 4);
    gfx.fillStyle(trim, 1).fillRect(crestX + 1, y + 5, 2, 1);
    gfx.fillStyle(cloth, 1).fillRect(crestX + 1, y + 2, 2, 2);

    // Stitched hem and a couple of heavy folds stop the cloth reading as UI.
    gfx.fillStyle(PAL.ink, 0.5).fillRect(x, y + 6, width, 1);
    gfx.fillStyle(PAL.ink, 0.34).fillRect(x + 8, y + 1, 1, 5);
    gfx.fillStyle(PAL.ink, 0.34).fillRect(x + width - 9, y + 1, 1, 5);
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

  // Sponsor inventory belongs to the pitch-side LED ribbon. Repeating the same
  // Calynx wordmark across two upper-tier fascias made the stand look like UI
  // wallpaper and competed with the authored supporter banners, so the terrace
  // now carries club cloth only.

  // Vomitories cut up through the back tier and stop at its barrier. Carrying
  // them further down only ever showed fragments between the front rows' heads,
  // which read as holes in the render rather than as openings in the stand.
  const vomitories = track(scene.add.graphics().setDepth(at(1.15)));
  for (const x of [64, 186, 302, 424]) drawVomitory(vomitories, x, back.top - 1, mid.top - 3);

  // ------------------------------------------------------------------- light
  // The shading pass goes over every tier and under every prop. It is a smooth,
  // neutral exposure layer, never a palette replacement for the crowd art.
  const shade = track(scene.add.graphics().setDepth(at(1.302)));
  drawModernStandShade(shade, viewWidth, back, front);

  const pools = STADIUM_LIGHT_COLUMNS.map((x, index) => {
    const pool = track(scene.add.image(x, back.top + 4, GLOW_TEXTURE)
      .setDisplaySize(index === 1 ? 236 : 210, 132)
      .setTint(0xf4fbff)
      // Broad, low-opacity LED spill lifts highlights while the authored navy,
      // gold, red and skin tones remain fully recognisable.
      .setAlpha(index === 1 ? 0.075 : 0.058)
      .setDepth(at(1.303))
      .setBlendMode(Phaser.BlendModes.ADD));
    pool.fklBaseAlpha = pool.alpha;
    return pool;
  });

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
      // Back flags share the rear tier exposure; front flags retain the cloth's
      // saturated club colours instead of fading into the architecture.
      .setAlpha(inBack ? 0.76 : 0.94)
      .setFlipX(random() < 0.5)
      .setDepth(at(1.305))));
    flags.at(-1).fklBaselineY = flags.at(-1).y;
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

  // Goal presentation gets a short contrast reserve over the stand. This sits
  // behind the dedicated celebration layer (1.34) but above the crowd detail,
  // so the scorer silhouettes and banner own the frame instead of every prop
  // peaking simultaneously.
  const celebrationVeil = track(scene.add.rectangle(
    viewWidth / 2,
    (back.top - 8 + front.bottom) / 2,
    viewWidth,
    front.bottom - back.top + 8,
    PAL.ink,
    1
  ).setAlpha(0).setDepth(at(1.329)));

  const tweens = [];
  const timers = [];
  let motionReduced = Boolean(reducedMotion);
  let flagPhase = 0;
  let celebrationUntil = 0;

  const resetAmbientPose = () => {
    flags.forEach((flag, index) => {
      flag?.setAngle?.(0).setY?.(flag.fklBaselineY);
      flag?.setFrame?.(FLAG_FLUTTER_FRAMES[index % FLAG_FLUTTER_FRAMES.length]);
    });
    flares.forEach((flare) => {
      flare.bloom?.setAlpha?.(0.32);
      flare.smoke?.setY?.(flare.baseY - 6).setAlpha?.(0.16);
    });
    pools.forEach((pool) => pool?.setAlpha?.(pool.fklBaseAlpha));
    flashes.forEach((flash) => flash?.setAlpha?.(0));
    celebrationVeil?.setAlpha?.(0);
  };

  const stopAmbient = () => {
    tweens.forEach((tween) => tween?.remove?.());
    tweens.length = 0;
    timers.forEach((timer) => timer?.remove?.(false));
    timers.length = 0;
    scene.tweens?.killTweensOf?.([
      ...flags,
      ...pools,
      ...flares.flatMap((flare) => [flare.bloom, flare.smoke, flare.core]),
      ...flashes,
      celebrationVeil
    ]);
    resetAmbientPose();
  };

  const startAmbient = () => {
    if (motionReduced || tweens.length || timers.length) return;
    timers.push(scene.time.addEvent({
      delay: FLAG_FLUTTER_MS,
      loop: true,
      callback: () => {
        flagPhase += (scene.time?.now ?? 0) < celebrationUntil ? 2 : 1;
        flags.forEach((flag, index) => {
          if (!flag?.active) return;
          const step = flagPhase + index;
          flag.setFrame(FLAG_FLUTTER_FRAMES[step % FLAG_FLUTTER_FRAMES.length]);
          flag.setY(flag.fklBaselineY - ((scene.time?.now ?? 0) < celebrationUntil && step % 2 ? 1 : 0));
        });
      }
    }));
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
    timers,

    /** Surge the props for the length of a goal celebration. */
    celebrate() {
      if (motionReduced) return;
      celebrationUntil = (scene.time?.now ?? 0) + 1040;
      scene.tweens.killTweensOf?.(celebrationVeil);
      celebrationVeil.setAlpha(0.18);
      scene.tweens.add({
        targets: celebrationVeil,
        alpha: 0,
        delay: 620,
        duration: 360,
        ease: 'Quad.easeIn'
      });
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
      pools.forEach((pool, index) => {
        scene.tweens.add({
          targets: pool,
          alpha: pool.fklBaseAlpha + (index === 1 ? 0.07 : 0.05),
          duration: 140,
          hold: 360,
          yoyo: true,
          ease: 'Quad.easeOut'
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
      timers.length = 0;
    }
  };
}
