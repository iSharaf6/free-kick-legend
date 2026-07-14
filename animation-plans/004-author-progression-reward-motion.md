# 004 — Author progression and reward motion

- **Status**: DONE
- **Commit**: f384df7
- **Severity**: HIGH
- **Category**: Purpose, physicality, cohesion, missed opportunities
- **Estimated scope**: 3 files, medium

## Problem

The existing game has no authored motion language for daily missions, streak rewards, or achievement claims because those surfaces do not yet exist. Existing progression feedback is split between static stat changes and an oversized star scale in `src/scenes/GameScene.js:1015`–`1018`:

```js
// src/scenes/GameScene.js:1015 — current
).setDepth(3001).setScale(0.88);
this.tweens.add({
  targets: star, scale: 2.25, delay: 200 + i * 180, duration: 300, ease: 'Back.easeOut',
```

The scale more than doubles a frequent career-clear element and uses a separate bounce personality from the crisp broadcast interface. New progression screens would feel disconnected if they added more unrelated tweens.

## Target

- Daily mission and achievement rows enter only when the screen opens, using opacity plus `translateY(6px)` over 200ms with strong ease-out semantics and a 40ms row stagger.
- Claimable states pulse color/opacity only; never continuously translate or scale.
- Claim presses use 120ms scale-to-`0.97` feedback, followed by an immediate coin-flight response.
- Claimed rows settle from scale `0.94` and opacity `0` to scale `1` and opacity `1` over 200ms with strong ease-out semantics.
- Career stars begin at scale `0.94`, not `0.88`, and settle to scale `1`; never scale above `1.08`.
- Under reduced motion, keep 120–200ms opacity feedback but omit position, scale, stagger and coin flight.
- Animate transform and opacity only. No layout-property animation.

## Repo conventions to follow

- Phaser tweens live inside scene classes; no motion dependency is added.
- `src/scenes/GameScene.js:477` uses 200ms `Cubic.easeOut` for entering match feedback.
- Reduced motion is read from `SaveManager.getSettings().reducedMotion`.
- UI motion remains under 300ms; a 40ms stagger is decorative and must not delay interaction.

## Steps

1. In `src/scenes/ProgressScene.js`, create daily mission and achievement rows in their final layout, then apply optional 6px transform offsets and opacity-only/transform entry tweens at 200ms with 40ms stagger.
2. In `src/scenes/ProgressScene.js`, add interruptible 120ms claim press feedback at scale `0.97`; on success, settle the row from `0.94` to `1` over 200ms and emit a short coin flight toward the header balance.
3. In `src/scenes/GameScene.js`, replace the star animation from `0.88 → 2.25` with `0.94 → 1.06 → 1`, keeping the existing 180ms stagger but ensuring each phase stays under 300ms.
4. Branch all displacement/scale motion on the stored reduced-motion setting while retaining opacity and state feedback.

## Boundaries

- Do NOT change mission targets, rewards, daily seed generation, currency balances, or unlock rules.
- Do NOT add a motion library.
- Do NOT animate width, height, margin, padding, top, or left.
- Do NOT block claim interactions until staggered entrances finish.
- If the cited GameScene star reveal has changed, stop and report instead of adding a second animation path.

## Verification

- **Mechanical**: run `npm test` and `npm run build`; both must pass.
- **Feel check**: open Progress, claim one daily mission and one achievement, and complete a career level. Confirm:
  - rows enter once with a 40ms cascade and remain immediately interactive;
  - claim feedback starts instantly and never exceeds scale `1` after collection;
  - coins visibly travel toward the balance without obscuring copy;
  - career stars settle without the old oversized pop;
  - enabling reduced motion removes displacement, scale, stagger and coin flight while preserving readable fades.
- **Done when**: all reward surfaces share one crisp, interruptible motion language and no progression animation exceeds the UI duration budget.

## Completion notes

- Implemented row entry, claim press, claimable opacity pulse, coin flight, claimed-row settle, and reduced-motion branches in `ProgressScene`.
- Replaced the oversized career-star pop with a restrained `0.94 → 1.06 → 1` reveal.
- Corrected striker pose order to `ready → strike/contact → follow-through` while applying this plan.
- Verified with the automated suite, production build, and an in-browser desktop feel check.
