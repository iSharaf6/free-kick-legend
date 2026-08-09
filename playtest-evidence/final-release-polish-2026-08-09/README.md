# Kick District final release audit — 9 August 2026

## Outcome

This evidence set records the final gameplay, animation, technical-art, UI/UX,
accessibility, mobile, and stability pass for Kick District by Calynx Studio.

- Branch: `codex/kick-district-final-release-polish`
- Baseline: fetched `origin/main` at `94cc045`
- Baseline score: **75 / 100**
- Final verified score: **97 / 100**
- Verdict: **release candidate** after external audible and physical-device
  checks
- Automated gate: **225 / 225 unit tests**, build, **31 / 31 Chromium tests**
- Runtime errors in final production playthroughs: **0**

## Severity-ranked issue ledger

| Severity | Baseline defect | Resolution | Why it matters | Status |
|---|---|---|---|---|
| Major | Tutorial/coaching text survived into the result and fought `GOAL` for hierarchy. | Clear coaching on valid input and defer the next hint until reset. | The most important feedback now reads as one authored result state. | Resolved |
| Major | Celebration fountains were large cloned foreground slabs with loose timing and cleanup. | Rebuilt as narrow asymmetric post fountains with depth, perspective scale, 96 ms stagger, static reduced-motion frames, and explicit ownership cleanup. | The goal now feels spatially tied to the posts and repeated results cannot accumulate objects or timers. | Resolved |
| Major | Canvas, pause, settings, terminal overlays, and advert requests could compete for keyboard input. | Added a true DOM focus entry and scoped keyboard ownership, focus cycling, action disablement, and live announcements. | Keyboard users can predict where `Tab`, arrows, Enter, Space, and Escape go; gameplay cannot fire through a modal. | Resolved |
| Major | Some portrait sizes left a live Time Attack behind the rotate gate; compact HUD state could remain stale after resize. | Gate every portrait viewport, pause the session, resume only gate-owned pauses, and recompute compact HUD geometry in place. | Rotation never consumes time or resets progress, and live layout changes remain readable. | Resolved |
| Major | Reduced motion was partial and could be defeated by toggling settings while paused or during a goal. | Added live teardown/restart contracts for scenes, crowd, guards, props, hazards, flags, kicker, and celebration; reassert reduction after pause resume. | The setting now changes actual motion immediately without corrupting state. | Resolved |
| Moderate | Player frame counts changed pre-contact timing. | Use one 122 ms pre-contact budget while preserving post-contact character rhythm. | Time Attack outcome no longer depends on the selected sprite sheet. | Resolved |
| Moderate | Keeper concede/recovery could replace an airborne dive and appear to snap. | Preserve dive/land/catch until grounded and keep the current root for reactions. | Saves and misses retain physical continuity. | Resolved |
| Moderate | Wall knockdown could teleport an airborne defender to the ground. | Preserve airborne root and velocity through collapse. | Contact remains readable and physically believable. | Resolved |
| Moderate | Deflector collision could reach full extension before the visible arm. | Drive art and hitbox from the same prediction-based 140 ms ramp, fully open 40 ms before arrival. | What the player sees is what blocks the ball. | Resolved |
| Moderate | Ball trail density depended on rendering cadence, visual spin ignored sign, and the idle ball bobbed above its shadow. | Sample trails at fixed simulation intervals, rotate by signed spin, and use a grounded idle pose. | Flight and grounding now read consistently across frame rates and shot directions. | Resolved |
| Moderate | A successful first attempt could skip power, loft, and curl onboarding. | Persist the four-step lesson sequence across the first four Academy matches. | Success no longer removes essential control teaching. | Resolved |
| Moderate | The in-match menu target was too small on compact touch layouts and browser zoom was suppressed. | Added a 44 CSS-pixel minimum hit area and retained pinch zoom. | Critical pause access is reachable on mobile and browser accessibility is not blocked. | Resolved |

No reproducible critical or major code-side defect remains after the final gate.

## Visual evidence index

### Baseline

| Capture | Demonstrates |
|---|---|
| [`before/01-menu-1280x720.png`](before/01-menu-1280x720.png) | Baseline desktop menu and visual language. |
| [`before/02-aiming-1280x720.png`](before/02-aiming-1280x720.png) | Baseline aiming composition and coaching hierarchy. |
| [`before/03-real-swipe-flight-1280x720.png`](before/03-real-swipe-flight-1280x720.png) | Real-pointer flight state before final motion polish. |
| [`before/04-goal-1280x720.png`](before/04-goal-1280x720.png) | Stale coaching overlapping the goal result. |
| [`before/goal-frame-40.png`](before/goal-frame-40.png) | Baseline celebration scale and fountain placement. |
| [`before/05-locker-1280x720.png`](before/05-locker-1280x720.png) | Baseline Locker. |
| [`before/06-progress-1280x720.png`](before/06-progress-1280x720.png) | Baseline Progress screen. |
| [`before/07-level-select-1280x720.png`](before/07-level-select-1280x720.png) | Baseline Career selection. |
| [`before/08-menu-844x390.png`](before/08-menu-844x390.png) | Baseline compact-landscape menu. |
| [`before/09-portrait-390x844.png`](before/09-portrait-390x844.png) | Baseline portrait gate. |
| [`before/10-large-portrait-1024x1366.png`](before/10-large-portrait-1024x1366.png) | Baseline large portrait exposed the live menu because gating stopped at 820 CSS pixels. |

