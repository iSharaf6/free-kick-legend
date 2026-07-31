import { test, expect } from '@playwright/test';
import { GamePage } from './game-page.js';

const LANDSCAPE_VIEWPORTS = [
  { width: 1920, height: 1080 },
  { width: 1440, height: 900 },
  { width: 1366, height: 768 },
  { width: 1280, height: 720 },
  { width: 844, height: 390 }
];

for (const viewport of LANDSCAPE_VIEWPORTS) {
  test(`full logical frame is visible at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    const game = new GamePage(page);
    await game.open(viewport);
    const box = await game.canvas.boundingBox();

    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 0.5);
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 0.5);
    await game.startCareer();
    const snapshot = await game.sceneSnapshot();
    expect(snapshot.worldWidth).toBeCloseTo(480, 4);
    expect(snapshot.worldHeight).toBeCloseTo(270, 4);
    expect(snapshot.zoom).toBe(4);
  });
}

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

  await page.evaluate(() => window.__fkl.shootDebug(0, 7.4, 24, 0));
  await page.waitForFunction(() => window.__fkl?.state === 'WINDUP');
  await page.keyboard.press('Tab');
  await page.waitForFunction(() => window.__fkl?.state === 'PAUSED');
  expect(await page.evaluate(() => ({
    ballActive: window.__fkl.ball.flying,
    animationPaused: window.__fkl.kicker.actionAnimationPaused
  }))).toEqual({ ballActive: false, animationPaused: true });

  await page.keyboard.press('Tab');
  await page.waitForFunction(() => window.__fkl?.state === 'FLIGHT');
  expect(await page.evaluate(() => window.__fkl.ball.flying)).toBe(true);
});

test('specialist keeper atlases are deferred until gameplay', async ({ page }) => {
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
  const point = await game.logicalPoint(344, 112);
  await page.mouse.click(point.x, point.y);
  const menuLabels = await page.evaluate(() => window.__game.scene.getScene('Menu').children.list
    .flatMap((child) => child?.list ?? [child])
    .map((child) => child?.text)
    .filter(Boolean));
  expect(menuLabels).toContain('KICKING OFF...');
  await page.mouse.click(point.x, point.y);

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
