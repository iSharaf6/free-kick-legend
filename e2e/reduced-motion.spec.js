import { test, expect } from '@playwright/test';
import { GamePage } from './game-page.js';

test('OS reduced motion reaches menu, Level Select, progress, locker, and match presentation', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const game = new GamePage(page);
  await game.open({ width: 1280, height: 720 });
  await expect(page.locator('html')).toHaveClass(/fkl-reduced-motion/);

  const menuBefore = await page.evaluate(() => {
    const scene = window.__game.scene.getScene('Menu');
    return {
      reducedMotion: scene.reducedMotion,
      crowdReduced: scene.crowdStand.reducedMotion,
      crowdTimer: scene.crowdStand.timer,
      crowdPoses: [...scene.crowdStand.currentPoses],
      kickerReduced: scene.kicker.reducedMotion,
      kickerAmbient: scene.kicker.ambient ?? null,
      fadeRunning: scene.cameras.main.fadeEffect.isRunning
    };
  });
  expect(menuBefore).toMatchObject({
    reducedMotion: true,
    crowdReduced: true,
    crowdTimer: null,
    crowdPoses: menuBefore.crowdPoses.map(() => 0),
    kickerReduced: true,
    kickerAmbient: null,
    fadeRunning: false
  });
  await page.waitForTimeout(250);
  expect(await page.evaluate(() => [
    ...window.__game.scene.getScene('Menu').crowdStand.currentPoses
  ])).toEqual(menuBefore.crowdPoses);

  await page.evaluate(() => window.__game.scene.getScene('Menu').scene.start('LevelSelect'));
  await page.waitForFunction(() => window.__game?.scene?.isActive('LevelSelect'));
  expect(await page.evaluate(() => {
    const scene = window.__game.scene.getScene('LevelSelect');
    return {
      reducedMotion: scene.reducedMotion,
      fadeRunning: scene.cameras.main.fadeEffect.isRunning
    };
  })).toEqual({ reducedMotion: true, fadeRunning: false });
  expect((await page.screenshot()).byteLength).toBeGreaterThan(10_000);

  await page.evaluate(() => window.__game.scene.getScene('LevelSelect').scene.start('Progress'));
  await page.waitForFunction(() => window.__game?.scene?.isActive('Progress'));
  expect(await page.evaluate(() => {
    const scene = window.__game.scene.getScene('Progress');
    const rows = scene.contentLayer.list.filter((item) => item?.type === 'Container');
    return {
      reducedMotion: scene.reducedMotion,
      fadeRunning: scene.cameras.main.fadeEffect.isRunning,
      rowsStatic: rows.every((row) => row.alpha === 1 && row.scaleX === 1 && row.scaleY === 1)
    };
  })).toEqual({ reducedMotion: true, fadeRunning: false, rowsStatic: true });

  await page.evaluate(() => window.__game.scene.getScene('Progress').scene.start('Locker', { category: 'ball' }));
  await page.waitForFunction(() => window.__game?.scene?.isActive('Locker'));
  expect(await page.evaluate(() => {
    const scene = window.__game.scene.getScene('Locker');
    return {
      reducedMotion: scene.reducedMotion,
      previewTween: scene.previewTween ?? null,
      kickerReduced: scene.kicker.reducedMotion,
      kickerAmbient: scene.kicker.ambient ?? null,
      fadeRunning: scene.cameras.main.fadeEffect.isRunning
    };
  })).toEqual({
    reducedMotion: true,
    previewTween: null,
    kickerReduced: true,
    kickerAmbient: null,
    fadeRunning: false
  });

  await page.evaluate(() => window.__game.scene.getScene('Locker').scene.start('Game', {
    mode: 'career', levelIndex: 40
  }));
  await page.waitForFunction(() => window.__fkl?.state === 'AIMING');
  expect(await page.evaluate(() => {
    const scene = window.__fkl;
    return {
      reducedMotion: scene.settings.reducedMotion,
      crowdReduced: scene.crowdTiers.reducedMotion,
      crowdTimer: scene.crowdTiers.timer,
      guardTweens: scene.securityGuardTweens.length,
      tracksideTimers: scene.tracksideTweens.length,
      cornerTweens: scene.cornerFlagTweens.length,
      threadTimer: scene.threadTimer,
      hoopPulses: [...scene.ringVisuals.values()].filter((visual) => visual.pulse).length,
      kickerAmbientEnabled: scene.kicker.ambientEnabled,
      kickerAmbient: scene.kicker.ambient ?? null
    };
  })).toEqual({
    reducedMotion: true,
    crowdReduced: true,
    crowdTimer: null,
    guardTweens: 0,
    tracksideTimers: 0,
    cornerTweens: 0,
    threadTimer: null,
    hoopPulses: 0,
    kickerAmbientEnabled: true,
    kickerAmbient: null
  });
});

