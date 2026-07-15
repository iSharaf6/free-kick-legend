# Goalkeeper Secondary Motion Sprite Sources — V1

These boards extend the existing amber-yellow goalkeeper without replacing any
earlier source art. They were generated with the built-in image generator using
the existing goalkeeper animation and recovery boards as identity/style
references. Each generated board used a flat `#ff00ff` background and was
converted to RGBA locally with the imagegen chroma-key helper.

## Files and exact frame order

### `keeper-footwork-return-sheet-v1-alpha.png`

Canvas: 1536 × 1024 RGBA. Exactly 10 sprites in a 2 × 5 layout.

- Top row, screen-left: ready/load; left foot initiates; right foot closes;
  left foot plants/brakes; balanced ready.
- Bottom row, screen-right: ready/load; right foot initiates; left foot closes;
  right foot plants/brakes; balanced ready.

### `keeper-handling-claims-sheet-v1-alpha.png`

Canvas: 1536 × 1024 RGBA. Exactly 13 sprites in a 4 / 4 / 5 layout.

- Row 1, low scoop: sink/reach; knee-drop contact; two-hand scoop; kneeling
  secure.
- Row 2, chest catch: ready/track; sternum-height glove contact; cushion/absorb;
  secure to chest.
- Row 3, high claim: load/track; takeoff; overhead contact; descend/secure;
  planted landing.

### `keeper-high-claim-sheet-v1-alpha.png`

Canvas: 2172 × 724 RGBA. Exactly 5 sprites in one horizontal row. This is the
preferred high-claim sequence because it exaggerates the vertical clearance for
clear gameplay readability.

1. Anticipation: planted load, eyes and gloves track the high ball.
2. Takeoff: both soles clear the baseline, one knee leads.
3. Apex contact: maximum height, two-glove catch above forehead.
4. Descent: still airborne, ball drawn toward upper chest.
5. Land/secure: both boots return to the original baseline, knees compress.

## Exact prompts

### Footwork / return

```text
Use case: stylized-concept
Asset type: production 2D football game goalkeeper animation sprite sheet, identity-matched continuation
Input images: Image 1 is the exact keeper identity and pixel-art style reference; Image 2 is the exact keeper recovery body proportions and grounding reference.
Primary request: Create exactly TEN separate full-body animation sprites of the same goalkeeper doing grounded lateral shuffle-and-return footwork. Arrange as a precise 2-row by 5-column sheet, read left-to-right.
Frame order:
TOP ROW, screen-left sequence: 1 ready/load, 2 left foot initiates step, 3 right foot closes without crossing, 4 left foot plants and brakes with visible compressed ankle/knee, 5 returns to balanced ready stance.
BOTTOM ROW, screen-right sequence: exact directional counterpart: 1 ready/load, 2 right foot initiates step, 3 left foot closes without crossing, 4 right foot plants and brakes with visible compressed ankle/knee, 5 returns to balanced ready stance.
Subject identity: exactly the same athletic adult male goalkeeper as the references: short dark brown hair, strong brows, amber-yellow long-sleeve jersey and matching shorts, yellow socks, white padded gloves, black football boots. Keep facial identity, outfit markings, body build, palette and sprite scale consistent in every frame.
Style/medium: premium hand-drawn 16-bit/32-bit pixel art, crisp dark pixel outlines, controlled cluster shading, warm golden highlights, game-ready silhouette, same viewing angle and detail density as the references.
Pose/motion: feet must remain on one shared invisible turf baseline; show visibly distinct foot contact, weight transfer, heel/toe planting and knee compression. No floating, skating, running, hopping, crossed legs, diving or teleporting. Each neighboring frame should interpolate naturally.
Composition/framing: exactly 10 isolated sprites, evenly spaced grid, generous padding around each, no overlap, no crop, no borders, no grid lines, no labels, no text, no arrows, no frame numbers.
Scene/backdrop: perfectly flat solid #ff00ff chroma-key background, completely uniform edge to edge.
Constraints: The background must have no shadows, gradients, texture, reflections, floor plane, or lighting variation. Keep all sprites fully separated from background with crisp pixel edges. Do not use #ff00ff anywhere in the keeper. No cast shadow, contact shadow, reflection, football, goal, watermark, caption, logo, or text. Exactly 2 rows and exactly 5 sprites per row.
```

### Low scoop / chest catch / high claim

