# Match crowd animation v1

This pack replaces the older tiled match crowd with the same authored stadium
look used by the goal celebration. It intentionally contains no permanent
fireworks, flares, score copy, players, goal, pitch, or advertising boards;
the existing goal-celebration layer can sit directly over it without a visible
art-style switch.

## Deliverables

- `crowd-match-seed-v1.png`: approved neutral frame, 960x218.
- `frames/crowd-match-00.png` through `crowd-match-29.png`: 30 exact-size frames.
- `crowd-match-animated-v1-preview.gif`: 12 fps seamless preview at 480x109.
- `crowd-match-animated-v1-contact.png`: six sampled frames for visual review.
- `../../../public/assets/hd/crowd-match-animated-v1.png`: 3x10 Phaser atlas.
- `../../../public/assets/hd/crowd-match-animated-v1.json`: runtime metadata and checksum.

## Phaser handoff

```js
this.load.spritesheet('crowd-match-animated-v1',
  'assets/hd/crowd-match-animated-v1.png', {
    frameWidth: 960,
    frameHeight: 218,
    endFrame: 29
  });

this.anims.create({
  key: 'crowd-match-idle-v1',
  frames: this.anims.generateFrameNumbers('crowd-match-animated-v1', {
    start: 0,
    end: 29
  }),
  frameRate: 12,
  repeat: -1
});

const crowd = this.add.sprite(240, 0, 'crowd-match-animated-v1', 0)
  .setOrigin(0.5, 0)
  .setDisplaySize(480, 109)
  .play('crowd-match-idle-v1');
```

The 960:218 source ratio and recommended 480x109 display ratio are identical,
so the crowd must not be stretched. Frame 00 is the exact generated seed and
is the reduced-motion fallback. If the pause overlay does not pause the Phaser
scene itself, explicitly call `crowd.anims.pause()` and `crowd.anims.resume()`.

Rebuild the pack with `scripts/build_crowd_animation_30f.py` after changing the
seed. The script locks the architecture and floodlights while applying only
integer-pixel supporter motion and camera flashes.
