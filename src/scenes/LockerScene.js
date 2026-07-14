import Phaser from 'phaser';
import { GAME_W, GAME_H } from '../config.js';
import {
  makeButton, makeIconButton, makeStatChip, titleText, bodyText,
  drawPanel, addScanlines, sceneIntro, formatCompact, configureHdCamera, FONT
} from '../ui.js';
import { SaveManager } from '../systems/SaveManager.js';
import { Audio } from '../systems/AudioSynth.js';
import {
  COSMETIC_CATEGORIES, getCosmetic, getCosmeticsByCategory
} from '../data/cosmetics.js';
import { CUPS } from '../data/levels.js';
import { PAL } from '../pixelart.js';
import { Kicker } from '../objects/Kicker.js';

const CATEGORY_META = {
  kit: { label: 'KITS', icon: 'icon-kit', color: PAL.blue },
  ball: { label: 'BALLS', icon: 'ball-classic', color: PAL.orange },
  trail: { label: 'TRAILS', icon: 'icon-trail', color: 0x67549a }
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

  create() {
    configureHdCamera(this);
    this.add.image(0, 0, 'stadium-menu').setOrigin(0).setDepth(0);
    const wash = this.add.graphics().setDepth(1);
    wash.fillStyle(PAL.ink, 0.72);
    wash.fillRect(0, 0, GAME_W, GAME_H);
    wash.fillStyle(PAL.sky, 0.28);
    wash.fillTriangle(12, 31, 197, 31, 128, 260);

    this.selectedId = this.resolveSelection(this.requestedSelection);
    this.drawHeader();
    this.drawPanels();
    this.renderTabs();
    this.renderContent();

    addScanlines(this, 2600, 0.03);
    sceneIntro(this);
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
      fill: PAL.panel,
      border: PAL.borderDark,
      corner: PAL.goldDark
    });
    makeIconButton(this, 23, 18, 20, 'icon-back', () => this.scene.start('Menu'), {
      color: PAL.panelHi,
      hover: PAL.blue,
      border: PAL.borderDark,
      iconScale: 0.78,
      hitWidth: 31,
      hitHeight: 29
    }).setDepth(104);
    titleText(this, 59, 18, 'MATCHDAY LOCKER', '14px', '#f3e7c3')
      .setOrigin(0, 0.5).setDepth(104);
    bodyText(this, 246, 18, 'STYLE ONLY  ·  NO STAT BOOSTS', {
      originX: 0.5,
      fontSize: '6px',
      color: '#8fa2ab',
      letterSpacing: 0.35
    }).setDepth(104);
    this.coinChip = makeStatChip(this, 425, 18, 80, 'icon-coin', formatCompact(SaveManager.getCoins()), {
      height: 21,
      fill: PAL.night,
      border: PAL.borderDark,
      fontSize: '8px',
      iconScale: 0.8
    }).setDepth(104);
  }

  drawPanels() {
    const g = this.add.graphics().setDepth(70);
    drawPanel(g, 9, 72, 190, 188, {
      fill: 0x102337,
      border: PAL.goldDark,
      corner: PAL.gold
    });
    drawPanel(g, 207, 72, 264, 188, {
      fill: PAL.panel,
      border: PAL.borderDark,
      corner: PAL.goldDark
    });

    // Dressing-room floor and a simple backlit kit rail.
    g.fillStyle(PAL.ink, 0.58);
    g.fillRect(14, 217, 180, 38);
    g.lineStyle(2, PAL.borderDark, 1);
    g.lineBetween(24, 89, 184, 89);
    for (let x = 30; x <= 180; x += 30) g.lineBetween(x, 89, x, 96);
    g.fillStyle(PAL.flood, 0.08);
    g.fillTriangle(35, 91, 173, 91, 141, 245);
  }

  renderTabs() {
    if (this.tabLayer) {
      this.tabLayer.removeAll(true);
      this.tabLayer.destroy();
    }
    this.tabLayer = this.add.container(0, 0).setDepth(120);
    const xs = [142, 240, 338];
    COSMETIC_CATEGORIES.forEach((category, index) => {
      const meta = CATEGORY_META[category];
      const selected = category === this.category;
      const button = makeButton(this, xs[index], 51, 88, 29, meta.label, () => {
        this.category = category;
        this.selectedId = SaveManager.getEquippedCosmetic(category)
          || getCosmeticsByCategory(category)[0]?.id;
        this.renderTabs();
        this.renderContent();
      }, {
        color: selected ? meta.color : PAL.panelHi,
        hover: meta.color,
        selected,
        border: selected ? PAL.gold : PAL.borderDark,
        icon: meta.icon,
        iconScale: category === 'ball' ? 0.65 : 0.72,
        iconX: 14,
        fontSize: '9px',
        letterSpacing: 0.45,
        hitHeight: 32
      });
      this.tabLayer.add(button);
    });
  }

  clearContent() {
    this.previewTween?.stop();
    this.previewTween = null;
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
  }

  renderPreview(selected) {
    const equippedKit = this.category === 'kit'
      ? selected.id
      : SaveManager.getEquippedCosmetic('kit');
    this.kicker = new Kicker(this, 91, 222, {
      kitId: equippedKit,
      scale: 4.05,
      depth: 133
    });

    const ballId = this.category === 'ball'
      ? selected.id
      : SaveManager.getEquippedCosmetic('ball');
    const ballKey = ballId === 'ball-classic' && this.textures.exists('ball-classic-hd')
      ? 'ball-classic-hd'
      : (this.textures.exists(ballId) ? ballId : 'ball-classic');
    const ball = this.add.image(160, 211, ballKey).setDepth(143);
    ball.setScale(19 / (ball.texture.source[0]?.width || 12));
    this.contentLayer.add(ball);
    this.previewTween = this.tweens.add({
      targets: ball,
      y: 204,
      rotation: Math.PI * 2,
      duration: 1500,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });

    const trailId = this.category === 'trail'
      ? selected.id
      : SaveManager.getEquippedCosmetic('trail');
    const trail = getCosmetic(trailId);
    if (trail?.particle !== 'none') {
      const line = this.add.graphics().setDepth(140);
      for (let i = 0; i < 9; i++) {
        const p = i / 8;
        const color = i % 2 ? trail.palette.start : trail.palette.end;
        line.fillStyle(color, 0.18 + p * 0.72);
        const size = Math.max(1, Math.ceil(p * 3));
        line.fillRect(120 + i * 4, 217 - i * 1.1, size, size);
      }
      this.contentLayer.add(line);
    }

    const selectedLabel = bodyText(this, 104, 244, 'LIVE PLAYER PREVIEW', {
      originX: 0.5,
      fontSize: '6px',
      color: '#9fb3ba',
      letterSpacing: 0.45
    });
    this.contentLayer.add(selectedLabel);
  }

  renderCatalog(items, selected) {
    const rarity = RARITY_COLORS[selected.rarity] ?? PAL.muted;
    const name = titleText(this, 221, 87, selected.name.toUpperCase(), '12px', '#f3e7c3')
      .setOrigin(0, 0.5);
    const rarityText = bodyText(this, 458, 88, selected.rarity.toUpperCase(), {
      originX: 1,
      fontFamily: FONT,
      fontSize: '6px',
      color: css(rarity),
      letterSpacing: 0.45
    });
    const description = bodyText(this, 221, 108, selected.description, {
      originY: 0,
      fontSize: '7px',
      color: '#aab9ba',
      wordWrap: { width: 235, useAdvancedWrap: true },
      lineSpacing: 2
    });
    this.contentLayer.add([name, rarityText, description]);

    items.forEach((item, index) => {
      const x = 231 + index * 43;
      this.contentLayer.add(this.makeCosmeticTile(x, 157, item, item.id === selected.id));
    });

    const owned = SaveManager.ownsCosmetic(selected.id);
    const equipped = SaveManager.getEquippedCosmetic(selected.category) === selected.id;
    const gate = this.unlockGate(selected);
    const requirement = bodyText(this, 221, 190, this.requirementText(selected, owned, gate), {
      fontSize: '7px',
      color: gate.available || owned ? '#f3c449' : '#d8866e',
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
      border: PAL.goldDark,
      icon,
      iconScale: 0.75,
      iconX: 18,
      fontSize: '9px',
      disabled,
      hitHeight: 34
    });
    this.contentLayer.add(action);
  }

  makeCosmeticTile(x, y, item, selected) {
    const owned = SaveManager.ownsCosmetic(item.id);
    const gate = this.unlockGate(item);
    const rarity = RARITY_COLORS[item.rarity] ?? PAL.border;
    const button = makeButton(this, x, y, 38, 39, '', () => {
      this.selectedId = item.id;
      this.renderContent();
    }, {
      color: selected ? 0x2b4557 : PAL.night,
      hover: 0x2b4557,
      border: selected ? PAL.gold : rarity,
      selected,
      hitWidth: 41,
      hitHeight: 43
    });

    let texture;
    if (item.category === 'kit') texture = `icon-${item.id}`;
    else if (item.category === 'ball') texture = item.id;
    else texture = `icon-${item.id}`;
    const preview = this.add.image(0, -2, this.textures.exists(texture) ? texture : CATEGORY_META[item.category].icon)
      .setScale(item.category === 'ball' ? 1.15 : 1);
    button.add(preview);

    if (owned) {
      button.add(this.add.image(12, 12, 'icon-check').setScale(0.42));
    } else if (!gate.available) {
      button.add(this.add.image(12, 12, 'icon-lock').setScale(0.44).setAlpha(0.78));
    } else {
      button.add(this.add.image(12, 12, 'icon-coin').setScale(0.42));
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
