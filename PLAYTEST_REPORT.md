# Executive Verdict

**Audit date:** 30 July 2026
**Repository revision:** `6cfa8db` on `main`
**Local build:** `http://127.0.0.1:5176/` (equivalent dev servers were also run on 5173–5177)
**Published build:** `https://isharaf6.github.io/free-kick-legend/`
**Tested viewports:** 1920×1080, 1280×720, 844×390, and 390×844
**Automated baseline:** `npm ci`, 152/152 tests passing, and a successful production build

| Area | Score |
|---|---:|
| Core gameplay | 3/10 |
| Game feel | 3/10 |
| Controls | 2/10 |
| Physics/readability | 2/10 |
| Visual polish | 4/10 |
| UI/UX | 1/10 |
| Progression | 3/10 |
| Content variety | 5/10 |
| Replayability | 3/10 |
| Audio/feedback | 2/10 |
| Technical stability | 4/10 |
| Mobile/browser readiness | 1/10 |

**Would you publish this game today?**

**NO, MAJOR ISSUES REMAIN**

The current local `main` and the public GitHub Pages build both render approximately a magnified upper-left portion of the intended scene. At 1280×720, the main menu's logo and primary actions are outside the viewport. At 1920×1080, the gameplay ball, much of the goal, aiming information, shot result, objective strip, and most of the pause dialog are outside the viewport. Locker, Progress, Daily Kick, Time Attack, and Career selection are similarly clipped. This makes the normal first-time journey and the central shoot/observe/learn loop unusable.

This is a stop-ship presentation defect even though the project compiles and its unit tests pass. A real swipe did register and the goalkeeper visibly reacted, but the ball flight and outcome were offscreen. It would be dishonest to claim that shooting feel, physics, balance, progression pacing, later-level variety, audio, or long-term retention were adequately validated while their essential UI and feedback were inaccessible.

The good news is that the visible art is substantially stronger than the current score suggests. The stadium, crowd, character sprites, pitch, goal, and CALYNX identity form a cohesive pixel-art presentation. The most likely route to a large quality improvement is to repair one shared rendering contract, not redesign the game's art or manually move every screen.

## Audit method and limits

The lead tester opened and interacted with both the local game and deployed build in the Codex in-app Chromium browser. The test included menu navigation, Career, Locker, Progress, Daily Kick, Time Attack, one real drag shot, pause/resume/restart stress, refreshes, and responsive viewport changes. Several menu destinations were reached only by clicking their source-derived offscreen coordinates; that demonstrates that scene transitions and hit regions exist, but it is not a valid player experience.

Five requested perspectives were assigned in parallel. The delegated browser sessions did not receive an available browser backend, so those agents correctly did not fabricate playtest results. After the lead had reproduced the problem, specialist agents were reassigned to source-backed root-cause, gameplay-session, progression, and visual-system analysis. In this report:

- **Observed** means directly reproduced in the browser by the lead.
- **Source-supported** means confirmed from implementation after the associated inaccessible or faulty behavior had been observed.
- **Not validated** means the P0 prevented a defensible real-play conclusion.

No production code was changed during this audit.

# TOP 10 CHANGES BEFORE RELEASE

### #1 — Restore one correct scene-to-screen scaling contract

**Priority:** P0
**Impact:** Very High
**Effort:** M

**Problem**

All scenes are magnified and cropped. The app authors a 480×270 logical world, constructs a 1920×1080 Phaser game with `FIT`, and also gives each scene a 1920×1080 camera viewport with 4× zoom. The evidence is consistent with an effective scale around twice the intended result, but the exact double-application point is not conclusively instrumented.

**Evidence**

The issue reproduced on local `main` and the live site at desktop and mobile-sized viewports. At 1920×1080, a panel authored at logical x=90 appears around physical x=720 rather than the expected x=360. See [local 1280×720 menu](playtest-evidence/baseline/01-local-menu-1280x720.jpg), [1920×1080 gameplay](playtest-evidence/baseline/06-gameplay-1920x1080.jpg), and [cropped pause panel](playtest-evidence/baseline/14-pause-menu-cropped.jpg).

