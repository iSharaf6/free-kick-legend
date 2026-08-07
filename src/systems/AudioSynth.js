export const AUDIO_SAMPLES = Object.freeze({
  ui: Object.freeze({
    key: 'audio-ui-button-press',
    path: 'assets/audio/ui-button-press.mp3',
    duration: 0.18,
    volume: 0.5
  }),
  post: Object.freeze({
    key: 'audio-post-impact',
    path: 'assets/audio/post-impact.mp3',
    duration: 0.82,
    volume: 0.72
  })
});

// WebAudio synth plus two short, authored samples. The context remains lazy;
// Phaser decodes the supplied clips during Boot and hands us its shared sound
// manager, so the first real pointer gesture can play without a second fetch.
export class Synth {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.volume = 0.85;
    this.noiseBuffer = null;
    this.soundManager = null;
    this.activeSamples = new Set();
    this.lastSample = null;
  }

  bindSoundManager(soundManager) {
    this.soundManager = soundManager || null;
    return this;
  }

  _ensure() {
    if (this.muted) return null;
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      this.ctx = new AC();
      this.noiseBuffer = this._makeNoiseBuffer(this.ctx, 2);
      // Master bus: every voice routes through this gain so mute and volume
      // changes silence or rescale sounds that are already playing.
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : this.volume;
      this.master.connect(this.ctx.destination);
    }
    this._resumeContext();
    return this.ctx;
  }

  _resumeContext() {
    if (!this.ctx || this.ctx.state !== 'suspended') return;
    try {
      // Browsers commonly reject resume() before the first trusted gesture.
      // It is an expected autoplay-policy result, not a gameplay failure, and
      // leaving the promise unobserved can surface as a minified GeneralError.
      this.ctx.resume()?.catch?.(() => false);
    } catch {
      // A denied/closed audio context must never block menus or gameplay.
    }
  }

  _applyMasterGain() {
    if (!this.ctx || !this.master) return;
    const target = this.muted ? 0 : this.volume;
    this.master.gain.cancelScheduledValues(this.ctx.currentTime);
    // 10ms exponential approach: instant to the ear, no click on the way out.
    this.master.gain.setTargetAtTime(target, this.ctx.currentTime, 0.01);
  }

  _applySampleMix() {
    for (const voice of this.activeSamples) {
      if (!voice.sound?.isPlaying) continue;
      voice.sound.setVolume?.(this.muted ? 0 : this.volume * voice.mix);
    }
  }

  _playSample(name, { rate = 1 } = {}) {
    const sample = AUDIO_SAMPLES[name];
    const manager = this.soundManager;
    if (!sample || this.muted || !manager?.add) return false;

    let sound;
    try {
      sound = manager.add(sample.key);
      if (!sound?.addMarker) return false;
      const marker = `fkl-${name}`;
      sound.addMarker({ name: marker, start: 0, duration: sample.duration });
      const voice = { sound, mix: sample.volume };
      let cleaned = false;
      const cleanup = () => {
        if (cleaned) return;
        cleaned = true;
        this.activeSamples.delete(voice);
        sound.destroy?.();
      };
      sound.once?.('complete', cleanup);
      sound.once?.('stop', cleanup);
      this.activeSamples.add(voice);
      const played = sound.play(marker, {
        volume: this.volume * sample.volume,
        rate
      });
      if (!played) {
        cleanup();
        return false;
      }
      this.lastSample = {
        name,
        key: sample.key,
        duration: sample.duration,
        rate,
        volume: this.volume * sample.volume
      };
      return true;
    } catch {
      sound?.destroy?.();
      return false;
    }
  }

  _makeNoiseBuffer(ctx, seconds) {
    const len = Math.ceil(ctx.sampleRate * seconds);
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    // Brown-ish stadium noise: less brittle than fresh white-noise buffers.
    let last = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      last = last * 0.965 + white * 0.035;
      data[i] = Math.max(-1, Math.min(1, last * 3.2));
    }
    return buffer;
  }

  setMuted(muted) {
    this.muted = Boolean(muted);
    // Do not construct or resume WebAudio while Boot is still loading. The
    // first actual UI/kick sound runs inside a trusted gesture and calls
    // _ensure(); an existing context can still be resumed when unmuted.
    if (!this.muted && this.ctx) this._resumeContext();
    this._applyMasterGain();
    this._applySampleMix();
  }

  toggleMuted() {
    this.setMuted(!this.muted);
    return this.muted;
  }

  setVolume(value) {
    this.volume = Math.max(0, Math.min(1, Number(value) || 0));
    // Volume lives on the SFX bus so changes also affect voices that are
    // already ringing out rather than only the next synthesized sound.
    this._applyMasterGain();
    this._applySampleMix();
  }

  prepare() {
    this._ensure();
  }

  _tone({ freq = 440, end = freq, time = 0.15, type = 'sine', vol = 0.2, when = 0 }) {
    const ctx = this._ensure();
    if (!ctx) return;
    const t0 = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    osc.frequency.exponentialRampToValueAtTime(Math.max(end, 1), t0 + time);
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + time);
    osc.connect(gain).connect(this.master ?? ctx.destination);
    osc.start(t0);
    osc.stop(t0 + time + 0.02);
  }

  _noise({ time = 0.4, vol = 0.15, freq = 1000, when = 0, rampUp = 0.02 }) {
    const ctx = this._ensure();
    if (!ctx) return;
    const t0 = ctx.currentTime + when;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer || this._makeNoiseBuffer(ctx, 2);
    src.loop = time > 1.95;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = freq;
    filter.Q.value = 0.6;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.linearRampToValueAtTime(vol, t0 + rampUp);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + time);
    src.connect(filter).connect(gain).connect(this.master ?? ctx.destination);
    src.start(t0);
    src.stop(t0 + time + 0.02);
  }

  kick(power = 0.75) {
    const p = Math.max(0.25, Math.min(1, power));
    this._tone({ freq: 145 + p * 35, end: 42, time: 0.09 + p * 0.04, type: 'sine', vol: 0.3 + p * 0.24 });
    this._noise({ time: 0.045 + p * 0.025, vol: 0.08 + p * 0.08, freq: 2100 + p * 900 });
  }

  whoosh(amount = 0.5) {
    const a = Math.max(0, Math.min(1, amount));
    this._noise({ time: 0.22, vol: 0.025 + a * 0.045, freq: 1500 + a * 900, rampUp: 0.06 });
  }

  post(frame = 'post') {
    const sampled = this._playSample('post', { rate: frame === 'crossbar' ? 1.08 : 0.98 });
    const high = frame === 'crossbar' ? 2650 : 2200;
    this._tone({ freq: high, end: high * 0.78, time: 0.24, type: 'square', vol: sampled ? 0.045 : 0.1 });
    this._tone({ freq: high * 0.5, end: high * 0.39, time: 0.32, type: 'triangle', vol: sampled ? 0.07 : 0.17 });
    if (!sampled) {
      this._tone({ freq: high * 0.25, end: high * 0.2, time: 0.24, type: 'sine', vol: 0.08, when: 0.025 });
    }
  }

  goal() {
    [523, 659, 784, 1047].forEach((f, i) =>
      this._tone({ freq: f, time: 0.22, type: 'triangle', vol: 0.18, when: i * 0.09 }));
    this.cheer();
    this._tone({ freq: 1760, end: 2240, time: 0.28, type: 'sine', vol: 0.06, when: 0.22 });
  }

  save() {
    this._noise({ time: 0.12, vol: 0.2, freq: 700 });
  }

  cheer() {
    // Two rolling stadium waves make a goal unmistakable even on laptop
    // speakers, while the layered bands avoid sounding like plain static.
    this._noise({ time: 3.2, vol: 0.36, freq: 460, rampUp: 0.08 });
    this._noise({ time: 3.1, vol: 0.29, freq: 920, rampUp: 0.10 });
    this._noise({ time: 2.8, vol: 0.20, freq: 1850, rampUp: 0.16 });
    this._noise({ time: 2.55, vol: 0.13, freq: 3300, rampUp: 0.22 });
    this._noise({ time: 2.5, vol: 0.22, freq: 700, when: 0.42, rampUp: 0.09 });
    this._noise({ time: 2.35, vol: 0.15, freq: 1450, when: 0.48, rampUp: 0.12 });
    [330, 392, 440, 523, 587].forEach((freq, index) => {
      this._tone({
        freq,
        end: freq * 1.045,
        time: 0.58,
        type: 'triangle',
        vol: 0.034,
        when: 0.10 + index * 0.09
      });
    });
  }

  groan() {
    this._noise({ time: 0.8, vol: 0.12, freq: 350, rampUp: 0.2 });
  }

  whistle() {
    this._tone({ freq: 2350, end: 2250, time: 0.35, type: 'square', vol: 0.06 });
  }

  ui() {
    if (this._playSample('ui')) return;
    this._tone({ freq: 700, end: 900, time: 0.08, type: 'sine', vol: 0.15 });
  }

  coin() {
    this._tone({ freq: 880, end: 1320, time: 0.11, type: 'square', vol: 0.08 });
    this._tone({ freq: 1320, end: 1760, time: 0.1, type: 'triangle', vol: 0.1, when: 0.07 });
  }

  star(index = 0) {
    const notes = [659, 784, 988];
    const f = notes[Math.max(0, Math.min(notes.length - 1, index))];
    this._tone({ freq: f, end: f * 1.18, time: 0.18, type: 'triangle', vol: 0.16 });
  }

  unlock() {
    [440, 554, 659, 880].forEach((f, i) =>
      this._tone({ freq: f, end: f * 1.04, time: 0.2, type: 'triangle', vol: 0.12, when: i * 0.075 }));
  }

  net() {
    this._noise({ time: 0.28, vol: 0.09, freq: 1750, rampUp: 0.015 });
  }

  tick() {
    this._tone({ freq: 1200, end: 1200, time: 0.04, type: 'sine', vol: 0.1 });
  }
}

export const Audio = new Synth();
