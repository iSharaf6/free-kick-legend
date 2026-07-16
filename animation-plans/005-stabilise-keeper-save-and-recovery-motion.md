# 005 — Stabilise keeper save and recovery motion

- **Status**: DONE
- **Commit**: 7b903fa
- **Severity**: HIGH
- **Category**: Physicality, cohesion, performance
- **Estimated scope**: 6 files, large

## Problem

The keeper's result presentation waited for the complete fall, recovery and jog
home, while the grounded recovery changed scale continuously between discrete
sprite frames. Every non-low dive also used one atlas regardless of the shot's
height or speed.

```js
// src/objects/Goalkeeper.js:614 — current at 7b903fa
const returnTime = returnDistance > 0.06 ? returnDistance / RETURN_SPEED + 0.22 : 0;

// src/objects/Goalkeeper.js:690 — current at 7b903fa
referenceHeight = lerp(
  KEEPER_RECOVERY_IMPACT_REFERENCE_H,
  KEEPER_RECOVERY_REFERENCE_H,
  recoveryProgress
);

// src/objects/Goalkeeper.js:641 — current at 7b903fa
const lowSavePhase = this.hasLowSaveAtlas &&
  !this.standingSave &&
  this.targetY <= LOW_SAVE_MAX_Y;
```

The result was a visible size pulse during recovery, a hard atlas pop before
return, repetitive save silhouettes, and a multi-second interruption of the
high-frequency shot loop.

## Target

- Normalize recovery and save-family sprites by body length during atlas build.
- Keep one stable projected world height through impact, recovery and return.
- Select and freeze a save family from deterministic height/speed bands.
- Provide at least five new direction-authored families, eight phases per
  direction: low smother, mid catch, upper parry, top fingertip, reflex foot.
- Hold a save result for at most 1050ms; do not wait for the full return run.
- Keep all runtime movement interruptible through simulation state rather than
  non-retargetable UI keyframes.

## Repo conventions to follow

- World position and contact state remain owned by `src/objects/Goalkeeper.js`.
- Raster source extraction remains in `scripts/build_hd_sprites.py`.
- Every atlas frame is `320×280`, bottom registered and nearest-neighbour scaled.
- `test/keeper-wall.test.js` verifies state, contact and frame mapping headlessly.

## Steps

1. Add five alpha source boards under `assets/source/` and pack 80 new frames in
   `scripts/build_hd_sprites.py` using constant body-length normalization.
2. Load the five atlases in `src/scenes/BootScene.js`.
3. Add deterministic save-family classification and freeze the family in
   `src/objects/Goalkeeper.js` when the shot is read.
4. Map set, launch, contact and landing phases onto each eight-frame direction row.
5. Use one recovery reference scale and shorten impact/recovery timing.
6. Cap save-result presentation in `src/scenes/GameScene.js` without tying goals,
   misses or posts to keeper return time.

## Boundaries

- Do NOT add a runtime animation dependency.
- Do NOT flip direction-authored save rows in Phaser.
- Do NOT bake the simulated football into new source art intentionally.
- Do NOT change progression rewards or cosmetic stats.

## Verification

- **Mechanical**: run `npm test`, `npm run build`, and `git diff --check`; all pass.
- **Feel check**: trigger slow low catches, hard low foot saves, waist catches,
  upper parries and top-corner attempts in both directions. Confirm each uses a
  different silhouette and stays planted to the projected turf at recovery.
- At 10% playback, confirm there is no size pump between landing and recovery.
- Enable reduced motion and confirm contact remains readable without smear or
  impact squash.
- **Done when**: the next shot is ready within about one second of a save, no
  return-direction flutter is visible, and the save family matches the ball line.
