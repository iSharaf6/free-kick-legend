import { test, expect } from '@playwright/test';
import { GamePage } from './game-page.js';

test('fifty varied shots leave no result, timer, or display-list residue', async ({ page }) => {
  test.setTimeout(120_000);
  const game = new GamePage(page);
  const runtimeErrors = [];
  page.on('pageerror', (error) => runtimeErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') runtimeErrors.push(message.text());
  });

  await game.open({ width: 1280, height: 720 });
  await page.evaluate(() => {
    window.__game.scene.getScene('Menu').scene.start('Game', {
      mode: 'arcade',
      timeLeft: 600
    });
  });
  await page.waitForFunction(() => window.__fkl?.state === 'AIMING');

  const samples = [];
  for (let index = 0; index < 50; index++) {
    const lane = (index % 7) - 3;
    const loft = 4.6 + (index % 5) * 1.25;
    const pace = 27 + (index % 4) * 1.35;
    const spin = ((index % 9) - 4) * 0.22;
    await page.evaluate(({ lane, loft, pace, spin }) => {
      window.__fkl.shootDebug(lane * 1.35, loft, pace, spin);
    }, { lane, loft, pace, spin });
    await page.waitForFunction(() => window.__fkl?.state === 'RESULT', null, { timeout: 8_000 });

    const sample = await page.evaluate((shotIndex) => {
      const scene = window.__fkl;
      const outcome = scene.banner?.text || '';
      scene.cancelScheduledCalls();
      scene.goalCelebration?.stop?.();
      scene.over = false;
      scene.resetAttempt();
      const activeChildren = scene.children.list.filter((child) => child?.active).length;
      const activeTweens = scene.tweens.getTweens?.().length ?? 0;
      return {
        shotIndex,
        outcome,
        activeChildren,
        activeTweens,
        scheduled: scene.scheduledCalls.size,
        celebrationObjects: scene.goalCelebration?.objects?.size ?? 0,
        celebrationTimers: scene.goalCelebration?.timers?.size ?? 0,
        walls: scene.walls.length,
        keepers: scene.keepers.length
      };
    }, index);
    samples.push(sample);
  }

  // Exercise the celebration controller repeatedly even when the seeded
  // Time Attack keeper happens to stop most of this run's real shots. These
  // are isolated outcome injections after the fifty actual launches above.
  const celebrationCycles = [];
  for (let cycle = 0; cycle < 5; cycle++) {
    await page.evaluate(() => {
      Object.assign(window.__fkl, {
        lastShot: { power: 0.92, spin: 0.18, vx: 0, vy: 7.2, vz: 27 },
        activeTarget: null
      });
      window.__fkl.resolve('GOAL', { x: 0, y: 1.45 });
    });
    await page.waitForFunction(() => window.__fkl?.state === 'RESULT');
    celebrationCycles.push(await page.evaluate(() => {
      const scene = window.__fkl;
      scene.cancelScheduledCalls();
      scene.goalCelebration?.stop?.();
      scene.over = false;
      scene.resetAttempt();
      return {
        objects: scene.goalCelebration?.objects?.size ?? 0,
        timers: scene.goalCelebration?.timers?.size ?? 0,
        scheduled: scene.scheduledCalls.size
      };
    }));
  }

  const childCounts = samples.map((sample) => sample.activeChildren);
  const tweenCounts = samples.map((sample) => sample.activeTweens);
  const firstHalfTweenFloor = Math.min(...tweenCounts.slice(0, 25));
  const secondHalfTweenFloor = Math.min(...tweenCounts.slice(25));
  // Goals deliberately add a short crowd/score surge, so unlike display-list
  // ownership the instantaneous tween count is outcome-dependent. A leak would
  // raise the steady-state floor in the second half and fail to return after
  // the final reaction drains.
  await page.waitForFunction((floor) => (
    (window.__fkl?.tweens?.getTweens?.().length ?? Infinity) <= floor + 2
  ), firstHalfTweenFloor, { timeout: 4_000 });
  const finalState = await page.evaluate(() => ({
    activeChildren: window.__fkl.children.list.filter((child) => child?.active).length,
    activeTweens: window.__fkl.tweens.getTweens?.().length ?? 0,
    scheduled: window.__fkl.scheduledCalls.size,
    celebrationObjects: window.__fkl.goalCelebration?.objects?.size ?? 0,
    celebrationTimers: window.__fkl.goalCelebration?.timers?.size ?? 0
  }));

  expect(samples.every((sample) => sample.outcome.length > 0)).toBe(true);
  expect(celebrationCycles).toEqual(Array.from({ length: 5 }, () => ({
    objects: 0,
    timers: 0,
    scheduled: 0
  })));
  expect(Math.max(...childCounts) - Math.min(...childCounts)).toBeLessThanOrEqual(2);
  expect(secondHalfTweenFloor).toBeLessThanOrEqual(firstHalfTweenFloor + 2);
  expect(finalState.activeChildren).toBeLessThanOrEqual(Math.min(...childCounts) + 2);
  expect(finalState.activeTweens).toBeLessThanOrEqual(firstHalfTweenFloor + 2);
  expect(finalState).toMatchObject({
    scheduled: 0,
    celebrationObjects: 0,
    celebrationTimers: 0
  });
  expect(samples.every((sample) => (
    sample.scheduled === 0 &&
    sample.celebrationObjects === 0 &&
    sample.celebrationTimers === 0 &&
    sample.walls <= 1 &&
    sample.keepers >= 1
  ))).toBe(true);
  expect(runtimeErrors).toEqual([]);
});

test('ten menu-to-locker transitions keep exactly one live scene and no runtime errors', async ({ page }) => {
  test.setTimeout(60_000);
  const game = new GamePage(page);
  const runtimeErrors = [];
  page.on('pageerror', (error) => runtimeErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') runtimeErrors.push(message.text());
  });

  await game.open({ width: 1280, height: 720 });
  for (let cycle = 0; cycle < 5; cycle++) {
    await game.clickLogical(350, 227);
    await page.waitForFunction(() => window.__game?.scene?.isActive('Locker'));
    expect(await page.evaluate(() => window.__game.scene.getScenes(true).map(
      (scene) => scene.sys.settings.key
    ))).toEqual(['Locker']);

    await game.clickLogical(23, 18);
    await page.waitForFunction(() => window.__game?.scene?.isActive('Menu'));
    expect(await page.evaluate(() => window.__game.scene.getScenes(true).map(
      (scene) => scene.sys.settings.key
    ))).toEqual(['Menu']);
  }

  expect(runtimeErrors).toEqual([]);
});
