import Phaser from 'phaser';
import { GAME_W, GAME_H } from '../config.js';
import {
  makeButton, makeIconButton, makeStatChip, titleText, bodyText,
  drawPanel, sceneIntro, formatCompact, configureHdCamera, FONT, UI, PRIMARY_BUTTON
} from '../ui.js';
import { SaveManager } from '../systems/SaveManager.js';
import { Audio } from '../systems/AudioSynth.js';
import { MenuMusic } from '../systems/MenuMusic.js';
import {
  COSMETIC_CATEGORIES, getCosmetic, getCosmeticsByCategory, kickerHdTextureKey
} from '../data/cosmetics.js';
import { ensureLoaded, queueLockerThumbnails } from '../data/kickerAssets.js';
import { CUPS } from '../data/levels.js';
import { PAL } from '../pixelart.js';
import { Kicker } from '../objects/Kicker.js';

const CATEGORY_META = {
  character: { label: 'PLAYERS', icon: 'kicker-hd-kit-home-idle' },
  kit: { label: 'KITS', icon: 'icon-kit' },
  ball: { label: 'BALLS', icon: 'ball-classic' },
  trail: { label: 'TRAILS', icon: 'icon-trail' }
};

// Tabs share one navy; the open one is a step lighter with a cream underline.
// Four saturated category faces made the tab row the loudest thing on screen.
const TAB_FACE = 0x14345e;
const TAB_FACE_SELECTED = 0x1d4678;
const BODY_COLOR = '#b8d3e7';
const MUTED_COLOR = '#9fb4c6';
const STYLE_COLOR = '#65e5c2';
const WARNING_COLOR = '#ff8e91';

// Legendary reads as amber rather than the primary-action gold.
const RARITY_COLORS = {
  common: PAL.muted,
  uncommon: PAL.greenHi,
  rare: PAL.blueHi,
  legendary: 0xff9f43
};

function css(color) {
  return `#${color.toString(16).padStart(6, '0')}`;
}

// Cosmetic data writes its stat lines as 'a · b · c'. On screen that reads as
// a spec sheet; commas make it a sentence.
function asSentence(value) {
  const text = String(value || '').replace(/\s*·\s*/g, ', ').trim();
  if (!text) return '';
  return /[.!?]$/.test(text) ? text : `${text}.`;
}

export class LockerScene extends Phaser.Scene {
  constructor() {
    super('Locker');
  }

  init(data = {}) {
    this.category = COSMETIC_CATEGORIES.includes(data.category) ? data.category : 'kit';
    this.requestedSelection = data.selectedId || null;
  }

  // Locker art is the one place the whole striker roster is on screen. Boot no
  // longer ships it, so the still frames this screen actually draws - every
  // character in the home kit, every kit on the previewed character - stream
  // on the way in. Roughly 10 frames rather than the full 192.
  preload() {
    let characterId;
    try {
      characterId = SaveManager.getEquippedCosmetic('character');
    } catch (error) {
      console.warn('[Locker] equipped character unavailable', error);
    }
    queueLockerThumbnails(this, characterId || undefined);
  }

  create() {
    configureHdCamera(this, { uiDepth: 50 });
    this.reducedMotion = Boolean(SaveManager.getSettings().reducedMotion);
    MenuMusic.enterMenu();
    this.add.image(0, 0, 'stadium-menu').setOrigin(0).setDepth(0);
    const wash = this.add.graphics().setDepth(1);
    wash.fillStyle(0x020816, 0.56);
    wash.fillRect(0, 0, GAME_W, GAME_H);
    wash.fillStyle(0x36bfff, 0.12);
    wash.fillTriangle(12, 31, 197, 31, 128, 260);

    this.selectedId = this.resolveSelection(this.requestedSelection);
    this.drawHeader();
    this.drawPanels();
    this.renderTabs();
    this.renderContent();

    if (!this.reducedMotion) sceneIntro(this);
  }

  resolveSelection(requested) {
    const requestedItem = getCosmetic(requested);
    if (requestedItem?.category === this.category) return requested;
    return SaveManager.getEquippedCosmetic(this.category)
      || getCosmeticsByCategory(this.category)[0]?.id;
  }

  drawHeader() {
    const g = this.add.graphics().setDepth(100);
    drawPanel(g, 7, 5, GAME_W - 14, 27, {
      fill: 0x0b244a
    });
    makeIconButton(this, 23, 18, 20, 'icon-back', () => this.scene.start('Menu'), {
      color: 0x14345e,
      hover: 0x1760bd,
      border: UI.edge,
      iconScale: 0.78,
      hitWidth: 31,
      hitHeight: 29
    }).setDepth(104);
    titleText(this, 59, 18, 'LOCKER', '15px', UI.creamText)
      .setOrigin(0, 0.5).setDepth(104);
    this.coinChip = makeStatChip(this, 425, 18, 80, 'icon-coin', formatCompact(SaveManager.getCoins()), {
      height: 21,
      fill: 0x07152f,
      border: UI.edge,
      fontSize: '8px',
      iconScale: 0.8
    }).setDepth(104);
  }

