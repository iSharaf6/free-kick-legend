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
  move('idle-stance', 'Idle stance', 'core-gameplay', 'base', 'keeper-anim-hd', [0, 1, 0, 3], { loop: true, frameMs: 520 }),
  move('ready-set', 'Ready bounce / set', 'core-gameplay', 'base', 'keeper-anim-hd', [2, 4, 2, 4], { loop: true, frameMs: 130 }),
  move('weight-shift', 'Weight shift / anticipation', 'core-gameplay', 'base', 'keeper-anim-hd', [1, 2, 3, 2], { loop: true, frameMs: 145 }),

  move('shuffle-left', 'Shuffle left loop', 'core-gameplay', 'footwork', 'keeper-footwork-hd', [0, 1, 2, 3, 4], { loop: true, side: 'left' }),
  move('shuffle-right', 'Shuffle right loop', 'core-gameplay', 'footwork', 'keeper-footwork-hd', [5, 6, 7, 8, 9], { loop: true, side: 'right' }),
  move('recover-centre-from-left', 'Recover to centre from left', 'core-gameplay', 'footwork', 'keeper-return-hd', [9, 10, 11, 12, 13, 14, 15, 16, 17], { side: 'right' }),
  move('recover-centre-from-right', 'Recover to centre from right', 'core-gameplay', 'footwork', 'keeper-return-hd', [0, 1, 2, 3, 4, 5, 6, 7, 8], { side: 'left' }),
  move('forward-attack-step', 'Forward attack step', 'core-gameplay', 'footwork', 'keeper-situational-punch-hd', [0, 1, 2]),
  move('backpedal-retreat', 'Backpedal / retreat', 'core-gameplay', 'footwork', 'keeper-situational-punch-hd', [5, 2, 1, 0]),

  move('low-catch-left', 'Low catch left', 'core-gameplay', 'low-saves', 'keeper-practical-low-hd', [24, 25, 26, 27, 28, 29, 30, 31], { side: 'left' }),
  move('low-catch-right', 'Low catch right', 'core-gameplay', 'low-saves', 'keeper-practical-low-hd', [16, 17, 18, 19, 20, 21, 22, 23], { side: 'right' }),
  move('low-parry-left', 'Low parry left', 'core-gameplay', 'low-saves', 'keeper-practical-low-hd', [8, 9, 10, 11, 12, 13, 14, 15], { side: 'left' }),
  move('low-parry-right', 'Low parry right', 'core-gameplay', 'low-saves', 'keeper-practical-low-hd', [0, 1, 2, 3, 4, 5, 6, 7], { side: 'right' }),
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
  move('mid-height-dive-left', 'Dive left mid-height', 'core-gameplay', 'diving', 'keeper-mid-dive-hd', [8, 9, 10, 11, 12, 13, 14, 15], { side: 'left' }),
  move('mid-height-dive-right', 'Dive right mid-height', 'core-gameplay', 'diving', 'keeper-mid-dive-hd', [0, 1, 2, 3, 4, 5, 6, 7], { side: 'right' }),
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

  move('save-and-hold-left', 'Save-and-hold recovery left', 'core-gameplay', 'recovery', 'keeper-practical-recovery-hd', [6, 7, 8, 9, 10, 11], { side: 'left' }),
  move('save-and-hold-right', 'Save-and-hold recovery right', 'core-gameplay', 'recovery', 'keeper-practical-recovery-hd', [0, 1, 2, 3, 4, 5], { side: 'right' }),
  move('get-up-centre', 'Get-up recovery centre', 'core-gameplay', 'recovery', 'keeper-practical-recovery-hd', [12, 13, 14, 15, 16, 17]),

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

export const KEEPER_PRACTICAL_IDS = Object.freeze([
  'full-stretch-dive-left', 'full-stretch-dive-right',
  'low-dive-left', 'low-dive-right',
  'mid-height-dive-left', 'mid-height-dive-right',
  'top-left-fingertip-tip', 'top-right-fingertip-tip',
  'upper-parry-left', 'upper-parry-right',
  'low-parry-left', 'low-parry-right',
  'low-catch-left', 'low-catch-right',
  'mid-catch-centre', 'mid-catch-left', 'mid-catch-right',
  'high-claim-standing', 'jump-catch-cross-claim',
  'front-smother', 'smother-left', 'smother-right',
  'spread-save', 'foot-save-left', 'foot-save-right',
  'save-and-hold-left', 'save-and-hold-right', 'get-up-centre'
]);

export const KEEPER_PRACTICAL_MOVESET = Object.freeze(
  KEEPER_PRACTICAL_IDS.map((id) => KEEPER_MOVES_BY_ID[id])
);

export function getKeeperMove(id) {
  return KEEPER_MOVES_BY_ID[id] || null;
}

