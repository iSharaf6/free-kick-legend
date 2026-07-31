import { expect } from '@playwright/test';

const SDK_STUB = `
  window.CrazyGames = { SDK: {
    environment: 'local',
    init: async () => true,
    data: {
      getItem: (key) => localStorage.getItem(key),
      setItem: (key, value) => localStorage.setItem(key, value),
      removeItem: (key) => localStorage.removeItem(key)
    },
    game: {
      settings: {},
      loadingStart: async () => {}, loadingStop: async () => {},
      gameplayStart: async () => {}, gameplayStop: async () => {},
      reportGameCompletedPercentage: async () => {}, happytime: async () => {}
    }
  } };
`;

export class GamePage {
  constructor(page) {
    this.page = page;
    this.canvas = page.locator('#app canvas');
  }

  async open(viewport) {
    if (viewport) await this.page.setViewportSize(viewport);
    await this.page.route('https://sdk.crazygames.com/**', (route) => route.fulfill({
      status: 200,
      contentType: 'application/javascript',
      body: SDK_STUB
    }));
    await this.page.goto('/');
    await this.page.waitForFunction(() => window.__game?.scene?.isActive('Menu'));
  }

  async logicalPoint(x, y) {
    const box = await this.canvas.boundingBox();
    expect(box).not.toBeNull();
    return {
      x: box.x + (x / 480) * box.width,
      y: box.y + (y / 270) * box.height
    };
  }

  async clickLogical(x, y) {
    const box = await this.canvas.boundingBox();
    expect(box).not.toBeNull();
    // Locator clicks wait for the canvas to be visible, stable and unblocked;
    // raw page.mouse clicks can race the loading overlay on slower CI runners.
    await this.canvas.click({
      position: {
        x: (x / 480) * box.width,
        y: (y / 270) * box.height
      }
    });
  }

  async startCareer() {
    // Mechanics specs enter the scene directly so their setup is not coupled
    // to the menu kicker's decorative preview timeline. The real Continue
    // interaction and its re-entry guard are exercised in their own spec.
    await this.page.evaluate(() => {
      const menu = window.__game.scene.getScene('Menu');
      menu.scene.start('Game', { mode: 'career', levelIndex: 0 });
    });
    await this.page.waitForFunction(() => window.__fkl?.state === 'AIMING');
  }

  async sceneSnapshot() {
    return await this.page.evaluate(() => {
      const scene = window.__fkl;
      const camera = scene?.cameras?.main;
      return {
        state: scene?.state,
        worldWidth: camera?.worldView?.width,
        worldHeight: camera?.worldView?.height,
        zoom: camera?.zoom
      };
    });
  }
}