test('match kicker can leave reduced motion without unrelated paused settings waking it', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const game = new GamePage(page);
  await game.open({ width: 1280, height: 720 });
  await page.evaluate(() => window.__game.scene.getScene('Menu').scene.start('Game', {
    mode: 'career', levelIndex: 0
  }));
  await page.waitForFunction(() => window.__fkl?.state === 'AIMING');

  expect(await page.evaluate(() => {
    const kicker = window.__fkl.kicker;
    return {
      reduced: kicker.reducedMotion,
      enabled: kicker.ambientEnabled,
      ambient: kicker.ambient ?? null
    };
  })).toEqual({ reduced: true, enabled: true, ambient: null });

  await page.evaluate(() => window.__fkl.applyLiveSettings({ reducedMotion: false }));
  expect(await page.evaluate(() => Boolean(window.__fkl.kicker.ambient))).toBe(true);

  await page.evaluate(() => {
    const scene = window.__fkl;
    scene.openPauseMenu();
    window.__pausedAmbient = scene.kicker.ambient;
    window.__pausedBob = scene.kicker.idleState.bob;
  });
  await page.waitForTimeout(160);
  await page.evaluate(() => window.__fkl.applyLiveSettings({ aimAssist: 'reduced' }));
  await page.waitForTimeout(220);
  expect(await page.evaluate(() => {
    const scene = window.__fkl;
    return {
      state: scene.state,
      sameTween: scene.kicker.ambient === window.__pausedAmbient,
      bob: scene.kicker.idleState.bob,
      pausedBob: window.__pausedBob,
      reduced: scene.kicker.reducedMotion
    };
  })).toEqual({
    state: 'PAUSED',
    sameTween: true,
    bob: await page.evaluate(() => window.__pausedBob),
    pausedBob: await page.evaluate(() => window.__pausedBob),
    reduced: false
  });

  await page.evaluate(() => {
    window.__fkl.applyLiveSettings({ reducedMotion: true });
    window.__fkl.closePauseMenu();
  });
  await page.waitForTimeout(220);
  expect(await page.evaluate(() => {
    const scene = window.__fkl;
    return {
      state: scene.state,
      reduced: scene.kicker.reducedMotion,
      ambient: scene.kicker.ambient ?? null,
      bob: scene.kicker.idleState.bob,
      swell: scene.kicker.idleState.swell
    };
  })).toEqual({ state: 'AIMING', reduced: true, ambient: null, bob: 0, swell: 0 });
});

