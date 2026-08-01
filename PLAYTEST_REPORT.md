# Free Kick Legend — Release Remediation Report

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