**Why it matters**

It blocks discovery, aiming, feedback, navigation, progression, and reliable QA. This is the weakest stage of every game loop because the player cannot see the loop.

**Recommended change**

Instrument the canvas attribute size, CSS rectangle, device pixel ratio, Phaser `displaySize`/`displayScale`, and camera viewport/world view/zoom at runtime. Then choose one scaling authority: either render the logical resolution and let the Scale Manager fit it, or retain the high-resolution backing strategy with a camera/display contract that provably exposes exactly 480×270 logical units. Do not patch individual scene coordinates.

**Likely implementation area**

`src/config.js:3-11`, `src/main.js:24-29`, and `src/ui.js:21-29`.

### #2 — Add real-browser framing gates for every release viewport

**Priority:** P1
**Impact:** Very High
**Effort:** M

**Problem**

The 152 passing tests do not exercise a real Phaser renderer or Scale Manager. A catastrophic visual regression can therefore ship while CI remains green.

**Evidence**

The exact same framing failure is present on `main` and the deployed site despite the green unit suite and production build. Existing browser shims fix `devicePixelRatio` and do not validate real canvas bounds.

**Why it matters**

A browser game is only releasable if its interactive frame is visible. Rendering is part of functional correctness, not optional visual polish.

**Recommended change**

Add browser smoke tests at 1920×1080, 1440×900, 1366×768, 1280×720, 844×390, and 390×844. Assert that the canvas is contained by `#app`, the camera exposes the full logical world, corner sentinels are visible, and representative actions on Menu, Career, gameplay, pause, Locker, Progress, Daily, and Time Attack are both visible and clickable. Run against dev and built preview.

**Likely implementation area**

New end-to-end test configuration plus `src/main.js`, `src/ui.js`, and representative scenes.

### #3 — Revalidate the first 30 seconds as an actual new player

**Priority:** P1
**Impact:** Very High
**Effort:** S

**Problem**

The main actions and tutorial are offscreen. An average portal player cannot discover Career or see the complete shooting instructions in 20–30 seconds.

**Evidence**

The visible 1280×720 menu contains only the left stadium/crowd region; Career was reached only with a known invisible-coordinate click. In gameplay, the tutorial's central/bottom content was outside the frame.

**Why it matters**

Portal users decide quickly whether a game works. The current first impression reads as a broken background rather than an interactive football game.

**Recommended change**

After #1, run a clean-storage first-time test without source knowledge. Require visible primary actions, an obvious ball interaction, one successful first shot path, and clear explanation of direction, power, loft, and curl. Measure time to first shot and count failed interactions.

**Likely implementation area**

`src/scenes/MenuScene.js`, `src/scenes/GameScene.js:2106-2180`, and the shared scale setup.

### #4 — Make the entire shot-learning loop visible and readable

**Priority:** P1
**Impact:** Very High
**Effort:** S after #1

**Problem**

The ball, trajectory, input readout, result, and objective progress cannot be seen together. A shot can register without communicating cause and effect.

**Evidence**

A real upward drag caused the goalkeeper to dive and recover, but the ball flight and result remained outside the viewport. See [shot flight](playtest-evidence/baseline/12-shot-flight-offscreen.jpg) and [shot result](playtest-evidence/baseline/13-shot-result-offscreen.jpg).

**Why it matters**

The desired reaction is “I know what I did wrong; one more try.” The present reaction is “I cannot see what happened.” That prevents skill learning and makes the core mechanic unscorable.

**Recommended change**

Once framing is fixed, test short/long, slow/fast, straight, high/low, and heavily curved gestures. Ensure direction, power, loft, curl, wind, predicted path, actual path, collision, grade, and objective progress form one legible feedback chain. Adjust only feedback proven unclear in that follow-up playtest.

**Likely implementation area**

`src/systems/SwipeInput.js`, `src/scenes/GameScene.js:1850-2180,3691-3797`, `src/objects/Ball.js`, and `src/systems/ShotScoring.js`.

### #5 — Restore visible navigation across every meta-game screen

