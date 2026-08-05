import { test, expect } from '@playwright/test';
import { GamePage } from './game-page.js';

const LANDSCAPE_VIEWPORTS = [
  { width: 1920, height: 1080 },
  { width: 1440, height: 900 },
  { width: 1366, height: 768 },
  { width: 1280, height: 720 },
  { width: 844, height: 390 }
];

test('full logical frame is visible at every release landscape viewport', async ({ page }) => {
  const game = new GamePage(page);
  await game.open(LANDSCAPE_VIEWPORTS[0]);
  await game.startCareer();

  for (const viewport of LANDSCAPE_VIEWPORTS) {
    await page.setViewportSize(viewport);
    await page.waitForFunction(() => {
      const box = document.querySelector('#app canvas')?.getBoundingClientRect();
      return box && box.left >= 0 && box.top >= 0 &&
        box.right <= window.innerWidth + 0.5 && box.bottom <= window.innerHeight + 0.5;
    });
    const box = await game.canvas.boundingBox();

    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 0.5);
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 0.5);
    expect(Math.abs(box.x - (viewport.width - box.width) / 2)).toBeLessThan(1);
    expect(Math.abs(box.y - (viewport.height - box.height) / 2)).toBeLessThan(1);
  }

  const snapshot = await game.sceneSnapshot();
  expect(snapshot.worldWidth).toBeCloseTo(480, 4);
  expect(snapshot.worldHeight).toBeCloseTo(270, 4);
  expect(snapshot.zoom).toBe(4);
});

test('portrait phones receive an explicit rotate prompt', async ({ page }) => {
  const game = new GamePage(page);
  await game.open({ width: 390, height: 844 });
  await expect(page.locator('#rotate')).toBeVisible();
  await expect(page.locator('#rotate strong')).toContainText('ROTATE FOR KICK-OFF');
});

test('pausing during windup freezes contact and resumes into flight', async ({ page }) => {
  const game = new GamePage(page);
  await game.open({ width: 1280, height: 720 });
  await game.startCareer();

  // Shoot and pause in the same browser task. On a throttled CI renderer,
  // separate protocol calls can otherwise let the contact frame run first.
  await page.evaluate(() => {
    window.__fkl.shootDebug(0, 7.4, 24, 0);
    window.__fkl.togglePauseMenu();
  });
  await page.waitForFunction(() => window.__fkl?.state === 'PAUSED');
  expect(await page.evaluate(() => ({
    ballActive: window.__fkl.ball.flying,
    animationPaused: window.__fkl.kicker.actionAnimationPaused
  }))).toEqual({ ballActive: false, animationPaused: true });

  await page.keyboard.press('Tab');
  await page.waitForFunction(() => window.__fkl?.state === 'FLIGHT');
  expect(await page.evaluate(() => window.__fkl.ball.flying)).toBe(true);
});

test('hiding the page automatically pauses an active match', async ({ page }) => {
  const game = new GamePage(page);
  await game.open({ width: 1280, height: 720 });
  await game.startCareer();

  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.waitForFunction(() => window.__fkl?.state === 'PAUSED');
  expect(await page.evaluate(() => ({
    timePaused: window.__fkl.time.paused,
    swipeEnabled: window.__fkl.swipe.enabled
  }))).toEqual({ timePaused: true, swipeEnabled: false });
});

test('specialist keeper atlases are deferred until gameplay', async ({ page }) => {
  // The selectable-player V3 set adds enough individual pose requests to fill
  // Chromium's small default Resource Timing buffer before deferred gameplay
  // assets arrive. Expand the observation buffer before navigation so this
  // assertion measures network behavior instead of silently dropping entries.
  await page.addInitScript(() => performance.setResourceTimingBufferSize(1000));
  const game = new GamePage(page);
  await game.open({ width: 1280, height: 720 });
  const bootKeeperAssets = await page.evaluate(() => performance.getEntriesByType('resource')
    .map((entry) => entry.name)
    .filter((name) => name.includes('/keeper-') && name.includes('-sheet-hd.png')));

  expect(bootKeeperAssets).toHaveLength(5);
  expect(bootKeeperAssets.some((name) => name.includes('practical-recovery'))).toBe(false);

  await game.startCareer();
  await page.waitForFunction(() => performance.getEntriesByType('resource')
    .some((entry) => entry.name.includes('keeper-practical-recovery-sheet-hd.png')));
});

