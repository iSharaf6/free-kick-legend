const BASE_URL = typeof import.meta.env?.BASE_URL === 'string' ? import.meta.env.BASE_URL : '/';

export const MENU_MUSIC = Object.freeze({
  src: `${BASE_URL}assets/audio/free-kick-legend-menu.mp3`,
  defaultVolume: 0.3,
  loopMode: 'full-track',
  sceneFadeMs: 500,
  resumeFadeMs: 320
});

function clampVolume(value, fallback = MENU_MUSIC.defaultVolume) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(Math.max(number, 0), 1) : fallback;
}

export class MenuMusicController {
  constructor(options = {}) {
    this.active = false;
    this.muted = false;
    this.volume = MENU_MUSIC.defaultVolume;
    this.hidden = false;
    this.autoplayBlocked = false;
    this.audio = null;
    this.playPromise = null;
    this.playToken = 0;
    this.outputVolume = 0;
    this.fadeFrame = null;
    this.fadeToken = 0;
    this.instanceId = 0;

    this.createAudio = options.createAudio ?? (() => {
      if (typeof globalThis.Audio !== 'function') return null;
      return new globalThis.Audio();
    });
    this.getDocument = options.getDocument ?? (() => globalThis.document ?? null);
    this.getWindow = options.getWindow ?? (() => globalThis.window ?? null);
    this.now = options.now ?? (() => globalThis.performance?.now?.() ?? Date.now());
    this.requestFrame = options.requestFrame ?? ((callback) => (
      globalThis.requestAnimationFrame?.(callback)
      ?? globalThis.setTimeout(() => callback(this.now()), 16)
    ));
    this.cancelFrame = options.cancelFrame ?? ((handle) => {
      if (globalThis.cancelAnimationFrame) globalThis.cancelAnimationFrame(handle);
      else globalThis.clearTimeout(handle);
    });

    this.boundDocument = null;
    this.boundWindow = null;
    this.onVisibilityChange = () => this.handleVisibility(Boolean(this.getDocument()?.hidden));
    this.onUserGesture = () => {
      if (!this.active || this.muted || this.hidden) return;
      // A first gesture can arrive while the browser is still rejecting the
      // optimistic autoplay promise. Retry synchronously while activation is
      // live instead of waiting for that stale promise to settle.
      this.attemptPlay(MENU_MUSIC.resumeFadeMs, { gesture: true });
    };
  }

  configure({ muted = this.muted, musicVolume = this.volume } = {}) {
    this.setVolume(musicVolume);
    this.setMuted(muted);
    return this.getState();
  }

  ensureAudio() {
    if (this.audio) return this.audio;
    const audio = this.createAudio();
    if (!audio) return null;

    audio.src = MENU_MUSIC.src;
    audio.preload = 'auto';
    // The replacement theme was authored for a direct end-to-start loop.
    // Native looping preserves the full recording and lets browsers honor its
    // MP3 priming/remainder metadata without a scripted seek or extra fade.
    audio.loop = true;
    audio.autoplay = false;
    audio.playsInline = true;
    audio.controls = false;
    audio.disableRemotePlayback = true;
    audio.volume = 0;
    this.audio = audio;
    this.instanceId += 1;
    this.bindLifecycle();
    return audio;
  }

  bindLifecycle() {
    const documentRef = this.getDocument();
    if (documentRef && this.boundDocument !== documentRef) {
      this.boundDocument?.removeEventListener?.('visibilitychange', this.onVisibilityChange);
      this.boundDocument = documentRef;
      this.hidden = Boolean(documentRef.hidden);
      documentRef.addEventListener?.('visibilitychange', this.onVisibilityChange);
    }

    const windowRef = this.getWindow();
    if (windowRef && this.boundWindow !== windowRef) {
      this.unbindUnlock();
      this.boundWindow = windowRef;
      this.bindUnlock();
    }
  }

  bindUnlock() {
    if (!this.boundWindow) return;
    const options = { capture: true, passive: true };
    this.boundWindow.addEventListener?.('pointerdown', this.onUserGesture, options);
    this.boundWindow.addEventListener?.('touchstart', this.onUserGesture, options);
    this.boundWindow.addEventListener?.('keydown', this.onUserGesture, { capture: true });
  }

  unbindUnlock() {
    if (!this.boundWindow) return;
    this.boundWindow.removeEventListener?.('pointerdown', this.onUserGesture, true);
    this.boundWindow.removeEventListener?.('touchstart', this.onUserGesture, true);
    this.boundWindow.removeEventListener?.('keydown', this.onUserGesture, true);
  }

  enterMenu() {
    this.active = true;
    this.ensureAudio();
    if (!this.muted && !this.hidden) this.attemptPlay(MENU_MUSIC.resumeFadeMs);
    return this.getState();
  }

  leaveMenu(fadeMs = MENU_MUSIC.sceneFadeMs) {
    this.active = false;
    if (!this.audio || this.audio.paused) return this.getState();
    this.fadeTo(0, fadeMs, () => {
      if (!this.active && this.audio) this.audio.pause();
    });
    return this.getState();
  }