  drawPanels() {
    const g = this.add.graphics().setDepth(70);
    drawPanel(g, 9, 72, 190, 188, {
      fill: 0x0a1c3c
    });
    drawPanel(g, 207, 72, 264, 188, {
      fill: 0x0b244a
    });

    // A simple illuminated presentation stage keeps the detailed selected
    // sprite dominant and the surrounding chrome deliberately restrained.
    g.fillStyle(PAL.ink, 0.58);
    g.fillRect(14, 217, 180, 38);
    g.lineStyle(2, UI.edgeHi, 1);
    g.lineBetween(24, 89, 184, 89);
    for (let x = 30; x <= 180; x += 30) g.lineBetween(x, 89, x, 96);
    g.fillStyle(0x64d7ff, 0.08);
    g.fillTriangle(35, 91, 173, 91, 141, 245);
  }

  renderTabs() {
    if (this.tabLayer) {
      this.tabLayer.removeAll(true);
      this.tabLayer.destroy();
    }
    this.tabLayer = this.add.container(0, 0).setDepth(120);
    const xs = [64, 181, 299, 416];
    COSMETIC_CATEGORIES.forEach((category, index) => {
      const meta = CATEGORY_META[category];
      const selected = category === this.category;
      const iconScale = category === 'character'
        ? 0.075
        : category === 'ball'
          ? 10 / (this.textures.get(meta.icon).getSourceImage()?.width || 12)
          : 0.72;
      const button = makeButton(this, xs[index], 51, 100, 29, meta.label, () => {
        this.category = category;
        this.selectedId = SaveManager.getEquippedCosmetic(category)
          || getCosmeticsByCategory(category)[0]?.id;
        this.renderTabs();
        this.renderContent();
      }, {
        color: selected ? TAB_FACE_SELECTED : TAB_FACE,
        hover: TAB_FACE_SELECTED,
        selected,
        border: selected ? UI.cream : UI.edge,
        icon: meta.icon,
        iconScale,
        iconX: 14,
        fontSize: '9px',
        letterSpacing: 0.2,
        hitHeight: 32
      });
      this.tabLayer.add(button);
    });
  }

  clearContent() {
    this.kicker?.destroy();
    this.kicker = null;
    if (this.contentLayer) {
      this.contentLayer.removeAll(true);
      this.contentLayer.destroy();
    }
    this.contentLayer = this.add.container(0, 0).setDepth(130);
  }

  renderContent() {
    this.clearContent();
    const items = getCosmeticsByCategory(this.category);
    let selected = getCosmetic(this.selectedId);
    if (!selected || selected.category !== this.category) {
      selected = items[0];
      this.selectedId = selected?.id;
    }
    if (!selected) return;

    this.renderPreview(selected);
    this.renderCatalog(items, selected);
    this.coinChip.valueText.setText(formatCompact(SaveManager.getCoins()));
    this.streamMissingPreviewArt();
  }

  // Browsing a different striker needs that striker's kit thumbnails. Both the
  // grid tiles and the Kicker preview already fall back to procedural art, so
  // this upgrades the screen rather than gating it. It converges: the re-render
  // queues nothing the second time, so no further load is started.
  async streamMissingPreviewArt() {
    const characterId = this.category === 'character'
      ? this.selectedId
      : SaveManager.getEquippedCosmetic('character');
    const token = this.selectedId;
    const loaded = await ensureLoaded(this, (scene) => queueLockerThumbnails(scene, characterId));
    if (!loaded || !this.scene.isActive() || this.selectedId !== token) return;
    this.renderContent();
  }

