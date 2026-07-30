# Playtest evidence index

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
