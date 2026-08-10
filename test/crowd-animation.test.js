import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import {
  CROWD_ANIMATION,
  crowdAmbientPose,
  crowdCheerFramesForCohort,
  crowdCohortDefinitions,
  crowdCohortFrameName,
  crowdCohortFrames,
  crowdCohortLayout,
  crowdCohortSourceRect,
  crowdDisplayScale,
  crowdGoalFramesForCohort,
  crowdPanelLayout,
  crowdPoseFrameName,
  crowdPoseFrames,
  crowdPoseSourceRect,
  crowdStaticFrameName,
  crowdStaticFrames
} from '../src/data/crowdAnimation.js';
import { CROWD_STAND } from '../src/data/crowdStand.js';

function pngDimensions(path) {
  const header = fs.readFileSync(path).subarray(0, 24);
  assert.equal(header.toString('ascii', 1, 4), 'PNG');
  return {
    width: header.readUInt32BE(16),
    height: header.readUInt32BE(20)
  };
}

test('v3 atlas drives six independent deterministic supporter cohorts', () => {
  assert.deepEqual(CROWD_ANIMATION.states, {
    idle: 0,
    chant: 1,
    arms: 2,
    jump: 3,
    tifo: 4,
    flags: 5
  });
  assert.equal(new Set(Object.values(CROWD_ANIMATION.states)).size, 6);
  assert.equal(CROWD_ANIMATION.panelCount, 2);
  assert.deepEqual(CROWD_ANIMATION.panelPhaseOffsets, [0, 1]);
  assert.equal(CROWD_ANIMATION.cohortsPerPanel, 3);
  assert.equal(CROWD_ANIMATION.cohortCount, 6);
  assert.deepEqual(CROWD_ANIMATION.staticPanelPoses, [0, 1],
    'the two immutable half-panels are different authored states');

  const patterns = CROWD_ANIMATION.cohortAmbientPatterns;
  assert.equal(patterns.length, 6);
  assert.equal(new Set(patterns.map((pattern) => pattern.join(','))).size, 6);
  patterns.forEach((pattern) => {
    assert.equal(pattern.length, 8);
    assert.ok(pattern.every((pose) => pose === 0 || pose === 1));
    assert.ok(pattern.some((pose, index) => pose === pattern[(index + 1) % pattern.length]),
      'every cohort contains a calm held beat');
  });
  for (let left = 0; left < 3; left++) {
    for (let tick = 0; tick < patterns[left].length; tick++) {
      assert.notEqual(crowdAmbientPose(left, tick), crowdAmbientPose(left + 3, tick),
        `matching source windows ${left}/${left + 3} never repeat in tick ${tick}`);
    }
  }

  for (let index = 0; index < 3; index++) {
    assert.equal(crowdGoalFramesForCohort(index).includes(CROWD_ANIMATION.states.tifo), true);
    assert.equal(crowdGoalFramesForCohort(index).includes(CROWD_ANIMATION.states.flags), false);
  }
  for (let index = 3; index < 6; index++) {
    assert.equal(crowdGoalFramesForCohort(index).includes(CROWD_ANIMATION.states.flags), true);
    assert.equal(crowdGoalFramesForCohort(index).includes(CROWD_ANIMATION.states.tifo), false);
  }
  assert.notDeepEqual(crowdCheerFramesForCohort(0), crowdCheerFramesForCohort(1));
});

test('the published crowd asset is the exact generated 2x3 v3 atlas', () => {
  const runtimePath = new URL(
    '../public/assets/hd/crowd-animation-sheet-v3.png',
    import.meta.url
  );
  const sourcePath = new URL(
    '../assets/source/crowd-animation-sheet-v3.png',
    import.meta.url
  );
  const expected = {
    width: CROWD_ANIMATION.frameWidth * CROWD_ANIMATION.columns,
    height: CROWD_ANIMATION.frameHeight * CROWD_ANIMATION.rows
  };

  assert.deepEqual(expected, {
    width: CROWD_ANIMATION.sourceWidth,
    height: CROWD_ANIMATION.sourceHeight
  });
  assert.deepEqual(pngDimensions(runtimePath), expected);
  assert.deepEqual(pngDimensions(sourcePath), expected);
  assert.equal(CROWD_ANIMATION.assetPath, 'assets/hd/crowd-animation-sheet-v3.png');
  assert.equal(CROWD_ANIMATION.textureKey, 'crowd-animation-v3');
});

