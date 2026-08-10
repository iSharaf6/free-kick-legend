import { test, expect } from '@playwright/test';
import { GamePage } from './game-page.js';

test('menu and pause expose persistent, keyboard-accessible settings', async ({ page }) => {
  // This scenario deliberately traverses the native settings dialog, a scene
  // load, the paused canvas menu, and focus restoration. Headed GPU CI can
  // exceed the suite's generic 30s budget without any individual wait failing.
  test.setTimeout(60_000);
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

  const focusedPauseButton = () => page.evaluate(() => {
    const button = window.__fkl.pauseOverlayObjects.find((object) => object?.buttonFocused);
    return button?.buttonLabel?.text || null;
  });

  // Enter the documented canvas keyboard boundary explicitly. Settings
  // restores this focus in browsers, but making the boundary visible here
  // keeps the control test independent of engine-specific focus timing.
  await game.canvas.focus();
  await page.keyboard.press('Tab');
  // Phaser applies keyboard input on its next game frame. The live-region
  // announcement is the rendered accessibility contract and remains
  // observable even while the Scene clock itself is paused.
  await expect(page.locator('#game-status')).toContainText('Match paused');
  expect(await page.evaluate(() => window.__fkl?.state)).toBe('PAUSED');
  expect(await page.evaluate(() => ({
    menuVisible: window.__fkl.menuButton.visible,
    menuEnabled: window.__fkl.menuButton.buttonEnabled,
    muteVisible: window.__fkl.muteButton.visible,
    muteEnabled: window.__fkl.muteButton.buttonEnabled
  }))).toEqual({
    menuVisible: false,
    menuEnabled: false,
    muteVisible: false,
    muteEnabled: false
  });
  expect(await focusedPauseButton()).toBeNull();

  await page.keyboard.press('Tab');
  await expect(page.locator('#game-status')).toHaveText('RESUME button');
  expect(await focusedPauseButton()).toBe('RESUME');
  await page.keyboard.press('Tab');
  await expect(page.locator('#game-status')).toHaveText('SETTINGS button');
  expect(await focusedPauseButton()).toBe('SETTINGS');
  await page.keyboard.press('Enter');
  await expect(panel).toBeVisible();
  await expect(page.getByLabel('AIM ASSIST')).toHaveValue('reduced');

  await page.keyboard.press('Tab');
  await expect(page.getByLabel('MUSIC VOLUME')).toBeFocused();
  expect(await page.evaluate(() => window.__fkl?.state)).toBe('PAUSED');
  await page.keyboard.press('Shift+Tab');
  await expect(page.getByRole('button', { name: 'DONE' })).toBeFocused();
  expect(await page.evaluate(() => window.__fkl?.state)).toBe('PAUSED');

  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();
  await page.keyboard.press('Tab');
  await expect(page.locator('#game-status')).toHaveText('RESTART button');
  expect(await focusedPauseButton()).toBe('RESTART');
  await page.keyboard.press('Shift+Tab');
  await expect(page.locator('#game-status')).toHaveText('SETTINGS button');
  expect(await focusedPauseButton()).toBe('SETTINGS');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.__fkl?.state === 'AIMING');
  expect(await page.evaluate(() => ({
    menuVisible: window.__fkl.menuButton.visible,
    menuEnabled: window.__fkl.menuButton.buttonEnabled,
    muteVisible: window.__fkl.muteButton.visible,
    muteEnabled: window.__fkl.muteButton.buttonEnabled
  }))).toEqual({
    menuVisible: true,
    menuEnabled: true,
    muteVisible: true,
    muteEnabled: true
  });
});

test('shared canvas buttons support sequential and spatial keyboard navigation', async ({ page }) => {
  const game = new GamePage(page);
  await game.open({ width: 1280, height: 720 });

  const canvas = page.locator('#app canvas.three-pixel-source');
  await expect(canvas).toHaveAttribute('tabindex', '0');
  await expect(canvas).toHaveAttribute('role', 'application');
  await expect(canvas).toHaveAttribute('aria-label', /Press Tab to enter game controls/);
  await expect(canvas).not.toBeFocused();
  await page.keyboard.press('Tab');
  await expect(canvas).toBeFocused();

  await game.clickLogical(350, 227);
  await page.waitForFunction(() => window.__game?.scene?.isActive('Locker'));

  const focusedButton = () => page.evaluate(() => {
    const objects = [];
    const visit = (object) => {
      objects.push(object);
      for (const child of object?.list || []) visit(child);
    };
    for (const child of window.__game.scene.getScene('Locker').children.list) visit(child);
    const focused = objects.find((object) => object?.buttonFocused);
    return focused ? {
      label: focused.buttonLabel?.text || '',
      icon: focused.buttonIcon?.texture?.key || null
    } : null;
  });

  expect(await focusedButton()).toBeNull();

  await page.keyboard.press('Tab');
  await expect(page.locator('#game-status')).toHaveText('Back button');
  expect(await focusedButton()).toEqual({ label: '', icon: 'icon-back' });
  await page.keyboard.press('Tab');
  await expect(page.locator('#game-status')).toHaveText('PLAYERS button');
  expect(await focusedButton()).toEqual({ label: 'PLAYERS', icon: 'kicker-hd-kit-home-idle' });
  await page.keyboard.press('Shift+Tab');
  await expect(page.locator('#game-status')).toHaveText('Back button');
  expect(await focusedButton()).toEqual({ label: '', icon: 'icon-back' });

  await page.keyboard.press('ArrowDown');
  await expect(page.locator('#game-status')).toHaveText('PLAYERS button');
  expect(await focusedButton()).toEqual({ label: 'PLAYERS', icon: 'kicker-hd-kit-home-idle' });
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#game-status')).toHaveText('KITS button');
  expect(await focusedButton()).toEqual({ label: 'KITS', icon: 'icon-kit' });
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('#game-status')).toHaveText('PLAYERS button');
  expect(await focusedButton()).toEqual({ label: 'PLAYERS', icon: 'kicker-hd-kit-home-idle' });
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__game.scene.getScene('Locker').category === 'character');

  await page.keyboard.press('Tab');
  await expect(page.locator('#game-status')).toHaveText('Back button');
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('#game-status')).toHaveText('PLAYERS button');
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#game-status')).toHaveText('KITS button');
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#game-status')).toHaveText('BALLS button');
  expect(await focusedButton()).toEqual({ label: 'BALLS', icon: 'ball-classic' });
  await page.keyboard.press('Space');
  await page.waitForFunction(() => window.__game.scene.getScene('Locker').category === 'ball');
});

