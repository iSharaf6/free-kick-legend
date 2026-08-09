# Match crowd reactions v1

Two 30-frame, one-shot reactions built from the approved Kick District crowd
art. Both keep every frame at 960x218 and should render at 480x109, preserving
the exact source ratio.

## Goal reaction

- Source: the existing `goal-celebration-stand-v1.png`, including its aerial
  fireworks, flares, flags, banners and lively crowd.
- Motion: two rising crowd waves, stronger flag/supporter movement, gold lift
  and multiple camera flashes.
- Timing: 30 frames at 18 fps, play once, then return to idle.
- Runtime atlas: `../../../public/assets/hd/crowd-match-goal-v1.png`.
- Metadata: `../../../public/assets/hd/crowd-match-goal-v1.json`.
- Source frames: `goal/frames/crowd-goal-00.png` through
  `goal/frames/crowd-goal-29.png`.
- Preview: `crowd-match-goal-v1-preview.gif`.

Use for `GOAL`, `TOP BINS` and `WORLD CLASS` outcomes. It replaces the opaque
static celebration stand during the reaction; the existing transparent gold
fountain sprites can remain above it.

## Ball-out reaction

- Source: the neutral generated match stand used by the idle animation.
- Motion: collective recoil, a small disappointed downward dip and recovery.
- Timing: 30 frames at 15 fps, play once, then return to idle.
- Runtime atlas: `../../../public/assets/hd/crowd-match-out-v1.png`.
- Metadata: `../../../public/assets/hd/crowd-match-out-v1.json`.
- Source frames: `out/frames/crowd-out-00.png` through
  `out/frames/crowd-out-29.png`.
- Preview: `crowd-match-out-v1-preview.gif`.

Use for `OFF TARGET`, `OVER THE BAR` and other true ball-out outcomes. Do not
use it for keeper saves or wall blocks unless that is a deliberate design
choice.

## Phaser handoff

Load both PNG files as spritesheets with `frameWidth: 960`,
`frameHeight: 218`, and `endFrame: 29`. Create these animations:

```js
this.anims.create({
  key: 'crowd-match-goal-v1',
  frames: this.anims.generateFrameNumbers('crowd-match-goal-v1', {
    start: 0,
    end: 29
  }),
  frameRate: 18,
  repeat: 0
});

this.anims.create({
  key: 'crowd-match-out-v1',
  frames: this.anims.generateFrameNumbers('crowd-match-out-v1', {
    start: 0,
    end: 29
  }),
  frameRate: 15,
  repeat: 0
});
```

On `animationcomplete`, restore the neutral crowd texture and play
`crowd-match-idle-v1`. For reduced motion, show frame 00 only. Pause and resume
the active crowd animation with the match pause state.