test('live reduced motion replaces an active paused goal celebration with a static result', async ({ page }, testInfo) => {
  const game = new GamePage(page);
  await game.open({ width: 1280, height: 720 });
  await page.evaluate(() => window.__game.scene.getScene('Menu').scene.start('Game', {
    mode: 'arcade'
  }));
  await page.waitForFunction(() => window.__fkl?.state === 'AIMING');

  await page.evaluate(() => {
    Object.assign(window.__fkl, {
      lastShot: { power: 0.94, spin: 0.22, vx: 0, vy: 7.5, vz: 24 },
      activeTarget: null
    });
    window.__fkl.resolve('GOAL', { x: 0, y: 1.45 });
  });
  await page.waitForFunction(() => [...(window.__fkl?.goalCelebration?.objects ?? [])]
    .some((object) => object.type === 'Container'));

  const session = await page.evaluate(() => {
    const scene = window.__fkl;
    scene.openPauseMenu();
    window.__animatedCelebrationObjects = [...scene.goalCelebration.objects];
    return {
      token: scene.sessionToken,
      attempt: scene.attempt,
      score: scene.score,
      returnState: scene.pauseReturnState
    };
  });
  await page.evaluate(() => window.__fkl.applyLiveSettings({ reducedMotion: true }));

  expect(await page.evaluate(() => {
    const scene = window.__fkl;
    const objects = [...scene.goalCelebration.objects];
    const fountains = objects.filter((object) => object.texture?.key === 'goal-spark-fountain-v3');
    const card = objects.find((object) => object.type === 'Container');
    return {
      state: scene.state,
      token: scene.sessionToken,
      attempt: scene.attempt,
      score: scene.score,
      returnState: scene.pauseReturnState,
      celebrationReduced: scene.goalCelebration.active?.reduced,
      oldObjectsDestroyed: window.__animatedCelebrationObjects.every((object) => !object.active),
      fountainFrames: fountains.map((fountain) => fountain.frame.name),
      fountainsStatic: fountains.every((fountain) => !fountain.anims.isPlaying),
      cardX: card?.x,
      objectTweens: objects.reduce((count, object) => count + scene.tweens.getTweensOf(object).length, 0),
      kickerReduced: scene.kicker.reducedMotion,
      kickerPose: scene.kicker.pose,
      kickerAmbient: scene.kicker.ambient ?? null,
      actionState: { ...scene.kicker.actState }
    };
  })).toEqual({
    state: 'PAUSED',
    token: session.token,
    attempt: session.attempt,
    score: session.score,
    returnState: session.returnState,
    celebrationReduced: true,
    oldObjectsDestroyed: true,
    fountainFrames: [3, 3, 3, 3, 3, 3],
    fountainsStatic: true,
    cardX: 82,
    objectTweens: 0,
    kickerReduced: true,
    kickerPose: 'celebrate',
    kickerAmbient: null,
    actionState: { lunge: 0, lift: 0, tilt: 0, squashX: 1, squashY: 1 }
  });

  await testInfo.attach('reduced-goal-celebration', {
    body: await page.screenshot(),
    contentType: 'image/png'
  });

  await page.evaluate(() => window.__fkl.closePauseMenu());
  await page.waitForTimeout(180);
  expect(await page.evaluate(() => {
    const scene = window.__fkl;
    return {
      state: scene.state,
      reduced: scene.settings.reducedMotion,
      celebrationReduced: scene.goalCelebration.active?.reduced,
      objectTweens: [...scene.goalCelebration.objects]
        .reduce((count, object) => count + scene.tweens.getTweensOf(object).length, 0),
      kickerAmbient: scene.kicker.ambient ?? null,
      bob: scene.kicker.idleState.bob,
      lift: scene.kicker.actState.lift
    };
  })).toEqual({
    state: 'RESULT',
    reduced: true,
    celebrationReduced: true,
    objectTweens: 0,
    kickerAmbient: null,
    bob: 0,
    lift: 0
  });
});