test('the Continue action acknowledges input and rejects re-entry', async ({ page }) => {
  const game = new GamePage(page);
  await game.open({ width: 1280, height: 720 });
  await game.clickLogical(344, 112);
  const menuLabels = await page.evaluate(() => window.__game.scene.getScene('Menu').children.list
    .flatMap((child) => child?.list ?? [child])
    .map((child) => child?.text)
    .filter(Boolean));
  expect(menuLabels).toContain('KICKING OFF...');
  await game.clickLogical(344, 112);

  await page.waitForFunction(() => window.__game.scene.isActive('Game'));
  expect(await page.evaluate(() => window.__game.scene.getScenes(true)
    .filter((scene) => scene.sys.settings.key === 'Game').length)).toBe(1);
});

test('live swipe copy clears the gesture and feedback lanes', async ({ page }) => {
  const game = new GamePage(page);
  await game.open({ width: 1280, height: 720 });
  await game.startCareer();
  const ball = await page.evaluate(() => ({ x: window.__fkl.ballSpr.x, y: window.__fkl.ballSpr.y }));
  const start = await game.logicalPoint(ball.x, ball.y);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x, start.y - 90, { steps: 4 });
  await page.waitForFunction(() => window.__fkl.tutorialCaption?.alpha < 0.2);
  await page.mouse.up();

  const lanes = await page.evaluate(() => {
    window.__fkl.showSwipeHintMessage('AIM HIGHER');
    return { hintY: window.__fkl.inputHint.y, readoutY: window.__fkl.shotReadout.y };
  });
  expect(lanes.readoutY - lanes.hintY).toBeGreaterThan(30);
});

test('Time Attack ends on the dedicated results card with working rematch actions', async ({ page }) => {
  const game = new GamePage(page);
  await game.open({ width: 844, height: 390 });
  await page.evaluate(() => {
    const menu = window.__game.scene.getScene('Menu');
    menu.scene.start('Game', { mode: 'arcade' });
  });
  await page.waitForFunction(() => window.__fkl?.state === 'AIMING');

  await page.evaluate(() => {
    window.__fkl.score = 8400;
    window.__fkl.goals = 4;
    window.__fkl.endArcade();
  });
  await page.waitForFunction(() => window.__fkl?.terminalOverlayShown === true);

  const result = await page.evaluate(() => {
    const scene = window.__fkl;
    const text = scene.children.list
      .flatMap((child) => child?.list ?? [child])
      .map((child) => child?.text)
      .filter(Boolean);
    const buttons = scene.terminalOverlayObjects
      .filter((child) => child?.buttonLabel)
      .map((child) => ({
        label: child.buttonLabel.text,
        x: child.x,
        y: child.y,
        width: child.buttonWidth,
        height: child.buttonHeight
      }));
    return { text, buttons };
  });

  expect(result.text).toEqual(expect.arrayContaining([
    "TIME'S UP!", 'SCORE', '8400', 'GOALS', '4', 'BEST', '+49', 'COINS'
  ]));
  expect(result.buttons).toEqual([
    { label: 'RETRY', x: 168, y: 216, width: 136, height: 34 },
    { label: 'MENU', x: 312, y: 216, width: 136, height: 34 }
  ]);

  await game.clickLogical(168, 216);
  await page.waitForFunction(() => window.__fkl?.mode === 'arcade' && window.__fkl?.state === 'AIMING');

  await page.evaluate(() => window.__fkl.endArcade());
  await page.waitForFunction(() => window.__fkl?.terminalOverlayShown === true);
  await game.clickLogical(312, 216);
  await page.waitForFunction(() => window.__game.scene.isActive('Menu'));
});