**Priority:** P1
**Impact:** Very High
**Effort:** S after #1

**Problem**

Career detail/actions, Locker content, Progress claims, Daily Kick, and Time Attack controls extend beyond the visible area.

**Evidence**

See [Career](playtest-evidence/baseline/02-career-after-invisible-click.jpg), [Locker](playtest-evidence/baseline/22-locker-cropped.jpg), [Progress](playtest-evidence/baseline/23-progress-cropped.jpg), [Daily Kick](playtest-evidence/baseline/24-daily-kick-cropped.jpg), and [Time Attack](playtest-evidence/baseline/25-time-attack-cropped.jpg).

**Why it matters**

The game's strongest code-supported retention systems cannot motivate players if they cannot be discovered or operated.

**Recommended change**

After the shared fix, walk every normal and locked state with clean, mid-game, and completed saves. Verify focus/hover/press states and that all critical controls remain inside the safe frame.

**Likely implementation area**

The shared scale setup first; then only genuinely residual issues in `LevelSelectScene`, `LockerScene`, `ProgressScene`, and `MenuScene`.

### #6 — Make mobile orientation recovery dependable

**Priority:** P1
**Impact:** High
**Effort:** S

**Problem**

At an emulated 390×844 portrait viewport, the page showed a blank navy area and no rotate instruction. The overlay is gated by `pointer: coarse`, so portrait environments reporting a fine pointer bypass it.

**Evidence**

See [portrait 390×844](playtest-evidence/baseline/20-live-mobile-portrait-390x844.jpg) and [landscape 844×390](playtest-evidence/baseline/21-live-mobile-landscape-844x390.jpg). This was desktop viewport/pointer emulation, not a physical coarse-pointer device, so real iOS and Android validation remains required.

**Why it matters**

Portal shells, tablets, hybrids, and emulators do not always report pointer capability consistently. A player needs an explanation rather than an apparently empty page.

**Recommended change**

Base the rotate notice on usable aspect ratio/orientation rather than requiring coarse pointer, preserve accessibility for keyboard users, and validate on physical iOS/Android plus representative portal embeds.

**Likely implementation area**

`index.html:153-213` and the shared canvas scaling setup.

### #7 — Require meaningful success for the Daily completion reward

**Priority:** P1
**Impact:** High
**Effort:** S

**Problem**

Source analysis indicates that the fifth Daily attempt completes the day regardless of score or goals. Five misses can therefore advance the streak and grant the full cycling reward.

**Evidence**

The Daily screen itself was opened but could not be fully played due to the P0. After that observation, code inspection found unconditional completion after five attempts in `GameScene`, while `SaveManager.completeDaily` grants streak credit, coins, and `dailyRuns` without a success threshold. This is source-supported and requires browser confirmation after #1.

**Why it matters**

A daily return hook that pays out for failure weakens mastery, devalues cosmetics, and makes the streak feel procedural rather than earned.

**Recommended change**

Define and communicate a modest Daily success threshold, distinguish “attempted” from “completed,” and award streak progression only on completion. Preserve a consolation outcome if avoiding player frustration is important.

**Likely implementation area**

`src/scenes/GameScene.js:3050-3064` and `src/systems/SaveManager.js:730-769`.

### #8 — Make Time Attack match its “60 SEC” promise

**Priority:** P1
**Impact:** High
**Effort:** S

**Problem**

Source analysis indicates that the timer stops in the RESULT phase, including a roughly 1.15-second transition before the next scenario. Real run duration and score opportunity therefore depend on result cadence rather than a continuous 60-second clock.

**Evidence**

The mode screen was observed but a complete readable run was blocked by the P0. The timer condition and result transition are directly visible in `GameScene`. This is source-supported and requires timed browser confirmation after #1.

**Why it matters**

“60 SEC” creates a clear player expectation. Pausing the clock during ordinary result flow undermines comparative scores and makes mode duration unpredictable.

**Recommended change**

Use monotonic wall-clock time for the run, define explicitly which exceptional states pause it, and make result transitions short enough that they do not consume an unfair proportion of play time.

