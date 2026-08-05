# Free Kick Legend — Release Remediation Report

## Live-to-local manual playtest — 5 August 2026

**Original live-build score:** 7.4 / 10

**Updated local production-build score:** 8.2 / 10

**Release verdict:** suitable for public beta. Portal submission is reasonable
after one portal-hosted SDK/audio smoke test. It is not yet a full-release
candidate because portrait play remains intentionally unsupported, the compact
landscape HUD needs a physical-phone readability pass, and all 50 career levels
were not manually completed in this session.

**Branch:** `codex/live-playtest-polish`

**Live build:** `https://isharaf6.github.io/free-kick-legend/`

**Evidence:** [`playtest-evidence/live-fix-2026-08-05/`](playtest-evidence/live-fix-2026-08-05/)

**Release gate:** 175 unit tests, production build, 10 Chromium journeys

### Scorecard

| Area | Live | Fixed local | Notes |
|---|---:|---:|---|
| Core gameplay | 7.6 | 8.3 | Clear skill loop; the fixed power range makes different shot intentions practical. |
| Controls | 6.3 | 8.2 | Live quick swipes saturated; local supports weak, middle-band, and maximum releases. |
| Ball physics | 8.2 | 8.3 | Predictable drag, curl, bounce, frame, wall, and net behavior. No arbitrary physics rebalance. |
| Game feel | 7.5 | 8.3 | Contact, flight, readout, and results are strong once shot power is controllable. |
| Striker animation | 8.3 | 8.3 | Distinct wind-up/contact/follow/recover/watch poses; no code or art replacement needed. |
| Goalkeeper animation | 8.6 | 8.6 | Directional reads, catches, dives, landings, and recovery remained convincing. |
| Defender animation | 7.9 | 7.9 | Wall jump/block reactions are readable and synchronized. |
| UI design | 8.0 | 8.4 | Time Attack now explains its ready state; aiming lanes no longer overlap it. |
| UI animation | 7.5 | 7.7 | Hover and scene transitions are good; pressed feedback remains subtle. |
| Visual consistency | 8.7 | 8.8 | Strong pixel-art identity; desktop letterboxing is now symmetrical. |
| Audio | 6.8* | 7.3* | Technical lifecycle and synchronization improved; see listening limitation below. |
| Loading experience | 7.0 | 8.0 | Standalone boot no longer waits on a portal SDK or eagerly resumes WebAudio. |
| Performance | 8.1 | 8.2 | No obvious stalls or failed requests; bundle growth is negligible. |
| Progression | 8.3 | 8.3 | Career, Daily, missions, achievements, loadouts, and persistence all worked. |
| Replayability | 8.1 | 8.5 | Cups, modes, objectives, players, balls, and truthful shot variation support repeat play. |
| Mobile experience | 6.6 | 6.9 | Landscape works and centers correctly; small HUD text and portrait gating remain. |
| Overall polish | 7.4 | 8.2 | The three most visible systemic defects are resolved locally. |

\* The in-app browser exposed mute state and timing but did not provide audible
output to the reviewer. Audio scores are therefore provisional and based on
visual synchronization, lifecycle behavior, automated coverage, and the live
console result—not a subjective mix/timbre/fatigue listening test.

### What was manually tested

- Waited through the real deployed loading screen and entered the real live
  canvas, rather than substituting source inspection or debug shots.
- Completed 20 accepted live pointer-swipe attempts: weak, short, slow, long,
  maximum, straight, curved both ways, both corners, central, wall, over-bar,
  wide, and repeated identical gestures. Multiple goals were scored.
- Paused and resumed gameplay; cycled Full, Reduced, and Off aim assist.
- Inspected Career levels, Locker, all four players, kits, balls, trails, Daily
  Kick, Time Attack, Progress, missions, achievements, mute, and pause settings.
- Tested 1920×1080, 1440×900, 1366×768, 1280×720, 844×390, and 390×844.
- Replayed 10 targeted real-pointer attempts on the changed local build,
  including 0%, 20%, and 100% readouts, straight and 100% curl shots, wall
  blocks, saves, and a scored 100%-power/100%-curl goal.
