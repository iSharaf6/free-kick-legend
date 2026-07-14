import { LEVELS } from '../data/levels.js';
import {
  COSMETIC_CATEGORIES,
  STARTER_COSMETICS,
  getCosmetic
} from '../data/cosmetics.js';
import { PlatformService } from './PlatformService.js';

export const SAVE_KEY = 'fkl-save-v2';
export const LEGACY_SAVE_KEY = 'fkl-save-v1';
export const SAVE_VERSION = 2;

const MAX_CURRENCY = 999_999_999;
const MAX_STAT = 999_999_999_999;
const LEVEL_BY_ID = new Map(LEVELS.map((level) => [level.id, level]));
const LEVEL_INDEX_BY_ID = new Map(LEVELS.map((level, index) => [level.id, index]));
const VALID_MODES = new Set(['career', 'arcade', 'daily']);
const STAT_KEYS = Object.freeze([
  'shots', 'goals', 'saves', 'misses', 'wallHits', 'postHits',
  'topCorners', 'curvedGoals', 'careerClears', 'careerStars',
  'arcadeRuns', 'dailyRuns', 'playSeconds'
]);

function isRecord(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function finiteNumber(value, fallback = 0, max = MAX_STAT) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(Math.max(number, 0), max);
}

function integer(value, fallback = 0, max = MAX_STAT) {
  return Math.floor(finiteNumber(value, fallback, max));
}

function volume(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(Math.max(number, 0), 1) : fallback;
}

