import { Audio } from './AudioSynth.js';
import { GAMEPLAY_CROWD_MIX, GameplayAmbience, MenuMusic } from './MenuMusic.js';
import { PlatformService } from './PlatformService.js';
import { AIM_ASSIST_MODES, DEFAULT_SETTINGS, SaveManager } from './SaveManager.js';

const BOOLEAN_SETTINGS = Object.freeze([
  'muted', 'reducedMotion', 'screenShake', 'highContrast'
]);

function toPercent(value) {
  return `${Math.round(Math.max(0, Math.min(1, Number(value) || 0)) * 100)}%`;
}

export function applyDocumentSettings(settings = {}, root = globalThis.document?.documentElement) {
  if (!root?.classList) return false;
  root.classList.toggle('fkl-high-contrast', Boolean(settings.highContrast));
  root.classList.toggle('fkl-reduced-motion', Boolean(settings.reducedMotion));
  return true;
}

export function applyRuntimeSettings(settings = {}) {
  const muted = Boolean(settings.muted || PlatformService.shouldMuteAudio());
  Audio.setMuted(muted);
  Audio.setVolume(settings.sfxVolume ?? DEFAULT_SETTINGS.sfxVolume);
  MenuMusic.setMuted(muted);
  MenuMusic.setVolume(settings.musicVolume ?? DEFAULT_SETTINGS.musicVolume);
  GameplayAmbience.setMuted(muted);
  GameplayAmbience.setVolume((settings.musicVolume ?? DEFAULT_SETTINGS.musicVolume) * GAMEPLAY_CROWD_MIX);
  applyDocumentSettings(settings);
  return { ...settings, muted };
}

export class SettingsPanelController {
  constructor() {
    this.panel = null;
    this.card = null;
    this.previousFocus = null;
    this.onChange = null;
    this.onClose = null;
    this.bound = false;
  }

  initialize(documentRef = globalThis.document) {
    if (this.bound && this.panel?.isConnected) return true;
    const panel = documentRef?.getElementById?.('settings-panel');
    if (!panel) return false;

    this.panel = panel;
    this.card = panel.querySelector('[role="dialog"]');
    this.bound = true;

    panel.querySelectorAll('[data-setting]').forEach((control) => {
      if (control.type === 'range') {
        control.addEventListener('input', () => this.updateVolumeOutput(control));
      }
      control.addEventListener('change', () => this.commitControl(control));
    });
    panel.querySelector('[data-action="close"]')?.addEventListener('click', () => {
      Audio.ui();
      this.close();
    });
    panel.querySelector('[data-action="reset"]')?.addEventListener('click', () => {
      Audio.ui();
      this.commit(DEFAULT_SETTINGS);
    });
    panel.addEventListener('pointerdown', (event) => {
      if (event.target === panel) this.close();
    });
    panel.addEventListener('keydown', (event) => this.handleKeydown(event));
    return true;
  }

  open({ onChange = null, onClose = null } = {}) {
    if (!this.initialize()) return false;
    this.onChange = onChange;
    this.onClose = onClose;
    this.previousFocus = globalThis.document?.activeElement ?? null;
    this.sync(SaveManager.getSettings());
    this.panel.hidden = false;
    this.panel.classList.add('is-open');
    globalThis.document?.body?.classList.add('settings-open');
    this.panel.querySelector('[data-action="close"]')?.focus?.();
    return true;
  }

  close() {
    if (!this.panel || this.panel.hidden) return false;
    this.panel.classList.remove('is-open');
    this.panel.hidden = true;
    globalThis.document?.body?.classList.remove('settings-open');
    const callback = this.onClose;
    this.onChange = null;
    this.onClose = null;
    this.previousFocus?.focus?.();
    this.previousFocus = null;
    callback?.();
    return true;
  }

  commitControl(control) {
    const key = control?.dataset?.setting;
    if (!key) return;
    let value;
    if (BOOLEAN_SETTINGS.includes(key)) value = Boolean(control.checked);
    else if (key === 'musicVolume' || key === 'sfxVolume') value = Number(control.value);
    else if (key === 'aimAssist') value = AIM_ASSIST_MODES.includes(control.value)
      ? control.value
      : DEFAULT_SETTINGS.aimAssist;
    else return;
    this.commit({ [key]: value });
  }

  commit(patch) {
    const settings = SaveManager.updateSettings(patch);
    applyRuntimeSettings(settings);
    this.sync(settings);
    this.onChange?.({ ...settings });
    if (typeof globalThis.dispatchEvent === 'function' && typeof globalThis.CustomEvent === 'function') {
      globalThis.dispatchEvent(new globalThis.CustomEvent('fkl:settingschange', {
        detail: { ...settings }
      }));
    }
    return settings;
  }

  sync(settings) {
    if (!this.panel) return;
    this.panel.querySelectorAll('[data-setting]').forEach((control) => {
      const key = control.dataset.setting;
      if (!(key in settings)) return;
      if (BOOLEAN_SETTINGS.includes(key)) control.checked = Boolean(settings[key]);
      else control.value = String(settings[key]);
      if (control.type === 'range') this.updateVolumeOutput(control);
    });
  }

  updateVolumeOutput(control) {
    const output = this.panel?.querySelector(`[data-output="${control.dataset.setting}"]`);
    if (output) output.textContent = toPercent(control.value);
  }

  handleKeydown(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.close();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = [...this.panel.querySelectorAll(
      'button:not([disabled]), input:not([disabled]), select:not([disabled])'
    )].filter((element) => !element.hidden);
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && globalThis.document?.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && globalThis.document?.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }
}

export const SettingsPanel = new SettingsPanelController();
