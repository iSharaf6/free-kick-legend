import { test, expect } from '@playwright/test';
import { GamePage } from './game-page.js';

// This journey boots every selectable-striker texture and captures three full
// canvas states. Parallel local runners can spend over 30 seconds decoding the
// same atlases, so use the release journey's explicit long-form allowance.
test.describe.configure({ timeout: 120_000 });


test('a selected striker persists from the locker through menu and gameplay', async ({ page }, testInfo) => {
  const game = new GamePage(page);
  await game.open({ width: 1280, height: 720 });

  await game.clickLogical(344, 228);
  await page.waitForFunction(() => window.__game?.scene?.isActive('Locker'));
  await game.clickLogical(64, 51);
  await page.waitForFunction(() => window.__game.scene.getScene('Locker').category === 'character');
  await game.clickLogical(274, 157);
  await page.waitForFunction(() => window.__game.scene.getScene('Locker').selectedId === 'character-islam-sharaf');
  await game.clickLogical(339, 232);
  await page.waitForFunction(() => {
    const save = JSON.parse(localStorage.getItem('fkl-save-v2'));
    return save?.equipped?.character === 'character-islam-sharaf';
  });
  await testInfo.attach('islam-sharaf-locker', {
    body: await page.screenshot(),
    contentType: 'image/png'
  });

  await game.clickLogical(23, 18);
  await page.waitForFunction(() => window.__game?.scene?.isActive('Menu'));
  const menuState = await page.evaluate(() => {
    const menu = window.__game.scene.getScene('Menu');
    const labels = menu.children.list
      .flatMap((child) => child?.list ?? [child])
      .map((child) => child?.text)
      .filter(Boolean);
    return {
      characterId: menu.kicker.characterId,
      texture: menu.kicker.sprite.texture.key,
      labels
    };
  });
  expect(menuState.characterId).toBe('character-islam-sharaf');
  expect(menuState.texture).toBe('kicker-hd-character-islam-sharaf-kit-home-idle');
  expect(menuState.labels).toContain('ISLAM SHARAF  ·  #10');
  await testInfo.attach('islam-sharaf-menu', {
    body: await page.screenshot(),
    contentType: 'image/png'
  });

  await game.startCareer();
  const gameplay = await page.evaluate(() => {
    window.__fkl.kicker.pauseAmbient().setPose('strike');
    return {
      characterId: window.__fkl.kicker.characterId,
      texture: window.__fkl.kicker.sprite.texture.key,
      originX: window.__fkl.kicker.sprite.originX,
      originY: window.__fkl.kicker.sprite.originY
    };
  });
  expect(gameplay).toEqual({
    characterId: 'character-islam-sharaf',
    texture: 'kicker-hd-character-islam-sharaf-kit-home-strike',
    originX: 0.5,
    originY: 247 / 256
  });
  await testInfo.attach('islam-sharaf-gameplay-strike', {
    body: await page.screenshot(),
    contentType: 'image/png'
  });
});
