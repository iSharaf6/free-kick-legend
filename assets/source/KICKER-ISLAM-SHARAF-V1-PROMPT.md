# Islam Sharaf Selectable Striker — V1

## Source contract

- Identity reference: the user-supplied `IMG_2014.jpg` (used for generation only; the private photo is not copied into the repository).
- Style and pose reference: `assets/source/football-sprite-sheet-source.png`.
- Generated chroma strip: `assets/source/kicker-islam-sharaf-sheet-v1-chroma.png`.
- Approved transparent strip: `assets/source/kicker-islam-sharaf-sheet-v1-alpha.png`.
- Runtime builder: `scripts/build_striker_sprites.py`.

## Generation prompt

```text
Use case: identity-preserve
Asset type: production five-pose character animation strip for the existing 2D browser game Free Kick Legend.
Input images: Image 1 is the identity reference for the new adult football player; Image 2 is the exact in-game style, camera angle, pose order, proportions, rendering density, and navy/gold kit reference.

Create one single horizontal row containing exactly five isolated full-body pixel-art sprites of the SAME new player, matching the five striker poses shown across the TOP ROW of Image 2, in this exact left-to-right order:
1) idle standing from behind, head turned slightly toward screen-right
2) ready/run-up from behind, leaning and stepping toward screen-right
3) right-foot strike/contact from behind, kicking leg extended toward screen-right
4) follow-through from behind, kicking leg sweeping across and body rotated
5) celebration from behind, both fists raised overhead

Identity from Image 1:
- young adult male footballer
- medium olive-brown complexion
- compact athletic/muscular build
- dense short black curly hair with a clean tapered silhouette
- dark eyebrows
- short moustache and neat chin/jaw facial hair, only where the turned head makes it visible
- preserve the recognisable hairline, head shape, skin tone, and athletic proportions
Do not include the phone, mirror, bathroom, lifted shirt, grey sweatpants, or real-world jersey from Image 1.

Outfit:
- use exactly the fictional navy football kit with gold trim from the top row of Image 2
- navy short-sleeve jersey, navy shorts, narrow gold collar/cuffs/side stripes
- white knee socks with small gold/navy bands
- black boots with restrained gold studs/highlights
- no logos, no text, no numbers, no brands

Style:
- match Image 2's authentic late-16-bit/early-32-bit pixel sprite art exactly
- crisp hand-placed pixel clusters, hard nearest-neighbour edges, dark warm outline, restrained shading
- same rear three-quarter facing direction, same figure height and scale, same anatomy, same baseline, same level of detail
- production game asset, not concept art, not smooth digital painting, not vector art, not 3D
- every frame must clearly be the same person

Composition:
- landscape canvas
- exactly five equal-width slots in one horizontal row
- center one player in each slot with generous separation and padding
- all boots share one consistent bottom baseline
- no footballs, props, shadows, scenery, labels, dividers, borders, captions, UI, or extra people

Background:
- perfectly flat solid #ff00ff chroma-key background
- one uniform color only, with no shadows, gradients, texture, reflections, floor plane, or lighting variation
- do not use #ff00ff anywhere in the player sprites
- crisp separated edges suitable for automated background removal
```

## Rebuild

Run the builder with a Python environment that includes Pillow:

```bash
python3 scripts/build_striker_sprites.py
```

The builder isolates the largest connected player in each slot, applies one shared scale, anchors every pose to the same y=247 foot line on a 256×256 canvas, and emits all five poses for every available kit.
