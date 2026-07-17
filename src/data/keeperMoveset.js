const move = (id, label, tier, category, texture, frames, options = {}) => Object.freeze({
  id,
  label,
  tier,
  category,
  texture,
  frames: Object.freeze(frames),
  frameMs: options.frameMs ?? 88,
  loop: Boolean(options.loop),
  side: options.side ?? 'centre'
});

// The supplied production table contains 55 rows (despite its 54-animation
// summary). Keep every row explicit so QA and gameplay never lose a move to an
// accidental alias or an implicit left/right mirror.
export const KEEPER_MOVESET = Object.freeze([
  move('idle-stance', 'Idle stance', 'core-gameplay', 'base', 'keeper-anim-hd', [0, 1, 0, 3], { loop: true, frameMs: 220 }),
  move('ready-set', 'Ready bounce / set', 'core-gameplay', 'base', 'keeper-anim-hd', [2, 4, 2, 4], { loop: true, frameMs: 130 }),
  move('weight-shift', 'Weight shift / anticipation', 'core-gameplay', 'base', 'keeper-anim-hd', [1, 2, 3, 2], { loop: true, frameMs: 145 }),

  move('shuffle-left', 'Shuffle left loop', 'core-gameplay', 'footwork', 'keeper-footwork-hd', [0, 1, 2, 3, 4], { loop: true, side: 'left' }),
  move('shuffle-right', 'Shuffle right loop', 'core-gameplay', 'footwork', 'keeper-footwork-hd', [5, 6, 7, 8, 9], { loop: true, side: 'right' }),
  move('recover-centre-from-left', 'Recover to centre from left', 'core-gameplay', 'footwork', 'keeper-return-hd', [9, 10, 11, 12, 13, 14, 15, 16, 17], { side: 'right' }),
  move('recover-centre-from-right', 'Recover to centre from right', 'core-gameplay', 'footwork', 'keeper-return-hd', [0, 1, 2, 3, 4, 5, 6, 7, 8], { side: 'left' }),
  move('forward-attack-step', 'Forward attack step', 'core-gameplay', 'footwork', 'keeper-situational-punch-hd', [0, 1, 2]),
  move('backpedal-retreat', 'Backpedal / retreat', 'core-gameplay', 'footwork', 'keeper-situational-punch-hd', [5, 2, 1, 0]),

  move('low-catch-left', 'Low catch left', 'core-gameplay', 'low-saves', 'keeper-low-smother-hd', [8, 9, 10, 11, 12, 13, 13, 15], { side: 'left' }),
  move('low-catch-right', 'Low catch right', 'core-gameplay', 'low-saves', 'keeper-low-smother-hd', [0, 1, 2, 3, 4, 5, 5, 7], { side: 'right' }),
  move('low-parry-left', 'Low parry left', 'core-gameplay', 'low-saves', 'keeper-low-save-hd', [8, 9, 10, 11, 12, 13, 14], { side: 'left' }),
  move('low-parry-right', 'Low parry right', 'core-gameplay', 'low-saves', 'keeper-low-save-hd', [0, 1, 2, 3, 4, 5, 6], { side: 'right' }),
  move('front-smother', 'Front smother', 'core-gameplay', 'low-saves', 'keeper-handling-hd', [0, 1, 2, 3]),
  move('smother-left', 'Smother left', 'core-gameplay', 'low-saves', 'keeper-low-smother-hd', [8, 9, 10, 11, 12, 13, 14, 15], { side: 'left' }),
  move('smother-right', 'Smother right', 'core-gameplay', 'low-saves', 'keeper-low-smother-hd', [0, 1, 2, 3, 4, 5, 6, 7], { side: 'right' }),

  move('mid-catch-centre', 'Mid catch centre', 'core-gameplay', 'mid-saves', 'keeper-handling-hd', [5, 6, 7, 8]),
  move('mid-catch-left', 'Mid catch left', 'core-gameplay', 'mid-saves', 'keeper-mid-catch-hd', [8, 9, 10, 11, 12, 13, 15], { side: 'left' }),
  move('mid-catch-right', 'Mid catch right', 'core-gameplay', 'mid-saves', 'keeper-mid-catch-hd', [0, 1, 2, 3, 4, 5, 7], { side: 'right' }),
  move('mid-parry-left', 'Mid parry left', 'core-gameplay', 'mid-saves', 'keeper-upper-parry-hd', [8, 9, 10, 11, 12, 13, 14], { side: 'left' }),
  move('mid-parry-right', 'Mid parry right', 'core-gameplay', 'mid-saves', 'keeper-upper-parry-hd', [0, 1, 2, 3, 4, 5, 6], { side: 'right' }),
  move('reflex-body-block', 'Reflex body block / chest save', 'situational-saves', 'mid-saves', 'keeper-situational-punch-hd', [0, 1, 2, 3, 5]),

  move('high-claim-standing', 'High claim standing', 'core-gameplay', 'high-saves', 'keeper-anim-hd', [2, 4, 18, 17]),
  move('jump-catch-cross-claim', 'Jump catch / cross claim', 'core-gameplay', 'high-saves', 'keeper-high-claim-hd', [0, 1, 2, 3, 4]),
  move('top-left-fingertip-tip', 'Top-left fingertip tip', 'core-gameplay', 'high-saves', 'keeper-top-tip-hd', [8, 9, 10, 11, 12, 13, 14, 15], { side: 'left' }),
  move('top-right-fingertip-tip', 'Top-right fingertip tip', 'core-gameplay', 'high-saves', 'keeper-top-tip-hd', [0, 1, 2, 3, 4, 5, 6, 7], { side: 'right' }),
  move('upper-parry-left', 'Upper parry left', 'core-gameplay', 'high-saves', 'keeper-upper-parry-hd', [8, 9, 10, 11, 12, 13, 14, 15], { side: 'left' }),
  move('upper-parry-right', 'Upper parry right', 'core-gameplay', 'high-saves', 'keeper-upper-parry-hd', [0, 1, 2, 3, 4, 5, 6, 7], { side: 'right' }),

  move('full-stretch-dive-left', 'Full-stretch dive left', 'core-gameplay', 'diving', 'keeper-dive-motion-hd', [12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23], { side: 'left' }),
  move('full-stretch-dive-right', 'Full-stretch dive right', 'core-gameplay', 'diving', 'keeper-dive-motion-hd', [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], { side: 'right' }),
  move('mid-height-dive-left', 'Dive left mid-height', 'core-gameplay', 'diving', 'keeper-mid-catch-hd', [8, 9, 10, 11, 12, 13, 14, 15], { side: 'left' }),
  move('mid-height-dive-right', 'Dive right mid-height', 'core-gameplay', 'diving', 'keeper-mid-catch-hd', [0, 1, 2, 3, 4, 5, 6, 7], { side: 'right' }),
  move('low-dive-left', 'Dive left low', 'core-gameplay', 'diving', 'keeper-low-save-hd', [8, 9, 10, 11, 12, 13, 14, 15], { side: 'left' }),
  move('low-dive-right', 'Dive right low', 'core-gameplay', 'diving', 'keeper-low-save-hd', [0, 1, 2, 3, 4, 5, 6, 7], { side: 'right' }),

  move('narrow-block', 'Narrow block', 'situational-saves', '1v1', 'keeper-situational-punch-hd', [1, 2, 3, 5]),
  move('spread-save', 'Spread save', 'situational-saves', '1v1', 'keeper-situational-punch-hd', [0, 1, 2, 3, 4, 5]),
  move('foot-save-left', 'Foot save left', 'situational-saves', '1v1', 'keeper-reflex-foot-hd', [8, 9, 10, 11, 12, 13, 14, 15], { side: 'left' }),
  move('foot-save-right', 'Foot save right', 'situational-saves', '1v1', 'keeper-reflex-foot-hd', [0, 1, 2, 3, 4, 5, 6, 7], { side: 'right' }),

  move('single-hand-punch-left', 'Single-hand punch left', 'situational-saves', 'punching', 'keeper-situational-punch-hd', [12, 13, 14, 15, 16, 17], { side: 'left' }),
  move('single-hand-punch-right', 'Single-hand punch right', 'situational-saves', 'punching', 'keeper-situational-punch-hd', [18, 19, 20, 21, 22, 23], { side: 'right' }),
  move('two-fist-punch-clear', 'Two-fist punch clear', 'situational-saves', 'punching', 'keeper-situational-punch-hd', [6, 7, 8, 9, 10, 11]),

  move('underarm-roll-left', 'Underarm roll left', 'polish', 'distribution', 'keeper-distribution-hd', [0, 1, 2, 3, 4, 5], { side: 'left' }),
  move('underarm-roll-right', 'Underarm roll right', 'polish', 'distribution', 'keeper-distribution-hd', [6, 7, 8, 9, 10, 11], { side: 'right' }),
  move('overarm-throw', 'Overarm throw', 'polish', 'distribution', 'keeper-distribution-hd', [12, 13, 14, 15, 16, 17]),
  move('short-pass-feet', 'Short pass with feet', 'polish', 'distribution', 'keeper-foot-distribution-hd', [0, 1, 2, 3, 4, 5]),
  move('driven-pass', 'Driven pass', 'polish', 'distribution', 'keeper-foot-distribution-hd', [18, 19, 20, 21, 22, 23]),
  move('goal-kick-placed', 'Goal kick / placed kick', 'polish', 'distribution', 'keeper-foot-distribution-hd', [12, 13, 14, 15, 16, 17]),
  move('drop-kick', 'Drop kick', 'polish', 'distribution', 'keeper-foot-distribution-hd', [6, 7, 8, 9, 10, 11]),
  move('side-volley-half-volley', 'Side volley / half-volley', 'polish', 'distribution', 'keeper-foot-distribution-hd', [24, 25, 26, 27, 28, 29]),

  move('ground-hold-after-save', 'Ground hold after save', 'polish', 'recovery', 'keeper-recovery-hd', [0]),
  move('get-up-left-side', 'Get up from left side', 'polish', 'recovery', 'keeper-recovery-hd', [6, 7, 8, 9, 10, 11], { side: 'left' }),
  move('get-up-right-side', 'Get up from right side', 'polish', 'recovery', 'keeper-recovery-hd', [0, 1, 2, 3, 4, 5], { side: 'right' }),

  move('concede-reaction', 'Concede reaction', 'polish', 'reactions', 'keeper-reactions-hd', [0, 1, 2, 3, 4, 5]),
  move('big-save-celebration', 'Big save celebration', 'polish', 'reactions', 'keeper-reactions-hd', [6, 7, 8, 9, 10, 11]),
  move('organise-wall', 'Organising wall / pointing', 'polish', 'reactions', 'keeper-reactions-hd', [12, 13, 14, 15, 16, 17])
]);

export const KEEPER_MOVE_COUNT = KEEPER_MOVESET.length;
export const KEEPER_MOVES_BY_ID = Object.freeze(Object.fromEntries(
  KEEPER_MOVESET.map((entry) => [entry.id, entry])
));
export const KEEPER_DISTRIBUTION_IDS = Object.freeze(
  KEEPER_MOVESET.filter((entry) => entry.category === 'distribution').map((entry) => entry.id)
);

export function getKeeperMove(id) {
  return KEEPER_MOVES_BY_ID[id] || null;
}
