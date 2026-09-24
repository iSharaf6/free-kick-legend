import Phaser from 'phaser';
import { GAME_W, GAME_H } from '../config.js';
import {
  bodyText,
  configureHdCamera,
  drawPanel,
  formatCompact,
  makeButton,
  makeIconButton,
  makeStatChip,
  sceneIntro,
  titleText,
  UI
} from '../ui.js';
import { PAL } from '../pixelart.js';
import { SaveManager } from '../systems/SaveManager.js';
import { Audio } from '../systems/AudioSynth.js';
import { MenuMusic } from '../systems/MenuMusic.js';
import { DAILY_STREAK_REWARDS, utcDateKey } from '../data/progression.js';

const PAGE_SIZE = 4;
// Same tab treatment as the Locker: one navy, the open tab a step lighter.
const TAB_FACE = PAL.panelHi;
const TAB_FACE_SELECTED = 0x1d4678;

function css(color) {
  return `#${color.toString(16).padStart(6, '0')}`;
}

export class ProgressScene extends Phaser.Scene {
  constructor() {
    super('Progress');
  }

  init(data = {}) {
    this.tab = data.tab === 'achievements' ? 'achievements' : 'daily';
    this.page = Math.max(0, Math.floor(Number(data.page) || 0));
  }

  create() {
    configureHdCamera(this, { uiDepth: 50 });
    MenuMusic.enterMenu();
    this.date = utcDateKey();
    SaveManager.ensureDaily(this.date);
    this.reducedMotion = SaveManager.getSettings().reducedMotion;

    this.add.image(0, 0, 'stadium-menu').setOrigin(0).setDepth(0);
    const wash = this.add.graphics().setDepth(1);
    wash.fillStyle(PAL.ink, 0.82);
    wash.fillRect(0, 0, GAME_W, GAME_H);
    wash.fillStyle(PAL.sky, 0.22);
    wash.fillTriangle(35, 31, 230, 31, 150, GAME_H);

    this.drawHeader();
    this.drawTabs();
    this.renderContent();
    if (!this.reducedMotion) sceneIntro(this);
  }

  drawHeader() {
    const g = this.add.graphics().setDepth(100);
    drawPanel(g, 7, 5, GAME_W - 14, 28, {
      fill: PAL.panel,
      border: PAL.borderDark
    });
    makeIconButton(this, 23, 19, 20, 'icon-back', () => this.scene.start('Menu'), {
      color: PAL.panelHi,
      hover: PAL.blue,
      border: PAL.borderDark,
      iconScale: 0.78,
      hitWidth: 31,
      hitHeight: 29
    }).setDepth(104);
    titleText(this, 58, 18, 'PLAYER PROGRESS', '14px', UI.creamText)
      .setOrigin(0, 0.5).setDepth(104);
    this.coinChip = makeStatChip(this, 426, 19, 78, 'icon-coin', formatCompact(SaveManager.getCoins()), {
      height: 21,
      fill: PAL.night,
      border: PAL.borderDark,
      fontSize: '8px',
      iconScale: 0.8
    }).setDepth(104);
  }

  drawTabs() {
    const dailyStates = SaveManager.getDailyMissionStates(this.date);
    const achievementStates = SaveManager.getAchievementStates();
    const dailyClaims = dailyStates.filter((state) => state.completed && !state.claimed).length;
    const achievementClaims = achievementStates.filter((state) => state.completed && !state.claimed).length;

    const tabs = [
      { id: 'daily', x: 146, label: 'DAILY MISSIONS', icon: 'icon-clock', ready: dailyClaims },
      { id: 'achievements', x: 368, label: 'ACHIEVEMENTS', icon: 'icon-cup', ready: achievementClaims }
    ];
    tabs.forEach((tab) => {
      const selected = this.tab === tab.id;
      makeButton(this, tab.x, 50, 210, 27, tab.label, () => this.switchTab(tab.id), {
        color: selected ? TAB_FACE_SELECTED : TAB_FACE,
        hover: TAB_FACE_SELECTED,
        selected,
        border: selected ? UI.cream : PAL.borderDark,
        icon: tab.icon,
        iconScale: 0.72,
        fontSize: '8px'
      }).setDepth(120);
      // Rewards waiting on a tab get the same red count badge as the menu's
      // trophy button, instead of a second clause in the label.
      if (tab.ready) this.addClaimBadge(tab.x + 101, 37, tab.ready);
    });
  }

