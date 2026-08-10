import test from 'node:test';
import assert from 'node:assert/strict';
import { makeButton, setCanvasButtonNavigationBlocked } from '../src/ui.js';
import { Audio } from '../src/systems/AudioSynth.js';

class Emitter {
  constructor() {
    this.listeners = new Map();
  }

  on(event, callback) {
    const listeners = this.listeners.get(event) || [];
    listeners.push(callback);
    this.listeners.set(event, listeners);
    return this;
  }

  once(event, callback) {
    const once = (...args) => {
      this.off(event, once);
      callback(...args);
    };
    return this.on(event, once);
  }

  off(event, callback) {
    const listeners = this.listeners.get(event) || [];
    this.listeners.set(event, listeners.filter((listener) => listener !== callback));
    return this;
  }

  emit(event, ...args) {
    for (const callback of [...(this.listeners.get(event) || [])]) callback(...args);
    return this;
  }
}

class Graphics {
  constructor() {
    this.rects = [];
  }

  clear() { this.rects = []; return this; }
  fillStyle(color, alpha) { this.fill = { color, alpha }; return this; }
  fillRect(x, y, width, height) {
    this.rects.push({ x, y, width, height, ...this.fill });
    return this;
  }
}

class DisplayObject extends Emitter {
  constructor(x = 0, y = 0) {
    super();
    this.x = x;
    this.y = y;
    this.active = true;
    this.visible = true;
    this.alpha = 1;
  }

  setOrigin() { return this; }
  setResolution() { return this; }
  setLetterSpacing() { return this; }
  setY(value) { this.y = value; return this; }
  setAlpha(value) { this.alpha = value; return this; }
  setScale() { return this; }
  setVisible(value) { this.visible = Boolean(value); return this; }
}

class Container extends DisplayObject {
  constructor(x, y, children) {
    super(x, y);
    this.list = children;
    this.input = null;
  }

  setSize(width, height) { this.width = width; this.height = height; return this; }
  setInteractive() {
    this.input = this.input || {};
    this.input.enabled = true;
    return this;
  }
  disableInteractive() {
    this.input = this.input || {};
    this.input.enabled = false;
    return this;
  }
  destroy() {
    this.active = false;
    this.emit('destroy');
  }
}

function makeScene() {
  const keyboard = new Emitter();
  const events = new Emitter();
  const attributes = new Map();
  const canvasListeners = new Map();
  const canvas = {
    setAttribute: (name, value) => attributes.set(name, value),
    getAttribute: (name) => attributes.get(name),
    addEventListener: (name, callback) => canvasListeners.set(name, callback),
    focus() { globalThis.document.activeElement = this; },
    dispatchPointerDown() { canvasListeners.get('pointerdown')?.(); }
  };
  const status = { textContent: '' };
  return {
    keyboard,
    canvas,
    status,
    scene: {
      input: { keyboard },
      events,
      game: { canvas },
      add: {
        graphics: () => new Graphics(),
        text: (x, y, text) => Object.assign(new DisplayObject(x, y), { text }),
        image: (x, y, texture) => Object.assign(new DisplayObject(x, y), { texture: { key: texture } }),
        container: (x, y, children) => new Container(x, y, children)
      }
    }
  };
}

function keyEvent(overrides = {}) {
  return {
    repeat: false,
    shiftKey: false,
    prevented: 0,
    preventDefault() { this.prevented++; },
    ...overrides
  };
}