// How a committed save plays its authored clip. Numbers are indices into the
// move's `frames` (so left and right share one spec); `{ texture, left, right }`
// borrows a frame from another one-scale sheet.
//   windup     - played during the brief `set` before launch, never in flight
//   flight     - launch .. contact; the last entry is the contact pose
//   after      - follow-through after contact (parries)
//   afterCatch - follow-through when the ball was held (defaults to `after`)
//   ground     - first turf pose after touchdown (groundCatch when held)
//   end        - 'lying' gets up from the turf, 'kneel' rises from a kneel,
//                'upright' is already standing and goes straight to the return
//   contacts   - candidate contact poses [k, lateral, height]: k indexes the
//                flight, lateral/height locate its leading glove in metres
//                from the sprite root (measured from the one-scale atlases).
//                The save uses the highest glove at or below the ball (else
//                the lowest), and the drawn dive is lifted/offset so that
//                glove meets the keeper's physical hand position. Flight poses
//                after the chosen contact become follow-through.
const SIDE_LYING = Object.freeze({ texture: 'keeper-dive-motion-hd', right: 11, left: 23 });
const phases = (spec) => Object.freeze(spec);
export const KEEPER_SAVE_PHASES = Object.freeze({
  'full-stretch': phases({
    windup: [1, 2, 3, 4], flight: [5, 6, 7, 8, 9], after: [10], ground: 11, end: 'lying',
    contacts: [[7, 1.08, 1.1], [9, 0.99, 0.69]]
  }),
  'low-dive': phases({
    windup: [1, 2, 3], flight: [4, 5], after: [6], afterCatch: [], ground: 7, end: 'lying',
    contacts: [[4, 0.97, 0.76], [5, 1.08, 0.33]]
  }),
  'low-parry': phases({
    windup: [1, 2], flight: [3, 4], after: [5, 6], ground: 7, end: 'lying', contacts: [[4, 0.9, 0.21]]
  }),
  'mid-dive': phases({
    windup: [1, 2], flight: [3, 4, 5, 6], after: [], ground: 7, end: 'lying',
    contacts: [[4, 1.28, 1.35], [6, 1.01, 0.79]]
  }),
  'top-tip': phases({
    windup: [1, 2], flight: [3, 4, 5, 6], after: [7], ground: SIDE_LYING, end: 'lying',
    contacts: [[5, 1.1, 2.2], [6, 0.94, 2.68]]
  }),
  'upper-parry': phases({
    windup: [1, 2, 3], flight: [4, 5, 6], after: [], ground: 7, end: 'lying',
    contacts: [[6, 0.92, 2.18], [5, 0.78, 2.24]]
  }),
  'mid-catch': phases({
    windup: [1, 2], flight: [3, 4], after: [], afterCatch: [5], ground: SIDE_LYING, groundCatch: 6,
    end: 'lying', contacts: [[3, 1.05, 0.91], [4, 0.87, 0.8]]
  }),
  'low-smother': phases({
    windup: [1, 2], flight: [3, 4], after: [], afterCatch: [5, 6], ground: 4, groundCatch: 7,
    end: 'lying', endCatch: 'kneel', contacts: [[3, 0.85, 0.48], [4, 1.01, 0.35]]
  }),
  'reflex-foot': phases({ windup: [1, 2], flight: [3, 4], after: [5, 6], ground: 7, end: 'upright' }),
  'spread-save': phases({ windup: [0, 1], flight: [2, 3], after: [], ground: 5, end: 'upright', centred: true })
});

// A dive plan must never show a baked-in ball before the keeper holds one.
// Catch-only clips therefore present their ball-free parry counterpart.
export const KEEPER_PLAN_PRESENTATION = Object.freeze({
  'low-catch-left': 'low-parry-left',
  'low-catch-right': 'low-parry-right'
});

// Standing catches start at the first frame with the ball already secured in
// the gloves: the contact has happened before the clip begins.
export const KEEPER_CATCH_PHASES = Object.freeze({
  'front-smother': Object.freeze({ from: 1 }),
  'mid-catch-centre': Object.freeze({ from: 2 }),
  'high-claim-standing': Object.freeze({ from: 2 }),
  // The five-frame jump claim is authored airborne from before contact; a
  // grounded overhead claim reads correctly once the ball is already held.
  'jump-catch-cross-claim': Object.freeze({ texture: 'keeper-anim-hd', frames: Object.freeze([18, 17]) })
});

// Frames whose artwork already draws the held ball.
export const KEEPER_BAKED_BALL_FRAMES = Object.freeze({
  'keeper-handling-hd': Object.freeze([0, 1, 2, 3, 5, 6, 7, 8]),
  'keeper-high-claim-hd': Object.freeze([0, 1, 2, 3, 4]),
  'keeper-practical-low-hd': Object.freeze([20, 21, 22, 23, 28, 29, 30, 31]),
  'keeper-mid-catch-hd': Object.freeze([5, 6, 7, 13, 14, 15]),
  'keeper-practical-recovery-hd': Object.freeze([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])
});
