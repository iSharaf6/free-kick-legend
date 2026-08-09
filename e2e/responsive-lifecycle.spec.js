import { test, expect } from '@playwright/test';
import { GamePage } from './game-page.js';

test('touch-sized match menu pauses gameplay and TAB still opens the same menu', async ({ page }) => {
  const game = new GamePage(page);
  await game.open({ width: 844, height: 390 });
  await game.startCareer();

  const control = await page.evaluate(() => {
    const scene = window.__fkl;
    const button = scene.menuButton;
    const canvas = document.querySelector('#app canvas').getBoundingClientRect();
    return {
      x: button.x,
      y: button.y,
      label: button.buttonLabel.text,
      visible: button.visible,
      cssHitWidth: button.input.hitArea.width * canvas.width / 480,
      cssHitHeight: button.input.hitArea.height * canvas.height / 270
    };
  });

  expect(control).toMatchObject({ label: 'II  MATCH MENU', visible: true });
  expect(control.cssHitWidth).toBeGreaterThanOrEqual(44);
  expect(control.cssHitHeight).toBeGreaterThanOrEqual(44);

  await game.clickLogical(control.x, control.y);
  await page.waitForFunction(() => window.__fkl?.state === 'PAUSED');
  await game.clickLogical(132, 162);
  await page.waitForFunction(() => window.__fkl?.state === 'AIMING');
  await page.keyboard.press('Tab');
  await page.waitForFunction(() => window.__fkl?.state === 'PAUSED');
});

test('active match recomputes compact HUD without restarting its session', async ({ page }) => {
  const game = new GamePage(page);
  await game.open({ width: 1280, height: 720 });
  await game.startCareer();

  const before = await page.evaluate(() => ({
    compact: window.__fkl.compactHud,
    fontSize: window.__fkl.matchHudText.style.fontSize,
    styleX: window.__fkl.careerStyleHud.text.x,
    sessionToken: window.__fkl.sessionToken,
    mode: window.__fkl.mode,
    levelIndex: window.__fkl.levelIndex,
    attempt: window.__fkl.attempt
  }));
  expect(before).toMatchObject({
    compact: false,
    fontSize: '4px',
    mode: 'career',
    levelIndex: 0,
    attempt: 1
  });

  await page.setViewportSize({ width: 844, height: 390 });
  await page.waitForFunction(() => (
    window.__fkl?.compactHud === true && window.__fkl.matchHudText?.style?.fontSize === '5px'
  ));
  const compact = await page.evaluate(() => ({
    styleX: window.__fkl.careerStyleHud.text.x,
    sessionToken: window.__fkl.sessionToken,
    mode: window.__fkl.mode,
    levelIndex: window.__fkl.levelIndex,
    attempt: window.__fkl.attempt,
    state: window.__fkl.state
  }));
  expect(compact.styleX).toBeGreaterThan(before.styleX);
  expect(compact).toMatchObject({
    sessionToken: before.sessionToken,
    mode: before.mode,
    levelIndex: before.levelIndex,
    attempt: before.attempt,
    state: 'AIMING'
  });

  await page.setViewportSize({ width: 1280, height: 720 });
  await page.waitForFunction(() => (
    window.__fkl?.compactHud === false && window.__fkl.matchHudText?.style?.fontSize === '4px'
  ));
  expect(await page.evaluate(() => window.__fkl.sessionToken)).toBe(before.sessionToken);
});

test('large-tablet rotate gate freezes Time Attack and only resumes its own pause', async ({ page }) => {
  const game = new GamePage(page);
  await game.open({ width: 1366, height: 768 });
  await page.evaluate(() => {
    const menu = window.__game.scene.getScene('Menu');
    menu.scene.start('Game', {
      mode: 'arcade',
      score: 320,
      goals: 2,
      combo: 2,
      timeLeft: 42
    });
  });
  await page.waitForFunction(() => window.__fkl?.state === 'AIMING' && window.__fkl.timeLeft < 42);

  await page.setViewportSize({ width: 1024, height: 1366 });
  await expect(page.locator('#rotate')).toBeVisible();
  await page.waitForFunction(() => (
    window.__fkl?.state === 'PAUSED' && window.__fkl.rotateGatePauseActive === true
  ));
  const frozen = await page.evaluate(() => ({
    timeLeft: window.__fkl.timeLeft,
    score: window.__fkl.score,
    sessionToken: window.__fkl.sessionToken,
    timePaused: window.__fkl.time.paused,
    swipeEnabled: window.__fkl.swipe.enabled
  }));
  expect(frozen).toMatchObject({ score: 320, timePaused: true, swipeEnabled: false });

  await page.waitForTimeout(350);
  expect(await page.evaluate(() => window.__fkl.timeLeft)).toBeCloseTo(frozen.timeLeft, 2);
  await page.keyboard.press('Tab');
  expect(await page.evaluate(() => window.__fkl.state)).toBe('PAUSED');

  await page.setViewportSize({ width: 1366, height: 1024 });
  await expect(page.locator('#rotate')).toBeHidden();
  await page.waitForFunction(() => (
    window.__fkl?.state === 'AIMING' && window.__fkl.rotateGatePauseActive === false
  ));
  expect(await page.evaluate(() => ({
    score: window.__fkl.score,
    sessionToken: window.__fkl.sessionToken
  }))).toEqual({ score: 320, sessionToken: frozen.sessionToken });

  // A deliberate pause predating portrait must remain deliberate afterward.
  await page.keyboard.press('Tab');
  await page.waitForFunction(() => window.__fkl?.state === 'PAUSED');
  await page.setViewportSize({ width: 1024, height: 1366 });
  await page.waitForFunction(() => window.__fkl?.viewportPortrait === true);
  expect(await page.evaluate(() => window.__fkl.rotateGatePauseActive)).toBe(false);
  await page.setViewportSize({ width: 1366, height: 1024 });
  await page.waitForFunction(() => window.__fkl?.viewportPortrait === false);
  expect(await page.evaluate(() => window.__fkl.state)).toBe('PAUSED');
});
