# 003 — Author keeper and crowd reactions

- **Status**: DONE
- **Commit**: unversioned workspace
- **Severity**: HIGH
- **Category**: Missed opportunities, cohesion, purpose
- **Estimated scope**: 4 files, medium

## Problem

`src/objects/Goalkeeper.js:166` swaps directly from a standing texture to one horizontal dive texture, while the body position is driven by the save simulation. There is no visible set/squash before take-off and no contact accent. `src/systems/AudioSynth.js:116` synthesizes only a quiet two-second filtered noise bed, so the rare goal event lacks an unmistakable stadium response.

```js
// src/objects/Goalkeeper.js:166 — current
this.spr.setTexture(diveTexture).setOrigin(0.5, 0.5);
this.spr.setFlipX(this.diveDir < 0);

// src/systems/AudioSynth.js:116 — current
this._noise({ time: 2.1, vol: 0.25, freq: 620, rampUp: 0.08 });
```

## Target

- Keep save collision deterministic while layering a readable set pose, 90–140ms anticipation squash, take-off, dive extension, catch/parry contact accent, and recovery.
- Use sprite transforms only: subtle scale between `0.92–1.06`, position from the existing simulation, and rotation no larger than 8 degrees beyond the authored dive pose.
- Make goal celebration a rare high-emotion event: a 3.2-second multi-band roar with a fast 80ms swell, a second wave at 420ms, and a short visual crowd wave.
- Respect reduced motion by keeping audio and opacity feedback but omitting crowd displacement and keeper squash.

## Repo conventions to follow

- Keeper collision state remains in `src/objects/Goalkeeper.js`; presentation is derived from that state.
- Audio remains generated in `src/systems/AudioSynth.js` to keep the web build self-contained.
- Match effects are triggered from `src/scenes/GameScene.js`.

## Steps

1. In `src/objects/Goalkeeper.js`, map `read`, `set`, `dive`, `catch`, and `recover` to authored transform states without changing the contact envelopes.
2. Add a contact pulse method to the keeper and call it on catch/parry before resolving the result.
3. In `src/systems/AudioSynth.js`, replace the quiet cheer with layered, staggered crowd bands lasting 3.2 seconds.
4. In `src/scenes/GameScene.js`, add a small pooled crowd-wave presentation tied only to goals.

## Boundaries

- Do NOT alter goalkeeper reaction probability or save geometry in this plan.
- Do NOT animate layout properties or add a motion dependency.
- Do NOT allow the result banner to cover the goal.

## Verification

- **Mechanical**: run `npm test` and `npm run build`; both must pass.
- **Feel check**: test catches, fingertip parries, misses, and goals. Confirm the keeper sets before diving, extends toward the predicted side, and reacts at contact without teleporting.
- Score with sound enabled and confirm the roar is obvious, lasts about three seconds, and has a second crowd wave.
- Enable reduced motion and confirm save/goal state remains readable without crowd displacement or squash.
- **Done when**: keeper motion reads as anticipation → action → contact → recovery and goals produce a clear stadium-scale response.
