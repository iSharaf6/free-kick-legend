const BASE_URL = typeof import.meta.env?.BASE_URL === 'string' ? import.meta.env.BASE_URL : '/';

export const MENU_MUSIC = Object.freeze({
  src: `${BASE_URL}assets/audio/free-kick-legend-menu.mp3`,
  defaultVolume: 0.3,
  // The source is 2:58.992. Analysis found a 150 BPM grid beginning near
  // 0.08s and the authored fade beginning on the 166.48s bar line. Returning
  // to 51.28s keeps the loop on an eight-bar phrase boundary at full energy.
  loopStart: 51.28,
  loopEnd: 166.48,
  loopFadeOutMs: 48,
  loopFadeInMs: 72,
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
    this.loopFrame = null;
    this.loopPending = false;
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
    this.onAudioPlay = () => this.startLoopMonitor();
    this.onAudioPause = () => this.stopLoopMonitor();
    this.onAudioEnded = () => {
      if (!this.audio || !this.active || this.muted || this.hidden) return;
      this.audio.currentTime = MENU_MUSIC.loopStart;
      this.attemptPlay(MENU_MUSIC.loopFadeInMs);
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
    audio.loop = false;
    audio.autoplay = false;
    audio.playsInline = true;
    audio.controls = false;
    audio.disableRemotePlayback = true;
    audio.volume = 0;
    audio.addEventListener?.('play', this.onAudioPlay);
    audio.addEventListener?.('pause', this.onAudioPause);
    audio.addEventListener?.('ended', this.onAudioEnded);
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
    this.loopPending = false;
    this.ensureAudio();
    if (!this.muted && !this.hidden) this.attemptPlay(MENU_MUSIC.resumeFadeMs);
    return this.getState();
  }

  leaveMenu(fadeMs = MENU_MUSIC.sceneFadeMs) {
    this.active = false;
    this.loopPending = false;
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
    this.loopPending = false;
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
    if (this.loopPending) return this.volume;
    if (this.audio && !this.audio.paused && this.active && !this.muted && !this.hidden) {
      this.fadeTo(this.volume, 60);
    }
    return this.volume;
  }

  handleVisibility(hidden) {
    this.hidden = Boolean(hidden);
    this.loopPending = false;
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

  startLoopMonitor() {
    if (this.loopFrame !== null || !this.audio || this.audio.paused) return;
    const check = () => {
      this.loopFrame = null;
      const audio = this.audio;
      if (!audio || audio.paused || !this.active || this.muted || this.hidden) return;
      const fadeLead = MENU_MUSIC.loopFadeOutMs / 1000;
      if (!this.loopPending && audio.currentTime >= MENU_MUSIC.loopEnd - fadeLead) {
        this.loopPending = true;
        this.fadeTo(0, MENU_MUSIC.loopFadeOutMs, () => this.performLoop());
        return;
      }
      this.loopFrame = this.requestFrame(check);
    };
    this.loopFrame = this.requestFrame(check);
  }

  stopLoopMonitor() {
    if (this.loopFrame !== null) this.cancelFrame(this.loopFrame);
    this.loopFrame = null;
  }

  performLoop() {
    const audio = this.audio;
    if (!audio || !this.active || this.muted || this.hidden) {
      this.loopPending = false;
      return;
    }
    const overrun = Math.max(0, audio.currentTime - MENU_MUSIC.loopEnd);
    audio.currentTime = MENU_MUSIC.loopStart + Math.min(overrun, 0.12);
    this.loopPending = false;
    this.fadeTo(this.volume, MENU_MUSIC.loopFadeInMs);
    this.startLoopMonitor();
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
      loopStart: MENU_MUSIC.loopStart,
      loopEnd: MENU_MUSIC.loopEnd,
      src: this.audio?.currentSrc || this.audio?.src || MENU_MUSIC.src
    };
  }

  destroy() {
    this.active = false;
    this.cancelFade();
    this.stopLoopMonitor();
    this.unbindUnlock();
    this.boundDocument?.removeEventListener?.('visibilitychange', this.onVisibilityChange);
    this.boundDocument = null;
    this.boundWindow = null;
    if (this.audio) {
      this.audio.removeEventListener?.('play', this.onAudioPlay);
      this.audio.removeEventListener?.('pause', this.onAudioPause);
      this.audio.removeEventListener?.('ended', this.onAudioEnded);
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
