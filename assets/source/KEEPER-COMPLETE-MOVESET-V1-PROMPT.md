# Goalkeeper complete moveset v1

This pass completes the production goalkeeper library with four non-destructive
alpha source boards generated from the existing mustard-gold keeper references.

- `keeper-situational-punch-sheet-v1-alpha.png`: 24 figures in four 6-frame
  rows: narrow/spread block, two-fist punch, left punch, right punch.
- `keeper-distribution-sheet-v1-alpha.png`: 28 figures in four rows: six-frame
  underarm rolls in both directions, six-frame overarm throw, then ten key poses
  for short pass, driven pass, goal kick, drop kick and side volley.
- `keeper-foot-distribution-sheet-v1-alpha.png`: 30 figures in five 6-frame
  rows, expanding every foot restart into preparation, contact and follow-through.
- `keeper-reactions-sheet-v1-alpha.png`: 18 figures in three 6-frame rows:
  concede, big-save celebration and organising/pointing.

All boards use the existing keeper animation, handling and recovery sheets as
strict identity, kit, scale, fixed-camera, pixel-art and grounding references.
They were produced with the built-in image generator on a flat `#ff00ff`
background, then converted to alpha with the installed chroma-key helper using
`--auto-key border --soft-matte --transparent-threshold 12
--opaque-threshold 220 --despill`.

## Shared production constraints

- Same athletic adult male keeper, face, dark-brown hair, mustard-gold kit,
  white gloves and black boots in every frame.
- Premium high-definition retro pixel art with crisp dark outlines and stable
  body scale from the fixed front-facing free-kick camera.
- One complete figure per cell, no overlaps, crops, labels, text, shadows,
  detached limbs, duplicate poses or motion trails.
- Grounded poses share a common invisible turf baseline.
- Gameplay renders its own ball for saves. Distribution source poses include a
  single classic ball so hand and foot contact remain readable.

## Runtime frame order

Situational/punch atlas (`keeper-situational-punch-sheet-hd.png`):

- Frames 0–5: forward attack step, narrow block, spread save and recovery.
- Frames 6–11: two-fist punch clear.
- Frames 12–17: single-hand punch screen-left.
- Frames 18–23: single-hand punch screen-right.

Distribution atlas (`keeper-distribution-sheet-hd.png`):

- Frames 0–5: underarm roll screen-left.
- Frames 6–11: underarm roll screen-right.
- Frames 12–17: overarm throw.
- Frames 18–19: short pass; 20–21: driven pass; 22–23: goal kick;
  24–25: drop kick; 26–27: side volley / half-volley.

Foot distribution atlas (`keeper-foot-distribution-sheet-hd.png`):

- Frames 0–5: short pass with feet.
- Frames 6–11: drop kick.
- Frames 12–17: goal kick / placed kick.
- Frames 18–23: driven pass.
- Frames 24–29: side volley / half-volley.

Reaction atlas (`keeper-reactions-sheet-hd.png`):

- Frames 0–5: concede reaction.
- Frames 6–11: big-save celebration.
- Frames 12–17: organise wall / point.
