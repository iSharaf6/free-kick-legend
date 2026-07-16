# Goalkeeper save families v4

This pass used the built-in image generator and existing keeper alpha sheets as
strict references. Five `2×8` chroma-key boards produced exactly 80 new poses:

| Source | Height/speed line | Direction rows |
| --- | --- | --- |
| `keeper-low-smother-sheet-v1-alpha.png` | slow shots below 0.66m | right / left |
| `keeper-mid-catch-sheet-v1-alpha.png` | 1.02–1.36m | right / left |
| `keeper-upper-parry-sheet-v1-alpha.png` | 1.36–2.02m | right / left |
| `keeper-top-tip-sheet-v1-alpha.png` | above 2.02m | right / left |
| `keeper-reflex-foot-sheet-v1-alpha.png` | hard shots below 0.58m | right / left |

Every generated source used this shared prompt block:

```text
Use case: stylized-concept
Asset type: production 2D football game goalkeeper sprite-animation source sheet
Input images: existing goalkeeper sheets are strict identity, kit, anatomy,
fixed-camera, pixel-art, grounding and motion-continuity references.
Primary request: Create exactly SIXTEEN distinct sequential full-body sprites of
the same goalkeeper, arranged as a perfectly regular 2-row by 8-column contact
sheet, read left-to-right. Row 1 travels screen-right. Row 2 is the natural
direction-authored screen-left counterpart, also ready-to-finish left-to-right.
Subject identity: the exact same athletic adult male goalkeeper: short dark-brown
hair, identical face and proportions, mustard-gold long-sleeve jersey and shorts,
mustard-gold socks, white padded gloves, black boots, crisp dark outlines.
Preserve exact kit, palette, body scale, face, anatomy, pixel density and fixed
front-facing free-kick camera.
Style/medium: premium high-definition retro pixel art matching the references,
crisp intentional pixel clusters, limited palette, strong readable silhouettes,
detailed fabric folds, no painterly blur and no smooth vector rendering.
Motion: adjacent frames change modestly with coherent root travel. Planted frames
share one identical invisible turf baseline. No skating, floating, teleporting,
scale popping, direction inversion, backward-facing body or impossible anatomy.
Composition/framing: exactly 2 rows by 8 columns; exactly one complete keeper per
cell; consistent scale; all limbs visible; generous separation; no overlap,
crop, grid, divider, labels, arrows or frame numbers.
Scene/backdrop: perfectly flat solid #ff00ff chroma-key background, completely
uniform edge-to-edge, with no shadow, gradient, texture, floor plane, reflection
or lighting variation.
Constraints: exactly 16 figures total and 8 per row; no football because gameplay
renders it separately; no duplicate poses; no missing/detached limbs; no
cast/contact shadow; no motion trails or particles; no text, logo or watermark;
do not use #ff00ff inside the goalkeeper.
Output intent: clean chroma-key source for deterministic alpha-atlas extraction.
```

The family-specific motion blocks were:

```text
LOW SMOTHER — right row: balanced ready; short right adjustment; hips sink and
both gloves lower; right knee drops behind the ball line; low push and two hands
reach; gloves close around an imagined slow rolling ball near turf; body folds
safely over it; side-kneeling secure finish. Left row: exact counterpart.

MID CATCH — right row: balanced ready; quick right adjustment; hips load left
push-off leg; torso angles right and gloves form a W; low diagonal launch; both
gloves meet an imagined ball at waist height; elbows cushion it toward the ribs;
controlled side landing. Left row: exact counterpart.

UPPER PARRY — right row: balanced ready; right adjustment; deep left-leg load
with gloves chest-high; explosive diagonal push; early flight with both arms
rising; maximum two-glove extension at shoulder/head height; wrists redirect an
imagined powerful ball outward; controlled shoulder-and-hip descent. Left row:
exact counterpart.

TOP TIP — right row: balanced set; quick right read step; deep left-leg coil;
explosive diagonal launch; early flight with lead arm reaching; near-horizontal
full stretch; maximum one-hand fingertip contact pose; post-contact rotation and
descent. Left row: exact counterpart.

REFLEX FOOT — right row: balanced ready; sharp right read; weight loads left leg;
right hip opens while gloves stay low; right boot shoots outward along turf;
maximum instep block with right leg extended and left knee bent; rebound
follow-through with torso counterbalancing; regain compact stance. Left row:
exact counterpart.
```

The flat-magenta results were converted with the installed imagegen helper using
`--auto-key border --soft-matte --transparent-threshold 12
--opaque-threshold 220 --despill`. Validation found 16 large connected figures
and transparent corners in every output. `scripts/build_hd_sprites.py` normalizes
every pose by body length, registers it to the frame baseline and builds five
`2560×560` Phaser atlases with `320×280` frames.
