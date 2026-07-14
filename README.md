# Free Kick Legend — Night Match '98

A polished, portal-ready pixel football game built with Phaser 3 and Vite. Draw a swipe to set direction, loft, power, and curl; beat an animated keeper; clear objective-driven cups; and spend earned coins on visual-only matchday customizations.

**[Play Free Kick Legend in your browser](https://isharaf6.github.io/free-kick-legend/)**

## What is included

- 50 career matches across five cups, with targets, crosswinds, curve challenges, multi-goal finals, and stable-ID progression.
- Fixed-step pseudo-3D ball physics at 120 Hz: full-velocity drag, Magnus curl, wind, grounded rolling, bounce, glancing post/crossbar rebounds, net damping, and frame-rate-invariant outcomes.
- Pose-based goalkeeper contact with deterministic read, set, dive, catch, parry, and recovery states.
- Robust mouse/touch swipes with pointer isolation, smoothing, resampling, invalid-gesture feedback, and live power/curl presentation.
- Score, combo, shot grades, top-corner/target bonuses, three-star mastery, first-clear rewards, and Time Attack.
- A functional Locker with six kits, six balls, six trails, earned coins, progression gates, and no pay-to-win upgrades.
- Versioned saves with v1 migration, validation, settings, lifetime stats, daily-ready records, and CrazyGames Data fallback.
- CrazyGames SDK v3 lifecycle, cloud-data, completion, happy-time, and natural-break ad hooks; the bridge remains safe when the SDK is disabled or unavailable.
- True 1920×1080 Full-HD rendering over stable logical coordinates, 4× text rasterization, high-density original striker/keeper/defender sprites, responsive safe areas, and layered synthesized stadium audio.

## Run and verify

```bash
npm install
npm run dev       # http://localhost:5173
npm test          # physics, input, save, progression, cosmetics, platform
npm run build     # production output in dist/
npm run preview   # http://localhost:4173
```

## Controls

- Drag/swipe upward from the ball, then release to shoot.
- Swipe farther upward for loft; release faster for power.
- Bow the gesture left or right and the ball follows that curve.
- Low shots can pass beneath a jumping wall; precise high finishes earn larger scores.

## Project map

```text
src/
├── config.js                   physics, camera, shot tuning
├── pixelart.js                 authored procedural sprite maps and palette
├── ui.js                       tactile UI primitives and scene chrome
├── data/
│   ├── levels.js               50 levels, five cups, targets, rewards, seeded arcade
│   └── cosmetics.js            visual-only kit, ball, and trail catalog
├── systems/
│   ├── SwipeInput.js           gesture capture, smoothing, shot mapping
│   ├── ShotScoring.js          grades, combo and mastery scoring
│   ├── GoalFramePhysics.js     shared post/crossbar collision and rebound geometry
│   ├── SaveManager.js          v2 persistence, migration, currency, loadout, stats
│   ├── PlatformService.js      no-op-safe CrazyGames/portal bridge
│   └── AudioSynth.js           generated match and UI audio
├── objects/
│   ├── Ball.js                 fixed-step pseudo-3D solver
│   ├── Goalkeeper.js           deterministic keeper state machine/contact
│   ├── Wall.js                 jumping defenders and volume-aware blocks
│   └── Kicker.js               striker pose/celebration presentation
└── scenes/
    ├── BootScene.js            SDK init and generated texture atlas
    ├── MenuScene.js            continue, career, arcade, locker
    ├── LevelSelectScene.js     five-cup career browser
    ├── LockerScene.js          purchase/equip customization flow
    └── GameScene.js            fixed-step match state machine and results
```

## Portal release

1. Run `npm test` and `npm run build`.
2. Zip the contents of `dist/` with `index.html` at the archive root. The repository's `free-kick-legend.zip` is the current ready-to-upload build.
3. Upload to the CrazyGames Developer Portal and test it in their preview environment.
4. The official SDK v3 script is already included in `index.html`. `BootScene` waits for initialization, `PlatformService` uses CrazyGames Data when available, and `GameScene` reports gameplay start/stop and career completion.
5. Midgame ads are requested only after a completed level or finished Time Attack run. Gameplay is already stopped, input is blocked while the request resolves, audio mutes only after `adStarted`, and `adError` safely restores the UI. No rewarded button is shown during Basic Launch.

For other portals, the bridge falls back to local storage and no-op lifecycle/ad calls. If a portal forbids third-party SDK scripts, remove the CrazyGames script tag and keep the same game bundle.

Useful official references: [SDK setup](https://docs.crazygames.com/sdk/intro/), [game lifecycle](https://docs.crazygames.com/sdk/game/), [data storage](https://docs.crazygames.com/sdk/data/), and [advertisement requirements](https://docs.crazygames.com/requirements/ads/).

The generated HD art source is preserved at `assets/source/football-sprite-sheet-source.png`; optimized transparent runtime frames live in `public/assets/hd/` and can be rebuilt with `scripts/build_hd_sprites.py` after regenerating the alpha source.

## Tuning

Physics and shot feel are centralized in `src/config.js`. Career difficulty and objective content live in `src/data/levels.js`. Cosmetic prices and unlock gates live in `src/data/cosmetics.js`.