test('every complete pose crops the same composed band from its own cell', () => {
  const frames = crowdPoseFrames();
  assert.equal(frames.length, CROWD_ANIMATION.frameCount);
  assert.equal(new Set(frames.map(({ name }) => name)).size, frames.length);

  frames.forEach((frame, index) => {
    const cellX = (index % CROWD_ANIMATION.columns) * CROWD_ANIMATION.frameWidth;
    const cellY = Math.floor(index / CROWD_ANIMATION.columns) * CROWD_ANIMATION.frameHeight;
    assert.equal(frame.name, crowdPoseFrameName(index));
    assert.deepEqual(
      { x: frame.x, y: frame.y, width: frame.width, height: frame.height },
      crowdPoseSourceRect(index)
    );
    assert.equal(frame.x, cellX + CROWD_ANIMATION.crop.x);
    assert.equal(frame.y, cellY + CROWD_ANIMATION.crop.y);
    assert.ok(frame.x >= cellX && frame.x + frame.width <= cellX + CROWD_ANIMATION.frameWidth);
    assert.ok(frame.y >= cellY && frame.y + frame.height <= cellY + CROWD_ANIMATION.frameHeight);
  });

  assert.ok(CROWD_ANIMATION.crop.y >= 30 && CROWD_ANIMATION.crop.y <= 40);
  assert.ok(CROWD_ANIMATION.crop.height >= 260 && CROWD_ANIMATION.crop.height <= 280);
});

test('immutable architecture uses two distinct authored plates', () => {
  const frames = crowdStaticFrames();
  assert.equal(frames.length, 2);
  assert.deepEqual(frames.map(({ name }) => name), [
    crowdStaticFrameName(0),
    crowdStaticFrameName(1)
  ]);
  assert.deepEqual(frames.map(({ pose }) => pose), [0, 1]);
  assert.notEqual(frames[0].x, frames[1].x,
    'the right half samples the second authored atlas cell instead of repeating the first');
});

test('six animation windows leave architecture aisles, roof and rail on the static layer', () => {
  const definitions = crowdCohortDefinitions();
  assert.equal(definitions.length, 6);
  assert.equal(new Set(definitions.map(({ panelIndex, windowIndex }) => (
    `${panelIndex}:${windowIndex}`
  ))).size, 6);

  const windows = CROWD_ANIMATION.panelCohortWindows;
  windows.forEach((window, index) => {
    assert.ok(window.x >= 0);
    assert.ok(window.x + window.width <= CROWD_ANIMATION.crop.width);
    if (index > 0) {
      const previous = windows[index - 1];
      assert.ok(window.x > previous.x + previous.width,
        'a static architectural lane separates neighbouring cohorts');
    }
  });
  assert.ok(CROWD_ANIMATION.cohortOverlay.y > 0, 'roofline stays static');
  assert.ok(
    CROWD_ANIMATION.cohortOverlay.y + CROWD_ANIMATION.cohortOverlay.height
      < CROWD_ANIMATION.crop.height,
    'front rail stays static'
  );

  const frames = crowdCohortFrames();
  assert.equal(frames.length, 6 * CROWD_ANIMATION.frameCount);
  assert.equal(new Set(frames.map(({ name }) => name)).size, frames.length);
  frames.forEach((frame) => {
    const poseRect = crowdPoseSourceRect(frame.pose);
    assert.equal(frame.name, crowdCohortFrameName(frame.cohortIndex, frame.pose));
    assert.deepEqual(
      { x: frame.x, y: frame.y, width: frame.width, height: frame.height },
      crowdCohortSourceRect(frame.cohortIndex, frame.pose)
    );
    assert.ok(frame.x >= poseRect.x && frame.x + frame.width <= poseRect.x + poseRect.width);
    assert.ok(frame.y > poseRect.y);
    assert.ok(frame.y + frame.height < poseRect.y + poseRect.height);
  });
});

