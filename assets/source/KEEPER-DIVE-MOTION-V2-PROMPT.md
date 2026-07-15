# Goalkeeper dive motion source v2

This source expands the goalkeeper's airborne side-dive motion while preserving
the fixed free-kick camera and the mustard-gold keeper identity established by
`keeper-animation-sheet-v1-alpha.png` and
`keeper-recovery-sheet-v1-alpha.png`.

## Source artifact

- Alpha source: `keeper-dive-motion-sheet-v2-alpha.png`
- Canvas: `1536×1024` RGBA
- Layout: four rows by six columns, 24 separated figures
- Direction convention: screen-right means travel toward the right edge of the
  game screen; screen-left means travel toward the left edge
- Ball convention: no ball is baked into any frame because gameplay renders it
  separately

The source was created with the built-in image generator on a flat `#ff00ff`
chroma-key background, then converted to alpha with the installed local
`remove_chroma_key.py` helper using `--auto-key border --soft-matte
--transparent-threshold 60 --opaque-threshold 220 --despill`.
Validation found exactly 24 large connected sprite components, six in every row,
with transparent corners and no detached components.

## Exact frame order

Frames are read left-to-right in each row, then top-to-bottom.

### Screen-right dive

- `0`: balanced ready set
- `1`: quick micro-shuffle right with weight transfer
- `2`: deep anticipation crouch loading the left push-off leg
- `3`: planted side-load with the hips beginning to turn
- `4`: explosive push-off with the trailing foot leaving turf
- `5`: launch, torso tipping diagonally right, gloves initiating the reach
- `6`: early flight, body lengthening
- `7`: mid-flight, hips and shoulders approaching horizontal
- `8`: maximum two-hand extension toward an imagined high ball
- `9`: one-hand parry/contact follow-through
- `10`: post-contact descent with safe torso rotation
- `11`: shoulder-and-hip turf impact into a short slide

### Screen-left dive

- `12`: balanced ready set
- `13`: quick micro-shuffle left with weight transfer
- `14`: deep anticipation crouch loading the right push-off leg
- `15`: planted side-load with the hips beginning to turn
- `16`: explosive push-off with the trailing foot leaving turf
- `17`: launch, torso tipping diagonally left, gloves initiating the reach
- `18`: early flight, body lengthening
- `19`: mid-flight, hips and shoulders approaching horizontal
- `20`: maximum two-hand extension toward an imagined high ball
- `21`: one-hand parry/contact follow-through
- `22`: post-contact descent with safe torso rotation
- `23`: shoulder-and-hip turf impact into a short slide

Frames `11` and `23` are intended to flow into the corresponding first impact
frames in `keeper-recovery-sheet-v1-alpha.png`.

## Generation prompt

```text
Use case: stylized-concept
Asset type: production 2D football game goalkeeper sprite-animation source sheet
Input images: Image 1 is the strict main identity, kit, anatomy, fixed-camera and pixel-art reference; Image 2 is the strict ground-recovery continuity reference.
Primary request: Create exactly 24 distinct sequential animation sprites of the same goalkeeper, arranged as a perfectly regular four-row by six-column contact sheet. This expands each side-dive into twelve readable phases for seamless in-game interpolation.
Scene/backdrop: perfectly flat solid #ff00ff chroma-key background for local removal. The background must be one uniform exact-looking color with no shadows, gradients, texture, reflections, floor plane, grid lines, dividers, labels, or lighting variation.
Subject identity: the exact same adult male goalkeeper from the reference sheets: short dark-brown hair, same face and athletic proportions, mustard-gold long-sleeve jersey and matching shorts, mustard-gold socks, white padded gloves, black boots, dark outlines. Preserve the exact kit design, palette, body scale, face, hair, anatomy, pixel density, outline weight, fabric detail and highlight direction.
Camera and orientation: locked fixed free-kick camera from the shooter’s viewpoint; goalkeeper faces toward the viewer exactly like the references. Screen-right means the figure travels toward the right edge of the sheet. Screen-left means the figure travels toward the left edge. Author both directions naturally; do not simply mirror pixels.
Style/medium: premium high-definition retro pixel art matching the references exactly, crisp intentional pixel clusters, limited palette, strong readable silhouettes, detailed anatomy and fabric folds, no painterly blur or smooth vector rendering.
Composition/framing: four rows and six evenly spaced columns; one full goalkeeper per cell; consistent scale; all body parts fully visible; generous magenta separation; no overlaps; identical empty margins; no football because the game renders the ball separately.
Exact frame order:
Row 1, screen-right frames 0–5: balanced ready set; quick micro-shuffle right with weight transfer; deep anticipation crouch loading the left push-off leg; planted side-load with hips beginning to turn; explosive push-off with trailing foot just leaving turf; launch with torso tipped diagonally right and both gloves initiating the reach.
Row 2, screen-right frames 6–11: early flight with body lengthening; mid-flight with hips and shoulders nearly horizontal; maximum two-hand extension toward an imagined high ball; one-hand parry/contact follow-through with lead glove flexed naturally and other hand supporting; post-contact descent with torso rotating safely and arms preparing for turf; shoulder-and-hip turf impact transitioning into a short slide, matching the start of Image 2 recovery.
Row 3, screen-left frames 12–17: balanced ready set; quick micro-shuffle left with weight transfer; deep anticipation crouch loading the right push-off leg; planted side-load with hips beginning to turn; explosive push-off with trailing foot just leaving turf; launch with torso tipped diagonally left and both gloves initiating the reach.
Row 4, screen-left frames 18–23: early flight with body lengthening; mid-flight with hips and shoulders nearly horizontal; maximum two-hand extension toward an imagined high ball; one-hand parry/contact follow-through with lead glove flexed naturally and other hand supporting; post-contact descent with torso rotating safely and arms preparing for turf; shoulder-and-hip turf impact transitioning into a short slide, matching the start of Image 2 recovery.
Motion continuity: adjacent frames must change only a modest amount; hands, torso angle, knees, push-off foot, and body height should advance progressively with no teleporting, pose inversion, or abrupt scale change. Both sequences must read clearly left-to-right within their two-row blocks.
Constraints: exactly 24 figures total; exactly 6 figures per row; no extra people; no duplicated poses; no missing limbs; no detached gloves or boots; no ball; no cast shadow; no contact shadow; no motion streaks; no particles; no text; no numbers; no logos; no watermark; do not use #ff00ff inside the goalkeeper.
Output intent: clean chroma-key sprite source sheet suitable for component extraction and deterministic repacking into an alpha atlas.
```
