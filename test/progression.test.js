import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  CUPS,
  LEVELS,
  createSeededRng,
  dailyScenario,
  randomScenario
} from '../src/data/levels.js';
import { getDailyMissions } from '../src/data/progression.js';
import {
  COSMETICS,
  COSMETIC_CATEGORIES,
  STARTER_COSMETICS,
  getCosmetic,
  getCosmeticsByCategory
} from '../src/data/cosmetics.js';
import {
  LEGACY_SAVE_KEY,
  SAVE_KEY,
  SaveManager
} from '../src/systems/SaveManager.js';

class MemoryStorage {
  constructor(entries = {}) {
    this.values = new Map(Object.entries(entries));
  }

  getItem(key) {
    return this.values.get(key) ?? null;
  }

  setItem(key, value) {
    this.values.set(key, String(value));
  }

  removeItem(key) {
    this.values.delete(key);
  }
}

let storage;

beforeEach(() => {
  storage = new MemoryStorage();
  SaveManager.configureStorage(storage);
});

test('career data contains five coherent ten-level cups', () => {
  assert.equal(LEVELS.length, 50);
  assert.equal(CUPS.length, 5);
  assert.equal(new Set(LEVELS.map((level) => level.id)).size, LEVELS.length);

  for (const cup of CUPS) {
    assert.equal(cup.levelIds.length, 10);
    assert.deepEqual(
      cup.levelIds,
      LEVELS.filter((level) => level.cup === cup.id).map((level) => level.id)
    );
  }

  for (const level of LEVELS) {
    assert.match(level.id, /^[a-z]+-\d{2}$/);
    assert.equal(typeof level.name, 'string');
    assert.ok(level.distance >= 13 && level.distance <= 23);
    assert.ok(level.offsetX >= -6 && level.offsetX <= 6);
    assert.ok(level.wall >= 0 && level.wall <= 6);
    assert.ok(level.keeper >= 0 && level.keeper <= 0.8);
    assert.equal(typeof level.objective.label, 'string');
    assert.equal(typeof level.reward.coins, 'number');
    assert.equal(typeof level.style, 'string');
    assert.equal(typeof level.wind.x, 'number');
    if (level.target) {
      assert.ok(level.target.x >= -1 && level.target.x <= 1);
      assert.ok(level.target.y >= 0 && level.target.y <= 1);
      assert.ok(level.target.rx > 0 && level.target.ry > 0);
    }
  }
});

test('seeded scenarios and RNG are deterministic while preserving RNG injection', () => {
  assert.deepEqual(randomScenario('2026-07-12'), randomScenario('2026-07-12'));
  assert.notDeepEqual(randomScenario('2026-07-12'), randomScenario('2026-07-13'));

  const first = createSeededRng('daily');
  const second = createSeededRng('daily');
  assert.deepEqual([first(), first(), first()], [second(), second(), second()]);

  const fixed = randomScenario(() => 0.5);
  assert.equal(fixed.distance, 18);
  assert.equal(fixed.offsetX, 0);
  assert.equal(fixed.wall, 4);
});

test('daily challenge and mission rotation are deterministic and fair', () => {
  const first = dailyScenario('2026-07-14');
  const repeated = dailyScenario('2026-07-14');
  assert.deepEqual(first, repeated);
  assert.notDeepEqual(first, dailyScenario('2026-07-15'));
  assert.equal(first.attempts, 5);
  assert.ok(first.wall >= 2 && first.wall <= 5);
  assert.ok(first.keeper >= 0.32 && first.keeper <= 0.57);
  assert.ok(first.movingTarget.range <= 0.25);

  const missions = getDailyMissions('2026-07-14');
  assert.equal(missions.length, 3);
  assert.equal(new Set(missions.map((mission) => mission.id)).size, 3);
  assert.equal(new Set(missions.map((mission) => mission.metric)).size, 3);
  assert.deepEqual(missions, getDailyMissions('2026-07-14'));
});