  attemptPlay(fadeMs = MENU_MUSIC.resumeFadeMs, { gesture = false } = {}) {
    const audio = this.ensureAudio();
    if (!audio || !this.active || this.muted || this.hidden) return Promise.resolve(false);
    if (!audio.paused) {
      this.autoplayBlocked = false;
      this.unbindUnlock();
      this.fadeTo(this.volume, fadeMs);
      return Promise.resolve(true);
    }
    if (this.playPromise && !gesture) return this.playPromise;

    let result;
    try {
      // Calling play synchronously inside the gesture listener is important:
      // awaiting before this line loses mobile Safari's user activation.
      result = audio.play();
    } catch {
      result = Promise.reject(new Error('menu music playback was blocked'));
    }

    const token = ++this.playToken;
    const promise = Promise.resolve(result)
      .then(() => {
        if (token !== this.playToken) return !audio.paused;
        if (!this.active || this.muted || this.hidden) {
          audio.pause();
          return false;
        }
        this.autoplayBlocked = false;
        this.unbindUnlock();
        this.fadeTo(this.volume, fadeMs);
        return true;
      })
      .catch(() => {
        if (token !== this.playToken) return false;
        this.autoplayBlocked = true;
        this.bindUnlock();
        return false;
      })
      .finally(() => {
        if (token === this.playToken) this.playPromise = null;
      });
    this.playPromise = promise;
    return promise;
  }

  setMuted(muted) {
    this.muted = Boolean(muted);
    if (this.muted) {
      if (this.audio && !this.audio.paused) {
        this.fadeTo(0, 40, () => {
          if (this.muted && this.audio) this.audio.pause();
        });
      }
    } else if (this.active && !this.hidden) {
      this.attemptPlay(MENU_MUSIC.resumeFadeMs);
    }
    return this.muted;
  }

  setVolume(value) {
    this.volume = clampVolume(value);
    if (this.audio && !this.audio.paused && this.active && !this.muted && !this.hidden) {
      this.fadeTo(this.volume, 60);
    }
    return this.volume;
  }

  handleVisibility(hidden) {
    this.hidden = Boolean(hidden);
    if (this.hidden) {
      this.cancelFade();
      this.setOutputVolume(0);
      this.audio?.pause?.();
    } else if (this.active && !this.muted) {
      this.attemptPlay(MENU_MUSIC.resumeFadeMs);
    }
    return this.getState();
  }

  setOutputVolume(value) {
    this.outputVolume = clampVolume(value, 0);
    if (this.audio) this.audio.volume = this.outputVolume;
  }

  cancelFade() {
    this.fadeToken += 1;
    if (this.fadeFrame !== null) this.cancelFrame(this.fadeFrame);
    this.fadeFrame = null;
  }

  fadeTo(value, durationMs = 0, onComplete = null) {
    const target = clampVolume(value, 0);
    this.cancelFade();
    if (!this.audio || durationMs <= 0 || Math.abs(target - this.outputVolume) < 0.001) {
      this.setOutputVolume(target);
      onComplete?.();
      return;
    }

    const token = this.fadeToken;
    const startValue = this.outputVolume;
    const startedAt = this.now();
    const step = (timestamp) => {
      if (token !== this.fadeToken) return;
      const progress = Math.min(Math.max((timestamp - startedAt) / durationMs, 0), 1);
      // Smoothstep keeps short fades click-free without sounding sluggish.
      const eased = progress * progress * (3 - 2 * progress);
      this.setOutputVolume(startValue + (target - startValue) * eased);
      if (progress < 1) {
        this.fadeFrame = this.requestFrame(step);
      } else {
        this.fadeFrame = null;
        onComplete?.();
      }
    };
    this.fadeFrame = this.requestFrame(step);
  }

  getState() {
    return {
      active: this.active,
      muted: this.muted,
      musicVolume: this.volume,
      outputVolume: this.outputVolume,
      paused: this.audio?.paused ?? true,
      currentTime: this.audio?.currentTime ?? 0,
      duration: Number.isFinite(this.audio?.duration) ? this.audio.duration : 0,
      autoplayBlocked: this.autoplayBlocked,
      instanceCount: this.audio ? 1 : 0,
      instanceId: this.instanceId,
      loopMode: MENU_MUSIC.loopMode,
      nativeLoop: this.audio?.loop ?? true,
      src: this.audio?.currentSrc || this.audio?.src || MENU_MUSIC.src
    };
  }

  destroy() {
    this.active = false;
    this.cancelFade();
    this.unbindUnlock();
    this.boundDocument?.removeEventListener?.('visibilitychange', this.onVisibilityChange);
    this.boundDocument = null;
    this.boundWindow = null;
    if (this.audio) {
      this.audio.pause?.();
      this.audio.removeAttribute?.('src');
      this.audio.load?.();
      this.audio = null;
    }
    this.playPromise = null;
    this.playToken += 1;
    this.outputVolume = 0;
  }
}

export const MenuMusic = new MenuMusicController();