  addClaimBadge(x, y, count) {
    const badge = this.add.graphics().setDepth(125);
    badge.fillStyle(PAL.red, 1);
    badge.fillCircle(x, y, 5);
    bodyText(this, x, y, String(Math.min(count, 9)), {
      originX: 0.5,
      fontSize: '7px',
      color: '#ffffff',
      strokeThickness: 0,
      letterSpacing: 0
    }).setDepth(126);
  }

  switchTab(tab) {
    if (tab === this.tab) return;
    this.scene.restart({ tab, page: 0 });
  }

  renderContent() {
    this.contentLayer?.destroy(true);
    this.contentLayer = this.add.container(0, 0).setDepth(130);
    if (this.tab === 'daily') this.renderDaily();
    else this.renderAchievements();
  }

  addProgressRow(state, y, index, claim) {
    const row = this.add.container(0, y);
    const g = this.add.graphics();
    drawPanel(g, 14, -18, 452, 38, {
      fill: state.claimed ? 0x122e2a : PAL.panel,
      border: state.completed ? UI.edgeHi : PAL.borderDark
    });

    const icon = this.add.image(34, 1, state.completed ? 'icon-star' : 'icon-star-empty').setScale(0.75);
    // Daily missions are a single sentence ('Take 8 free kicks'); only
    // achievements carry a second line. A mission is not padded out with a
    // restatement of its own target.
    const hasDescription = Boolean(state.description);
    const name = bodyText(this, 50, hasDescription ? -6 : 1, state.label, {
      fontSize: '9px',
      color: state.completed ? UI.creamText : '#c4ceca',
      letterSpacing: 0.1
    });
    const parts = [g, icon, name];
    if (hasDescription) {
      parts.push(bodyText(this, 50, 9, state.description, {
        fontSize: '7px',
        color: '#8fa2ab',
        letterSpacing: 0.1
      }));
    }

    const bar = this.add.graphics();
    const progress = Phaser.Math.Clamp(state.progress / Math.max(state.target, 1), 0, 1);
    bar.fillStyle(PAL.ink, 1);
    bar.fillRect(245, -4, 92, 9);
    bar.fillStyle(PAL.borderDark, 1);
    bar.fillRect(247, -2, 88, 5);
    bar.fillStyle(state.completed ? PAL.greenHi : PAL.blueHi, 1);
    bar.fillRect(247, -2, Math.floor(88 * progress), 5);
    const progressText = bodyText(this, 291, 11,
      `${formatCompact(state.progress)} / ${formatCompact(state.target)}`, {
        originX: 0.5,
        fontSize: '7px',
        color: '#aebbb9',
        letterSpacing: 0.1
      });

    const button = makeButton(this, 407, 1, 98, 24,
      state.claimed ? 'CLAIMED' : state.completed ? `CLAIM +${state.reward}` : `+${state.reward} COINS`,
      () => this.claimReward(state, row, claim), {
        color: state.completed && !state.claimed ? PAL.green : PAL.panelMuted,
        hover: PAL.greenHi,
        border: state.completed && !state.claimed ? PAL.greenHi : PAL.borderDark,
        icon: 'icon-coin',
        iconScale: 0.62,
        iconX: 13,
        fontSize: '7px',
        disabled: !state.completed || state.claimed,
        hitHeight: 29
      });
    if (state.completed && !state.claimed && !this.reducedMotion) {
      this.tweens.add({
        targets: button,
        alpha: 0.76,
        duration: 620,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut'
      });
    }

    row.add([...parts, bar, progressText, button]);
    this.contentLayer.add(row);
    this.animateRow(row, y, index, state.claimed);
    return row;
  }

  animateRow(row, y, index, claimed = false) {
    if (this.reducedMotion) {
      row.setY(y).setScale(1).setAlpha(1);
      return;
    }
    row.setY(y + 6).setScale(claimed ? 0.94 : 1).setAlpha(0);
    this.tweens.add({
      targets: row,
      y,
      alpha: 1,
      scale: 1,
      duration: 200,
      delay: index * 40,
      ease: 'Cubic.easeOut'
    });
  }