test('cosmetics are unique, visual-only and include a valid starter per category', () => {
  assert.equal(new Set(COSMETICS.map((cosmetic) => cosmetic.id)).size, COSMETICS.length);
  for (const category of COSMETIC_CATEGORIES) {
    const starter = getCosmetic(STARTER_COSMETICS[category]);
    assert.equal(starter.category, category);
    assert.equal(starter.price, 0);
    assert.ok(getCosmeticsByCategory(category).length >= 5);
  }

  for (const cosmetic of COSMETICS) {
    assert.equal(cosmetic.visualOnly, true);
    assert.equal('power' in cosmetic, false);
    assert.equal('accuracy' in cosmetic, false);
    assert.equal('multiplier' in cosmetic, false);
  }
});

test('v1 numeric stars migrate to stable IDs without granting duplicate rewards', () => {
  storage.setItem(LEGACY_SAVE_KEY, JSON.stringify({
    stars: { 0: 3, 1: 2, 8: 1, 99: 3 },
    bestArcade: 17
  }));
  SaveManager.configureStorage(storage);

  assert.equal(SaveManager.getStars(0), 3);
  assert.equal(SaveManager.getStars('academy-02'), 2);
  assert.equal(SaveManager.getStars('curve-01'), 1);
  assert.equal(SaveManager.getBestArcade(), 17);
  assert.equal(SaveManager.getCoins(), 0);
  assert.equal(SaveManager.unlockedCount(LEVELS.length), 3);

  const migrated = JSON.parse(storage.getItem(SAVE_KEY));
  assert.equal(migrated.version, 2);
  assert.equal(migrated.stars['academy-01'], 3);
  assert.equal(migrated.rewardClaims['academy-01'].threeStar, true);
});

test('save validation clamps corrupt values and restores safe cosmetics/settings', () => {
  storage.setItem(SAVE_KEY, JSON.stringify({
    version: 2,
    stars: { 'academy-01': 9, '1': 2, unknown: 3 },
    bestArcade: -20,
    best: { arcade: 12, daily: { '2026-07-12': 44, invalid: 999 } },
    coins: -500,
    owned: { kit: ['kit-crimson', 'fake-kit'], ball: [], trail: ['trail-ember'] },
    equipped: { kit: 'fake-kit', ball: 'ball-ocean', trail: 'trail-ember' },
    settings: { musicVolume: 4, sfxVolume: -2, reducedMotion: true },
    lastPlayed: { mode: 'hacked', levelId: 'not-a-level' }
  }));
  SaveManager.configureStorage(storage);

  assert.equal(SaveManager.getStars('academy-01'), 3);
  assert.equal(SaveManager.getStars('academy-02'), 2);
  assert.equal(SaveManager.getBestArcade(), 12);
  assert.equal(SaveManager.getBestDaily('2026-07-12'), 44);
  assert.equal(SaveManager.getCoins(), 0);
  assert.deepEqual(SaveManager.getOwnedCosmetics('kit'), ['kit-home', 'kit-crimson']);
  assert.equal(SaveManager.getEquippedCosmetic('kit'), 'kit-home');
  assert.equal(SaveManager.getEquippedCosmetic('trail'), 'trail-ember');
  assert.equal(SaveManager.getSettings().musicVolume, 1);
  assert.equal(SaveManager.getSettings().sfxVolume, 0);
  assert.equal(SaveManager.getSettings().reducedMotion, true);
  assert.equal(SaveManager.getLastPlayed().levelId, 'academy-01');
});

test('career stars unlock sequentially and award clear/three-star coins only once', () => {
  assert.equal(SaveManager.setStars(0, 1), 1);
  assert.equal(SaveManager.getCoins(), LEVELS[0].reward.coins);
  assert.equal(SaveManager.unlockedCount(LEVELS.length), 2);
  assert.equal(SaveManager.getLastPlayed().levelId, 'academy-02');

  SaveManager.setStars('academy-01', 1);
  assert.equal(SaveManager.getCoins(), LEVELS[0].reward.coins);

  SaveManager.setStars(0, 3);
  assert.equal(
    SaveManager.getCoins(),
    LEVELS[0].reward.coins + LEVELS[0].reward.threeStarBonus
  );
  SaveManager.setStars(0, 3);
  assert.equal(SaveManager.getTotalStars(), 3);

  // Completing a later level via debug/import cannot skip the missing level.
  SaveManager.setStars(2, 3);
  assert.equal(SaveManager.unlockedCount(LEVELS.length), 2);
});