  renderPreview(selected) {
    const equippedCharacter = this.category === 'character'
      ? selected.id
      : SaveManager.getEquippedCosmetic('character');
    const equippedKit = this.category === 'kit'
      ? selected.id
      : SaveManager.getEquippedCosmetic('kit');
    const ballFocus = selected.category === 'ball';
    const trailFocus = selected.category === 'trail';
    this.kicker = new Kicker(this, ballFocus ? 68 : 91, 222, {
      kitId: equippedKit,
      characterId: equippedCharacter,
      scale: ballFocus ? 3.25 : trailFocus ? 4.45 : 4.8,
      depth: 133,
      ambient: !this.reducedMotion,
      reducedMotion: this.reducedMotion
    });

    // The catalog thumbnails are intentionally compact, but the selected ball
    // needs a true hero read beside the richly shaded player art.
    if (ballFocus && this.textures.exists(selected.id)) {
      const ballShadow = this.add.graphics().setDepth(137);
      ballShadow.fillStyle(PAL.ink, 0.68);
      ballShadow.fillRect(113, 216, 50, 5);
      ballShadow.fillStyle(UI.edge, 0.45);
      ballShadow.fillRect(119, 213, 38, 3);
      const ball = this.add.image(138, 187, selected.id)
        .setDisplaySize(55, 55)
        .setDepth(139);
      this.contentLayer.add([ballShadow, ball]);
    }

    const trailId = this.category === 'trail'
      ? selected.id
      : SaveManager.getEquippedCosmetic('trail');
    const trail = getCosmetic(trailId);
    if (trail) {
      const line = this.add.graphics().setDepth(140);
      const points = trailFocus ? 16 : 9;
      for (let i = 0; i < points; i++) {
        const p = i / (points - 1);
        const color = i % 2 ? trail.palette.start : trail.palette.end;
        const alpha = trailFocus
          ? 0.24 + p * 0.68
          : (0.08 + p * 0.72) * (trail.utility?.opacity ?? 0.2);
        line.fillStyle(color, alpha);
        const size = Math.max(1, Math.ceil(p * (trailFocus ? 6 : 3)));
        line.fillRect(
          (trailFocus ? 34 + i * 8 : 120 + i * 4),
          (trailFocus ? 226 - i * 4.4 : 217 - i * 1.1),
          size,
          size
        );
      }
      this.contentLayer.add(line);
    }
  }

  renderCatalog(items, selected) {
    const rarity = RARITY_COLORS[selected.rarity] ?? PAL.muted;
    const name = titleText(this, 221, 87, selected.name.toUpperCase(), '12px', UI.creamText)
      .setOrigin(0, 0.5);
    const rarityText = bodyText(this, 458, 88, selected.rarity.toUpperCase(), {
      originX: 1,
      fontFamily: FONT,
      fontSize: '7px',
      color: css(rarity),
      letterSpacing: 0.2
    });
    this.contentLayer.add([name, rarityText]);

    // One short paragraph: what it is, then what it does. Items that change
    // nothing about the kick say so in two words instead of a disclaimer.
    const lines = [{ text: selected.description, color: BODY_COLOR }];
    if (selected.category === 'character') {
      lines.push({
        text: `${selected.archetype}, ${selected.dominantFoot}-footed, ${String(selected.personality).toLowerCase()}.`,
        color: MUTED_COLOR
      });
    }
    const effect = selected.gameplay
      ? `${selected.gameplay.ability || selected.gameplay.feel}: ${asSentence(selected.gameplay.summary)}`
      : selected.utility
        ? `${selected.utility.label}: ${asSentence(selected.utility.summary)}`
        : 'Looks only.';
    lines.push({ text: effect, color: STYLE_COLOR });

    let y = 98;
    lines.forEach(({ text, color }, index) => {
      const line = bodyText(this, 221, y, text, {
        originY: 0,
        fontSize: '7px',
        color,
        // Phaser wraps before letter spacing is applied, so leave it room.
        wordWrap: { width: 226, useAdvancedWrap: true },
        lineSpacing: 1,
        letterSpacing: 0.1
      });
      this.contentLayer.add(line);
      y += line.displayHeight + (index === 0 ? 4 : 2);
    });

    const compact = items.length > 6;
    items.forEach((item, index) => {
      const x = compact ? 225 + index * 33 : 231 + index * 43;
      this.contentLayer.add(this.makeCosmeticTile(x, 169, item, item.id === selected.id, compact));
    });

    const owned = SaveManager.ownsCosmetic(selected.id);
    const equipped = SaveManager.getEquippedCosmetic(selected.category) === selected.id;
    const gate = this.unlockGate(selected);
    const blocker = this.requirementText(selected, owned, gate);
    if (blocker) {
      this.contentLayer.add(bodyText(this, 221, 203, blocker, {
        fontSize: '7px',
        color: gate.available ? MUTED_COLOR : WARNING_COLOR,
        letterSpacing: 0.1
      }));
    }

    let label = `BUY ${selected.price}`;
    let icon = 'icon-coin';
    let disabled = !gate.available;
    if (owned && equipped) {
      label = 'EQUIPPED';
      icon = 'icon-check';
      disabled = true;
    } else if (owned) {
      label = 'EQUIP';
      icon = 'icon-check';
      disabled = false;
    } else if (!gate.available) {
      label = 'LOCKED';
      icon = 'icon-lock';
    }

    // Buying or equipping is this screen's one primary action, so while it is
    // available it gets the same gold key as Continue and Play Match.
    const action = makeButton(this, 339, 232, 224, 31, label, () => this.handleAction(selected), {
      ...(disabled ? { color: TAB_FACE, hover: TAB_FACE_SELECTED, border: UI.edge } : PRIMARY_BUTTON),
      icon,
      iconScale: 0.75,
      iconX: 18,
      fontSize: '9px',
      disabled,
      hitHeight: 34
    });
    // Ink glyph on the gold face, matching Play Match.
    if (!disabled) action.buttonIcon?.setTint(0x1b1303);
    this.contentLayer.add(action);
  }

