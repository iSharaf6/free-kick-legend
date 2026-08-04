// Kits remain visual-only. Players and balls now carry explicit, readable play
// styles so changing loadout changes technique rather than only repainting the
// same shot. The trade-offs stay deterministic: no paid item adds random aim or
// hidden goalkeeper manipulation.

export const COSMETIC_CATEGORIES = Object.freeze(['character', 'kit', 'ball', 'trail']);

export const STARTER_COSMETICS = Object.freeze({
  character: 'character-mica',
  kit: 'kit-home',
  ball: 'ball-snowball',
  trail: 'trail-none'
});

function item(definition) {
  const palette = Object.freeze({ ...(definition.palette ?? {}) });
  const unlock = Object.freeze({ ...(definition.unlock ?? { type: 'coins', value: definition.price ?? 0 }) });
  const gameplay = definition.gameplay
    ? Object.freeze({
        ...definition.gameplay,
        physics: definition.gameplay.physics
          ? Object.freeze({ ...definition.gameplay.physics })
          : undefined
      })
    : null;
  const utility = definition.utility ? Object.freeze({ ...definition.utility }) : null;
  return Object.freeze({
    rarity: 'common',
    price: 0,
    ...definition,
    palette,
    unlock,
    gameplay,
    utility,
    visualOnly: gameplay === null
  });
}

