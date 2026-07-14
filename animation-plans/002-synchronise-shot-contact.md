# 002 — Synchronise the striker and ball at contact

- **Status**: DONE
- **Commit**: unversioned workspace
- **Severity**: HIGH
- **Category**: Physicality, purpose, cohesion
- **Estimated scope**: 3 files, medium

## Problem

`src/scenes/GameScene.js:464` changes the match to flight, starts the striker animation, and launches the ball in the same call. `src/objects/Kicker.js:66` also begins on the strike texture and only later swaps to the follow texture. The ball therefore moves before an authored foot-contact frame exists, and the player looks detached from the ball.

```js
// src/scenes/GameScene.js:464 — current
this.state = 'FLIGHT';
this.kicker?.playKick();
Audio.kick(shot.power);
this.ball.kick(shot.vx, shot.vy, shot.vz, shot.spin);

// src/objects/Kicker.js:66 — current
this.setPose('strike');
this.scene.time.delayedCall(170, () => {
  this.setPose('follow');
});
```

## Target

- Add a `WINDUP` state that disables input but does not integrate the ball.
- Sequence `ready` for 80ms, `follow` as the planted-foot wind-up for 90ms, `strike` as the contact frame, then recover over 240ms.
- Invoke the physics impulse and kick sound on the exact frame that switches to `strike`.
- Place the striker relative to the projected ball start so the contact boot overlaps the ball.
- Use transform and texture changes only. On-screen movement uses `ease-in-out` semantics; recovery/exit uses `ease-out` semantics.
- Under reduced motion, keep the contact timing but drop positional movement.

## Repo conventions to follow

- Phaser timing and tweens stay in `src/objects/Kicker.js` and `src/scenes/GameScene.js`; add no dependency.
- The match already uses explicit states such as `AIMING`, `FLIGHT`, and `RESULT` in `src/scenes/GameScene.js`.
- Reduced-motion preference is `this.settings.reducedMotion`.

## Steps

1. In `src/objects/Kicker.js`, replace the immediate texture swap with an interruptible contact callback sequence and clean up prior timers/tweens before replay.
2. In `src/scenes/GameScene.js`, enter `WINDUP` on swipe release and move ball launch, audio, curl whoosh, and keeper prediction into the contact callback.
3. In `src/scenes/GameScene.js`, derive the striker position from the same projected initial ball position used to draw the ball.

## Boundaries

- Do NOT change swipe-to-velocity conversion.
- Do NOT change scoring, progression, or level objectives.
- Do NOT add dependencies.
- If the named match states or pose textures have drifted, stop instead of inventing a parallel state machine.

## Verification

- **Mechanical**: run `npm test` and `npm run build`; both must pass.
- **Feel check**: make straight, curved, and weak shots and confirm the ball remains still through anticipation, moves on visible boot contact, and never jumps ahead of the striker.
- Trigger a reset during presentation and confirm no stale timer launches a second shot.
- Enable reduced motion and confirm contact remains legible without the approach translation.
- **Done when**: every legal shot launches once, on the contact pose, with the player visibly connected to the ball.
