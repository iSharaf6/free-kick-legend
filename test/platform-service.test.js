import test from 'node:test';
import assert from 'node:assert/strict';

import { PlatformAdapter } from '../src/systems/PlatformService.js';

test('standalone platform adapter is fully no-op safe', async () => {
  const platform = new PlatformAdapter();
  assert.equal(await platform.init({ sdk: null }), false);
  assert.equal(platform.isReady(), true);
  assert.equal(platform.isAvailable(), false);
  assert.equal(platform.getEnvironment(), 'standalone');
  assert.equal(await platform.gameplayStart(), false);
  assert.equal(platform.isGameplayActive(), true);
  assert.equal(await platform.gameplayStop(), false);
  assert.equal(await platform.requestRewardedAd(), false);
});

test('platform adapter routes storage, lifecycle, progress and completed ads', async () => {
  const calls = [];
  const data = {
    getItem: () => null,
    setItem: () => {}
  };
  const sdk = {
    environment: 'local',
    init: async () => calls.push('init'),
    data,
    game: {
      settings: { muteAudio: true },
      gameplayStart: async () => calls.push('start'),
      gameplayStop: async () => calls.push('stop'),
      reportGameCompletedPercentage: async (value) => calls.push(['progress', value])
    },
    ad: {
      requestAd: (type, callbacks) => {
        calls.push(['ad', type]);
        queueMicrotask(() => {
          callbacks.adStarted();
          callbacks.adFinished();
        });
      }
    }
  };
  const platform = new PlatformAdapter();
  assert.equal(await platform.init({ sdk }), true);
  assert.equal(platform.getStorage(), data);
  assert.equal(platform.shouldMuteAudio(), true);
  assert.equal(await platform.gameplayStart(), true);
  assert.equal(await platform.gameplayStart(), true);
  assert.equal(await platform.reportProgress(140), true);
  assert.equal(await platform.gameplayStop(), true);

  let started = 0;
  let finished = 0;
  assert.equal(await platform.requestRewardedAd({
    onStarted: () => started++,
    onFinished: () => finished++
  }), true);
  assert.equal(started, 1);
  assert.equal(finished, 1);
  assert.deepEqual(calls, [
    'init', 'start', ['progress', 100], 'stop', ['ad', 'rewarded']
  ]);
});

test('ad errors and thrown hooks resolve false without leaking failures', async () => {
  const expectedError = new Error('unfilled');
  const sdk = {
    environment: 'local',
    init: async () => {},
    ad: {
      requestAd: (_type, callbacks) => queueMicrotask(() => callbacks.adError(expectedError))
    }
  };
  const platform = new PlatformAdapter();
  await platform.init({ sdk });
  const shown = await platform.requestMidgameAd({
    onError: () => {
      throw new Error('presentation hook failed');
    }
  });
  assert.equal(shown, false);
  assert.equal(platform.getLastError(), expectedError);
});