- Repeated a real pointer shot on the final production preview. No debug
  shooting hook was used for manual validation.

### Findings in severity order

#### 1. High — normal quick swipes collapsed into maximum power — resolved

- **Player experience:** almost every decisive mouse/touch flick reported 100%
  power. A very short roughly 70-screen-pixel release produced 96%, leaving no
  dependable middle-power control and making weak-shot practice awkward.
- **Reproduction:** Career gameplay at 1280×720; start at the ball, release a
  short/normal quick upward swipe, then inspect the result readout. Repeat with
  several ordinary fast swipes.
- **Root cause:** `SHOT.maxSpeedPxMs` was 0.68 logical px/ms. A minimum-length
  26px gesture evaluated over the 40ms floor already reached about 95%.
- **Files changed:** `src/config.js`, `test/swipe-input.test.js`.
- **Fix:** widened the speed domain to 1.35 px/ms while preserving the existing
  speed-based control model, physics solver, and maximum shot.
- **Tests:** added explicit weak, useful-middle, minimum-fast, and maximum power
  calibration coverage. Existing canonical preview/release parity still passes.
- **Evidence:** live aim/result in `before/03-aim-1280x720.jpg`; truthful local
  middle meter in `after/04-aiming-mid-power-1280x720.jpg`; maximum curved goal
  in `after/07-goal-1280x720.jpg`.
- **Status:** fully resolved and manually verified locally and in production
  preview.

#### 2. Medium — Time Attack spent the player's clock before play — resolved

- **Player experience:** the 60-second timer began on scene entry and reached
  roughly 47 seconds while the player was orienting/resizing before a meaningful
  first shot.
- **Reproduction:** choose Time Attack, wait without shooting, and watch the HUD.
- **Root cause:** `updateArcadeClock` decremented every active frame, with no
  ready state separating scene entry from the first accepted release.
- **Files changed:** `src/scenes/GameScene.js`,
  `test/game-scene-session.test.js`.
- **Fix:** a new run holds at 60, displays “SWIPE TO START THE 60-SECOND RUN”,
  clears that CTA as aiming begins, and starts only when a valid shot commits.
  Result feedback continues to consume time after the run starts.
- **Tests:** clock wait/start/idempotence and ready-CTA aiming-lane regressions.
- **Evidence:** running live mode in `before/07-time-attack-1280x720.jpg`; fixed
  ready and clear aiming states in `after/03-time-attack-ready-1280x720.jpg`
  and `after/04-aiming-mid-power-1280x720.jpg`.
- **Status:** fully resolved and manually verified after six idle seconds in
  both dev and production-preview builds.

#### 3. Medium — desktop letterboxing was vertically off-centre — resolved

- **Player experience:** at 1440×900 the game sat visibly low, with about 67.5px
  above the canvas and 22.5px below it.
- **Reproduction:** resize the menu to 1440×900 and compare top/bottom gaps.
- **Root cause:** Phaser `CENTER_BOTH` margins and the parent flexbox both
  centered the same canvas.
- **Files changed:** `src/main.js`, `e2e/release.spec.js`.
- **Fix:** CSS remains the single centering owner; Phaser now uses `NO_CENTER`.
- **Tests:** every release landscape viewport must now be centered within one
  CSS pixel on both axes, not merely remain inside the viewport.
- **Evidence:** `before/08-menu-1440x900-misaligned.jpg` versus
  `after/10-menu-centered-1440x900.jpg`.
- **Status:** fully resolved. Measured fixed bounds are y=45 with 45px remaining
  below at 1440×900; other target viewports remain centered.

#### 4. Medium — standalone boot emitted a minified console error and waited on portal work — code-resolved; live deployment pending

- **Player experience:** the deployed page logged one `t.GeneralError` from the
  production bundle on a fresh session. The loading meter looked complete for
  about 600ms before menu handoff. No HTTP failures accompanied it.