test('shared buttons expose focus, spatial navigation, activation, and skip unavailable controls', () => {
  const originalDocument = globalThis.document;
  const wasMuted = Audio.muted;
  Audio.setMuted(true);

  try {
    const { scene, keyboard, canvas, status } = makeScene();
    const body = {};
    globalThis.document = {
      querySelector: () => null,
      getElementById: (id) => id === 'game-status' ? status : null,
      activeElement: body
    };
    const activations = { left: 0, right: 0, down: 0 };
    const left = makeButton(scene, 20, 20, 40, 20, 'LEFT', () => { activations.left++; });
    const right = makeButton(scene, 100, 20, 40, 20, 'RIGHT', () => { activations.right++; });
    const down = makeButton(scene, 100, 80, 40, 20, 'DOWN', () => { activations.down++; });
    makeButton(scene, 180, 20, 40, 20, 'DISABLED', () => {}, { disabled: true });
    const hidden = makeButton(scene, 240, 20, 40, 20, 'HIDDEN', () => {});
    hidden.setVisible(false);

    const pageTab = keyEvent();
    keyboard.emit('keydown-TAB', pageTab);
    assert.equal(left.buttonFocused, false);
    assert.equal(pageTab.prevented, 0, 'page Tab is free to enter the canvas');

    canvas.dispatchPointerDown();
    assert.equal(globalThis.document.activeElement, canvas, 'pointer entry gives the canvas keyboard ownership');

    const firstTab = keyEvent();
    keyboard.emit('keydown-TAB', firstTab);
    assert.equal(left.buttonFocused, true);
    assert.equal(firstTab.prevented, 1);
    assert.equal(status.textContent, 'LEFT button');
    assert.equal(canvas.getAttribute('tabindex'), '0');
    assert.equal(canvas.getAttribute('role'), 'application');
    assert.match(canvas.getAttribute('aria-label'), /Press Tab to enter game controls/);
    assert.ok(
      left.list[0].rects.some((rect) => rect.width === 44 && rect.height === 1),
      'keyboard focus draws an outer pixel frame'
    );

    keyboard.emit('keydown-TAB', keyEvent());
    assert.equal(right.buttonFocused, true);
    keyboard.emit('keydown-TAB', keyEvent({ shiftKey: true }));
    assert.equal(left.buttonFocused, true);

    keyboard.emit('keydown-TAB', keyEvent());
    assert.equal(right.buttonFocused, true);
    const replayedReverseTab = keyEvent({
      shiftKey: true,
      type: 'keydown',
      code: 'Tab',
      timeStamp: 1234
    });
    keyboard.emit('keydown-TAB', replayedReverseTab);
    replayedReverseTab.cancelled = 0;
    keyboard.emit('keydown-TAB', replayedReverseTab);
    replayedReverseTab.cancelled = 0;
    keyboard.emit('keydown-TAB', replayedReverseTab);
    assert.equal(left.buttonFocused, true, 'one replayed Shift+Tab event advances only once');

    keyboard.emit('keydown-RIGHT', keyEvent());
    assert.equal(right.buttonFocused, true);
    keyboard.emit('keydown-DOWN', keyEvent());
    assert.equal(down.buttonFocused, true);

    keyboard.emit('keydown-ENTER', keyEvent());
    keyboard.emit('keydown-SPACE', keyEvent());
    keyboard.emit('keydown-SPACE', keyEvent({ repeat: true }));
    assert.equal(activations.down, 2, 'Enter and Space activate once; repeats are ignored');

    assert.equal(setCanvasButtonNavigationBlocked(scene, true), true);
    assert.equal(down.buttonFocused, false, 'blocking navigation clears stale keyboard focus');
    const blockedTab = keyEvent();
    keyboard.emit('keydown-TAB', blockedTab);
    keyboard.emit('keydown-ENTER', keyEvent());
    assert.equal(blockedTab.prevented, 1, 'a modal blocker retains focus inside the canvas');
    assert.equal(activations.down, 2, 'a modal blocker suppresses activation');
    setCanvasButtonNavigationBlocked(scene, false);
    keyboard.emit('keydown-TAB', keyEvent());
    assert.equal(left.buttonFocused, true, 'navigation resumes from the first available action');

    down.setButtonEnabled(false);
    assert.equal(down.buttonFocused, false);
    keyboard.emit('keydown-TAB', keyEvent({ shiftKey: true }));
    assert.equal(right.buttonFocused, true, 'disabled and hidden trailing buttons are skipped');

    right.setVisible(false);
    keyboard.emit('keydown-TAB', keyEvent({ shiftKey: true }));
    assert.equal(left.buttonFocused, true, 'a button hidden after focus is skipped');

    left.emit('pointerover');
    left.emit('pointerdown');
    left.emit('pointerup');
    assert.equal(activations.left, 1, 'pointer activation remains intact');

    left.destroy();
    const noTarget = keyEvent();
    keyboard.emit('keydown-TAB', noTarget);
    assert.equal(noTarget.prevented, 0, 'destroyed buttons are removed from navigation');

    globalThis.document.querySelector = () => ({ closest: () => null });
    right.setVisible(true);
    const dialogTab = keyEvent();
    keyboard.emit('keydown-TAB', dialogTab);
    assert.equal(right.buttonFocused, false);
    assert.equal(dialogTab.prevented, 0, 'an active DOM dialog retains keyboard ownership');
  } finally {
    Audio.setMuted(wasMuted);
    globalThis.document = originalDocument;
  }
});
