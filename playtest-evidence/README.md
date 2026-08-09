# Playtest evidence index

## Final gameplay and release-polish audit — 9 August 2026

The [`final-release-polish-2026-08-09/`](final-release-polish-2026-08-09/)
directory contains the baseline and verified post-fix captures for the final
release pass. It covers desktop and compact landscape gameplay, portrait
gating, real shot phases, result staging, keeper recovery, wall collapse,
deflector extension, ball grounding, keyboard pause focus, settings, Locker,
Progress, and Career selection.

| Baseline | Final | Finding |
|---|---|---|
| `final-release-polish-2026-08-09/before/04-goal-1280x720.png` | `final-release-polish-2026-08-09/after/postfix-1280-goal-result.png` | Stale coaching was removed and the result composition rebuilt. |
| `final-release-polish-2026-08-09/before/goal-frame-40.png` | `final-release-polish-2026-08-09/after/gameplay-audit-goal-pyro.png` | Oversized cloned fountains became post-anchored perspective effects. |
| `final-release-polish-2026-08-09/before/08-menu-844x390.png` | `final-release-polish-2026-08-09/after/postfix-844x390-aiming.png` | Compact landscape remains fully playable with a live-reflowed HUD. |
| `final-release-polish-2026-08-09/before/10-large-portrait-1024x1366.png` | `final-release-polish-2026-08-09/after/postfix-1024x1366-portrait-gate.png` | The baseline exposed a live menu at large portrait widths; final applies the rotate gate at every portrait width. Match-freezing ownership is covered by E2E. |
| — | `final-release-polish-2026-08-09/after/postfix-1280-pause-keyboard-focus.png` | Pause owns input and exposes a visible keyboard focus ring. |
| — | `final-release-polish-2026-08-09/after/postfix-1280-reduced-motion-goal.png` | A live toggle replaces the active celebration with a static equivalent. |
| — | `final-release-polish-2026-08-09/after/postfix-1280-deflector-extension.png` | Deflector art and collision share progressive extension timing. |
| — | `final-release-polish-2026-08-09/after/postfix-1280-ball-grounding-03-rolling.png` | Ball contact transitions through a credible rolling state before rest. |

The directory-level README contains the complete issue ledger, capture index,
performance comparison, test commands, changed-file map, and release summary.

---

## Live-to-local manual pass — 5 August 2026

The `live-fix-2026-08-05` directory contains a curated 23-image before/after
set captured with the Codex in-app Chromium browser. The `before` images are
from the deployed GitHub Pages canvas; the `after` images are from the updated
local build using real pointer input. Key comparisons:

| Before | After | Finding |
|---|---|---|
| `before/07-time-attack-1280x720.jpg` | `after/03-time-attack-ready-1280x720.jpg` | Timer now waits at 60 for the first valid shot. |
| `before/03-aim-1280x720.jpg` | `after/04-aiming-mid-power-1280x720.jpg` | Fixed power domain and unobstructed live meter. |
| `before/08-menu-1440x900-misaligned.jpg` | `after/10-menu-centered-1440x900.jpg` | Symmetric desktop letterboxing. |
| `before/04-goal-result-1280x720.jpg` | `after/07-goal-1280x720.jpg` | Real pointer goal/result validation after calibration. |
| `before/09-mobile-844x390.jpg` | `after/11-mobile-landscape-844x390.jpg` | Landscape remains full-frame and centered. |
| `before/10-mobile-390x844.jpg` | `after/12-mobile-portrait-390x844.jpg` | Explicit landscape-only portrait gate remains readable. |

See `PLAYTEST_REPORT.md` for exact reproduction steps, root causes, fixes, and
resolution status.

---

Captured on 30 July 2026 with the Codex in-app Chromium browser. Images are intentionally limited to states that support a finding in `PLAYTEST_REPORT.md`.

| File | Build / viewport | What it demonstrates |
|---|---|---|
| `baseline/01-local-menu-1280x720.jpg` | Local / 1280×720 | Main menu is magnified; logo and primary actions are offscreen |
| `baseline/02-career-after-invisible-click.jpg` | Local / 1280×720 | Career was reached only with a source-derived offscreen click; selection detail/action is clipped |
| `baseline/05-gameplay-cropped-first-view.jpg` | Local / 1280×720 | First gameplay frame exposes only part of the authored scene |
| `baseline/06-gameplay-1920x1080.jpg` | Local / 1920×1080 | Full-HD viewport still loses the ball, right HUD, and much of the goal |
| `baseline/10-live-build-menu-after-load.jpg` | Published / 1280×720 | The same menu defect is deployed on GitHub Pages |
| `baseline/12-shot-flight-offscreen.jpg` | Local / 1920×1080 | A real drag triggered keeper motion while flight remained offscreen |
| `baseline/13-shot-result-offscreen.jpg` | Local / 1920×1080 | Shot outcome/feedback remains outside the visible frame |
| `baseline/14-pause-menu-cropped.jpg` | Local / 1920×1080 | Pause panel is magnified and exits the right edge |
| `baseline/20-live-mobile-portrait-390x844.jpg` | Published / 390×844 emulation | Portrait can show neither usable game nor rotation guidance under a fine pointer |
| `baseline/21-live-mobile-landscape-844x390.jpg` | Published / 844×390 emulation | Landscape remains cropped |
| `baseline/22-locker-cropped.jpg` | Local / 1920×1080 | Locker content/actions are outside the frame |
| `baseline/23-progress-cropped.jpg` | Local / 1920×1080 | Progress tabs/claims cannot be fully reached visually |
| `baseline/24-daily-kick-cropped.jpg` | Local / 1920×1080 | Daily Kick is affected by the same systemic framing issue |
| `baseline/25-time-attack-cropped.jpg` | Local / 1920×1080 | Time Attack is affected by the same systemic framing issue |

The portrait and landscape mobile captures use responsive viewport emulation, not a physical phone. Coarse-pointer behavior, browser chrome, safe areas, and touch feel therefore remain follow-up requirements.

## Publish-polish pass — 2 August 2026

These captures use the repository-owned Playwright Chromium runner at 1280×720.

| File | What it demonstrates |
|---|---|
| `polish-final/locker-malik.png` | Player ability and trade-off are readable before equipping |
| `polish-final/locker-basketball.png` | Basketball size, unlock gate, and rebound identity |
| `polish-final/locker-golf.png` | Golf-ball scale and fast/high-curl identity |
| `polish-final/locker-aurora.png` | Prestige trail now advertises its curl-reading utility |
| `polish-final/aurora-flight.png` | Aurora renders the complete bend as two restrained ribbons |
| `polish-final/gameplay-malik.png` | Ability and ball feel are present in the live HUD; corner flags use projected pitch anchors |
| `polish-final/wall-collapse.png` | Thunderstrike drives one defender through the authored collapse sheet |
| `polish-final/keeper-return.png` | Keeper begins the next attempt from the prior landing position instead of teleporting home |