- **Reproduction:** open the GitHub Pages build in a fresh tab, inspect console,
  and watch the end of Boot.
- **Root cause:** two pre-gesture async paths were active on the standalone
  origin: WebAudio was constructed/resumed while settings loaded, and the
  CrazyGames SDK was initialized on GitHub Pages. The live error is minified,
  so attribution to the rejected resume is an evidence-based inference; both
  unsafe paths were independently fixed.
- **Files changed:** `src/systems/AudioSynth.js`,
  `src/systems/PlatformService.js`, `src/scenes/BootScene.js`,
  `test/audio-synth.test.js`, `test/platform-service.test.js`.
- **Fix:** audio remains lazy until a real sound request and consumes expected
  autoplay resume rejections; explicit `sdk:null` now truly disables detection;
  GitHub Pages opts out while portal-hosted builds retain automatic SDK use.
- **Tests:** lazy audio/rejection handling, explicit SDK opt-out, all existing
  portal lifecycle/audio journeys, and final production-preview console smoke.
- **Evidence:** loading states in `before/01-loading-1280x720.jpg` and
  `after/01-loading-1280x720.jpg`.
- **Status:** updated local production preview has zero console errors. The code
  path is resolved, but the existing live site remains unchanged because this
  task did not authorize deployment.

#### 5. Low — compact landscape text is small — open and documented

- **Player experience:** 844×390 is playable, but the 16:9 canvas becomes about
  693×390 with 75px side pillars and some 3–5 logical-pixel HUD copy is tiny.
- **Reproduction:** open gameplay at 844×390 and read the top HUD/instructions.
- **Likely subsystem:** fixed 480×270 UI typography plus aspect-preserving fit.
- **Recommended fix:** a dedicated compact-landscape HUD preset with larger
  critical type and fewer secondary labels; validate on physical iOS/Android.
- **Evidence:** `after/11-mobile-landscape-844x390.jpg`.
- **Status:** not changed to avoid cropping the goal or destabilizing every
  scene. Symmetric aspect-fit pillars are expected, not a rendering failure.

#### 6. Low — portrait remains a landscape-only gate — open by design

- **Player experience:** 390×844 shows a clear rotate prompt, not playable
  portrait gameplay.
- **Reproduction:** open at 390×844.
- **Likely subsystem:** intentional CSS orientation policy in `index.html`.
- **Recommended fix:** retain the gate unless true portrait scene composition
  is funded; do not merely shrink the 16:9 game into a 390×219 strip.
- **Evidence:** `after/12-mobile-portrait-390x844.jpg`.
- **Status:** documented product constraint. The prompt is readable and tested.

#### 7. Low — settings depth and pressed feedback remain light — open

- **Player experience:** audio is a binary menu toggle; aim assist is available
  only in pause; there are no exposed music/SFX sliders or accessibility screen.
  Button hover is clear, but a sampled pressed frame differs by only one pixel.
- **Reproduction:** inspect the main menu audio button and pause settings; hold
  a primary button.
- **Likely subsystem:** menu/settings information architecture and `src/ui.js`.
- **Recommended fix:** add a compact settings panel for music/SFX, aim assist,
  reduced motion, screen shake, and contrast; strengthen pressed contrast/offset.
- **Status:** deliberately not expanded in this remediation pass.

### Animation and asset decision

The supplied striker art is adequate: every selectable player has eight
distinct fixed-canvas poses with a shared foot anchor, and manual sequences
showed wind-up, contact, follow-through, recover, watch, and celebration without
teleporting the body core. Keeper and defender atlases also behaved correctly.
The sprite-generation trigger therefore was not met. No generated art, proxy
assets, source-art replacement, or sprite-pipeline invocation was necessary.

### Files changed