**Likely implementation area**

`src/scenes/GameScene.js:2555-2568,2908-3017`.

### #9 — Serialize and coalesce platform gameplay lifecycle calls

**Priority:** P2
**Impact:** Medium
**Effort:** S–M

**Problem**

Rapid pause/resume/restart produces repeated CrazyGames SDK throttling errors. Opposite lifecycle transitions can overlap because active state is changed before the asynchronous SDK operation resolves.

**Evidence**

Repeated Tab and restart inputs did not crash or softlock the game, but the console repeatedly reported `gameplayStart() call throttled` and `gameplayStop() call throttled` with a 1000 ms delay.

**Why it matters**

It creates noisy errors, uncertain portal state, and a compliance/integration risk during ordinary impatient input.

**Recommended change**

Serialize transitions, coalesce redundant desired states, and reconcile local state only after completion. Add a test for rapid alternating calls and scene restart while a stop is in flight.

**Likely implementation area**

`src/systems/PlatformService.js:135-145`, `src/scenes/GameScene.js:552-617,630-706`, and platform/session tests.

### #10 — Avoid the unsupported-domain SDK boot penalty

**Priority:** P2
**Impact:** High
**Effort:** S

**Problem**

The live GitHub Pages build remained on the boot presentation at an approximately 1.8-second observation and reached the menu by five seconds. Code allows SDK initialization to wait up to four seconds.

**Evidence**

This is an approximate observation rather than a laboratory performance trace. The four-second fallback is explicit in `PlatformService`.

**Why it matters**

Several seconds of apparently idle boot time is expensive for a portal game, especially when running outside the supported portal.

**Recommended change**

Load the portal SDK only where supported, or allow the game to continue while nonessential integration initializes. Add real navigation timing for first contentful frame and menu interactive time.

**Likely implementation area**

`src/systems/PlatformService.js:1-85` and boot-to-menu handoff.

# BUGS

## Entire game is magnified and cropped

**Priority:** P0 — Release blocker
**Environment:** Local `main` and published GitHub Pages build; Codex in-app Chromium; 1280×720 and 1920×1080 desktop, 844×390 landscape emulation

**Steps to reproduce**

1. Open the local or published game.
2. Wait for the main menu.
3. Observe that the logo and main actions are beyond the right edge.
4. Use a known offscreen Career action coordinate and start a level.
5. Observe gameplay, then press Tab to pause.

**Expected**

The full authored 16:9 scene is fitted inside the viewport. Menu actions, ball, goal, HUD, objective strip, and complete pause dialog are visible.

**Actual**

Only a magnified upper-left portion is visible. Normal navigation is impossible and gameplay feedback is offscreen.

**Frequency:** 100% in every tested local/live landscape session and tested viewport.

**Screenshot/evidence**

[Local menu](playtest-evidence/baseline/01-local-menu-1280x720.jpg), [live menu](playtest-evidence/baseline/10-live-build-menu-after-load.jpg), [gameplay](playtest-evidence/baseline/06-gameplay-1920x1080.jpg), [pause](playtest-evidence/baseline/14-pause-menu-cropped.jpg).

**Likely implementation area**

`src/config.js:3-11`, `src/main.js:24-29`, `src/ui.js:21-29`. The exact cause is not yet proven; instrument before modifying.

## Portrait viewport can show neither game nor rotate guidance

**Priority:** P1 — Major
**Environment:** Published build, 390×844 viewport under desktop pointer emulation

**Steps to reproduce**

1. Open the published game.
2. Set the viewport to 390×844 without emulating a coarse pointer.
3. Wait for boot to complete.

**Expected**

Either a usable responsive game or a clear rotate-to-landscape card is visible.

**Actual**

A largely blank navy page is shown and the rotate card remains hidden.

**Frequency:** 100% in the tested emulated portrait setup. Physical-device frequency is not established.

**Screenshot/evidence**

[Portrait evidence](playtest-evidence/baseline/20-live-mobile-portrait-390x844.jpg).

**Likely implementation area**

`index.html:153-213`, especially the `pointer: coarse` media-query gate, plus the P0 scaling contract.