test('coins purchase and equip cosmetics without exposing gameplay power', () => {
  SaveManager.addCoins(300);
  assert.equal(SaveManager.purchaseCosmetic('ball-ocean'), true);
  assert.equal(SaveManager.getCoins(), 120);
  assert.equal(SaveManager.ownsCosmetic('ball-ocean'), true);
  assert.equal(SaveManager.equipCosmetic('ball-ocean'), true);
  assert.equal(SaveManager.getEquippedCosmetic('ball'), 'ball-ocean');
  assert.equal(SaveManager.purchaseCosmetic('trail-aurora'), false);
  assert.equal(SaveManager.equipCosmetic('trail-aurora'), false);
});

test('settings, stats, daily records and continue state persist through reload', () => {
  SaveManager.updateSettings({ muted: true, screenShake: false });
  SaveManager.incrementStat('shots', 3);
  SaveManager.updateDaily({
    currentDate: '2026-07-12',
    completed: true,
    completedDates: ['2026-07-12'],
    missions: { curl: 2 }
  });
  SaveManager.setBestDaily('2026-07-12', 2400);
  SaveManager.setLastPlayed({ mode: 'career', levelId: 'curve-03' });
  SaveManager.reload();

  assert.equal(SaveManager.getSettings().muted, true);
  assert.equal(SaveManager.getSettings().screenShake, false);
  assert.equal(SaveManager.getStats().shots, 3);
  assert.equal(SaveManager.getDaily().missions.curl, 2);
  assert.equal(SaveManager.getBestDaily('2026-07-12'), 2400);
  assert.equal(SaveManager.getLastPlayedLevelIndex(), 12);
});

test('daily missions, streak rewards and replay protection persist', () => {
  const date = '2026-07-14';
  SaveManager.ensureDaily(date);
  SaveManager.trackMissions({ shots: 20, goals: 10, curvedGoals: 5, topCorners: 3, score: 10000 }, date);
  const missions = SaveManager.getDailyMissionStates(date);
  assert.ok(missions.every((mission) => mission.completed));

  const expectedMissionCoins = missions.reduce((sum, mission) => sum + mission.reward, 0);
  for (const mission of missions) assert.equal(SaveManager.claimDailyMission(mission.id, date).success, true);
  assert.equal(SaveManager.getCoins(), expectedMissionCoins);
  assert.equal(SaveManager.claimDailyMission(missions[0].id, date).success, false);

  const first = SaveManager.completeDaily(date, 9000);
  assert.equal(first.firstCompletion, true);
  assert.equal(first.streak, 1);
  assert.equal(first.reward, 60);
  const replay = SaveManager.completeDaily(date, 12000);
  assert.equal(replay.firstCompletion, false);
  assert.equal(replay.reward, 0);
  assert.equal(replay.best, 12000);

  const next = SaveManager.completeDaily('2026-07-15', 8000);
  assert.equal(next.streak, 2);
  assert.equal(next.reward, 75);
  assert.equal(SaveManager.getStats().dailyRuns, 2);
});

test('achievement rewards can be claimed once after the stat threshold', () => {
  SaveManager.incrementStat('goals');
  const state = SaveManager.getAchievementStates().find((achievement) => achievement.id === 'first-net');
  assert.equal(state.completed, true);
  assert.equal(state.claimed, false);
  assert.equal(SaveManager.claimAchievement('first-net').success, true);
  assert.equal(SaveManager.getCoins(), 50);
  assert.equal(SaveManager.claimAchievement('first-net').success, false);
  SaveManager.reload();
  assert.equal(
    SaveManager.getAchievementStates().find((achievement) => achievement.id === 'first-net').claimed,
    true
  );
});