### Final build

| Capture | Demonstrates |
|---|---|
| [`after/postfix-1280-menu.png`](after/postfix-1280-menu.png) | Final desktop menu and hierarchy. |
| [`after/postfix-1280-aiming.png`](after/postfix-1280-aiming.png) | Clean aiming state. |
| [`after/postfix-1280-windup.png`](after/postfix-1280-windup.png) | Timed pre-contact pose. |
| [`after/postfix-1280-flight.png`](after/postfix-1280-flight.png) | Unobstructed flight/readout state. |
| [`after/postfix-1280-goal-result.png`](after/postfix-1280-goal-result.png) | Final desktop result composition. |
| [`after/gameplay-audit-goal-pyro.png`](after/gameplay-audit-goal-pyro.png) | Post-anchored celebration staging. |
| [`after/postfix-844x390-goal-result.png`](after/postfix-844x390-goal-result.png) | Complete compact-landscape result composition. |
| [`after/postfix-1280-keeper-save-impact.png`](after/postfix-1280-keeper-save-impact.png) | Keeper contact during a real save. |
| [`after/postfix-1280-keeper-save-recovery.png`](after/postfix-1280-keeper-save-recovery.png) | Grounded recovery without a root snap. |
| [`after/postfix-1280-wall-collapse-impact.png`](after/postfix-1280-wall-collapse-impact.png) | Airborne defender at impact. |
| [`after/postfix-1280-wall-collapse-settled.png`](after/postfix-1280-wall-collapse-settled.png) | Collapse continuation at the preserved root. |
| [`after/postfix-1280-deflector-extension.png`](after/postfix-1280-deflector-extension.png) | Partial predictive extension. |
| [`after/postfix-1280-deflector-follow-through.png`](after/postfix-1280-deflector-follow-through.png) | Full extension and follow-through. |
| [`after/postfix-1280-ball-grounding-01-descent.png`](after/postfix-1280-ball-grounding-01-descent.png) | Ball descent. |
| [`after/postfix-1280-ball-grounding-02-contact.png`](after/postfix-1280-ball-grounding-02-contact.png) | Ground contact. |
| [`after/postfix-1280-ball-grounding-03-rolling.png`](after/postfix-1280-ball-grounding-03-rolling.png) | Rolling transition. |
| [`after/postfix-1280-ball-grounding-04-settled.png`](after/postfix-1280-ball-grounding-04-settled.png) | Grounded final pose and shadow. |
| [`after/postfix-1280-pause-keyboard-focus.png`](after/postfix-1280-pause-keyboard-focus.png) | Pause isolation and visible keyboard focus. |
| [`after/postfix-1280-settings-dialog.png`](after/postfix-1280-settings-dialog.png) | Native focusable settings over a frozen match. |
| [`after/postfix-1280-reduced-motion-goal.png`](after/postfix-1280-reduced-motion-goal.png) | Static equivalent after a live reduced-motion toggle. |
| [`after/postfix-1280-locker.png`](after/postfix-1280-locker.png) | Final Locker presentation. |
| [`after/postfix-1280-progress.png`](after/postfix-1280-progress.png) | Final Progress presentation. |
| [`after/postfix-1280-level-select.png`](after/postfix-1280-level-select.png) | Final Career selection. |
| [`after/postfix-390x844-portrait-gate.png`](after/postfix-390x844-portrait-gate.png) | Small-phone portrait retains the established rotate-gate design. |
| [`after/postfix-1024x1366-portrait-gate.png`](after/postfix-1024x1366-portrait-gate.png) | The same clear gate now covers large portrait viewports; freeze/resume ownership is verified in E2E. |

The 844×390 and 390×844 captures use Chromium viewport emulation. Gameplay
captures use the production build; the independent production playthrough used
real CDP pointer events rather than substituting a debug launch for the primary
player-flow proof.

## Verification matrix

| Gate | Result | Coverage |
|---|---|---|
| `npm test` | 225 / 225 passed | Physics, session ownership, keeper/wall/kicker timing, celebration cleanup, progression, settings, keyboard buttons. |
| `npm run build` | Passed | Vite production build; only the existing chunk-size advisory remains. |
| `npm run test:e2e` | 31 / 31 passed | Release journeys, settings, input ownership, responsive lifecycle, reduced motion, 50-shot stress, and scene transitions. |
| Production desktop play | Passed | 1280×720 real-pointer goal, keeper save, wall collapse, deflector block, ball grounding. |
| Production compact play | Passed | 844×390 real-pointer `AIMING → WINDUP → FLIGHT → RESULT`. |
| Celebration cleanup | Passed | Eight independent play/stop cycles and five stress injections returned to zero owned objects/timers. |
| Console/network | Passed | Zero page errors, console errors, or request failures in final production play. |

