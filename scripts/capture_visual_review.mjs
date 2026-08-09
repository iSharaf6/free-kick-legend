import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const output = new URL('../artifacts/review/', import.meta.url);
const outputPath = fileURLToPath(output);
await mkdir(outputPath, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.route('https://sdk.crazygames.com/**', (route) => route.fulfill({
  status: 200,
  contentType: 'application/javascript',
  body: 'window.CrazyGames={SDK:{environment:"local",init:async()=>false}};'
}));
await page.goto('http://127.0.0.1:5173/');
await page.waitForFunction(() => window.__game?.scene?.isActive('Menu'));
await page.screenshot({ path: fileURLToPath(new URL('menu.png', output)) });

await page.evaluate(() => window.__game.scene.getScene('Menu').scene.start('Locker'));
await page.waitForFunction(() => window.__game?.scene?.isActive('Locker'));
await page.waitForTimeout(250);
await page.screenshot({ path: fileURLToPath(new URL('locker.png', output)) });

await page.evaluate(() => window.__game.scene.getScene('Locker').scene.start('Menu'));
await page.waitForFunction(() => window.__game?.scene?.isActive('Menu'));
const canvas = page.locator('#app canvas');
const box = await canvas.boundingBox();
await canvas.click({ position: { x: box.width * (230 / 480), y: box.height * (22 / 270) } });
await page.waitForFunction(() => document.querySelector('#settings-panel.is-open'));
await page.screenshot({ path: fileURLToPath(new URL('settings.png', output)) });
await page.locator('[data-action="close"]').click();

await page.evaluate(() => window.__game.scene.getScene('Menu').scene.start('Game', { mode: 'arcade' }));
await page.waitForFunction(() => window.__fkl?.state === 'AIMING');
await page.screenshot({ path: fileURLToPath(new URL('match.png', output)) });
await page.evaluate(() => window.__fkl.openPauseMenu());
await page.screenshot({ path: fileURLToPath(new URL('pause.png', output)) });
await page.evaluate(() => window.__fkl.closePauseMenu());
await page.evaluate(() => {
  Object.assign(window.__fkl, {
    lastShot: { power: 0.94, spin: 0.22, vx: 0, vy: 7.5, vz: 24 },
    activeTarget: null
  });
  window.__fkl.resolve('GOAL', { x: 0, y: 1.45 });
});
await page.waitForFunction(() => window.__fkl?.goalCelebration?.objects?.size > 2);
await page.screenshot({ path: fileURLToPath(new URL('goal.png', output)) });
await page.waitForFunction(() => window.__fkl?.goalCelebration?.objects?.size === 0);
await page.evaluate(() => window.__fkl.showCareerCompleteOverlay({
  stars: 3,
  rating: 'Top bins',
  points: 2140,
  goalsRequired: 1,
  reward: 120,
  hasNext: true
}));
await page.screenshot({ path: fileURLToPath(new URL('level-clear.png', output)) });
await browser.close();