- `src/config.js`
- `src/main.js`
- `src/scenes/BootScene.js`
- `src/scenes/GameScene.js`
- `src/systems/AudioSynth.js`
- `src/systems/PlatformService.js`
- `test/audio-synth.test.js`
- `test/game-scene-session.test.js`
- `test/platform-service.test.js`
- `test/swipe-input.test.js`
- `e2e/release.spec.js`
- `PLAYTEST_REPORT.md`
- `playtest-evidence/README.md`
- `playtest-evidence/live-fix-2026-08-05/` (23 curated screenshots)

### Tests and performance

`npm run test:release` passed in full:

- 175 / 175 Node unit tests;
- Vite production build;
- 10 / 10 Chromium journeys in about one minute.

The final manual production-preview smoke used real pointer input and reported
zero console errors. Live inspection found zero failed requests and no obvious
stalls across 20 shots. The minified JavaScript changed from 1,536.15kB /
422.42kB gzip to 1,537.34kB / 422.80kB gzip: +1.19kB raw and +0.38kB gzip.
No meaningful runtime performance regression was observed.

### Five most important improvements

1. Restored a useful weak-to-full shot-power range.
2. Made Time Attack fair from its first valid release.
3. Removed the Time Attack ready/aim-meter overlap.
4. Corrected double-centered desktop letterboxing.
5. Hardened standalone boot against eager WebAudio and portal SDK failures.

### Recommended next release steps

1. Review this branch and deploy it to a non-production GitHub Pages preview.
2. Confirm the old `t.GeneralError` is absent on the real GitHub origin.
3. Run a human audio mix/fatigue pass with speakers and headphones.
4. Test 844×390 on physical phones and prototype a compact HUD preset.
5. Complete a representative late-cup difficulty/economy playthrough before
   calling the game a full release.

---

## Historical reports

## Publish-polish addendum — 2 August 2026

**Evidence:** [`playtest-evidence/polish-final/`](playtest-evidence/polish-final/)

**Release gate:** 171 unit tests, production build, 10 Chromium journeys

The loadout and motion pass is complete and the repository release gate is
green. The browser run additionally verified a real Malik shot at 112% power,
the `WALL FLATTENED!` result and collapse atlas, two projected corner flags,
the Aurora twin-ribbon flight path, and a non-teleporting keeper return.

- Players now have explicit techniques: balanced aim, Thunderstrike power and
  wall knockdown, extra curl, or wind-resistant control. The live HUD and
  Locker disclose every trade-off.
- Basketball and golf-ball loadouts join the six football designs, with
  deterministic gravity, drag, Magnus, rebound, rolling, size, and launch-feel
  profiles. The collision envelope remains regulation-sized for level fairness.
- Trails now function as flight-analysis rewards: pace spacing, power-reactive
  blocks, bounce-path diamonds, goal reward, or a complete two-line curl trace.
- Striker timing is compacted to an observed ~0.84 seconds, uses continuous
  eased translation/lean across pose swaps, removes whole-body idle inflation,
  and gives each player a different celebration cadence.
- Keeper retries clear save state without resetting the root position; the
  return atlas carries the keeper home during the next aiming phase.
- Corner flags are planted by the pole pixel at the shared projected pitch
  width instead of rotating around the texture centre.

This pass still does not claim a manual human completion of every one of the 50
career matches. It does establish that the production build, regression suite,
real input journeys, loadout persistence, and requested live animation states
are release-clean.

**Remediation date:** 1 August 2026

**Target branch:** `main`

**Evidence:** [`playtest-evidence/release-2026-08-01/`](playtest-evidence/release-2026-08-01/)

**Release gate:** 157 unit tests, 6 Chromium scenarios, production build

## Verdict

The reproducible blockers in the supplied playtest report are fixed and now
covered by automated regression tests. The game is suitable for another human
release-candidate playthrough. This is not a claim that all 50 career matches
have been manually completed in this pass.

The previous report in this repository incorrectly identified the shared 4x
camera contract as a systemic crop. Real Chromium instrumentation now proves
that the canvas remains inside the app and the camera exposes exactly 480×270
logical units at 4x zoom on 1920×1080, 1440×900, 1366×768, 1280×720, and
844×390. No risky camera rewrite was made. Portrait 390×844 receives the
landscape rotation prompt.