### Stress specifics

- 50 varied actual debug launches cover lane, loft, pace, and signed spin.
- Five explicit goal celebrations run only after those 50 launches so cleanup
  is exercised independently of the seeded keeper outcomes.
- To avoid waiting through the result cadence fifty times, the test explicitly
  invokes scheduled-call cancellation, celebration stop, and attempt reset
  after each result. It then verifies that these production cleanup APIs return
  their owned timers, objects, and calls to zero; it does not present the sample
  as an untouched natural-idle heap trace.
- Active-child variation stays within two; second-half steady-state tween floor
  does not rise; scheduled calls and celebration-owned objects/timers return to
  zero.
- Ten Menu↔Locker transitions keep exactly one active scene and emit no runtime
  error.

## Performance and size comparison

| Metric | Baseline `94cc045` | Final | Delta |
|---|---:|---:|---:|
| Main JS, Vite-reported raw | 1,583.77 kB | 1,603.09 kB | +19.32 kB / +1.22% |
| Main JS, Vite-reported gzip | 437.72 kB | 443.01 kB | +5.29 kB / +1.21% |
| Production boot requests | 23 | 23 | 0 |
| Full match requests | 60 | 60 | 0 |
| Paired production transfer | ~2.824 MB | ~2.829 MB | ~+5.3 kB / +0.19% |
| Match-ready paired median | 2,698.5 ms | 2,756 ms | +57.5 ms / +2.13% |
| Ten-transition forced-GC heap delta | 608,428 bytes | 607,612 bytes | −816 bytes |

The user's pre-existing, untracked crowd sprite experiments add approximately
17.2 MiB to the local `dist` when Vite copies `public/`. They are not referenced
by this build, are not part of this change, and are excluded from the clean
baseline/final asset comparison. Excluding them, the clean production output is
33,788 KiB and 237 files versus 33,768 KiB and 237 files at baseline.

The paired runtime samples were taken immediately before the two final
handoff-review corrections. Those corrections only changed code inside the
existing JavaScript request, adding 0.14 kB raw / 0.02 kB gzip; they add no
request and do not materially alter the timing or transfer conclusion.

## Changed-file map

| Concern | Files |
|---|---|
| Match lifecycle, HUD, input ownership, onboarding | `src/scenes/GameScene.js`, `src/ui.js`, `index.html` |
| Character and object continuity | `src/objects/Kicker.js`, `src/objects/Goalkeeper.js`, `src/objects/Wall.js`, `src/objects/Ball.js` |
| Goal celebration and moving mechanics | `src/systems/GoalCelebration.js`, `src/systems/LevelMechanics.js` |
| Crowd, dressing, and reduced motion | `src/art/CrowdStand.js`, `src/art/StandDressing.js`, `src/scenes/BootScene.js`, `src/scenes/MenuScene.js`, `src/scenes/LevelSelectScene.js`, `src/scenes/LockerScene.js`, `src/scenes/ProgressScene.js`, `src/systems/SaveManager.js` |
| Regression coverage | `test/*.test.js`, `e2e/release.spec.js`, `e2e/settings.spec.js`, `e2e/reduced-motion.spec.js`, `e2e/responsive-lifecycle.spec.js`, `e2e/stress.spec.js` |
| Audit and visual proof | `PLAYTEST_REPORT.md`, `playtest-evidence/README.md`, `playtest-evidence/final-release-polish-2026-08-09/` |

## Suggested pull-request summary

### What changed

- Rebuilt the goal result as a spatially grounded, leak-free presentation.
- Normalized shot-contact timing and preserved keeper, wall, ball, and moving
  obstacle continuity.
- Added complete keyboard/touch/modal ownership and live responsive HUD logic.
- Made reduced motion an immediate cross-scene setting, including an already
  active celebration.
- Strengthened first-session onboarding and added final release stress gates.

### Why

The game's systems and art direction were stronger than its visible seams. The
pass removes the animation snaps, competing overlays, misleading collision
timing, inaccessible input paths, and lifecycle gaps that most strongly made a
complete game feel unfinished.

### Risk

The work deliberately leaves core shot physics, progression economy, authored
player identities, portal integration, and save schema intact. New behavior is
concentrated in presentation and ownership boundaries and is covered by unit,
browser, production-play, and stress checks.

## Honest remaining limitations

- Audio timing and settings are technically verified, but mix, loudness, and
  fatigue were not subjectively judged through real speakers/headphones.
- No physical iOS or Android device was available; responsive emulation cannot
  prove browser chrome, safe-area, coarse-touch, or mobile assistive-technology
  behavior.
- The source fountain animation contains four frames. The final system stages
  those frames cleanly and accessibly, but a richer source sheet would remain
  an optional future art upgrade.