## Rapid pause/restart floods portal lifecycle errors

**Priority:** P2 — Important polish
**Environment:** Local build with CrazyGames SDK integration active in Chromium

**Steps to reproduce**

1. Enter gameplay.
2. Press Tab repeatedly to alternate pause and resume.
3. Interleave restart input.
4. Inspect the browser console.

**Expected**

Lifecycle calls are coalesced or serialized; no SDK throttling errors occur.

**Actual**

Repeated `gameplayStart() call throttled, delay 1000` and `gameplayStop() call throttled, delay 1000` errors are logged.

**Frequency:** 100% in the rapid-toggle stress run. No crash or softlock occurred.

**Screenshot/evidence**

Console observation recorded during the audit; [pause state](playtest-evidence/baseline/14-pause-menu-cropped.jpg) shows the affected flow.

**Likely implementation area**

`src/scenes/GameScene.js:596-617,630-706` and `src/systems/PlatformService.js:135-145`.

## Source-supported progression defects awaiting browser confirmation

Two deterministic code paths should be treated as P1 release candidates, but are not mislabeled as completed browser reproductions:

- Daily completion grants streak/reward after five attempts without a score or goal threshold (`GameScene.js:3050-3064`, `SaveManager.js:730-769`).
- Time Attack excludes RESULT time from its advertised 60-second timer (`GameScene.js:2555-2568,2908-3017`).

Both should receive focused browser cases immediately after the P0 is fixed.

# GAMEPLAY FINDINGS

## Core loop

| Stage | Expected | Observed | Gap |
|---|---|---|---|
| Select content | Obvious visible mode action | Actions were offscreen; source-derived coordinates were required | A normal player cannot begin deliberately |
| Understand objective | Objective visible before input | Objective strip was partly or wholly outside the frame | Intent cannot guide the shot |
| Aim and swipe | Ball and gesture relationship visible | A real drag registered, but the ball was outside the visible composition | Input works without a readable target/input anchor |
| Ball flight | Followable trajectory and curl/loft | Goalkeeper reacted; flight remained offscreen | No causal learning is possible |
| Keeper/wall | Fair, readable reaction/collision | A keeper dive/recovery was visible; full interaction was not | Timing/fairness cannot be judged |
| Result | Immediate goal/save/miss explanation | Result presentation was outside the frame | Success and failure are ambiguous |
| Progress/reward | Score/objective/reward is clear | Meta screens and HUD are clipped | Retention loop is inaccessible |

**Weakest stage:** visibility and feedback between input and outcome.
**Strongest demonstrated stage:** the game accepted a real swipe and advanced a responsive keeper animation without crashing.

## Shot feel, aiming, power, loft, curl, and trajectory

One upward drag was accepted. A tiny/extreme gesture attempt was also made, but the relevant ball and result region remained offscreen. Responsiveness beyond “input registered” is therefore not defensibly scorable. Direction, power, loft, and curl may be sophisticated in implementation, but the test asks whether a human can see, understand, predict, intentionally use, and learn from them. In the current release build the answer is **no**, because the communication layer is outside the viewport.

The aim-assist controls and pause settings also extend beyond the visible panel. Their correctness and usefulness remain not validated.

## Wind

Wind information appeared only partially in the cropped composition. Its effect on trajectory could not be compared with a visible flight. No conclusion about clarity, strength, or fairness is valid yet.

## Goalkeeper

The observed goalkeeper produced a recognizable dive and recovery in response to the real shot. This is a positive animation signal. Save fairness, reaction timing, variety, scripting, and whether goals feel earned were not validated because neither the ball nor complete result was visible.

## Defensive wall and hazards

The authored level data includes normal, moving, split, double, deflector, and jumping-wall configurations, plus hoops, glare, weather, smaller goals, multiple keeper behaviors, and bank-shot objectives. That breadth is source-supported, not playtested. Positioning, jump timing, leg collisions, readability, and fairness remain release-unknown.

## Goal-frame physics, rebounds, and difficulty

