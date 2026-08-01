import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  ADVANCED_OBJECTIVE_TYPES,
  CUPS,
  HAZARD_TYPES,
  LEVEL_SCHEMA_VERSION,
  LEVELS,
  WALL_TYPES,
  createSeededRng,
  dailyScenario,
  getLevelMechanics,
  randomScenario,
  validateLevelDefinition,
  validateLevelSet
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
    assert.equal(level.schemaVersion, LEVEL_SCHEMA_VERSION);
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

test('Level 15 and low-shot technique levels stay placement-open instead of forcing centre circles', () => {
  assert.equal(LEVELS[14].id, 'curve-05');
  assert.equal(LEVELS[14].objective.type, 'dip');
  assert.equal(LEVELS[14].target, null);
  assert.ok(LEVELS[14].objective.minimumHeight <= 1.95);

  for (const level of LEVELS.filter((entry) => entry.objective.type === 'low-shot')) {
    assert.equal(level.target, null, `${level.id} should reward the low route, not a mandatory circle`);
  }

  const targetObjectives = new Set([
    'target', 'target-streak', 'curve-target', 'wind-target',
    'ring-shot', 'limited-power', 'blind-shot', 'reverse-target'
  ]);
  for (const level of LEVELS.filter((entry) => entry.target)) {
    assert.ok(targetObjectives.has(level.objective.type), `${level.id} uses a target on a non-target objective`);
  }
});

test('v2 career definitions are valid, deeply immutable and remain sparse', () => {
  assert.deepEqual(validateLevelSet(), []);
  assert.deepEqual(validateLevelSet(JSON.parse(JSON.stringify(LEVELS))), [], 'level data survives JSON round-tripping');

  let plainLevels = 0;
  for (const level of LEVELS) {
    assert.equal(Object.isFrozen(level), true);
    assert.equal(Object.isFrozen(level.objective), true);
    if (level.hazards) {
      assert.ok(level.hazards.length > 0, `${level.id} should omit empty hazards`);
      assert.equal(Object.isFrozen(level.hazards), true);
    }
    if (level.rings) {
      assert.ok(level.rings.length > 0, `${level.id} should omit empty rings`);
      assert.equal(Object.isFrozen(level.rings), true);
    }
    if (!level.wallConfig && !level.goal && !level.hazards && !level.rings && !level.shotRules && !level.keeperConfig) {
      plainLevels++;
    }
  }
  assert.ok(plainLevels >= 20, 'introductory encounters should keep the lean legacy payload');

  const broken = {
    ...LEVELS.find((level) => level.wallConfig?.type === 'double'),
    wallConfig: { type: 'double', count: 99, rows: [] }
  };
  assert.match(validateLevelDefinition(broken).join('\n'), /wallConfig\.count must match legacy wall/);
});

test('later cups cover every authored wall, weather and objective twist', () => {
  const laterLevels = LEVELS.slice(10);
  const mechanics = new Set(laterLevels.flatMap(getLevelMechanics));

  for (const type of WALL_TYPES.filter((type) => type !== 'standard')) {
    assert.ok(mechanics.has(`${type}-wall`), `career needs a ${type} wall encounter`);
  }
  for (const type of HAZARD_TYPES) {
    assert.ok(mechanics.has(type), `career needs the ${type} hazard`);
  }
  for (const type of ADVANCED_OBJECTIVE_TYPES) {
    assert.ok(mechanics.has(type), `career needs the ${type} objective`);
  }
  for (const type of ['smaller-goal', 'rotating-wind', 'hoop-threading', 'sweeper-keeper', 'double-keeper']) {
    assert.ok(mechanics.has(type), `career needs ${type}`);
  }
});

