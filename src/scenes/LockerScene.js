import Phaser from 'phaser';
import { GAME_W, GAME_H } from '../config.js';
import {
  makeButton, makeIconButton, makeStatChip, titleText, bodyText,
  drawPanel, sceneIntro, formatCompact, configureHdCamera, FONT
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
  character: { label: 'PLAYERS', icon: 'kicker-hd-kit-home-idle', color: 0x087b4c },
  kit: { label: 'KITS', icon: 'icon-kit', color: 0x1760bd },
  ball: { label: 'BALLS', icon: 'ball-classic', color: 0xc87312 },
  trail: { label: 'TRAILS', icon: 'icon-trail', color: 0x6238ae }
};

const RARITY_COLORS = {
  common: PAL.muted,
  uncommon: PAL.greenHi,
  rare: PAL.blueHi,
  legendary: PAL.gold
};

function css(color) {
  return `#${color.toString(16).padStart(6, '0')}`;
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
    configureHdCamera(this);
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
      fill: 0x0b244a,
      border: 0x3478b8,
      corner: 0x27b8f4
    });
    makeIconButton(this, 23, 18, 20, 'icon-back', () => this.scene.start('Menu'), {
      color: 0x14345e,
      hover: 0x1760bd,
      border: 0x3478b8,
      iconScale: 0.78,
      hitWidth: 31,
      hitHeight: 29
    }).setDepth(104);
    titleText(this, 59, 18, 'LOCKER', '15px', '#f7fbff')
      .setOrigin(0, 0.5).setDepth(104);
    bodyText(this, 276, 18, 'MATCHDAY CUSTOMISATION', {
      originX: 0.5,
      fontSize: '5px',
      color: '#9ccce8',
      letterSpacing: 0.26
    }).setDepth(104);
    this.add.image(359, 18, 'calynx-logo-pixel')
      .setDisplaySize(38, 11.5).setTint(0x64d7ff).setDepth(104);
    this.coinChip = makeStatChip(this, 425, 18, 80, 'icon-coin', formatCompact(SaveManager.getCoins()), {
      height: 21,
      fill: 0x07152f,
      border: 0x3478b8,
      fontSize: '8px',
      iconScale: 0.8
    }).setDepth(104);
  }

  drawPanels() {
    const g = this.add.graphics().setDepth(70);
    drawPanel(g, 9, 72, 190, 188, {
      fill: 0x0a1c3c,
      border: 0x3478b8,
      corner: 0x27b8f4
    });
    drawPanel(g, 207, 72, 264, 188, {
      fill: 0x0b244a,
      border: 0x3478b8,
      corner: 0xffc928
    });

    // A simple illuminated presentation stage keeps the detailed selected
    // sprite dominant and the surrounding chrome deliberately restrained.
    g.fillStyle(PAL.ink, 0.58);
    g.fillRect(14, 217, 180, 38);
    g.lineStyle(2, 0x3478b8, 1);
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
        color: selected ? meta.color : 0x14345e,
        hover: meta.color,
        selected,
        border: selected ? 0xffc928 : 0x3478b8,
        icon: meta.icon,
        iconScale,
        iconX: 14,
        fontSize: category === 'character' ? '8px' : '9px',
        letterSpacing: 0.45,
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
      ballShadow.fillStyle(0x3478b8, 0.45);
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

    const previewLabel = selected.category === 'character'
      ? 'SELECTED PLAYER PREVIEW'
      : `SELECTED ${selected.category.toUpperCase()} PREVIEW`;
    const selectedLabel = bodyText(this, 104, 244, previewLabel, {
      originX: 0.5,
      fontSize: '6px',
      color: '#9ccce8',
      letterSpacing: 0.45
    });
    this.contentLayer.add(selectedLabel);
  }

  renderCatalog(items, selected) {
    const rarity = RARITY_COLORS[selected.rarity] ?? PAL.muted;
    const name = titleText(this, 221, 87, selected.name.toUpperCase(), '12px', '#f7fbff')
      .setOrigin(0, 0.5);
    const rarityText = bodyText(this, 458, 88, selected.rarity.toUpperCase(), {
      originX: 1,
      fontFamily: FONT,
      fontSize: '6px',
      color: css(rarity),
      letterSpacing: 0.45
    });
    const description = bodyText(this, 221, selected.category === 'character' ? 102 : 108, selected.description, {
      originY: 0,
      fontSize: selected.category === 'character' ? '6px' : '7px',
      color: '#b8d3e7',
      wordWrap: { width: 235, useAdvancedWrap: true },
      lineSpacing: selected.category === 'character' ? 1 : 2
    });
    this.contentLayer.add([name, rarityText, description]);

    if (selected.category === 'character') {
      const playerMeta = bodyText(
        this,
        221,
        126,
        `${selected.archetype.toUpperCase()}  ·  ${selected.dominantFoot.toUpperCase()} FOOT  ·  ${selected.personality.toUpperCase()}`,
        {
          fontSize: '6px',
          color: '#ffc928',
          letterSpacing: 0.22
        }
      );
      this.contentLayer.add(playerMeta);
    }

    const style = selected.gameplay
      ? `${selected.gameplay.ability || selected.gameplay.feel}  ·  ${selected.gameplay.summary}`
      : selected.utility
        ? `${selected.utility.label}  ·  ${selected.utility.summary}`
        : 'VISUAL IDENTITY  ·  NO GAMEPLAY MODIFIER';
    const styleText = bodyText(this, 221, selected.category === 'character' ? 140 : 130, style.toUpperCase(), {
      fontSize: '6px',
      color: '#65e5c2',
      wordWrap: { width: 232, useAdvancedWrap: true },
      lineSpacing: 1,
      letterSpacing: 0.12
    });
    this.contentLayer.add(styleText);

    const compact = items.length > 6;
    items.forEach((item, index) => {
      const x = compact ? 225 + index * 33 : 231 + index * 43;
      this.contentLayer.add(this.makeCosmeticTile(x, 166, item, item.id === selected.id, compact));
    });

    const owned = SaveManager.ownsCosmetic(selected.id);
    const equipped = SaveManager.getEquippedCosmetic(selected.category) === selected.id;
    const gate = this.unlockGate(selected);
    const requirement = bodyText(this, 221, 202, this.requirementText(selected, owned, gate), {
      fontSize: '7px',
      color: gate.available || owned ? '#ffc928' : '#ff8e91',
      letterSpacing: 0.25
    });
    this.contentLayer.add(requirement);

    let label = `BUY  ·  ${selected.price}`;
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

    const meta = CATEGORY_META[this.category];
    const action = makeButton(this, 339, 232, 224, 31, label, () => this.handleAction(selected), {
      color: meta.color,
      hover: this.category === 'kit' ? PAL.blueHi : this.category === 'ball' ? 0xe47c3e : 0x836bb5,
      border: 0x3478b8,
      icon,
      iconScale: 0.75,
      iconX: 18,
      fontSize: '9px',
      disabled,
      hitHeight: 34
    });
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
      border: selected ? PAL.gold : rarity,
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

  requirementText(item, owned, gate) {
    if (owned) return SaveManager.getEquippedCosmetic(item.category) === item.id
      ? 'READY FOR THE NEXT MATCH'
      : 'OWNED  ·  TAP EQUIP';
    const unlock = item.unlock || { type: 'coins', value: item.price };
    if (!gate.available) {
      if (unlock.type === 'stars') return `LOCKED  ·  REACH ${unlock.value} STARS`;
      if (unlock.type === 'cup') return `LOCKED  ·  WIN ${gate.cup?.name?.toUpperCase() || 'THE CUP'}`;
      if (unlock.type === 'daily') return `LOCKED  ·  COMPLETE ${unlock.value} DAILY KICKS`;
      return 'LOCKED BY PROGRESSION';
    }
    const shortfall = Math.max(0, item.price - SaveManager.getCoins());
    return shortfall > 0
      ? `${item.price} COINS  ·  NEED ${shortfall} MORE`
      : `${item.price} COINS  ·  AVAILABLE NOW`;
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
    const warning = bodyText(this, 339, 211, `NEED ${needed} MORE COINS`, {
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