  makeCosmeticTile(x, y, item, selected, compact = false) {
    const owned = SaveManager.ownsCosmetic(item.id);
    const gate = this.unlockGate(item);
    const rarity = RARITY_COLORS[item.rarity] ?? PAL.border;
    const button = makeButton(this, x, y, compact ? 29 : 38, compact ? 34 : 39, '', () => {
      this.selectedId = item.id;
      this.renderContent();
    }, {
      color: selected ? 0x2b4557 : PAL.night,
      hover: 0x2b4557,
      border: selected ? UI.cream : rarity,
      selected,
      hitWidth: compact ? 31 : 41,
      hitHeight: compact ? 37 : 43
    });

    let texture;
    if (item.category === 'character') {
      texture = kickerHdTextureKey(item.id, 'kit-home', 'idle');
    } else if (item.category === 'kit') texture = `icon-${item.id}`;
    else if (item.category === 'ball') texture = item.id;
    else texture = `icon-${item.id}`;
    const previewTexture = this.textures.exists(texture) ? texture : CATEGORY_META[item.category].icon;
    const ballScale = (compact ? 16 : 20) /
      (this.textures.get(previewTexture).getSourceImage()?.width || 12);
    const preview = this.add.image(0, -2, previewTexture)
      .setScale(item.category === 'character' ? 0.11 : item.category === 'ball' ? ballScale : 1);
    button.add(preview);

    if (owned) {
      button.add(this.add.image(compact ? 9 : 12, compact ? 10 : 12, 'icon-check').setScale(0.42));
    } else if (!gate.available) {
      button.add(this.add.image(compact ? 9 : 12, compact ? 10 : 12, 'icon-lock').setScale(0.44).setAlpha(0.78));
    } else {
      button.add(this.add.image(compact ? 9 : 12, compact ? 10 : 12, 'icon-coin').setScale(0.42));
    }
    return button;
  }

  unlockGate(item) {
    const unlock = item.unlock || { type: 'coins', value: item.price };
    switch (unlock.type) {
      case 'starter':
      case 'coins':
        return { available: true };
      case 'stars':
        return { available: SaveManager.getTotalStars() >= Number(unlock.value || 0) };
      case 'cup': {
        const cup = CUPS.find((entry) => entry.id === unlock.value);
        const complete = Boolean(cup?.levelIds.length)
          && cup.levelIds.every((id) => SaveManager.getStars(id) > 0);
        return { available: complete, cup };
      }
      case 'daily': {
        const completed = SaveManager.getDaily().completedDates?.length || 0;
        return { available: completed >= Number(unlock.value || 0), completed };
      }
      default:
        return { available: false };
    }
  }

  // Only say something when a thing stands between the player and the item.
  // Owned and equipped states are already on the button.
  requirementText(item, owned, gate) {
    if (owned) return null;
    const unlock = item.unlock || { type: 'coins', value: item.price };
    if (!gate.available) {
      if (unlock.type === 'stars') return `Earn ${unlock.value} stars to unlock.`;
      if (unlock.type === 'cup') return `Win ${gate.cup?.name || 'the cup'} to unlock.`;
      if (unlock.type === 'daily') return `Play ${unlock.value} daily kicks to unlock.`;
      return 'Keep playing to unlock.';
    }
    const shortfall = Math.max(0, item.price - SaveManager.getCoins());
    return shortfall > 0 ? `You need ${shortfall} more coins.` : null;
  }

  handleAction(item) {
    if (SaveManager.ownsCosmetic(item.id)) {
      SaveManager.equipCosmetic(item.id);
      Audio.unlock();
      this.renderContent();
      this.kicker?.celebrate();
      return;
    }

    if (SaveManager.purchaseCosmetic(item.id)) {
      SaveManager.equipCosmetic(item.id);
      Audio.coin();
      this.renderContent();
      this.kicker?.celebrate();
      return;
    }

    const needed = Math.max(0, item.price - SaveManager.getCoins());
    const warning = bodyText(this, 339, 211, `You need ${needed} more coins.`, {
      originX: 0.5,
      fontFamily: FONT,
      fontSize: '7px',
      color: '#e38a70'
    }).setDepth(500);
    this.tweens.add({
      targets: warning,
      x: { from: 336, to: 342 },
      duration: 45,
      yoyo: true,
      repeat: 2,
      ease: 'Sine.easeInOut'
    });
    this.tweens.add({
      targets: warning,
      alpha: 0,
      y: 205,
      delay: 420,
      duration: 180,
      ease: 'Cubic.easeOut',
      onComplete: () => warning.destroy()
    });
  }
}
