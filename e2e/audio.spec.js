import { test, expect } from '@playwright/test';
import { GamePage } from './game-page.js';

async function musicState(page) {
  return await page.evaluate(() => window.__menuMusic.getState());
}

async function unlockMusic(page) {
  await page.keyboard.press('Space');
  await page.waitForFunction(() => {
    const state = window.__menuMusic?.getState();
    return state && !state.paused && state.outputVolume > 0.25;
  });
}

async function waitForScene(page, key) {
  await page.waitForFunction((sceneKey) => window.__game?.scene?.isActive(sceneKey), key);
}

test('menu music unlocks once, survives every menu panel, and persists mute', async ({ page }) => {
  const game = new GamePage(page);
  await game.open({ width: 1280, height: 720 });
  await page.waitForFunction(() => window.__menuMusic?.getState().duration > 170);

  const initial = await musicState(page);
  expect(initial.active).toBe(true);
  expect(initial.instanceCount).toBe(1);
  expect(initial.musicVolume).toBeCloseTo(0.3, 4);
  await unlockMusic(page);
  await page.evaluate(() => {
    window.__menuMusic.audio.currentTime = 60;
    window.__menuMusic.audio.dataset.fklTestInstance = 'original';
  });

  const panels = [
    { button: [344, 141], scene: 'LevelSelect' },
    { button: [344, 228], scene: 'Locker' },
    { button: [288, 17], scene: 'Progress' }
  ];
  for (const panel of panels) {
    await game.clickLogical(...panel.button);
    await waitForScene(page, panel.scene);
    expect(await page.evaluate(() => ({
      active: window.__menuMusic.getState().active,
      paused: window.__menuMusic.audio.paused,
      instance: window.__menuMusic.audio.dataset.fklTestInstance,
      currentTime: window.__menuMusic.audio.currentTime
    }))).toMatchObject({ active: true, paused: false, instance: 'original' });
    expect((await musicState(page)).currentTime).toBeGreaterThanOrEqual(60);
    await game.clickLogical(23, 18);
    await waitForScene(page, 'Menu');
  }

  await game.clickLogical(25, 17);
  await page.waitForFunction(() => window.__menuMusic?.getState().muted && window.__menuMusic.audio.paused);
  expect(await page.evaluate(() => ({
    icon: window.__game.scene.getScene('Menu').soundButton.buttonIcon.texture.key,
    saved: JSON.parse(localStorage.getItem('fkl-save-v2')).settings.muted
  }))).toEqual({ icon: 'icon-mute', saved: true });

  await page.reload();
  await waitForScene(page, 'Menu');
  await page.waitForFunction(() => window.__menuMusic?.getState().instanceCount === 1);
  expect(await page.evaluate(() => ({
    muted: window.__menuMusic.getState().muted,
    paused: window.__menuMusic.audio.paused,
    icon: window.__game.scene.getScene('Menu').soundButton.buttonIcon.texture.key
  }))).toEqual({ muted: true, paused: true, icon: 'icon-mute' });

  await game.clickLogical(25, 17);
  await page.waitForFunction(() => !window.__menuMusic?.getState().muted && !window.__menuMusic.audio.paused);
  expect((await musicState(page)).instanceCount).toBe(1);
});

test('gameplay fades the menu track and returning resumes its position', async ({ page }) => {
  const game = new GamePage(page);
  await game.open({ width: 1280, height: 720 });
  await unlockMusic(page);
  await page.waitForFunction(() => window.__menuMusic?.getState().duration > 170);
  await page.evaluate(() => { window.__menuMusic.audio.currentTime = 80; });

  await game.clickLogical(344, 199);
  await page.waitForFunction(() => window.__fkl?.mode === 'arcade');
  await page.waitForFunction(() => {
    const state = window.__menuMusic.getState();
    return !state.active && state.paused && state.outputVolume === 0;
  });
  const afterArcade = (await musicState(page)).currentTime;
  expect(afterArcade).toBeGreaterThanOrEqual(80);
  // A slow runner can spend several seconds constructing the match while the
  // menu remains visible and its soundtrack correctly continues. The stable
  // contract is that gameplay pauses the same track without resetting it.
  expect(afterArcade).toBeLessThan(95);

  await page.evaluate(() => window.__fkl.startScene('Menu'));
  await waitForScene(page, 'Menu');
  await page.waitForFunction(() => window.__menuMusic.getState().active && !window.__menuMusic.audio.paused);
  expect((await musicState(page)).currentTime).toBeGreaterThanOrEqual(afterArcade);

  await game.clickLogical(344, 170);
  await page.waitForFunction(() => window.__fkl?.mode === 'daily');
  await page.waitForFunction(() => !window.__menuMusic.getState().active && window.__menuMusic.audio.paused);
  expect((await musicState(page)).instanceCount).toBe(1);
});

test('visibility recovery and the analyzed loop point reuse the same track', async ({ page }) => {
  const game = new GamePage(page);
  await game.open({ width: 1280, height: 720 });
  await unlockMusic(page);
  await page.waitForFunction(() => window.__menuMusic?.getState().duration > 170);

  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.waitForFunction(() => window.__menuMusic.audio.paused);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.waitForFunction(() => !window.__menuMusic.audio.paused);

  await page.evaluate(() => {
    const music = window.__menuMusic;
    music.audio.currentTime = music.getState().loopEnd - 0.03;
  });
  await page.waitForFunction(() => {
    const state = window.__menuMusic.getState();
    return state.currentTime >= state.loopStart && state.currentTime < state.loopStart + 1;
  });
  await page.waitForFunction(() => window.__menuMusic.getState().outputVolume > 0.29);

  const looped = await musicState(page);
  expect(looped.instanceCount).toBe(1);
  expect(looped.loopStart).toBeCloseTo(51.28, 2);
  expect(looped.loopEnd).toBeCloseTo(166.48, 2);
  expect(looped.paused).toBe(false);
});