test('no career level authors a wall that advances on the kicker', () => {
  assert.equal(WALL_TYPES.includes('rushing'), false, 'a charging wall is a Law 13 offence, not a wall type');

  for (const level of LEVELS) {
    for (const key of ['rushDistance', 'rushSpeed', 'trigger']) {
      assert.equal(key in (level.wallConfig ?? {}), false, `${level.id} still carries wallConfig.${key}`);
    }
  }

  const charging = {
    ...LEVELS.find((level) => level.wallConfig?.type === 'moving'),
    wallConfig: { type: 'rushing', count: 4, rushDistance: 2.4, rushSpeed: 4.2, trigger: 'strike' }
  };
  const errors = validateLevelDefinition(charging).join('\n');
  assert.match(errors, /unknown wall type rushing/);
  assert.match(errors, /wallConfig\.rushSpeed is not supported/);
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

test('cosmetics are unique, readable and include a valid starter per category', () => {
  assert.equal(new Set(COSMETICS.map((cosmetic) => cosmetic.id)).size, COSMETICS.length);
  for (const category of COSMETIC_CATEGORIES) {
    const starter = getCosmetic(STARTER_COSMETICS[category]);
    assert.equal(starter.category, category);
    assert.equal(starter.price, 0);
    const minimum = category === 'character' ? 4 : 5;
    assert.ok(getCosmeticsByCategory(category).length >= minimum);
  }

  for (const cosmetic of COSMETICS) {
    assert.equal('power' in cosmetic, false);
    assert.equal('accuracy' in cosmetic, false);
    assert.equal('multiplier' in cosmetic, false);
  }

  assert.ok(getCosmeticsByCategory('kit').every((cosmetic) => cosmetic.visualOnly));
  assert.ok(getCosmeticsByCategory('character').every((cosmetic) => cosmetic.gameplay?.ability));
  assert.ok(getCosmeticsByCategory('ball').every((cosmetic) => cosmetic.gameplay?.physics));
  assert.ok(getCosmeticsByCategory('trail').every((cosmetic) => cosmetic.utility?.summary));
  assert.ok(getCosmetic('ball-basketball'));
  assert.ok(getCosmetic('ball-golf'));

  const players = getCosmeticsByCategory('character');
  assert.equal(new Set(players.map((player) => player.archetype)).size, players.length);
  for (const player of players) {
    assert.ok(player.dominantFoot);
    assert.ok(player.personality);
    assert.ok(player.silhouette);
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
  assert.equal(migrated.version, 3);
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
  assert.deepEqual(
    SaveManager.getOwnedCosmetics('character'),
    [
      'character-mica',
      'character-power-striker',
      'character-agile-winger',
      'character-islam-sharaf'
    ]
  );
  assert.equal(SaveManager.getEquippedCosmetic('kit'), 'kit-home');
  assert.equal(SaveManager.getEquippedCosmetic('trail'), 'trail-ember');
  assert.equal(SaveManager.getSettings().musicVolume, 1);
  assert.equal(SaveManager.getSettings().sfxVolume, 0);
  assert.equal(SaveManager.getSettings().reducedMotion, true);
  assert.equal(SaveManager.getLastPlayed().levelId, 'academy-01');
});

test('the unused v2 music default migrates to the soundtrack mix level', () => {
  storage.setItem(SAVE_KEY, JSON.stringify({
    version: 2,
    settings: { muted: false, musicVolume: 0.7, sfxVolume: 1 }
  }));
  SaveManager.configureStorage(storage);

  assert.equal(SaveManager.getSettings().musicVolume, 0.3);
  SaveManager.setSetting('musicVolume', 0.7);
  assert.equal(SaveManager.getSettings().musicVolume, 0.7);
  assert.equal(JSON.parse(storage.getItem(SAVE_KEY)).version, 3);
});

test('currency is clamped to a display-safe six-digit balance', () => {
  SaveManager.addCoins(Number.MAX_SAFE_INTEGER);
  assert.equal(SaveManager.getCoins(), 999_999);
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

test('coins purchase and equip deterministic play-style cosmetics', () => {
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

test('a scoreless daily attempt records the best without granting completion', () => {
  const date = '2026-07-20';
  const result = SaveManager.completeDaily(date, 0, false);

  assert.equal(result.completed, false);
  assert.equal(result.firstCompletion, false);
  assert.equal(result.reward, 0);
  assert.equal(SaveManager.getDaily().completed, false);
  assert.equal(SaveManager.getStats().dailyRuns, 0);
  assert.equal(SaveManager.getCoins(), 0);
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
