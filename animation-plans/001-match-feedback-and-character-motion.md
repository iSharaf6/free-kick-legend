# 001 — Move match feedback off the goal and add authored character motion

- **Status**: DONE
- **Commit**: unversioned workspace
- **Severity**: HIGH
- **Category**: Purpose, physicality, cohesion
- **Estimated scope**: 4 files, medium

## Problem

The shot result currently appears in a 184×45 panel centered over the goal mouth. In `src/scenes/GameScene.js:391`, the panel begins at y=80, and `showBanner()` scales its title from `0.2` at `src/scenes/GameScene.js:403`. This hides the decisive ball/keeper/net moment and violates the physicality rule against `scale(0–0.9)` entrances.

```js
// src/scenes/GameScene.js:391 — current
drawPanel(this.bannerPlate, GAME_W / 2 - 92, 80, 184, 45, { ... });
this.banner = titleText(this, GAME_W / 2, 102, '', '22px');

// src/scenes/GameScene.js:403 — current
this.banner.setText(text).setColor(color).setAlpha(1).setScale(0.2);
```

Character motion is also pose-swapped abruptly: the kicker changes to `strike` at `src/scenes/GameScene.js:457` and returns to idle after 260ms. It needs a short anticipation → contact → follow-through sequence tied to the actual kick.

## Target

- Put result feedback in a slim broadcast ribbon below the top HUD, outside the projected goal mouth.
- Enter at `translateY(-8px)`, `scale(0.94)`, `opacity: 0`; settle over 200ms with `Cubic.easeOut` / `cubic-bezier(0.23, 1, 0.32, 1)` semantics.
- Hold for 650ms, then exit upward over 180ms with ease-out.
- Never cover the goal, ball, keeper, wall, or target marker.
- Kicker sequence: ready anticipation before release, strike at release, follow-through for 220ms, recovery over 180ms. Celebration is reserved for goals.
- Keeper save/contact and crowd celebration may use rare-event motion, but must not delay input reset.
- Under reduced motion, use opacity-only transitions and direct pose changes.

## Repo conventions to follow

- Phaser tweens live in scene/object classes; no new dependency.
- User preference is already available as `this.settings.reducedMotion` in `GameScene`.
- Existing UI depths are centralized through `UI_DEPTH` in `src/ui.js`.

## Steps

1. In `src/scenes/GameScene.js`, replace the goal-mouth banner panel with a compact ribbon near y=42–67.
2. Change `showBanner()` to animate from scale `0.94`, never below `0.9`, and use 200ms enter / 180ms exit timings.
3. In reduced-motion mode, keep the ribbon fixed and fade only.
4. In `src/objects/Kicker.js`, add a follow-through pose and a single interruptible kick sequence method.
5. Trigger crowd/impact accents at goal contact; keep result UI separate from the physical event.

## Boundaries

- Do not change scoring or progression in this plan.
- Do not add a motion library.
- Do not delay shot resolution or the next-attempt timer.
- Do not move the target marker.

## Verification

- **Mechanical**: run `npm test` and `npm run build`; both must pass.
- **Feel check**: score, hit the post, get saved, and hit the wall. Confirm the entire goal remains visible throughout every result.
- Trigger two rapid outcomes in Time Attack and confirm the ribbon retargets without restarting from an invisible scale.
- Enable reduced motion and confirm there is no translation or scaling, while feedback remains readable.
- **Done when**: match outcomes are readable without obscuring play and character poses form one clear kick action.
