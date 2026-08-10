# Kick District — Own the Curve

A polished, portal-ready pixel football game built with Phaser 3 and Vite. Draw a swipe to set direction, loft, power, and curl; master four specialist strikers and eight distinct ball types; beat an animated keeper; clear objective-driven cups; and spend earned coins on matchday loadouts.

**[Play Kick District in your browser](https://isharaf6.github.io/free-kick-legend/)**

## What is included

- 50 authored career matches across five cups, with stable-ID progression and escalating objectives: corner-only finishes, bank shots, ring threading, limited-power strikes, blind shots, numbered zones, and combo challenges.
- Match hazards and defensive twists including rotating wind, fog, snow, glare, slippery run-ups, crowd pressure, moving/split/double walls, deflectors, compact goals, sweeper keepers, and two-keeper finals. The wall shuffles, splits, staggers and stretches a leg out, but it never advances on the ball: under Law 13 it holds its distance until the kick is taken.
- Fixed-step pseudo-3D ball physics at 120 Hz: full-velocity drag, Magnus curl, wind, grounded rolling, bounce, glancing post/crossbar rebounds, net damping, and frame-rate-invariant outcomes.
- A gameplay-routed set of 28 practical goalkeeper actions: full/low/mid dives, fingertip tips, upper/low parries, low/mid catches, high claims, jump catches, front/side smothers, the spread and foot saves, secure side holds, and a centre get-up. The striker uses a compact, eased contact-timed run-up, strike, follow-through, recovery, and character-specific celebration. Keepers recover and run home between attempts without teleporting.
- Robust mouse/touch swipes with pointer isolation, smoothing, resampling, invalid-gesture feedback, and live power/curl presentation.
- Score, combo, shot grades, top-corner/target bonuses, three-star mastery, first-clear rewards, and Time Attack.
- A deterministic five-shot Daily Kick, moving bonus target, seven-day reward cycle, three rotating missions, 12 achievements, claimable coins, and replay-safe rewards.
- A functional Locker with four readable striker techniques: Mica's balance, Malik's 112% Thunderstrike and wall knockdown, Nico's extra curl, and Islam's wind-resistant control. Six kits remain cosmetic.
- Seven selectable balls with deterministic flight identities: the balanced classic football (the default), snowball, basketball, golf ball, volleyball, beach ball, and tennis ball. Each changes launch, gravity, drag, curl, wind response, bounce, rolling resistance, or spin decay.
- Versioned saves with v1 migration, validation, settings, lifetime stats, daily streaks/claims, achievements, and CrazyGames Data fallback.
- CrazyGames SDK v3 lifecycle, cloud-data, completion, happy-time, and natural-break ad hooks; the bridge remains safe when the SDK is disabled or unavailable.
- True 1920×1080 Full-HD rendering over stable logical coordinates, 4× text rasterization, high-density original striker/keeper/defender sprites, a purpose-built pixel pitch whose mowing converges on the camera's own vanishing line, responsive safe areas, and layered synthesized stadium audio.
- A layered stadium: a fixed-camera supporters' end with a canonical seven-row cast and 448 individually generated face tiles per frame, a CALYNX hoarding run in six colourways and uneven widths, stewards, a photographers' pit, broadcast camera positions and wind-lean corner flags. The hoardings are a physical backstop - shots that miss thump into the advertising and rebound onto the pitch.
- The stand uses three authored 10-frame pixel-art atlases: a seamless moving loop, a goal-scored reaction, and a dedicated ball-out reaction. One canonical roster is assembled once from the generated donor art; every later pose is a bounded rigid motion of those same supporter groups, with fixed foreground rails and small state-specific arm accents. Every 960×196 frame renders at one uniform 0.5 scale to fill the 480×98 stadium band, so the camera, identity order, position and scale never drift. The goal and out sheets stream with the match pack while the moving sheet supplies the menu and cup browser. Concrete barriers carrying tifo, vomitories, floodlight pools, roof shadow and corner falloff sit over the plate; flags, flares and camera flashes remain independent props.
- The goal celebration is authored pixel art, not photography. A permanent normal-blended mortar is planted outside each post at one goal-relative world anchor and remains visible while off; a separate 10-frame additive gerb plume fires over that unchanged hardware, while a volley of six shells lifts out of the stand on staggered beats and breaks overhead. `scripts/build_goal_pyro.py` runs one seeded particle simulation and samples it per frame, so a spark occupies consecutive points along its own ballistic arc rather than being redrawn at random; colour comes from particle age, grading white-hot at the nozzle through gold and amber to a dull ember. The 12-frame shell is authored in pure luminance so a tint multiplies to a clean hue and one sheet supplies a whole display. The three generated pyro assets total about 298 kB.
- A goal punches the camera twice — a hard 90 ms jolt as the net takes the ball, then a softer 320 ms swell as the stand erupts — both bounded under three logical pixels of throw, because Phaser's shake intensity is a fraction of the 1920-pixel backing canvas rather than a distance, and anything larger smears the 4× pixel grid. Flat backdrops extend past all four edges so the displaced viewport can never sample empty world.
- There is daylight behind the goal. The turf between the goal line and the advertising projects into the band between the goal's foot and the stadium seam, so raising that seam pushes the hoardings from roughly 26 m to 33 m back and roughly triples the visible grass, while the stand tiers were rebased and grown to take back the height. Everything anchored to the seam — hoardings, stewards, the photographers' pit — is expressed as an offset from it, so the trackside cannot drift apart.
- Hoop challenges drawn as one continuous golden thread running from the ball through every gate to the finish, with the gates as pixel-rim eyes on it that light one at a time - so the route reads without the objective text. Gate centres are sampled from real scoring trajectories rather than placed by eye, which is what makes them threadable at all.
- Aim before you commit: a predicted opening arc from the real solver (wind, drag and curl included), a goal-plane reticle, a wind-drift tell, and live power/loft/curl meters.
- Scene-scoped asset streaming. Boot fetches the menu chrome, the one equipped striker and the shared moving-crowd sheet; the menu and cup browser warm the goalkeeper, defender, goal-crowd, ball-out and celebration pack into the HTTP cache while the player reads the screen, and the locker streams only the still frames its grid draws. The two reaction sheets remain off the boot critical path.

## Run and verify

Requires Node.js 20.19 or newer.

```bash
npm ci
npm run dev       # http://localhost:5173
npm test          # physics, input, save, progression, cosmetics, platform
npm run test:e2e  # real Chromium viewport, input, pause and boot-payload gates
npm run build     # production output in dist/
npm run preview   # http://localhost:4173
```

The first browser run also needs `npx playwright install chromium`. Use
`npm run test:release` for the complete unit, production-build, and browser
release gate. GitHub Pages runs that browser matrix before deploying `main`, so
an agent does not need the Codex in-app browser backend to perform a legitimate
automated playtest.

## Controls

- Drag/swipe upward from the ball, then release to shoot.
- Swipe farther upward for loft; release faster for power.
- Bow the gesture left or right and the ball follows that curve.
- Low shots can pass beneath a jumping wall; precise high finishes earn larger scores.
- Press `Tab` during a match to open the match menu.
- Restart and Exit Match are only available from that Tab menu.

## Project map

```text
src/
├── config.js                   physics, camera, shot tuning
├── pixelart.js                 authored procedural sprite maps and palette
├── ui.js                       tactile UI primitives and scene chrome
├── data/
│   ├── levels.js               50 levels, five cups, targets, seeded arcade/daily
│   ├── progression.js          daily missions, streak rewards, achievements
│   ├── assetBase.js            BASE_URL resolution shared by the asset manifests
│   ├── kickerAssets.js         per-scene striker pose streaming (menu/locker/match)
│   ├── matchAssets.js          keeper + defender match pack, and its HTTP prefetch
│   ├── keeperAssets.js         boot/deferred goalkeeper atlas manifest
│   ├── keeperMoveset.js        complete keeper animation catalog and frame maps
│   └── cosmetics.js            kits, player techniques, ball profiles, utility trails
├── systems/
│   ├── SwipeInput.js           gesture capture, smoothing, shot mapping
│   ├── LoadoutGameplay.js      deterministic player/ball trade-offs
│   ├── LevelMechanics.js       hazards, goals, rings, walls and objective rules
│   ├── ShotScoring.js          grades, combo and mastery scoring
│   ├── GoalFramePhysics.js     shared post/crossbar collision and rebound geometry
│   ├── SaveManager.js          v2 persistence, migration, currency, loadout, stats
│   ├── PlatformService.js      no-op-safe CrazyGames/portal bridge
│   └── AudioSynth.js           generated match and UI audio
├── art/
│   ├── CrowdStand.js           fixed-camera authored crowd plate
│   ├── StandDressing.js        barriers, tifo, vomitories, stand lighting
│   └── PuppetTextures.js       generated rig textures
├── objects/
│   ├── Ball.js                 fixed-step pseudo-3D solver
│   ├── Goalkeeper.js           deterministic keeper state machine/contact
│   ├── Wall.js                 moving, split and staggered formations
│   └── Kicker.js               contact-timed strike and celebration animation
└── scenes/
    ├── BootScene.js            SDK init and generated texture atlas
    ├── MenuScene.js            continue, career, daily, arcade, locker
    ├── LevelSelectScene.js     five-cup career browser
    ├── LockerScene.js          purchase/equip customization flow
    ├── ProgressScene.js        missions, achievements, streak reward track
    └── GameScene.js            fixed-step match state machine and results
```

## Portal release

1. Run `npm run test:release`.
2. Zip the contents of the freshly generated `dist/` directory with `index.html` at the archive root. Do not wrap the files in another folder.
3. Upload to the CrazyGames Developer Portal and test it in their preview environment.
4. The official SDK v3 script is already included in `index.html`. `BootScene` waits for initialization, `PlatformService` uses CrazyGames Data when available, and `GameScene` reports gameplay start/stop and career completion.
5. Midgame ads are requested only after a completed level or finished Time Attack run. Gameplay is already stopped, input is blocked while the request resolves, audio mutes only after `adStarted`, and `adError` safely restores the UI. Daily Kick also offers one optional rewarded video to double the first-completion coin reward; failure or unavailability never removes the earned base reward.

For other portals, the bridge falls back to local storage and no-op lifecycle/ad calls. If a portal forbids third-party SDK scripts, remove the CrazyGames script tag and keep the same game bundle.

Useful official references: [SDK setup](https://docs.crazygames.com/sdk/intro/), [game lifecycle](https://docs.crazygames.com/sdk/game/), [data storage](https://docs.crazygames.com/sdk/data/), and [advertisement requirements](https://docs.crazygames.com/requirements/ads/).

The keeper, ball, defender and player HD sources are preserved in `assets/source/`; their optimized runtime frames live in `public/assets/hd/`. Keeper and defender assets are rebuilt with `scripts/build_hd_sprites.py`; every selectable striker's eight-pose, six-kit set is rebuilt with `scripts/build_striker_sprites.py`. The three checked-in generated crowd boards live in `assets/source/crowd-v3/` and are cropped into exact 2×5 runtime atlases by `scripts/build_crowd_sprites.py`. Their complete generation prompts and references are preserved beside them. The practical keeper contract is documented in `assets/source/KEEPER-PRACTICAL-SAVES-V2-PROMPT.md`; the wider situational/distribution/reaction source contract remains in `assets/source/KEEPER-COMPLETE-MOVESET-V1-PROMPT.md`.

## Tuning

Base physics and shot feel are centralized in `src/config.js`; per-ball and per-player trade-offs live in `src/data/cosmetics.js` and are composed by `src/systems/LoadoutGameplay.js`. Career difficulty and objective content live in `src/data/levels.js`. Prices and unlock gates remain in `src/data/cosmetics.js`.