test('all crowd layers use one scalar and cannot stretch the atlas', () => {
  for (const width of [320, 480, 720]) {
    const scale = crowdDisplayScale(width);
    const renderedWidth = CROWD_ANIMATION.crop.width * scale;
    const renderedHeight = CROWD_ANIMATION.crop.height * scale;
    assert.equal(renderedWidth, width / CROWD_ANIMATION.panelCount);
    assert.ok(Math.abs(
      renderedWidth / renderedHeight
        - CROWD_ANIMATION.crop.width / CROWD_ANIMATION.crop.height
    ) < Number.EPSILON * 4);
    crowdCohortLayout(width).forEach((cohort) => assert.equal(cohort.scale, scale));
  }

  assert.equal(CROWD_ANIMATION.panelDisplayWidth, 240);
  assert.equal(crowdDisplayScale(480), 0.3125);
  assert.equal(CROWD_ANIMATION.displayHeight, 85);
  assert.throws(() => crowdDisplayScale(0), /positive view width/);
  assert.throws(() => crowdDisplayScale(Number.NaN), /positive view width/);
});

test('panel and cohort layouts align exactly with caller offsets', () => {
  const panels = crowdPanelLayout(480, 17);
  assert.deepEqual(panels.map(({ x, width, height, scale }) => ({
    x, width, height, scale
  })), [
    { x: 17, width: 240, height: 85, scale: 0.3125 },
    { x: 257, width: 240, height: 85, scale: 0.3125 }
  ]);
  assert.equal(panels[0].x + panels[0].width, panels[1].x);
  assert.equal(panels.at(-1).x + panels.at(-1).width, 497);

  const cohorts = crowdCohortLayout(480, 17, 9);
  assert.equal(cohorts.length, 6);
  cohorts.forEach((cohort) => {
    const panel = panels[cohort.panelIndex];
    assert.ok(cohort.x >= panel.x);
    assert.ok(cohort.x + cohort.width <= panel.x + panel.width);
    assert.equal(cohort.y, 9 + CROWD_ANIMATION.cohortOverlay.y * cohort.scale);
  });
  for (let index = 0; index < 3; index++) {
    assert.equal(cohorts[index + 3].x - cohorts[index].x, 240);
    assert.equal(cohorts[index + 3].width, cohorts[index].width);
  }
  assert.throws(() => crowdPanelLayout(480, Number.NaN), /x must be finite/);
  assert.throws(() => crowdCohortLayout(480, 0, Number.NaN), /top must be finite/);
});