## Changes made from the report

### Gameplay and timing

- Pausing during `WINDUP` now pauses the striker's Phaser animation as well as
  Scene time and tweens. Contact cannot fire while the state is `PAUSED`, and
  resuming continues into `FLIGHT` instead of softlocking the attempt.
- Time Attack now counts result feedback as part of the advertised 60 seconds.
  Only an explicit player pause freezes the clock.
- Rapid platform lifecycle changes are serialized, debounced, and throttled.
  A quick pause/resume or visibility bounce coalesces instead of issuing
  overlapping `gameplayStop`/`gameplayStart` calls.

### First load

- The initial keeper payload is reduced from all 19 atlases (13.17 MiB) to five
  core atlases (3.98 MiB). Fourteen specialist save, recovery, distribution,
  and reaction atlases stream after gameplay starts.
- The keeper uses its loaded core motion as a fallback until specialist art is
  available, then refreshes texture availability without restarting the match.
- This removes 9.19 MiB of keeper PNGs from the blocking title-screen path.

### Player communication and progression

- Coaching feedback moved to its own vertical lane instead of overlapping the
  shot readout.
- Tutorial copy fades while the player is dragging, leaving the live gesture
  and meters readable, and returns after an invalid swipe.
- Career clear cards now state the real three-star mastery rule: finish in the
  minimum possible shots with a 2050+ point strike.
- Academy match 2 now asks the player to “Lift the ball through the centre” and
  gives four attempts, matching the skill it is teaching.
- A scoreless five-shot Daily attempt records its best score but no longer
  grants completion, streak progress, or rewards.
- Continue immediately disables itself and changes to “KICKING OFF...” so
  repeated clicks cannot restart the striker preview sequence.
- Persisted currency is clamped to 999,999 instead of displaying a corrupted
  nine-digit balance.
- Portrait detection no longer depends on `pointer: coarse`, which was absent
  in some browser/device emulations. Canvas scaling uses pixelated sampling.

## Automated browser coverage

`npm run test:e2e` launches repository-owned Chromium and stubs only the portal
SDK boundary. Tests use the real Phaser renderer and real mouse/keyboard input.
They verify:

1. full-frame camera/canvas geometry at five release landscape viewports;
2. the 390×844 portrait rotation experience;
3. pause during live windup, frozen contact, resume, and live ball flight;
4. five boot keeper atlases followed by deferred specialist loading;
5. Continue double-click/re-entry protection;
6. real swipe behavior plus separated tutorial, coaching, and readout lanes.

The same browser suite is now a required step in the GitHub Pages workflow
before `main` deploys. This removes the earlier dependency on whether a Codex
agent happens to have an in-app Browser backend attached.

## Evidence reviewed

- [`01-menu-1280x720.png`](playtest-evidence/release-2026-08-01/01-menu-1280x720.png)
- [`02-gameplay-1280x720.png`](playtest-evidence/release-2026-08-01/02-gameplay-1280x720.png)
- [`03-pause-windup-1280x720.png`](playtest-evidence/release-2026-08-01/03-pause-windup-1280x720.png)
- [`04-portrait-rotate-390x844.png`](playtest-evidence/release-2026-08-01/04-portrait-rotate-390x844.png)

## Deliberately not changed

- Cosmetic prices were not rebalanced from one synthetic economy projection.
  That decision needs retention and purchase data or a longer progression
  playthrough; changing every price now would replace one guess with another.
- The official CrazyGames SDK v3 script remains in `index.html`. Its inclusion
  and explicit initialization are required by the platform; the lifecycle
  adapter and boot fail-safe handle standalone and unavailable cases.
- No score is assigned to long-term replayability, audio fatigue, or late-game
  difficulty in this remediation pass. Those require real repeated human play.

## Run the release gate

```bash
npm ci
npx playwright install chromium
npm run test:release
```
