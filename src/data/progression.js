import { createSeededRng } from './levels.js';

export const DAILY_STREAK_REWARDS = Object.freeze([60, 75, 90, 110, 135, 165, 220]);

export const DAILY_MISSION_POOL = Object.freeze([
  Object.freeze({ id: 'shots-8', metric: 'shots', label: 'Take 8 free kicks', target: 8, reward: 40 }),
  Object.freeze({ id: 'goals-4', metric: 'goals', label: 'Score 4 goals', target: 4, reward: 55 }),
  Object.freeze({ id: 'curve-2', metric: 'curvedGoals', label: 'Score 2 curved goals', target: 2, reward: 65 }),
  Object.freeze({ id: 'top-bin-1', metric: 'topCorners', label: 'Find the top corner', target: 1, reward: 75 }),
  Object.freeze({ id: 'points-7000', metric: 'score', label: 'Earn 7,000 shot points', target: 7000, reward: 60 }),
  Object.freeze({ id: 'goals-6', metric: 'goals', label: 'Score 6 goals', target: 6, reward: 80 }),
  Object.freeze({ id: 'shots-12', metric: 'shots', label: 'Take 12 free kicks', target: 12, reward: 55 })
]);

export const ACHIEVEMENTS = Object.freeze([
  Object.freeze({ id: 'first-net', stat: 'goals', label: 'First of many', description: 'Score your first goal', target: 1, reward: 50 }),
  Object.freeze({ id: 'goal-25', stat: 'goals', label: 'Reliable finisher', description: 'Score 25 goals', target: 25, reward: 150 }),
  Object.freeze({ id: 'goal-100', stat: 'goals', label: 'Century striker', description: 'Score 100 goals', target: 100, reward: 400 }),
  Object.freeze({ id: 'bend-10', stat: 'curvedGoals', label: 'Bend specialist', description: 'Score 10 curved goals', target: 10, reward: 160 }),
  Object.freeze({ id: 'top-10', stat: 'topCorners', label: 'Postage stamp', description: 'Score 10 top-corner goals', target: 10, reward: 220 }),
  Object.freeze({ id: 'shots-100', stat: 'shots', label: 'Training ground', description: 'Take 100 free kicks', target: 100, reward: 180 }),
  Object.freeze({ id: 'clear-10', stat: 'careerClears', label: 'Cup contender', description: 'Clear 10 career matches', target: 10, reward: 180 }),
  Object.freeze({ id: 'clear-50', stat: 'careerClears', label: 'Five-cup legend', description: 'Clear all 50 career matches', target: 50, reward: 650 }),
  Object.freeze({ id: 'stars-50', stat: 'careerStars', label: 'Rising standard', description: 'Earn 50 career stars', target: 50, reward: 260 }),
  Object.freeze({ id: 'stars-150', stat: 'careerStars', label: 'Perfect collection', description: 'Earn all 150 career stars', target: 150, reward: 900 }),
  Object.freeze({ id: 'arcade-5', stat: 'arcadeRuns', label: 'Under the lights', description: 'Finish 5 Time Attack runs', target: 5, reward: 120 }),
  Object.freeze({ id: 'daily-7', stat: 'dailyRuns', label: 'Seven-day pro', description: 'Complete 7 Daily Kicks', target: 7, reward: 350 })
]);

export function utcDateKey(date = new Date()) {
  const value = date instanceof Date ? date : new Date(date);
  return Number.isFinite(value.getTime()) ? value.toISOString().slice(0, 10) : null;
}

export function dayDistance(fromDate, toDate) {
  const from = Date.parse(`${fromDate}T00:00:00Z`);
  const to = Date.parse(`${toDate}T00:00:00Z`);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return null;
  return Math.round((to - from) / 86_400_000);
}

export function getDailyMissions(date = utcDateKey()) {
  const rng = createSeededRng(`missions:${date}`);
  const remaining = [...DAILY_MISSION_POOL];
  const selected = [];
  while (selected.length < 3 && remaining.length) {
    const index = Math.floor(rng() * remaining.length);
    const candidate = remaining.splice(index, 1)[0];
    if (selected.some((mission) => mission.metric === candidate.metric)) continue;
    selected.push(candidate);
  }
  return selected;
}

export function getAchievement(id) {
  return ACHIEVEMENTS.find((achievement) => achievement.id === id) ?? null;
}
