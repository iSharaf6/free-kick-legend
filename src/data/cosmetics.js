// Every item in this catalog is visual-only. Prices use coins earned through
// play; no item changes shot power, accuracy, physics or goalkeeper behaviour.

export const COSMETIC_CATEGORIES = Object.freeze(['kit', 'ball', 'trail']);

export const STARTER_COSMETICS = Object.freeze({
  kit: 'kit-home',
  ball: 'ball-classic',
  trail: 'trail-none'
});

function item(definition) {
  const palette = Object.freeze({ ...(definition.palette ?? {}) });
  const unlock = Object.freeze({ ...(definition.unlock ?? { type: 'coins', value: definition.price ?? 0 }) });
  return Object.freeze({
    rarity: 'common',
    price: 0,
    ...definition,
    palette,
    unlock,
    visualOnly: true
  });
}

export const COSMETICS = Object.freeze([
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
  item({
    id: 'ball-classic', category: 'ball', name: 'Classic Panels', description: 'The timeless black-and-white match ball.',
    price: 0, rarity: 'common', unlock: { type: 'starter', value: 0 },
    palette: { base: 0xf3f0df, panels: 0x202630, accent: 0xaeb5bc }
  }),
  item({
    id: 'ball-ocean', category: 'ball', name: 'Ocean Spin', description: 'Cool cyan panels that read clearly in flight.',
    price: 180, rarity: 'common', unlock: { type: 'coins', value: 180 },
    palette: { base: 0xeaf9ff, panels: 0x1679a7, accent: 0x55c5dc }
  }),
  item({
    id: 'ball-ember', category: 'ball', name: 'Ember Strike', description: 'Hot orange panels for pressure kicks.',
    price: 300, rarity: 'uncommon', unlock: { type: 'stars', value: 28 },
    palette: { base: 0xffe4b8, panels: 0xc44424, accent: 0xf39c32 }
  }),
  item({
    id: 'ball-pixel', category: 'ball', name: 'Pixel Pop', description: 'Chunky primary colours with arcade energy.',
    price: 420, rarity: 'rare', unlock: { type: 'cup', value: 'targets' },
    palette: { base: 0xf7f0d0, panels: 0x365fbd, accent: 0xe85a45 }
  }),
  item({
    id: 'ball-midnight', category: 'ball', name: 'Midnight Chrome', description: 'A dark ball edged for strong visibility.',
    price: 560, rarity: 'rare', unlock: { type: 'stars', value: 84 },
    palette: { base: 0x323b4b, panels: 0x10151e, accent: 0xb7c6da }
  }),
  item({
    id: 'ball-gold', category: 'ball', name: 'Golden Match', description: 'The final-stage ball of a proven specialist.',
    price: 850, rarity: 'legendary', unlock: { type: 'cup', value: 'legend' },
    palette: { base: 0xffe184, panels: 0xa66b16, accent: 0xfff0b8 }
  }),

  // ------------------------------------------------------------------ trails
  item({
    id: 'trail-none', category: 'trail', name: 'Clean Flight', description: 'No added trail—just the strike.',
    price: 0, rarity: 'common', unlock: { type: 'starter', value: 0 },
    palette: { start: 0xffffff, end: 0xffffff }, particle: 'none'
  }),
  item({
    id: 'trail-comet', category: 'trail', name: 'Comet Tail', description: 'A crisp white-to-gold flight streak.',
    price: 260, rarity: 'common', unlock: { type: 'stars', value: 10 },
    palette: { start: 0xffffff, end: 0xf2c832 }, particle: 'spark'
  }),
  item({
    id: 'trail-ember', category: 'trail', name: 'Ember Wake', description: 'Warm sparks that fade behind the ball.',
    price: 380, rarity: 'uncommon', unlock: { type: 'coins', value: 380 },
    palette: { start: 0xffd166, end: 0xe34c26 }, particle: 'square'
  }),
  item({
    id: 'trail-frost', category: 'trail', name: 'Frost Line', description: 'A clean ice-blue ribbon in flight.',
    price: 440, rarity: 'uncommon', unlock: { type: 'daily', value: 3 },
    palette: { start: 0xe6fbff, end: 0x4ab7dc }, particle: 'diamond'
  }),
  item({
    id: 'trail-confetti', category: 'trail', name: 'Matchday Confetti', description: 'Tiny celebratory colours on every strike.',
    price: 620, rarity: 'rare', unlock: { type: 'cup', value: 'pressure' },
    palette: { start: 0xffee58, end: 0xef5350 }, particle: 'confetti'
  }),
  item({
    id: 'trail-aurora', category: 'trail', name: 'Aurora Curve', description: 'A prestige teal-and-violet curl trace.',
    price: 900, rarity: 'legendary', unlock: { type: 'stars', value: 120 },
    palette: { start: 0x42f5c5, end: 0x8d62e8 }, particle: 'aurora'
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
