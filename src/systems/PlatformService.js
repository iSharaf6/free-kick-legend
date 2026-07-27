const AD_TYPES = new Set(['midgame', 'rewarded']);

function browserSdk() {
  try {
    return globalThis.window?.CrazyGames?.SDK ?? globalThis.CrazyGames?.SDK ?? null;
  } catch {
    return null;
  }
}

function browserStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function isStorageLike(storage) {
  return Boolean(
    storage &&
    typeof storage.getItem === 'function' &&
    typeof storage.setItem === 'function'
  );
}

function callHook(hook, ...args) {
  if (typeof hook !== 'function') return;
  try {
    hook(...args);
  } catch {
    // A presentation hook must never strand the SDK/ad lifecycle.
  }
}

export class PlatformAdapter {
  constructor() {
    this._sdk = null;
    this._ready = false;
    this._available = false;
    this._environment = 'standalone';
    this._gameplayActive = false;
    this._lastError = null;
  }

  /**
   * Initialize an injected SDK or the CrazyGames global when present.
   * No script is downloaded here, keeping standalone/other-portal builds clean.
   */
  async init({ sdk = undefined, force = false } = {}) {
    if (this._ready && !force) return this._available;

    const candidate = sdk ?? browserSdk();
    this._sdk = candidate;
    this._ready = true;
    this._lastError = null;

    if (!candidate) {
      this._available = false;
      this._environment = 'standalone';
      return false;
    }

    try {
      if (typeof candidate.init === 'function') await candidate.init();
      this._environment = String(candidate.environment ?? 'platform');
      this._available = this._environment !== 'disabled';
      return this._available;
    } catch (error) {
      this._lastError = error;
      this._available = false;
      this._environment = 'disabled';
      return false;
    }
  }

  isReady() {
    return this._ready;
  }

  isAvailable() {
    return this._available;
  }

  getEnvironment() {
    return this._environment;
  }

  getLastError() {
    return this._lastError;
  }

  /** CrazyGames Data when ready, otherwise the supplied/local storage. */
  getStorage(fallback = undefined) {
    const platformStorage = this._available ? this._sdk?.data : null;
    if (isStorageLike(platformStorage)) return platformStorage;
    const chosenFallback = fallback ?? browserStorage();
    return isStorageLike(chosenFallback) ? chosenFallback : null;
  }

  getGameSettings() {
    const settings = this._available ? this._sdk?.game?.settings : null;
    return settings && typeof settings === 'object' ? { ...settings } : {};
  }

  shouldMuteAudio() {
    return this.getGameSettings().muteAudio === true;
  }

  async _invoke(moduleName, methodName, ...args) {
    const method = this._sdk?.[moduleName]?.[methodName];
    if (!this._available || typeof method !== 'function') return false;
    try {
      await method.apply(this._sdk[moduleName], args);
      return true;
    } catch (error) {
      this._lastError = error;
      return false;
    }
  }

  async gameplayStart() {
    if (this._gameplayActive) return this._available;
    this._gameplayActive = true;
    return await this._invoke('game', 'gameplayStart');
  }

  async gameplayStop() {
    if (!this._gameplayActive) return this._available;
    this._gameplayActive = false;
    return await this._invoke('game', 'gameplayStop');
  }

  isGameplayActive() {
    return this._gameplayActive;
  }

  async loadingStart() {
    return await this._invoke('game', 'loadingStart');
  }

  async loadingStop() {
    return await this._invoke('game', 'loadingStop');
  }

  async reportProgress(percent) {
    const safePercent = Math.min(Math.max(Number(percent) || 0, 0), 100);
    return await this._invoke('game', 'reportGameCompletedPercentage', safePercent);
  }

  async happyTime() {
    return await this._invoke('game', 'happytime');
  }

  supportsAds() {
    return Boolean(this._available && typeof this._sdk?.ad?.requestAd === 'function');
  }

  /**
   * Promise wrapper around the SDK's callback-only video-ad API.
   * Returns true only when the ad completed; unavailable/unfilled ads resolve
   * false so callers can immediately restore gameplay without special cases.
   */
  async requestAd(type, hooks = {}) {
    if (!AD_TYPES.has(type)) return false;
    if (!this.supportsAds()) {
      callHook(hooks.onUnavailable);
      return false;
    }

    return await new Promise((resolve) => {
      let settled = false;
      const finish = (shown, error = null) => {
        if (settled) return;
        settled = true;
        if (error) this._lastError = error;
        resolve(shown);
      };

      const callbacks = {
        adStarted: () => callHook(hooks.onStarted),
        adFinished: () => {
          callHook(hooks.onFinished);
          finish(true);
        },
        adError: (error) => {
          callHook(hooks.onError, error);
          finish(false, error);
        }
      };

      try {
        this._sdk.ad.requestAd(type, callbacks);
      } catch (error) {
        callHook(hooks.onError, error);
        finish(false, error);
      }
    });
  }

  async requestMidgameAd(hooks = {}) {
    return await this.requestAd('midgame', hooks);
  }

  async requestRewardedAd(hooks = {}) {
    return await this.requestAd('rewarded', hooks);
  }
}

export const PlatformService = new PlatformAdapter();