  claimReward(state, row, claim) {
    const result = claim();
    if (!result.success) return;
    Audio.coin();
    this.coinChip.valueText.setText(formatCompact(result.coins));
    if (!this.reducedMotion) {
      this.tweens.add({ targets: row, scaleX: 0.97, scaleY: 0.97, duration: 70, yoyo: true });
      const coin = this.add.image(407, row.y, 'icon-coin').setDepth(3000).setScale(0.85);
      this.tweens.add({
        targets: coin,
        x: 426,
        y: 19,
        scale: 0.55,
        duration: 220,
        ease: 'Cubic.easeIn',
        onComplete: () => coin.destroy()
      });
    }
    this.time.delayedCall(this.reducedMotion ? 50 : 240, () => {
      this.scene.restart({ tab: this.tab, page: this.page });
    });
  }

  renderDaily() {
    const states = SaveManager.getDailyMissionStates(this.date);
    states.forEach((state, index) => {
      this.addProgressRow(state, 89 + index * 43, index, () => SaveManager.claimDailyMission(state.id, this.date));
    });

    const daily = SaveManager.getDaily(this.date);
    const g = this.add.graphics();
    drawPanel(g, 14, 207, 452, 54, {
      fill: PAL.night,
      border: PAL.borderDark
    });
    this.contentLayer.add(g);
    const streakCopy = daily.streak > 0
      ? `${daily.streak}-day streak. ${daily.completed ? 'Done for today.' : 'Play today to keep it going.'}`
      : 'Play today to start a streak.';
    this.contentLayer.add(bodyText(this, 24, 216, streakCopy, {
      fontSize: '8px',
      color: UI.creamText,
      letterSpacing: 0.1
    }));

    const cycleIndex = daily.completed
      ? (Math.max(daily.streak, 1) - 1) % DAILY_STREAK_REWARDS.length
      : daily.streak % DAILY_STREAK_REWARDS.length;
    DAILY_STREAK_REWARDS.forEach((reward, index) => {
      const x = 26 + index * 62;
      const active = index === cycleIndex;
      g.fillStyle(active ? UI.cream : PAL.borderDark, 1);
      g.fillRect(x, 226, 54, 28);
      g.fillStyle(active ? PAL.panelHi : PAL.panelMuted, 1);
      g.fillRect(x + 1, 227, 52, 26);
      this.contentLayer.add(bodyText(this, x + 27, 234, `Day ${index + 1}`, {
        originX: 0.5,
        fontSize: '7px',
        color: active ? UI.creamText : '#82979f',
        letterSpacing: 0.1
      }));
      this.contentLayer.add(bodyText(this, x + 27, 246, `+${reward}`, {
        originX: 0.5,
        fontSize: '8px',
        color: active ? UI.creamText : '#aebbb9',
        letterSpacing: 0.1
      }));
    });
  }

  renderAchievements() {
    const states = SaveManager.getAchievementStates();
    const pageCount = Math.max(1, Math.ceil(states.length / PAGE_SIZE));
    this.page = Phaser.Math.Clamp(this.page, 0, pageCount - 1);
    const start = this.page * PAGE_SIZE;
    states.slice(start, start + PAGE_SIZE).forEach((state, index) => {
      this.addProgressRow(state, 87 + index * 43, index, () => SaveManager.claimAchievement(state.id));
    });

    makeButton(this, 164, 252, 92, 23, 'PREV', () => {
      this.scene.restart({ tab: 'achievements', page: Math.max(0, this.page - 1) });
    }, {
      color: PAL.panelHi,
      hover: PAL.blue,
      icon: 'icon-back',
      iconScale: 0.6,
      fontSize: '7px',
      disabled: this.page === 0
    }).setDepth(160);
    bodyText(this, GAME_W / 2, 252, `${this.page + 1} / ${pageCount}`, {
      originX: 0.5,
      fontSize: '7px',
      color: '#b9c6c5'
    }).setDepth(161);
    makeButton(this, 316, 252, 92, 23, 'NEXT', () => {
      this.scene.restart({ tab: 'achievements', page: Math.min(pageCount - 1, this.page + 1) });
    }, {
      color: PAL.panelHi,
      hover: PAL.blue,
      icon: 'icon-play',
      iconScale: 0.6,
      fontSize: '7px',
      disabled: this.page >= pageCount - 1
    }).setDepth(160);
  }
}
