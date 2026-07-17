# Practical Goalkeeper Save Atlases — V2

These source boards were generated with the built-in image generation tool and
converted from flat `#FF00FF` chroma key to alpha with the installed imagegen
`remove_chroma_key.py` helper. Runtime packing is deterministic in
`scripts/build_hd_sprites.py`.

## Locked visual identity

- Athletic adult male goalkeeper, front-facing three-quarter game camera.
- Mustard-gold padded long-sleeve jersey and shorts, gold socks, white gloves,
  black boots, short dark-brown hair.
- Same face, body proportions, kit markings, bold black pixel/ink outline and
  detailed retro 2D sprite rendering as the existing keeper sheets.
- Full body and ball must remain inside every cell; no shadow, floor, labels,
  grid lines, scenery, watermark or magenta in the subject.
- Practical professional goalkeeping biomechanics; readable anticipation,
  push, contact, landing and recovery phases; no celebration poses.

## Reference images

- `keeper-dive-motion-sheet-v2-alpha.png`: identity, dive silhouette and scale.
- `keeper-low-save-sheet-v1-alpha.png`: low-save timing and body mechanics.
- `keeper-low-smother-sheet-v1-alpha.png`: low ball handling and secure holds.
- `keeper-mid-catch-sheet-v1-alpha.png`: two-glove catch mechanics.
- `keeper-top-tip-sheet-v1-alpha.png`: airborne reach and outline treatment.
- `keeper-recovery-sheet-v1-alpha.png`: turf registration and get-up mechanics.

## Prompt 1 — low parry and low catch master

Create an exact 2-row by 8-column board with exactly 16 isolated goalkeeper
figures. Both rows move toward screen-right and read left-to-right; screen-left
is produced later as a strict mirror.

Row 1 is an eight-phase low parry: ready set, subtle right preload, low push,
descent, right palm reaches just above turf, a complete open glove performs the
one-hand deflection gesture, controlled landing watching the unseen shot, and
final side landing with hands free. It contains zero footballs because gameplay
renders the physics ball separately.

Row 2 is an eight-phase low catch: ready set, right preload, hips lower, short
collapse step, both gloves scoop behind the ball near the shin, clean capture,
ball pulled tight to the chest while descending, and side landing holding the
ball securely.

Use a perfectly uniform flat `#FF00FF` backdrop. Enforce one keeper per cell,
generous gutters, consistent scale, exactly 16 keepers, no missing/overlapping
cells and no detached limbs. Row 1 contains no ball pixels; row 2 contains only
the single secured catch ball.

Successful source: `keeper-practical-low-sheet-v3-alpha.png`.

## Prompt 2 — mid-height parry/dive master

Create one exact horizontal `1 × 8` strip with exactly eight isolated
goalkeeper figures and generous gutters. It is a practical mid-height
parry/dive to screen-right. Runtime creates screen-left as a strict mirror.

The clean screen-right master shows: balanced set, lateral preload, powerful
push, takeoff with both complete hands leading at waist/chest height, horizontal
flight around 30 degrees above the turf, an open-palm parry gesture around the
unseen shot, separated empty gloves through follow-through and descent, and a
controlled side landing with both hands still visibly open and separate. It
contains zero footballs and never becomes a clasp, cup or catch pose.

Use a perfectly uniform flat `#FF00FF` backdrop. Enforce eight distinct poses,
consistent scale and identity, zero footballs, complete hands and forearms, no
high fingertip pose and no cropped or detached anatomy.

Successful source: `keeper-mid-dive-sheet-v3-alpha.png`.

## Prompt 3 — secure hold and centre get-up

Create an exact 3-row by 6-column board with exactly 18 isolated goalkeeper
figures.

Row 1 is a six-phase save-and-hold recovery from the right side: ball locked to
chest while lying, knees curl around the ball, protective roll, sit up, rise
through one knee, and finish in a balanced crouch still holding it. Row 2 is the
mirrored left-side choreography. The ball stays secure in every frame.

Row 3 is a six-phase centre get-up without the ball: low/prone chest on turf,
plant both gloves, hands-and-knees, bring one foot underneath, rise through a
squat, and finish in the goalkeeper set position.

Use a perfectly uniform flat `#FF00FF` backdrop. Enforce practical recovery
mechanics, a common turf baseline, consistent scale, no distribution motion,
no celebration, no pointing and no duplicate standing frames.

Successful source: `keeper-practical-recovery-sheet-v1-alpha.png`.

## Runtime packing contract

All runtime frames are `320 × 280` with eight pixels of bottom padding.

| Texture / file | Frames | Layout |
| --- | ---: | --- |
| `keeper-practical-low-hd` / `keeper-practical-low-sheet-hd.png` | 32 | 0–7 low parry right; 8–15 exact mirrored low parry left; 16–23 low catch right; 24–31 exact mirrored low catch left |
| `keeper-mid-dive-hd` / `keeper-mid-dive-sheet-hd.png` | 16 | 0–7 mid-height dive right; 8–15 mid-height dive left |
| `keeper-practical-recovery-hd` / `keeper-practical-recovery-sheet-hd.png` | 18 | 0–5 save-and-hold right; 6–11 save-and-hold left; 12–17 centre get-up |

The low-action parry and mid-dive sources intentionally use one clean authored
direction. Mirroring the complete packed frame — not just the isolated body —
guarantees pixel-exact reach, timing and cell registration in both directions.
No destructive football masking is used. Parry and mid-dive frames are authored
with zero football pixels and complete gloves. Low-catch and save-and-hold rows
retain their secured football because gameplay hides the simulated ball while
those control clips run.
