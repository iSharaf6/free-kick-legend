import { test, expect } from '@playwright/test';
import { GamePage } from './game-page.js';

test('menu and pause expose persistent, keyboard-accessible settings', async ({ page }) => {
  const game = new GamePage(page);
  await game.open({ width: 1280, height: 720 });

  const point = await game.logicalPoint(231, 17);
  await page.mouse.move(point.x, point.y);
  await page.mouse.down();
  expect(await page.evaluate(() => window.__game.scene.getScene('Menu').settingsButton.buttonLabel.y)).toBe(2);
  await page.mouse.up();

  const panel = page.locator('#settings-panel');
  await expect(panel).toBeVisible();
  await expect(page.getByRole('heading', { name: 'MATCH SETTINGS' })).toBeVisible();

  await page.getByLabel('MUSIC VOLUME').fill('0.55');
  await page.getByLabel('SFX VOLUME').fill('0.65');
  await page.getByLabel('AIM ASSIST').selectOption('reduced');
  await page.getByLabel('REDUCED MOTION').check();
  await page.getByLabel('SCREEN SHAKE').uncheck();
  await page.getByLabel('HIGH CONTRAST').check();

  await expect(page.locator('html')).toHaveClass(/fkl-high-contrast/);
  await expect(page.locator('html')).toHaveClass(/fkl-reduced-motion/);
  await expect(page.locator('[data-output="musicVolume"]')).toHaveText('55%');
  await expect(page.locator('[data-output="sfxVolume"]')).toHaveText('65%');
  expect(await page.evaluate(() => {
    const settings = JSON.parse(localStorage.getItem('fkl-save-v2')).settings;
    return {
      musicVolume: settings.musicVolume,
      sfxVolume: settings.sfxVolume,
      aimAssist: settings.aimAssist,
      reducedMotion: settings.reducedMotion,
      screenShake: settings.screenShake,
      highContrast: settings.highContrast
    };
  })).toEqual({
    musicVolume: 0.55,
    sfxVolume: 0.65,
    aimAssist: 'reduced',
    reducedMotion: true,
    screenShake: false,
    highContrast: true
  });

  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();
  await game.startCareer();
  await page.keyboard.press('Tab');
  await page.waitForFunction(() => window.__fkl?.state === 'PAUSED');
  await game.clickLogical(204, 162);
  await expect(panel).toBeVisible();
  await expect(page.getByLabel('AIM ASSIST')).toHaveValue('reduced');
  await page.getByRole('button', { name: 'DONE' }).click();
  await expect(panel).toBeHidden();
});

test('compact landscape promotes critical HUD text and results reach the live region', async ({ page }) => {
  const game = new GamePage(page);
  await game.open({ width: 844, height: 390 });
  await game.startCareer();

  expect(await page.evaluate(() => {
    const scene = window.__fkl;
    const match = scene.children.list.find((child) => child?.text === 'MATCH 01');
    return { compact: scene.compactHud, fontSize: match?.style?.fontSize };
  })).toEqual({ compact: true, fontSize: '5px' });

  await page.evaluate(() => window.__fkl.showShotReadout('WALL', { x: 0, y: 1 }, { points: 0 }));
  await expect(page.locator('#game-status')).toContainText('wall', { ignoreCase: true });
});
