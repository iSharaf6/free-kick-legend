import { getCosmetic } from '../data/cosmetics.js';

const DEFAULT_CHARACTER = Object.freeze({
  ability: 'Perfect Balance',
  summary: '100% power · neutral curl · longer aim read',
  powerMultiplier: 1,
  powerCap: 1,
  spinMultiplier: 1,
  lateralMultiplier: 1,
  windEffect: 1,
  previewFraction: 0.55,
  wallKnockdownPower: Infinity
});

const DEFAULT_BALL = Object.freeze({
  feel: 'Match Standard',
  summary: 'Balanced flight, bounce and curl',
  shotPower: 1,
  visualScale: 1,
  windEffect: 1,
  physics: Object.freeze({})
});

function finite(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

export function resolveLoadoutGameplay(loadout = {}) {
  const character = getCosmetic(loadout.character)?.gameplay ?? DEFAULT_CHARACTER;
  const ball = getCosmetic(loadout.ball)?.gameplay ?? DEFAULT_BALL;
  return Object.freeze({
    ability: character.ability ?? DEFAULT_CHARACTER.ability,
    abilitySummary: character.summary ?? DEFAULT_CHARACTER.summary,
    ballFeel: ball.feel ?? DEFAULT_BALL.feel,
    ballSummary: ball.summary ?? DEFAULT_BALL.summary,
    powerMultiplier: finite(character.powerMultiplier, 1) * finite(ball.shotPower, 1),
    powerCap: finite(character.powerCap, 1),
    spinMultiplier: finite(character.spinMultiplier, 1),
    lateralMultiplier: finite(character.lateralMultiplier, 1),
    windEffect: finite(character.windEffect, 1) * finite(ball.windEffect, DEFAULT_BALL.windEffect),
    previewFraction: finite(character.previewFraction, 0.55),
    wallKnockdownPower: finite(character.wallKnockdownPower, Infinity),
    visualScale: finite(ball.visualScale, 1),
    ballPhysics: Object.freeze({ ...(ball.physics ?? {}) })
  });
}

// Apply deterministic loadout trade-offs after level hazards have resolved.
// Authored low-power challenges remain hard caps; regulation levels allow the
// selected player's advertised cap (Malik reaches 112%).
export function applyLoadoutToShot(shot, style, levelMaxPower = 1) {
  const inputPower = Math.max(0, finite(shot.power, 0));
  const authoredCap = Math.max(0, finite(levelMaxPower, 1));
  const playerCap = authoredCap < 1 - 1e-6
    ? authoredCap
    : Math.max(0, finite(style?.powerCap, 1));
  const power = Math.min(
    inputPower * Math.max(0, finite(style?.powerMultiplier, 1)),
    playerCap
  );
  const velocityScale = inputPower > 1e-6 ? power / inputPower : 1;
  const lateral = finite(style?.lateralMultiplier, 1);

  return {
    ...shot,
    vx: finite(shot.vx, 0) * velocityScale * lateral,
    vy: finite(shot.vy, 0) * velocityScale,
    vz: finite(shot.vz, 0) * velocityScale,
    spin: finite(shot.spin, 0) * finite(style?.spinMultiplier, 1),
    power,
    loadoutPowerAdded: power - inputPower,
    previewFraction: finite(style?.previewFraction, 0.55),
    wallKnockdown: power >= finite(style?.wallKnockdownPower, Infinity),
    ability: style?.ability,
    ballFeel: style?.ballFeel
  };
}