test('live reduced-motion toggle rebuilds ambient weather without changing match state', async ({ page }) => {
  const game = new GamePage(page);
  await game.open({ width: 1280, height: 720 });
  await page.evaluate(() => window.__game.scene.getScene('Menu').scene.start('Game', {
    mode: 'career', levelIndex: 42
  }));
  await page.waitForFunction(() => window.__fkl?.state === 'AIMING');
  await page.evaluate(() => {
    window.__fkl.openPauseMenu();
    window.__ambientBefore = {
      hazards: [...window.__fkl.hazardVisuals],
      trackside: [...window.__fkl.tracksideObjects],
      flags: [...window.__fkl.cornerFlags]
    };
  });
  await page.waitForFunction(() => window.__fkl?.state === 'PAUSED');
  const session = await page.evaluate(() => ({
    token: window.__fkl.sessionToken,
    attempt: window.__fkl.attempt,
    score: window.__fkl.score,
    pauseReturnState: window.__fkl.pauseReturnState
  }));

  await page.evaluate(() => window.__fkl.applyLiveSettings({ reducedMotion: true }));
  expect(await page.evaluate(() => {
    const scene = window.__fkl;
    return {
      state: scene.state,
      token: scene.sessionToken,
      attempt: scene.attempt,
      score: scene.score,
      pauseReturnState: scene.pauseReturnState,
      crowdTimer: scene.crowdTiers.timer,
      guardTweens: scene.securityGuardTweens.length,
      tracksideTimers: scene.tracksideTweens.length,
      cornerTweens: scene.cornerFlagTweens.length,
      hazardTweens: scene.hazardMotionTweens.length,
      snowEmitters: scene.snowEmitters.length,
      oldObjectsDestroyed: [
        ...window.__ambientBefore.hazards,
        ...window.__ambientBefore.trackside,
        ...window.__ambientBefore.flags
      ].every((object) => !object.active),
      targetAlpha: scene.targetGfx.alpha
    };
  })).toEqual({
    state: 'PAUSED',
    token: session.token,
    attempt: session.attempt,
    score: session.score,
    pauseReturnState: session.pauseReturnState,
    crowdTimer: null,
    guardTweens: 0,
    tracksideTimers: 0,
    cornerTweens: 0,
    hazardTweens: 0,
    snowEmitters: 0,
    oldObjectsDestroyed: true,
    targetAlpha: 0.92
  });

  await page.evaluate(() => window.__fkl.applyLiveSettings({ reducedMotion: false }));
  expect(await page.evaluate(() => {
    const scene = window.__fkl;
    return {
      state: scene.state,
      token: scene.sessionToken,
      attempt: scene.attempt,
      score: scene.score,
      crowdRunning: Boolean(scene.crowdTiers.timer),
      guardTweens: scene.securityGuardTweens.length,
      guards: scene.securityGuards.length,
      tracksideTimers: scene.tracksideTweens.length,
      cornerTweens: scene.cornerFlagTweens.length,
      flags: scene.cornerFlags.length,
      hazardTweens: scene.hazardMotionTweens.length,
      targetTweens: scene.tweens.getTweensOf(scene.targetGfx).length
    };
  })).toMatchObject({
    state: 'PAUSED',
    token: session.token,
    attempt: session.attempt,
    score: session.score,
    crowdRunning: true,
    guardTweens: 6,
    guards: 6,
    tracksideTimers: 2,
    hazardTweens: 2,
    targetTweens: 1
  });
  expect(await page.evaluate(() => {
    const scene = window.__fkl;
    return scene.cornerFlagTweens.length === scene.cornerFlags.length;
  })).toBe(true);
});

test('live reduced-motion toggle stops and restarts thread and active-hoop motion', async ({ page }) => {
  const game = new GamePage(page);
  await game.open({ width: 1280, height: 720 });
  await page.evaluate(() => window.__game.scene.getScene('Menu').scene.start('Game', {
    mode: 'career', levelIndex: 40
  }));
  await page.waitForFunction(() => window.__fkl?.state === 'AIMING');
  const before = await page.evaluate(() => ({
    token: window.__fkl.sessionToken,
    attempt: window.__fkl.attempt,
    ringProgress: JSON.stringify(window.__fkl.ringProgress),
    threadRunning: Boolean(window.__fkl.threadTimer),
    hoopPulses: [...window.__fkl.ringVisuals.values()].filter((visual) => visual.pulse).length
  }));
  expect(before).toMatchObject({ threadRunning: true, hoopPulses: 1 });

  await page.evaluate(() => window.__fkl.applyLiveSettings({ reducedMotion: true }));
  expect(await page.evaluate(() => ({
    state: window.__fkl.state,
    token: window.__fkl.sessionToken,
    attempt: window.__fkl.attempt,
    ringProgress: JSON.stringify(window.__fkl.ringProgress),
    threadTimer: window.__fkl.threadTimer,
    threadFlow: window.__fkl.threadFlow,
    hoopPulses: [...window.__fkl.ringVisuals.values()].filter((visual) => visual.pulse).length
  }))).toEqual({
    state: 'AIMING',
    token: before.token,
    attempt: before.attempt,
    ringProgress: before.ringProgress,
    threadTimer: null,
    threadFlow: 0,
    hoopPulses: 0
  });

  await page.evaluate(() => window.__fkl.applyLiveSettings({ reducedMotion: false }));
  expect(await page.evaluate(() => ({
    state: window.__fkl.state,
    token: window.__fkl.sessionToken,
    attempt: window.__fkl.attempt,
    ringProgress: JSON.stringify(window.__fkl.ringProgress),
    threadRunning: Boolean(window.__fkl.threadTimer),
    hoopPulses: [...window.__fkl.ringVisuals.values()].filter((visual) => visual.pulse).length
  }))).toEqual({
    state: 'AIMING',
    token: before.token,
    attempt: before.attempt,
    ringProgress: before.ringProgress,
    threadRunning: true,
    hoopPulses: 1
  });
});