test('terminal overlays contain canvas focus and block actions during ads', async ({ page }) => {
  const game = new GamePage(page);
  await game.open({ width: 1280, height: 720 });
  await game.startCareer();

  await page.evaluate(() => {
    window.__overlayActivations = 0;
    window.__fkl.showOverlay('TRY AGAIN', ['OUT OF ATTEMPTS'], [
      {
        label: 'RETRY', color: 0x1976d2, hover: 0x2196f3,
        cb: () => { window.__overlayActivations++; }
      },
      { label: 'LEVELS', color: 0x37474f, hover: 0x546e7a, cb: () => {} }
    ]);
  });

  expect(await page.evaluate(() => ({
    menuVisible: window.__fkl.menuButton.visible,
    menuEnabled: window.__fkl.menuButton.buttonEnabled,
    muteVisible: window.__fkl.muteButton.visible,
    muteEnabled: window.__fkl.muteButton.buttonEnabled
  }))).toEqual({
    menuVisible: false,
    menuEnabled: false,
    muteVisible: false,
    muteEnabled: false
  });

  await game.canvas.focus();
  await page.keyboard.press('Tab');
  expect(await page.evaluate(() => (
    window.__fkl.terminalOverlayObjects.find((object) => object?.buttonFocused)?.buttonLabel?.text
  ))).toBe('RETRY');

  await page.evaluate(() => {
    window.CrazyGames.SDK.ad = {
      requestAd: (_type, callbacks) => { window.__adCallbacks = callbacks; }
    };
    window.__pendingAd = window.__fkl.requestNaturalBreakAd();
  });
  await page.waitForFunction(() => window.__fkl.adRequestActive && window.__adCallbacks);
  await expect(game.canvas).toBeFocused();
  expect(await page.evaluate(() => window.__fkl.terminalOverlayObjects
    .filter((object) => typeof object?.setButtonEnabled === 'function')
    .every((button) => !button.buttonEnabled && !button.buttonFocused))).toBe(true);

  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  await expect(game.canvas).toBeFocused();
  expect(await page.evaluate(() => window.__overlayActivations)).toBe(0);

  await page.evaluate(async () => {
    window.__adCallbacks.adStarted();
    window.__adCallbacks.adFinished();
    await window.__pendingAd;
  });
  await page.waitForFunction(() => !window.__fkl.adRequestActive);
  await page.keyboard.press('Tab');
  expect(await page.evaluate(() => (
    window.__fkl.terminalOverlayObjects.find((object) => object?.buttonFocused)?.buttonLabel?.text
  ))).toBe('RETRY');
  await page.keyboard.press('Enter');
  expect(await page.evaluate(() => window.__overlayActivations)).toBe(1);
});

test('compact landscape promotes critical HUD text and results reach the live region', async ({ page }) => {
  const game = new GamePage(page);
  await game.open({ width: 844, height: 390 });
  await game.startCareer();

  expect(await page.evaluate(() => {
    const scene = window.__fkl;
    const match = scene.children.list.find((child) => child?.text === 'MATCH 01');
    return { compact: scene.compactHud, fontSize: match?.style?.fontSize };
  })).toEqual({ compact: true, fontSize: '9px' });

  await page.evaluate(() => window.__fkl.showShotReadout('WALL', { x: 0, y: 1 }, { points: 0 }));
  await expect(page.locator('#game-status')).toContainText('wall', { ignoreCase: true });

  await page.evaluate(() => window.__fkl.showOverlay('TRY AGAIN', [
    'OUT OF ATTEMPTS',
    'CHANGE HEIGHT, POWER, OR CURVE'
  ], [
    { label: 'RETRY', color: 0x1976d2, hover: 0x2196f3, cb: () => {} },
    { label: 'LEVELS', color: 0x37474f, hover: 0x546e7a, cb: () => {} }
  ]));
  await expect(page.locator('#game-status')).toContainText('Actions: RETRY, LEVELS');
});