export const COSMETICS = Object.freeze([
  // -------------------------------------------------------------- characters
  item({
    id: 'character-mica', category: 'character', name: 'Mica Vale',
    description: 'The original number 17 and free-kick specialist.',
    archetype: 'Balanced', dominantFoot: 'right', personality: 'Composed',
    silhouette: 'Average athletic build with a compact, square ready stance.',
    gameplay: {
      ability: 'Perfect Balance',
      summary: '100% power · neutral curl · longer aim read',
      powerMultiplier: 1, powerCap: 1, spinMultiplier: 1,
      lateralMultiplier: 1, windEffect: 1, previewFraction: 0.62
    },
    renderScale: 1,
    number: 17, price: 0, rarity: 'common', unlock: { type: 'starter', value: 0 }
  }),
  item({
    id: 'character-power-striker', category: 'character', name: 'Malik Rook',
    description: 'A broad number 9 whose planted stance and full-body rotation radiate power.',
    number: 9, archetype: 'Power Striker', dominantFoot: 'right', personality: 'Fearless',
    silhouette: 'Tall and muscular, with a wide base, heavy shoulders and forceful movement.',
    gameplay: {
      ability: 'Thunderstrike',
      summary: '112% power · reduced curl · flattens the wall',
      powerMultiplier: 1.12, powerCap: 1.12, spinMultiplier: 0.88,
      lateralMultiplier: 0.96, windEffect: 1.06, previewFraction: 0.54,
      wallKnockdownPower: 1.02
    },
    renderScale: 1.14,
    price: 0, rarity: 'rare', unlock: { type: 'starter', value: 0 }
  }),
  item({
    id: 'character-agile-winger', category: 'character', name: 'Nico Velo',
    description: 'A quick number 7 with elastic footwork and a sharp, airborne follow-through.',
    number: 7, archetype: 'Agile Winger', dominantFoot: 'right', personality: 'Playful',
    silhouette: 'Shorter and lean, with staggered feet, narrow shoulders and springy movement.',
    gameplay: {
      ability: 'Whip Step',
      summary: '96% power cap · 35% more curl · wider bend',
      powerMultiplier: 0.98, powerCap: 0.96, spinMultiplier: 1.35,
      lateralMultiplier: 1.07, windEffect: 1, previewFraction: 0.5
    },
    renderScale: 1,
    price: 0, rarity: 'uncommon', unlock: { type: 'starter', value: 0 }
  }),
  item({
    id: 'character-islam-sharaf', category: 'character', name: 'Islam Sharaf',
    description: 'A lean, technical number 10 with precise footwork and a controlled wrapped finish.',
    number: 10, archetype: 'Technical Creator', dominantFoot: 'right', personality: 'Assured',
    silhouette: 'Lean-muscular V-taper with squared shoulders, planted feet and a focused upfield posture.',
    gameplay: {
      ability: 'Dead-Ball Control',
      summary: '103% power · 12% more curl · resists wind',
      powerMultiplier: 1.03, powerCap: 1.03, spinMultiplier: 1.12,
      lateralMultiplier: 1, windEffect: 0.78, previewFraction: 0.68
    },
    renderScale: 1,
    price: 0, rarity: 'legendary', unlock: { type: 'starter', value: 0 }
  }),

  // -------------------------------------------------------------------- kits
  item({
    id: 'kit-home', category: 'kit', name: 'Legend Home', description: 'Navy, gold and stadium white.',
    price: 0, rarity: 'common', unlock: { type: 'starter', value: 0 },
    palette: { primary: 0x17365d, secondary: 0xf2c832, trim: 0xf8f8f4 }
  }),
  item({
    id: 'kit-crimson', category: 'kit', name: 'Crimson Press', description: 'Deep red with clean cream trim.',
    price: 240, rarity: 'common', unlock: { type: 'coins', value: 240 },
    palette: { primary: 0x9f2837, secondary: 0x6d1726, trim: 0xfff0d4 }
  }),
  item({
    id: 'kit-emerald', category: 'kit', name: 'Emerald Eleven', description: 'A vivid green tournament strip.',
    price: 320, rarity: 'uncommon', unlock: { type: 'stars', value: 16 },
    palette: { primary: 0x16784a, secondary: 0x0e4e36, trim: 0xf3d45b }
  }),
  item({
    id: 'kit-sunrise', category: 'kit', name: 'Sunrise City', description: 'Warm orange with midnight details.',
    price: 420, rarity: 'uncommon', unlock: { type: 'cup', value: 'curve' },
    palette: { primary: 0xe96f27, secondary: 0x23304d, trim: 0xffe6a1 }
  }),
  item({
    id: 'kit-monochrome', category: 'kit', name: 'Monochrome FC', description: 'Graphic black-and-ivory blocks.',
    price: 560, rarity: 'rare', unlock: { type: 'stars', value: 60 },
    palette: { primary: 0x171a20, secondary: 0xe8e2d2, trim: 0x747b86 }
  }),
  item({
    id: 'kit-royal', category: 'kit', name: 'Royal Final', description: 'A regal violet kit for cup specialists.',
    price: 760, rarity: 'legendary', unlock: { type: 'cup', value: 'pressure' },
    palette: { primary: 0x5c378f, secondary: 0x2c194d, trim: 0xf0c95a }
  }),

  // ------------------------------------------------------------------- balls
  // These are deliberately sport balls, not recoloured footballs. Each one
  // changes the solver profile, so its feel is something the player can learn.
  item({
    id: 'ball-snowball', category: 'ball', name: 'Packed Snowball',
    description: 'A hand-packed snowball that thumps down and sheds speed in the air.',
    price: 0, rarity: 'common', unlock: { type: 'starter', value: 0 },
    palette: { base: 0xeaf5ff, panels: 0xaec8dc, accent: 0xffffff },
    gameplay: {
      feel: 'Packed Impact', summary: 'Heavy drop · soft bounce · low wind drift', shotPower: 0.92,
      visualScale: 1.08, windEffect: 0.76,
      physics: { gravity: 1.12, drag: 1.32, magnus: 0.70, bounce: 0.36, rollingDrag: 1.72, impactFriction: 0.72, spinDecay: 1.34 }
    }
  }),
  item({
    id: 'ball-basketball', category: 'ball', name: 'Street Basketball',
    description: 'An oversized street ball with springy, floaty rebounds.',
    price: 520, rarity: 'rare', unlock: { type: 'stars', value: 52 },
    palette: { base: 0xe77925, panels: 0x24160f, accent: 0xffb45e },
    gameplay: {
      feel: 'Street Bounce', summary: 'Floatier flight · 45% stronger bounce', shotPower: 0.96,
      visualScale: 1.16, windEffect: 0.96,
      physics: { gravity: 0.94, drag: 1.08, magnus: 0.84, bounce: 1.45, rollingDrag: 0.82 }
    }
  }),
  item({
    id: 'ball-golf', category: 'ball', name: 'Tour Golf Ball',
    description: 'A tiny dimpled ball that flies fast and bends aggressively.',
    price: 780, rarity: 'legendary', unlock: { type: 'cup', value: 'legend' },
    palette: { base: 0xf8fbf2, panels: 0x9aa7a5, accent: 0xd6ded9 },
    gameplay: {
      feel: 'Tour Flight', summary: 'Smaller · faster · 45% more aerodynamic curl', shotPower: 1.06,
      visualScale: 0.72, windEffect: 0.88,
      physics: { gravity: 1.06, drag: 0.76, magnus: 1.45, bounce: 0.66, spinDecay: 0.78 }
    }
  }),
  item({
    id: 'ball-volleyball', category: 'ball', name: 'Sky Volleyball',
    description: 'A soft, buoyant volleyball that carries high and keeps its bend.',
    price: 340, rarity: 'uncommon', unlock: { type: 'coins', value: 340 },
    palette: { base: 0xf7fbff, panels: 0x247ac5, accent: 0x78c6ee },
    gameplay: {
      feel: 'Float Serve', summary: 'High carry · extra curl · lively rebound', shotPower: 0.98,
      visualScale: 1.05, windEffect: 1.14,
      physics: { gravity: 0.88, drag: 1.02, magnus: 1.16, bounce: 1.18, rollingDrag: 0.92, spinDecay: 0.75 }
    }
  }),
  item({
    id: 'ball-beachball', category: 'ball', name: 'Beach Ball',
    description: 'A glossy beach ball that floats, swerves and catches every breeze.',
    price: 560, rarity: 'rare', unlock: { type: 'cup', value: 'targets' },
    palette: { base: 0xf7fbff, panels: 0x217bd0, accent: 0xf0523b },
    gameplay: {
      feel: 'Breeze Rider', summary: 'Big float · huge wind drift · slow launch', shotPower: 0.84,
      visualScale: 1.20, windEffect: 1.65,
      physics: { gravity: 0.74, drag: 1.55, magnus: 1.50, bounce: 0.90, rollingDrag: 1.20, impactFriction: 0.80, spinDecay: 1.24 }
    }
  }),
  item({
    id: 'ball-tennis', category: 'ball', name: 'Tennis Ball',
    description: 'A fast felt ball with a sharp seam that bites into curl and springs off turf.',
    price: 760, rarity: 'legendary', unlock: { type: 'cup', value: 'legend' },
    palette: { base: 0xd8ed23, panels: 0xf7f4d5, accent: 0x91b312 },
    gameplay: {
      feel: 'Topspin Rally', summary: 'Quick launch · sharp curl · springy bounce', shotPower: 1.06,
      visualScale: 0.90, windEffect: 1.05,
      physics: { gravity: 1.04, drag: 0.90, magnus: 1.30, bounce: 1.60, rollingDrag: 1.05, impactFriction: 0.88, spinDecay: 0.90 }
    }
  }),

  // ------------------------------------------------------------------ trails
  item({
    id: 'trail-none', category: 'trail', name: 'Clean Flight', description: 'No added trail—just the strike.',
    price: 0, rarity: 'common', unlock: { type: 'starter', value: 0 },
    palette: { start: 0xffffff, end: 0xffffff }, particle: 'none',
    utility: { label: 'Minimal read', summary: 'Short, subtle motion trace', samples: 10, opacity: 0.14 }
  }),
  item({
    id: 'trail-comet', category: 'trail', name: 'Comet Tail', description: 'A crisp white-to-gold flight streak.',
    price: 260, rarity: 'common', unlock: { type: 'stars', value: 10 },
    palette: { start: 0xffffff, end: 0xf2c832 }, particle: 'spark',
    utility: { label: 'Pace read', summary: 'Even markers expose changes in ball speed', samples: 30, opacity: 0.62 }
  }),
  item({
    id: 'trail-ember', category: 'trail', name: 'Ember Wake', description: 'Warm sparks that fade behind the ball.',
    price: 380, rarity: 'uncommon', unlock: { type: 'coins', value: 380 },
    palette: { start: 0xffd166, end: 0xe34c26 }, particle: 'square',
    utility: { label: 'Power read', summary: 'Block size reacts to strike power', samples: 34, opacity: 0.66 }
  }),
  item({
    id: 'trail-frost', category: 'trail', name: 'Frost Line', description: 'A clean ice-blue ribbon in flight.',
    price: 440, rarity: 'uncommon', unlock: { type: 'daily', value: 3 },
    palette: { start: 0xe6fbff, end: 0x4ab7dc }, particle: 'diamond',
    utility: { label: 'Bounce read', summary: 'Diamond samples preserve the landing path', samples: 40, opacity: 0.68 }
  }),
  item({
    id: 'trail-confetti', category: 'trail', name: 'Matchday Confetti', description: 'Tiny celebratory colours on every strike.',
    price: 620, rarity: 'rare', unlock: { type: 'cup', value: 'pressure' },
    palette: { start: 0xffee58, end: 0xef5350 }, particle: 'confetti',
    utility: { label: 'Reward read', summary: 'A restrained burst marks goals and combos', samples: 32, opacity: 0.7 }
  }),
  item({
    id: 'trail-aurora', category: 'trail', name: 'Aurora Curve', description: 'A prestige teal-and-violet curl trace.',
    price: 900, rarity: 'legendary', unlock: { type: 'stars', value: 120 },
    palette: { start: 0x42f5c5, end: 0x8d62e8 }, particle: 'aurora',
    utility: { label: 'Curl read', summary: 'Twin ribbons make the full bend legible', samples: 52, opacity: 0.74 }
  })
]);

const COSMETICS_BY_ID = new Map(COSMETICS.map((cosmetic) => [cosmetic.id, cosmetic]));

export function getCosmetic(id) {
  return COSMETICS_BY_ID.get(id) ?? null;
}

export function getCosmeticsByCategory(category) {
  if (!COSMETIC_CATEGORIES.includes(category)) return [];
  return COSMETICS.filter((cosmetic) => cosmetic.category === category);
}

export function kickerHdTextureKey(characterId, kitId, pose) {
  const safeCharacter = getCosmetic(characterId)?.category === 'character'
    ? characterId
    : STARTER_COSMETICS.character;
  const safeKit = getCosmetic(kitId)?.category === 'kit' ? kitId : STARTER_COSMETICS.kit;
  return safeCharacter === STARTER_COSMETICS.character
    ? `kicker-hd-${safeKit}-${pose}`
    : `kicker-hd-${safeCharacter}-${safeKit}-${pose}`;
}