function dateString(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function uniqueStrings(values, predicate = () => true, limit = 400) {
  if (!Array.isArray(values)) return [];
  const result = [];
  const seen = new Set();
  for (const value of values) {
    if (typeof value !== 'string' || seen.has(value) || !predicate(value)) continue;
    seen.add(value);
    result.push(value);
    if (result.length >= limit) break;
  }
  return result;
}

function clone(value) {
  if (Array.isArray(value)) return value.map(clone);
  if (isRecord(value)) {
    const copy = {};
    for (const [key, item] of Object.entries(value)) copy[key] = clone(item);
    return copy;
  }
  return value;
}

function resolveLevelId(reference) {
  if (Number.isInteger(reference)) return LEVELS[reference]?.id ?? null;
  if (typeof reference !== 'string') return null;
  if (LEVEL_BY_ID.has(reference)) return reference;
  if (/^\d+$/.test(reference)) return LEVELS[Number(reference)]?.id ?? null;
  return null;
}

const LEGACY_LEVEL_IDS_40 = Object.freeze([
  ...Array.from({ length: 8 }, (_, index) => `academy-${String(index + 1).padStart(2, '0')}`),
  ...Array.from({ length: 8 }, (_, index) => `curve-${String(index + 1).padStart(2, '0')}`),
  ...Array.from({ length: 8 }, (_, index) => `targets-${String(index + 1).padStart(2, '0')}`),
  ...Array.from({ length: 8 }, (_, index) => `pressure-${String(index + 1).padStart(2, '0')}`),
  ...Array.from({ length: 8 }, (_, index) => `legend-${String(index + 1).padStart(2, '0')}`)
]);

function resolveStoredLevelId(reference) {
  if (typeof reference === 'string' && /^\d+$/.test(reference)) {
    return LEGACY_LEVEL_IDS_40[Number(reference)] ?? resolveLevelId(reference);
  }
  return resolveLevelId(reference);
}

function normalizedStars(rawStars) {
  const stars = {};
  if (!isRecord(rawStars)) return stars;
  for (const [reference, value] of Object.entries(rawStars)) {
    const levelId = resolveStoredLevelId(reference);
    const rating = Math.min(integer(value, 0, 3), 3);
    if (levelId && rating > 0) stars[levelId] = Math.max(stars[levelId] ?? 0, rating);
  }
  return stars;
}

function defaultSettings() {
  return {
    muted: false,
    musicVolume: 0.7,
    sfxVolume: 1,
    reducedMotion: false,
    screenShake: true,
    highContrast: false
  };
}

function normalizedSettings(rawSettings) {
  const defaults = defaultSettings();
  if (!isRecord(rawSettings)) return defaults;
  return {
    muted: typeof rawSettings.muted === 'boolean' ? rawSettings.muted : defaults.muted,
    musicVolume: volume(rawSettings.musicVolume, defaults.musicVolume),
    sfxVolume: volume(rawSettings.sfxVolume, defaults.sfxVolume),
    reducedMotion: typeof rawSettings.reducedMotion === 'boolean' ? rawSettings.reducedMotion : defaults.reducedMotion,
    screenShake: typeof rawSettings.screenShake === 'boolean' ? rawSettings.screenShake : defaults.screenShake,
    highContrast: typeof rawSettings.highContrast === 'boolean' ? rawSettings.highContrast : defaults.highContrast
  };
}

function defaultStats() {
  const stats = {};
  for (const key of STAT_KEYS) stats[key] = 0;
  return stats;
}

function normalizedStats(rawStats, stars) {
  const stats = defaultStats();
  if (isRecord(rawStats)) {
    for (const key of STAT_KEYS) stats[key] = finiteNumber(rawStats[key], 0);
  }
  stats.careerStars = Object.values(stars).reduce((sum, rating) => sum + rating, 0);
  stats.careerClears = Math.max(
    stats.careerClears,
    Object.values(stars).filter((rating) => rating > 0).length
  );
  return stats;
}

function normalizedOwned(rawOwned) {
  const owned = {};
  for (const category of COSMETIC_CATEGORIES) {
    const starterId = STARTER_COSMETICS[category];
    const valid = (id) => getCosmetic(id)?.category === category;
    owned[category] = uniqueStrings(rawOwned?.[category], valid, 100);
    if (!owned[category].includes(starterId)) owned[category].unshift(starterId);
  }
  return owned;
}

function normalizedEquipped(rawEquipped, owned) {
  const equipped = {};
  for (const category of COSMETIC_CATEGORIES) {
    const requested = rawEquipped?.[category];
    equipped[category] = owned[category].includes(requested)
      ? requested
      : STARTER_COSMETICS[category];
  }
  return equipped;
}

function normalizedDaily(rawDaily) {
  const rawMissions = isRecord(rawDaily?.missions) ? rawDaily.missions : {};
  const missions = {};
  for (const [id, progress] of Object.entries(rawMissions)) {
    if (typeof id === 'string' && id.length <= 64) missions[id] = integer(progress, 0, 1_000_000);
  }
  return {
    currentDate: dateString(rawDaily?.currentDate),
    completed: rawDaily?.completed === true,
    rewardClaimed: rawDaily?.rewardClaimed === true,
    completedDates: uniqueStrings(rawDaily?.completedDates, (date) => dateString(date) !== null, 400),
    missions
  };
}

function normalizedBestDaily(rawDaily) {
  const daily = {};
  if (!isRecord(rawDaily)) return daily;
  for (const [date, score] of Object.entries(rawDaily)) {
    if (dateString(date)) daily[date] = integer(score, 0);
  }
  return daily;
}

function normalizedRewardClaims(rawClaims, stars) {
  const claims = {};
  for (const [levelId, rating] of Object.entries(stars)) {
    const raw = isRecord(rawClaims?.[levelId]) ? rawClaims[levelId] : {};
    claims[levelId] = {
      clear: raw.clear === true || rating > 0,
      threeStar: raw.threeStar === true || rating >= 3
    };
  }
  return claims;
}

function normalizedLastPlayed(rawLastPlayed) {
  const mode = VALID_MODES.has(rawLastPlayed?.mode) ? rawLastPlayed.mode : 'career';
  const levelId = resolveLevelId(rawLastPlayed?.levelId) ?? LEVELS[0].id;
  const playedAt = typeof rawLastPlayed?.playedAt === 'string' ? rawLastPlayed.playedAt : null;
  return { mode, levelId, playedAt };
}

function normalizedTutorial(rawTutorial) {
  return {
    completed: rawTutorial?.completed === true,
    step: integer(rawTutorial?.step, 0, 20)
  };
}

function createDefaultSave() {
  const owned = normalizedOwned(null);
  return {
    version: SAVE_VERSION,
    stars: {},
    bestArcade: 0,
    best: { arcade: 0, daily: {} },
    coins: 0,
    owned,
    equipped: normalizedEquipped(null, owned),
    settings: defaultSettings(),
    stats: defaultStats(),
    daily: normalizedDaily(null),
    lastPlayed: normalizedLastPlayed(null),
    tutorial: normalizedTutorial(null),
    rewardClaims: {}
  };
}

function normalizeSave(rawSave) {
  if (!isRecord(rawSave)) return createDefaultSave();
  const stars = normalizedStars(rawSave.stars);
  const bestArcade = Math.max(
    integer(rawSave.bestArcade, 0),
    integer(rawSave.best?.arcade, 0)
  );
  const owned = normalizedOwned(rawSave.owned);
  return {
    version: SAVE_VERSION,
    stars,
    bestArcade,
    best: {
      arcade: bestArcade,
      daily: normalizedBestDaily(rawSave.best?.daily)
    },
    coins: integer(rawSave.coins, 0, MAX_CURRENCY),
    owned,
    equipped: normalizedEquipped(rawSave.equipped, owned),
    settings: normalizedSettings(rawSave.settings),
    stats: normalizedStats(rawSave.stats, stars),
    daily: normalizedDaily(rawSave.daily),
    lastPlayed: normalizedLastPlayed(rawSave.lastPlayed),
    tutorial: normalizedTutorial(rawSave.tutorial),
    rewardClaims: normalizedRewardClaims(rawSave.rewardClaims, stars)
  };
}

function storageGet(storage, key) {
  if (!storage || typeof storage.getItem !== 'function') return null;
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

function parse(raw) {
  if (typeof raw !== 'string' || raw.length === 0) return null;
  try {
    const value = JSON.parse(raw);
    return isRecord(value) ? value : null;
  } catch {
    return null;
  }
}

function firstFrontierLevel(stars) {
  let index = 0;
  while (index < LEVELS.length - 1 && (stars[LEVELS[index].id] ?? 0) > 0) index++;
  return LEVELS[index].id;
}

export const SaveManager = {
  _cache: null,
  _storageOverride: undefined,

  configureStorage(storage, { reload = true } = {}) {
    const valid = storage === null || (
      storage && typeof storage.getItem === 'function' && typeof storage.setItem === 'function'
    );
    if (!valid) return false;
    this._storageOverride = storage;
    if (reload) this._cache = null;
    return true;
  },

  _storage() {
    return this._storageOverride !== undefined
      ? this._storageOverride
      : PlatformService.getStorage();
  },

  load() {
    if (this._cache) return this._cache;
    const storage = this._storage();
    const current = parse(storageGet(storage, SAVE_KEY));
    if (current) {
      this._cache = normalizeSave(current);
      return this._cache;
    }

    const legacy = parse(storageGet(storage, LEGACY_SAVE_KEY));
    this._cache = legacy
      ? normalizeSave({ stars: legacy.stars, bestArcade: legacy.bestArcade })
      : createDefaultSave();
    if (legacy) this.save();
    return this._cache;
  },

  reload() {
    this._cache = null;
    return this.load();
  },

  save() {
    if (!this._cache) this._cache = createDefaultSave();
    this._cache = normalizeSave(this._cache);
    const storage = this._storage();
    if (!storage || typeof storage.setItem !== 'function') return false;
    try {
      storage.setItem(SAVE_KEY, JSON.stringify(this._cache));
      return true;
    } catch {
      return false;
    }
  },

  reset({ preserveSettings = false } = {}) {
    const previousSettings = preserveSettings ? this.getSettings() : null;
    this._cache = createDefaultSave();
    if (previousSettings) this._cache.settings = normalizedSettings(previousSettings);
    this.save();
    return this._cache;
  },

  getStars(levelReference) {
    const levelId = resolveLevelId(levelReference);
    return levelId ? this.load().stars[levelId] ?? 0 : 0;
  },

  setStars(levelReference, stars) {
    const levelId = resolveLevelId(levelReference);
    if (!levelId) return 0;
    const rating = Math.min(integer(stars, 0, 3), 3);
    const data = this.load();
    const previous = data.stars[levelId] ?? 0;
    if (rating <= previous) return previous;

    data.stars[levelId] = rating;
    const claims = data.rewardClaims[levelId] ?? { clear: false, threeStar: false };
    const levelReward = LEVEL_BY_ID.get(levelId)?.reward ?? { coins: 0, threeStarBonus: 0 };

    if (previous === 0 && !claims.clear) {
      data.coins = Math.min(data.coins + integer(levelReward.coins, 0, MAX_CURRENCY), MAX_CURRENCY);
      data.stats.careerClears++;
      claims.clear = true;
    }
    if (rating === 3 && previous < 3 && !claims.threeStar) {
      data.coins = Math.min(data.coins + integer(levelReward.threeStarBonus, 0, MAX_CURRENCY), MAX_CURRENCY);
      claims.threeStar = true;
    }
    data.rewardClaims[levelId] = claims;
    data.stats.careerStars = Object.values(data.stars).reduce((sum, value) => sum + value, 0);
    data.lastPlayed = {
      mode: 'career',
      levelId: firstFrontierLevel(data.stars),
      playedAt: new Date().toISOString()
    };
    this.save();
    return rating;
  },

  // Number of sequentially accessible levels; completing a level unlocks one.
  unlockedCount(totalLevels = LEVELS.length) {
    const total = Math.min(integer(totalLevels, LEVELS.length, LEVELS.length), LEVELS.length);
    if (total <= 0) return 0;
    const stars = this.load().stars;
    let unlocked = 1;
    while (unlocked < total && (stars[LEVELS[unlocked - 1].id] ?? 0) > 0) unlocked++;
    return unlocked;
  },

  getCompletedCount(totalLevels = LEVELS.length) {
    const total = Math.min(integer(totalLevels, LEVELS.length, LEVELS.length), LEVELS.length);
    let completed = 0;
    for (let i = 0; i < total; i++) if (this.getStars(i) > 0) completed++;
    return completed;
  },

  getTotalStars() {
    return Object.values(this.load().stars).reduce((sum, rating) => sum + rating, 0);
  },

  getProgress(totalLevels = LEVELS.length) {
    const total = Math.min(integer(totalLevels, LEVELS.length, LEVELS.length), LEVELS.length);
    return {
      completed: this.getCompletedCount(total),
      unlocked: this.unlockedCount(total),
      total,
      stars: this.getTotalStars(),
      maxStars: total * 3
    };
  },

  getBestArcade() {
    return this.load().bestArcade;
  },

  setBestArcade(score) {
    const data = this.load();
    const safeScore = integer(score, 0);
    if (safeScore <= data.bestArcade) return data.bestArcade;
    data.bestArcade = safeScore;
    data.best.arcade = safeScore;
    this.save();
    return safeScore;
  },

  getBestDaily(date) {
    const validDate = dateString(date);
    return validDate ? this.load().best.daily[validDate] ?? 0 : 0;
  },

  setBestDaily(date, score) {
    const validDate = dateString(date);
    if (!validDate) return 0;
    const data = this.load();
    const previous = data.best.daily[validDate] ?? 0;
    const safeScore = integer(score, 0);
    if (safeScore <= previous) return previous;
    data.best.daily[validDate] = safeScore;
    this.save();
    return safeScore;
  },

  getCoins() {
    return this.load().coins;
  },

  addCoins(amount) {
    const data = this.load();
    data.coins = Math.min(data.coins + integer(amount, 0, MAX_CURRENCY), MAX_CURRENCY);
    this.save();
    return data.coins;
  },

  spendCoins(amount) {
    const cost = integer(amount, 0, MAX_CURRENCY);
    const data = this.load();
    if (cost <= 0 || data.coins < cost) return false;
    data.coins -= cost;
    this.save();
    return true;
  },

  ownsCosmetic(id) {
    const cosmetic = getCosmetic(id);
    return cosmetic ? this.load().owned[cosmetic.category].includes(id) : false;
  },

  isCosmeticAvailable(id) {
    const cosmetic = getCosmetic(id);
    if (!cosmetic) return false;
    if (this.ownsCosmetic(id)) return true;
    const unlock = cosmetic.unlock ?? { type: 'coins', value: cosmetic.price };
    switch (unlock.type) {
      case 'starter':
      case 'coins':
        return true;
      case 'stars':
        return this.getTotalStars() >= integer(unlock.value, 0);
      case 'cup': {
        const cupLevels = LEVELS.filter((level) => level.cup === unlock.value);
        return cupLevels.length > 0 && cupLevels.every((level) => this.getStars(level.id) > 0);
      }
      case 'daily':
        return this.getDaily().completedDates.length >= integer(unlock.value, 0);
      default:
        return false;
    }
  },

  getCosmeticStatus(id) {
    const cosmetic = getCosmetic(id);
    if (!cosmetic) return null;
    return {
      id,
      owned: this.ownsCosmetic(id),
      available: this.isCosmeticAvailable(id),
      equipped: this.getEquippedCosmetic(cosmetic.category) === id,
      affordable: this.getCoins() >= cosmetic.price,
      price: cosmetic.price,
      unlock: { ...cosmetic.unlock }
    };
  },

  unlockCosmetic(id) {
    const cosmetic = getCosmetic(id);
    if (!cosmetic) return false;
    const data = this.load();
    const owned = data.owned[cosmetic.category];
    if (!owned.includes(id)) owned.push(id);
    this.save();
    return true;
  },

  purchaseCosmetic(id) {
    const cosmetic = getCosmetic(id);
    if (!cosmetic) return false;
    if (this.ownsCosmetic(id)) return true;
    if (!this.isCosmeticAvailable(id)) return false;
    if (!this.spendCoins(cosmetic.price)) return false;
    return this.unlockCosmetic(id);
  },

  equipCosmetic(id) {
    const cosmetic = getCosmetic(id);
    if (!cosmetic || !this.ownsCosmetic(id)) return false;
    const data = this.load();
    data.equipped[cosmetic.category] = id;
    this.save();
    return true;
  },

  getOwnedCosmetics(category = null) {
    const owned = this.load().owned;
    if (category === null) return clone(owned);
    return COSMETIC_CATEGORIES.includes(category) ? [...owned[category]] : [];
  },

  getEquippedCosmetic(category) {
    return COSMETIC_CATEGORIES.includes(category)
      ? this.load().equipped[category]
      : null;
  },

  getEquippedCosmetics() {
    return { ...this.load().equipped };
  },

  // Short alias used by gameplay rendering code.
  getEquipped() {
    return this.getEquippedCosmetics();
  },

  getSettings() {
    return { ...this.load().settings };
  },

  updateSettings(settings) {
    const data = this.load();
    data.settings = normalizedSettings({ ...data.settings, ...(isRecord(settings) ? settings : {}) });
    this.save();
    return { ...data.settings };
  },

  setSetting(key, value) {
    if (!(key in defaultSettings())) return false;
    this.updateSettings({ [key]: value });
    return true;
  },

  getStats() {
    return { ...this.load().stats };
  },

  incrementStat(key, amount = 1) {
    if (!STAT_KEYS.includes(key)) return 0;
    const data = this.load();
    data.stats[key] = Math.min(data.stats[key] + finiteNumber(amount, 0), MAX_STAT);
    this.save();
    return data.stats[key];
  },

  getDaily() {
    return clone(this.load().daily);
  },

  updateDaily(daily) {
    const data = this.load();
    const patch = isRecord(daily) ? daily : {};
    data.daily = normalizedDaily({
      ...data.daily,
      ...patch,
      missions: {
        ...data.daily.missions,
        ...(isRecord(patch.missions) ? patch.missions : {})
      }
    });
    this.save();
    return clone(data.daily);
  },

  getLastPlayed() {
    return { ...this.load().lastPlayed };
  },

  setLastPlayed(modeOrState, levelReference = undefined) {
    const requested = isRecord(modeOrState)
      ? modeOrState
      : { mode: modeOrState, levelId: levelReference };
    const data = this.load();
    data.lastPlayed = normalizedLastPlayed({
      ...data.lastPlayed,
      ...requested,
      playedAt: requested.playedAt ?? new Date().toISOString()
    });
    this.save();
    return { ...data.lastPlayed };
  },

  getLastPlayedLevelIndex() {
    return LEVEL_INDEX_BY_ID.get(this.load().lastPlayed.levelId) ?? 0;
  },

  getTutorial() {
    return { ...this.load().tutorial };
  },

  setTutorial({ completed = undefined, step = undefined } = {}) {
    const data = this.load();
    data.tutorial = normalizedTutorial({
      completed: completed ?? data.tutorial.completed,
      step: step ?? data.tutorial.step
    });
    this.save();
    return { ...data.tutorial };
  }
};