Post/crossbar collisions, rebounds, bounce, rolling, drag, and edge cases could not be visually followed. Difficulty therefore cannot be separated into player error, input imprecision, randomness, keeper behavior, or unclear feedback. Releasing without this distinction would risk turning intended mastery into opaque frustration.

## Objectives and feedback

The implementation contains objective text, scores, grades, bonuses, shot readouts, and result phases, but their current placement makes them unavailable. Goal/save/post/miss impact, combo feedback, celebration, crowd response, audio, camera motion, and the desire to take another shot immediately all remain not validated.

# UX FINDINGS

## Onboarding

The first-time experience fails before comprehension can be measured. The primary actions and tutorial are not visible in the same frame. A source-informed tester could enter gameplay; an average CrazyGames player would not be expected to understand the game within 20–30 seconds in this state.

Time to first shot, time to understand controls, failed-interaction count, and shots-to-understanding are intentionally not reported: producing numbers from invisible-coordinate navigation would be misleading.

## Menus and navigation

Menu, Career, Progress, Locker, Daily Kick, and Time Attack all share the clipping failure. Visual hierarchy cannot work when primary actions are outside the viewport. Hit regions did respond where expected, and transitions did not softlock in the limited stress run, which suggests the scene graph is present beneath the presentation defect.

## HUD, objectives, and results

The HUD and objective/result areas are authored coherently in logical coordinates, but they are not simultaneously visible at runtime. The current problem is systemic scaling, not proven local alignment mistakes. The follow-up test must confirm that score, attempts, objective, wind, shot telemetry, grade, and next action are readable without scanning or guessing.

## Progression visibility, Locker, achievements, and missions

The Progress screen exposes Daily Missions and Achievements in code, and the Locker contains gated visual-only cosmetics. None can be judged for clarity, claim satisfaction, purchase confirmation, equipped state, or locked-state comprehension until the full screen is visible.

The code-supported meta structure is coherent:

- 50 sequential career levels across five cups;
- best-of-three mastery stars and one-time clear/three-star coin rewards;
- 18 visual-only cosmetics gated by coins, stars, cup completion, or Daily participation;
- three deterministic daily missions;
- 12 claimable achievements;
- a seven-step Daily reward cycle.

However, some gated cosmetics also retain a coin price, so perceived grind and value need a real economy playtest rather than an implementation-only conclusion.

# VISUAL FINDINGS

## Proportions and screen composition

Current proportions are unusable because the scene is globally magnified. The 1920×1080 gameplay evidence loses the ball, right-side goal/HUD, and lower information; the pause dialog exits the viewport. Do not resize the player, goalkeeper, wall, goal, or individual panels until the shared camera/display contract is corrected.

## Stadium, crowd, advertisements, goal, and pitch

What remains visible is strong. The deep navy/green/gold palette, dense crowd, steward silhouettes, CALYNX advertising, white goal/net, and converging pitch geometry create clear stadium depth and a recognizable commercial identity. The recently aligned pitch markings support the goal perspective. These assets should be preserved while framing is repaired.

## Player, keeper, and wall

Character silhouettes are readable, the keeper's observed dive/recovery had recognizable intent, and the pixel treatment is cohesive. Wall animation quality and scale cannot be judged from the blocked play area. No evidence supports redrawing these assets.

## HUD and hierarchy

The authored chrome uses a consistent broadcast-panel language, but runtime cropping destroys hierarchy. Once fully visible, test the relative prominence of objective, attempts, score, wind, shot controls, and result—not simply whether each exists.

## Pixel rendering

Phaser enables pixel art and disables antialiasing, while CSS uses `image-rendering: auto`. At non-integer fit ratios such as 1366×768 and 844×390, that creates a risk of browser interpolation and inconsistent crispness. This is P2 and should be decided intentionally after P0, not used as a substitute for the framing repair.

## Animation and transitions

Crowd motion and keeper response were visibly alive. Scene transitions and pause toggling operated without an observed softlock. Goal, save, miss, reward, unlock, and completion animation quality could not be evaluated because their frames were inaccessible.

## Responsive layouts