test('runtime crossfades supporter cohorts while architecture frames stay immutable', () => {
  const source = fs.readFileSync(new URL('../src/art/CrowdStand.js', import.meta.url), 'utf8');

  assert.match(source, /registerCrowdAnimationFrames/);
  assert.match(source, /for \(const panel of crowdPanelLayout\(viewWidth, x\)\)/);
  assert.match(source, /for \(const layout of crowdCohortLayout\(viewWidth, x, top\)\)/);
  assert.match(source, /crowdStaticFrameName\(panel\.index\)/);
  assert.match(source, /next\.setFrame\(crowdCohortFrameName\(cohortIndex, frame\)\)/);
  assert.match(source, /const nextIndex = 1 - cohort\.activeLayer/);
  assert.match(source, /ease: 'Sine\.easeInOut'/);
  assert.match(source, /crowdGoalFramesForCohort/);
  assert.doesNotMatch(source, /setFrame\(crowdStaticFrameName/,
    'static architecture is chosen only at construction and never swapped');
  assert.doesNotMatch(source, /buildCrowdTierLayout|crowdWaveLift|CROWD_STAND\.textureKey/);
  assert.doesNotMatch(source, /\.setY\(/, 'supporter animation never fakes a pose with y bobbing');
  assert.doesNotMatch(source, /\.setDisplaySize\(/, 'supporter animation never sets two dimensions');
  assert.doesNotMatch(
    source,
    /\.scaleX\s*=|\.scaleY\s*=|displayWidth\s*=|displayHeight\s*=/,
    'supporter animation never mutates one axis'
  );

  const scaleCalls = source.match(/setScale\([^)]*\)/g) || [];
  assert.equal(scaleCalls.length, 1, 'every crowd image passes one uniform scalar through one helper');
  assert.equal(scaleCalls[0].includes(','), false);
});

test('runtime API includes ambient, cheer, goal, accessibility and cleanup paths', () => {
  const source = fs.readFileSync(new URL('../src/art/CrowdStand.js', import.meta.url), 'utf8');
  for (const method of [
    'startAmbient',
    'applyAmbient',
    'playCheer',
    'cheer',
    'playGoal',
    'setReducedMotion',
    'destroy'
  ]) {
    assert.match(source, new RegExp(`\\b${method}\\(`), `controller exposes ${method}`);
  }
  assert.match(source, /this\.scheduled\.forEach\(\(timer\) => timer\?\.remove\?\.\(false\)\)/);
  assert.match(source, /this\.baseSprites\.forEach\(\(sprite\) => sprite\?\.destroy\?\.\(\)\)/);
  assert.match(source, /this\.sprites\.forEach\(\(sprite\) => sprite\?\.destroy\?\.\(\)\)/);
  assert.match(source, /this\.dressing\?\.destroy\?\.\(\)/);
});

test('ambient crossfades are restrained while celebrations have a readable arc', () => {
  assert.ok(CROWD_ANIMATION.ambientFrameMs >= 300);
  assert.ok(CROWD_ANIMATION.ambientTransitionMs < CROWD_ANIMATION.ambientFrameMs);
  assert.ok(CROWD_ANIMATION.cheerTransitionMs < CROWD_ANIMATION.cheerFrameMs);
  assert.ok(CROWD_ANIMATION.goalTransitionMs < CROWD_ANIMATION.goalFrameMs);

  const goalDuration = Math.max(
    CROWD_ANIMATION.goalTifoFrames.length,
    CROWD_ANIMATION.goalFlagFrames.length
  ) * CROWD_ANIMATION.goalFrameMs + Math.max(...CROWD_ANIMATION.goalCohortDelaysMs);
  const cheerDuration = CROWD_ANIMATION.cheerFrames.length * CROWD_ANIMATION.cheerFrameMs
    + Math.max(...CROWD_ANIMATION.cheerCohortDelaysMs);
  assert.ok(goalDuration >= 1100 && goalDuration <= 1500,
    `goal animation has broadcast-readable timing (${goalDuration}ms)`);
  assert.ok(cheerDuration < goalDuration, 'a routine cheer is shorter than a goal celebration');
  assert.equal(CROWD_ANIMATION.goalTifoFrames.at(-1), CROWD_ANIMATION.states.idle);
  assert.equal(CROWD_ANIMATION.goalFlagFrames.at(-1), CROWD_ANIMATION.states.idle);
});

test('reduced motion holds tifo and flags without starting frame loops', () => {
  const source = fs.readFileSync(new URL('../src/art/CrowdStand.js', import.meta.url), 'utf8');
  assert.match(source, /runReducedPoses\(/);
  assert.match(source, /instant: true/);
  assert.match(source, /CROWD_ANIMATION\.states\.tifo/);
  assert.match(source, /CROWD_ANIMATION\.states\.flags/);
  assert.ok(CROWD_ANIMATION.reducedCheerHoldMs >= 500);
  assert.ok(CROWD_ANIMATION.reducedGoalHoldMs >= 900);
});

test('supporter band aligns with existing stand dressing and depth budget', () => {
  const renderedBottom = CROWD_ANIMATION.top + CROWD_ANIMATION.displayHeight;
  assert.equal(renderedBottom, CROWD_STAND.tiers.at(-1).bottom);
  assert.ok(CROWD_ANIMATION.depth < CROWD_STAND.depthCeiling);
  assert.ok(CROWD_STAND.depthCeiling < 1.34);
});

test('upper tiers contain club cloth but no repeated pitch-side sponsor marks', () => {
  const source = fs.readFileSync(new URL('../src/art/StandDressing.js', import.meta.url), 'utf8');
  assert.match(source, /drawBanners\(upperBarrier/);
  assert.match(source, /drawBanners\(lowerBarrier/);
  assert.doesNotMatch(source, /calynx-logo-pixel|brandBack|placements\s*=\s*\[/i);
});

test('publisher and reproducibility note point only at the v3 asset', () => {
  const builder = fs.readFileSync(new URL('../scripts/build_crowd_sprites.py', import.meta.url), 'utf8');
  const prompt = fs.readFileSync(new URL(
    '../assets/source/crowd-animation-sheet-v3-prompt.md',
    import.meta.url
  ), 'utf8');

  assert.match(builder, /crowd-animation-sheet-v3\.png/g);
  assert.doesNotMatch(builder, /sheet-v2|sheet-hd/);
  assert.match(prompt, /2-column by 3-row atlas/);
  assert.match(prompt, /Tifo celebration/);
  assert.match(prompt, /Peak celebration/);
  assert.match(prompt, /two complete crowd panels side by side/);
  assert.match(prompt, /240x85/);
});