```text
Use case: stylized-concept
Asset type: production 2D football game goalkeeper handling animation sprite sheet, identity-matched continuation
Input images: Image 1 is the exact keeper identity, costume, football and pixel-art style reference; Image 2 is the exact keeper body proportions, recovery mechanics and grounding reference.
Primary request: Create exactly THIRTEEN separate full-body animation sprites of the same goalkeeper performing three seamless ball-handling actions. Arrange as three clearly separated horizontal rows, read left-to-right.
ROW 1 — exactly 4 low scoop / secure frames: 1 sink hips and reach toward a low rolling ball, 2 gloves meet directly behind ball with one knee dropping, 3 ball scooped safely into both hands against lower torso, 4 kneeling secure pose hugging ball with elbows tucked.
ROW 2 — exactly 4 chest catch / absorb frames: 1 ready stance receiving body-height ball, 2 both gloves contact ball in front of sternum, 3 elbows bend and shoulders roll forward to cushion impact, 4 ball securely wrapped to chest in balanced stance.
ROW 3 — exactly 5 high claim / land frames: 1 knees load and eyes track high ball, 2 vertical takeoff with arms rising, 3 highest-point two-glove catch above forehead with ball securely between palms, 4 controlled descent with ball pulled toward upper chest, 5 both boots planted on shared baseline, knees flexed, ball secure to chest.
Subject identity: exactly the same athletic adult male goalkeeper as the references: short dark brown hair, strong brows, amber-yellow long-sleeve jersey and matching shorts, yellow socks, white padded gloves, black football boots. Keep face, outfit markings, body build, palette and sprite scale consistent in every frame.
Football: one classic black-and-white football per frame only where described; consistent size, crisp pixel-art rendering, clearly held or approached; never duplicate the ball within one frame.
Style/medium: premium hand-drawn 16-bit/32-bit pixel art, crisp dark pixel outlines, controlled cluster shading, warm golden highlights, game-ready silhouette, same fixed front-facing viewpoint and detail density as the references.
Pose/motion: each neighboring frame must interpolate naturally. Grounded frames share one invisible turf baseline. Show believable glove contact, elbow cushioning, center-of-mass shift, knee flexion and landing compression. No floating except the intentional jump frames in row 3.
Composition/framing: exactly 13 isolated sprites. First row exactly 4 sprites, second row exactly 4 sprites, third row exactly 5 sprites. Even spacing, generous padding, no overlaps, no crops, no borders, no grid lines, no labels, no text, no arrows, no frame numbers.
Scene/backdrop: perfectly flat solid #ff00ff chroma-key background, completely uniform edge to edge.
Constraints: The background must have no shadows, gradients, texture, reflections, floor plane, or lighting variation. Keep sprites fully separated with crisp pixel edges. Do not use #ff00ff anywhere in the keeper or football. No cast shadow, contact shadow, reflection, goal, net, field, watermark, caption, logo, or text.
```

### Dedicated high claim

```text
Use case: stylized-concept
Asset type: production 2D football game goalkeeper high-claim animation sprite sheet, identity-matched continuation
Input images: Image 1 is the exact keeper identity, costume and premium pixel-art reference. Image 2 is the handling reference; improve only the high-claim motion by making lift, apex and landing physically unmistakable.
Primary request: Create exactly FIVE separate full-body sprites of the same goalkeeper claiming a high football, arranged in one horizontal row, read left-to-right.
Exact frame order:
1 ANTICIPATION — both boots planted on one invisible turf baseline, knees deeply loaded, torso tall, eyes up, open gloves beginning to rise, football above and slightly in front.
2 TAKEOFF — explosive vertical push, both boots now visibly clear of the original baseline, one knee leading, arms extending toward the descending ball.
3 APEX CONTACT — keeper clearly at maximum airborne height with both boots substantially clear of baseline, body fully lengthened, both white gloves enclosing exactly one black-and-white football above the forehead.
4 DESCENT — still airborne but lower than frame 3, knees beginning to tuck, elbows bend and ball is pulled securely down toward upper chest.
5 LAND / SECURE — both boots visibly planted back on the original baseline, knees compressed symmetrically to absorb force, torso balanced, ball hugged securely to chest.
Subject identity: exactly the same athletic adult male goalkeeper as the references: short dark brown hair, strong brows, amber-yellow long-sleeve jersey and matching shorts, yellow socks, white padded gloves, black football boots. Keep face, outfit markings, body build, palette, proportions and sprite scale consistent across all frames.
Football: exactly one consistent-size classic black-and-white football in every frame; no duplicate balls.
Style/medium: premium hand-drawn 16-bit/32-bit pixel art, crisp dark pixel outlines, controlled pixel-cluster shading, warm golden highlights, game-ready silhouette, fixed front-facing viewpoint, matching reference detail density.
Motion requirements: preserve one common world baseline across the five cells. Frame 1 and frame 5 boots touch that baseline. Frames 2, 3 and 4 must have clear empty background between both boot soles and that baseline. The apex frame must be visibly highest. Neighboring poses must interpolate naturally without teleporting, limb duplication, sliding or scale changes.
Composition/framing: exactly five isolated sprites in one horizontal row, evenly spaced, generous padding, no overlap, no crop, no borders, no grid lines, no labels, no text, no arrows, no frame numbers.
Scene/backdrop: perfectly flat solid #ff00ff chroma-key background, completely uniform edge to edge.
Constraints: no shadows, gradients, texture, reflections, floor plane, lighting variation, goal, net, field, watermark, caption, logo, or text. Do not use #ff00ff anywhere in keeper or football. Crisp pixel edges.
```

## Alpha validation

- All three files are RGBA with fully transparent corners.
- Footwork sheet: exactly 5 isolated sprites per row and zero-pixel baseline
  spread inside each direction.
- Handling sheet: exactly 4 / 4 / 5 staged animation cells.
- Dedicated high claim: exactly 5 cells; planted frames 1 and 5 share the same
  bottom edge, while frames 2–4 clear it.
- No visible magenta-like pixels remain where alpha is greater than 12.