Landscape fitting fails in the tested desktop and mobile-sized viewports. Portrait desktop emulation also lacks a dependable rotation message. Real-device browser chrome, safe areas, touch behavior, and coarse-pointer handling remain untested and are mandatory before mobile release.

# RETENTION & GAME DESIGN FINDINGS

## First minute

The current build loses the player before the first meaningful choice. This is not a tuning problem; it is an accessibility-of-the-game problem. The strongest retention improvement is to make the first interaction and its outcome visible.

## First five minutes and first session

Intended hooks are visible in code: sequential objectives, first-clear coins, mastery stars, and escalating mechanics. Their pacing and motivational value were not observable. After P0, test whether early objectives introduce one concept at a time and whether a near miss creates an understandable next attempt.

## Progression and mastery loop

The star system reserves higher mastery for efficient, high-quality completion, which is a sound basis for replay. The 50-level/five-cup structure provides a clear long-form spine. Yet the economy and difficulty curve require representative early, middle, late, unusual, and boss-level play before any release claim.

## Reward and cosmetic loop

One-time clear and mastery bonuses help prevent simple reward duplication. Cosmetic rewards are visual-only, avoiding pay-to-win pressure. Value, purchase friction, and grind remain unknown; double-gated cosmetics may feel demanding depending on actual coin income.

## Daily return hook

The seeded Daily Kick, three missions, seven-step streak, and Daily-gated cosmetic provide a coherent reason to return tomorrow. The source-supported five-misses completion path would undermine that hook and should be corrected/confirmed before release.

## Time Attack and replayability

Time Attack offers a distinct repeatable score chase, while three-star career replay and unusual objectives provide intended mastery reasons. The non-wall-clock timer risks unfair comparisons. More importantly, none of this can retain users until the core frame is usable.

## Direct retention answers

**After 10 minutes, why would I keep playing?** Intended answer: improve stars, learn new shot demands, and earn first-clear coins. Observed answer in this build: the player is unlikely to reach ten valid minutes.

**After 30 minutes, what keeps me playing?** Intended answer: cup escalation, three-star mastery, cosmetics, and Time Attack score improvement. Not validated.

**Why would I return tomorrow?** Intended answer: shared seeded Daily Kick, missions, streak rewards, and a Daily unlock. The completion threshold needs correction and browser validation.

# WHAT ALREADY WORKS

- **Art direction:** The visible stadium has a cohesive pixel identity, good depth, and a convincing match-day atmosphere. A wholesale visual redesign would discard good work.
- **Brand integration:** CALYNX boards are legible and stylistically integrated rather than pasted over the scene.
- **Scene responsiveness beneath the crop:** Known hit regions triggered Career and other scenes; a drag registered; pause, resume, and restart inputs did not produce an observed softlock.
- **Keeper motion:** The directly observed dive and recovery communicate defensive action clearly.
- **Authored content breadth:** Fifty levels, five cups, varied objectives/hazards, alternate keepers/walls, Daily, Time Attack, missions, achievements, and cosmetics constitute a substantial intended package.
- **Progression safeguards in code:** Best stars are retained, clear and three-star rewards are one-time, saves are normalized, and repeat reward claims are rejected.
- **Engineering baseline:** Dependency installation, all 152 unit tests, and the production build completed successfully. No ordinary uncaught JavaScript exception or obvious asset 404 was observed during initial local/live loading.

These strengths should be preserved. They do not cancel the release blocker, but they mean the game may improve dramatically once the presentation contract is corrected and a real second playtest becomes possible.

# RELEASE ROADMAP

## BEFORE RELEASE

1. **P0:** Instrument and fix the shared logical/backing/camera scale contract.
2. **P1:** Add real-browser viewport and reachability tests across the release matrix.
3. **P1:** Re-run a clean-storage first-time-player test and make the first shot understandable within 20–30 seconds.
4. **P1:** Validate the full shot feedback chain across varied gestures, outcomes, wall/keeper behavior, and collisions.
5. **P1:** Validate every menu/meta screen and normal/locked/claimed/equipped state.
6. **P1:** Fix and physically validate portrait guidance plus mobile landscape gameplay.
7. **P1:** Require meaningful Daily success before streak/reward completion.
8. **P1:** Make Time Attack use the time model promised to the player.
9. **Release gate:** Sample early, middle, late, unusual, hazard, hoop, wall, boss, and bank-shot content; do not infer fairness from data definitions.

## POLISH PASS

1. **P2:** Serialize/coalesce CrazyGames lifecycle transitions and add rapid-toggle coverage.
2. **P2:** Remove or hide the unsupported-domain SDK wait from the critical boot path.
3. **P2:** Choose and document a deliberate CSS pixel-scaling policy at non-integer viewport ratios.
4. **P2:** Add resize/orientation invariant handling and mid-game resize tests.
5. **P2:** After gameplay becomes visible, tune only those impact, audio, camera, result, and reward effects that real players find weak.

## POST-LAUNCH

1. **P3:** Use analytics to locate tutorial exits, repeated failure levels, Daily conversion, cosmetic affordability, and Time Attack replay rate.
2. **P3:** Consider a lightweight practice mode only if evidence shows players cannot isolate curl/loft/power learning in Career.
3. **P3:** Experiment with additional Daily modifiers or leaderboard framing after timing fairness and reward integrity are proven.
4. **P3:** Expand cosmetics only after existing unlock/value pacing is validated.

# FINAL PRODUCT CRITIQUE

1. **What is the strongest part of Free Kick Legend?**
   Its cohesive stadium pixel art and the breadth of authored football challenges. The visible scene has identity, and the code contains more progression structure than a simple prototype.

2. **What is the weakest part?**
   The runtime rendering contract. It prevents the player from seeing and operating the game that has been built.

3. **What currently makes it feel indie/prototype-like?**
   A catastrophic viewport regression can coexist with a green unit suite and reach production. Portal lifecycle noise, ambiguous portrait fallback, and unvalidated time/reward rules reinforce that impression.

4. **What would make it feel professionally published?**
   A full-frame experience at every supported viewport, browser-level release gates, a verified first-minute tutorial, readable shot causality, and an end-to-end balance/economy pass on the actual build.

5. **Is the shooting mechanic genuinely fun?**
   Not currently judgeable. The input registered and keeper response was promising, but ball flight and outcome were offscreen. Any stronger claim would be fabricated.

6. **Does difficulty feel fair?**
   Not validated. Fairness cannot be assessed when the cause and result of failure are invisible.

7. **Are the controls understandable?**
   No in the released presentation. The required input anchor, tutorial, assistance, and feedback do not form a visible whole.

8. **Does the game have enough variety?**
   It has enough variety on paper: 50 levels and a broad mechanic/objective catalogue. Whether those levels feel meaningfully distinct remains unplayed.

9. **Would players replay it?**
   Not in the current build. The intended mastery stars, Time Attack, and unusual objectives could support replay after the blocker and timing integrity are fixed.

10. **Would players return the next day?**
    Not currently. The Daily/missions/streak package is a credible hook, but it is inaccessible and its completion rule appears too permissive.

11. **Three changes most likely to increase player retention**

    1. Restore the full visible shoot/feedback/retry loop.
    2. Verify early-to-late difficulty so failure consistently teaches the next attempt.
    3. Make Daily success meaningful and Time Attack scoring temporally fair.

12. **Three changes most likely to increase perceived polish**

    1. Correct systemic framing at every supported viewport.
    2. Guarantee visible orientation guidance and robust resizing on mobile/portal embeds.
    3. Remove lifecycle-console noise and critical-path SDK delay, then tune feedback from real play evidence.

13. **If only ONE thing could be improved before release, what should it be?**
    Fix the shared scale/camera contract so exactly the complete 480×270 logical scene is visible. Until then, every other improvement is hidden behind the same blocker.

## Release decision

Do not publish or promote the current build. Fix the P0, deploy a candidate, and repeat the actual playtest before making any claim about game feel, fairness, or retention. The project has enough visual identity and authored systems to justify that second pass; it is not ready to skip it.
