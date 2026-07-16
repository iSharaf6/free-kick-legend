# Goalkeeper motion expansion v3

This pass adds two non-destructive alpha sources to the existing goalkeeper
library:

- `keeper-return-transition-sheet-v2-alpha.png`: 18 validated figures, nine
  grounded return-to-set phases in each screen direction.
- `keeper-low-save-sheet-v1-alpha.png`: 16 validated figures, eight low-save
  phases in each screen direction.

Together with the 84 separated figures in the six earlier source sheets, the
project now contains 118 goalkeeper source poses. The runtime atlases contain
113 populated frames; the difference is from five high-claim source poses that
replace empty/duplicate handling slots rather than being packed twice.

Both sources were made with the built-in image generator using the existing
keeper sheets as strict image references. The generated flat-magenta boards
were converted with the installed chroma-key helper using `--auto-key border`,
`--soft-matte`, `--transparent-threshold 12`, `--opaque-threshold 220`, and
`--despill`.

The generator returned fewer figures than the requested 20 on both boards.
The build intentionally packs only the 18 and 16 complete, validated figures;
it does not invent duplicate or empty frames to satisfy a nominal count.

## Return-to-set prompt

```text
Use case: stylized-concept
Asset type: production 2D football game goalkeeper return-to-set animation sprite source sheet
Input images: Image 1 is the strict recovery continuity reference; Image 2 is the strict grounded footwork, identity, scale, costume and pixel-art reference; Image 3 is the strict fixed-camera anatomy and outline reference.
Primary request: Create exactly TWENTY distinct sequential full-body sprites of the same goalkeeper returning laterally to his central ready position after completing a save. Arrange as a perfectly regular 2-row by 10-column contact sheet, read left-to-right.
Top row, screen-left travel, exactly 10 phases: upright recovery handoff; weight settles onto right leg; left foot opens toward screen-left; controlled push from right boot; left boot plants; right foot closes without crossing; second short left step; right foot closes; braking knee compression; balanced planted ready stance.
Bottom row, screen-right travel, exactly 10 natural direction-authored phases: upright recovery handoff; weight settles onto left leg; right foot opens toward screen-right; controlled push from left boot; right boot plants; left foot closes without crossing; second short right step; left foot closes; braking knee compression; balanced planted ready stance.
Subject identity: exactly the same athletic adult male goalkeeper in all reference sheets: short dark-brown hair, same face and body proportions, mustard-gold long-sleeve jersey and matching shorts, mustard-gold socks, white padded gloves, black boots, crisp dark outlines. Preserve the exact kit, palette, face, hair, body scale, pixel density, outline weight, fabric detail, and fixed front-facing free-kick camera.
Style/medium: premium high-definition retro pixel art matching the references, crisp intentional pixel clusters, limited palette, strong readable silhouettes, detailed anatomy and fabric folds; no painterly blur and no smooth vector rendering.
Motion requirements: all poses are grounded on one identical invisible turf baseline; both boots remain physically believable; show progressive weight transfer, heel/toe contact, ankle and knee compression. Neighboring frames change only modestly. No skating, floating, running, hopping, leg crossing, teleporting, pose inversion, abrupt scale changes, or facing away from the viewer.
Composition/framing: exactly two evenly separated rows and exactly ten evenly spaced columns; one full goalkeeper per cell; consistent scale; all body parts fully visible; generous separation; no overlap; no crop; no grid, dividers, labels, arrows, frame numbers, ball, goal or field.
Scene/backdrop: perfectly flat solid #ff00ff chroma-key background, completely uniform edge to edge, for local background removal.
Constraints: no duplicated poses; no missing limbs; no detached gloves or boots; no cast shadow; no contact shadow; no gradients; no texture; no floor plane; no reflection; no motion streaks; no particles; no text; no logos; no watermark; do not use #ff00ff anywhere in the goalkeeper.
Output intent: clean chroma-key sprite source suitable for deterministic extraction into equal Phaser atlas frames.
```

## Low-save prompt

```text
Use case: stylized-concept
Asset type: production 2D football game goalkeeper low side-save animation sprite source sheet
Input images: Image 1 is the strict keeper identity, high-dive motion timing, fixed-camera and pixel-art reference; Image 2 is the strict turf-impact continuity reference; Image 3 is the strict costume, face, scale and low-save pose reference.
Primary request: Create exactly TWENTY distinct sequential full-body sprites of the same goalkeeper making a believable low side save near the turf. Arrange as a perfectly regular 2-row by 10-column contact sheet, read left-to-right.
Top row, screen-right low save: balanced ready; short adjustment right; hips sink and weight loads left push-off leg; right knee and gloves drop toward the ball line; explosive low push-off; early low flight with lead glove reaching; maximum two-hand low extension 20–45 cm above turf; one-hand parry follow-through with torso safely rotating; shoulder-and-hip descent; controlled side impact matching the recovery reference.
Bottom row, screen-left low save: balanced ready; short adjustment left; hips sink and weight loads right push-off leg; left knee and gloves drop toward the ball line; explosive low push-off; early low flight with lead glove reaching; maximum two-hand low extension 20–45 cm above turf; one-hand parry follow-through with torso safely rotating; shoulder-and-hip descent; controlled side impact matching the recovery reference.
Subject identity: exactly the same athletic adult male goalkeeper: short dark-brown hair, same face and proportions, mustard-gold long-sleeve jersey and matching shorts, mustard-gold socks, white padded gloves, black boots, crisp dark outlines. Preserve exact kit, palette, face, hair, body scale, pixel density, outline weight, fabric detail, and fixed front-facing free-kick camera.
Style/medium: premium high-definition retro pixel art matching the references, crisp intentional pixel clusters, limited palette, strong silhouettes, detailed anatomy and fabric folds; no painterly blur or smooth vector rendering.
Motion requirements: the motion remains low and lateral rather than rising into the existing high dive. Adjacent frames change only modestly. The planted frames use one common invisible turf baseline; airborne root height stays low; gloves lead toward the imagined low ball; legs trail naturally; impact flows into the recovery reference. No skating, floating upward, teleporting, pose inversion, abrupt scale changes, backward-facing body, or impossible limb bends.
Composition/framing: exactly two evenly separated rows; one full keeper per cell; consistent scale; all body parts visible; generous separation; no overlap; no crop; no grid, dividers, labels, arrows, frame numbers, football, goal or field.
Scene/backdrop: perfectly flat solid #ff00ff chroma-key background, completely uniform edge to edge, for local background removal.
Constraints: no duplicated poses; no extra people; no missing limbs; no detached gloves or boots; no ball because gameplay renders it separately; no cast shadow; no contact shadow; no gradients; no texture; no floor plane; no reflection; no motion streaks; no particles; no text; no logos; no watermark; do not use #ff00ff inside the goalkeeper.
Output intent: clean chroma-key source for deterministic extraction into a low-save Phaser atlas.
```

## Runtime frame order

Return atlas (`keeper-return-sheet-hd.png`):

- Frames 0–8: travel screen-left, from planted handoff through braking to ready.
- Frames 9–17: travel screen-right, from planted handoff through braking to ready.

Low-save atlas (`keeper-low-save-sheet-hd.png`):

- Frames 0–7: screen-right set, launch, extension, parry and impact.
- Frames 8–15: screen-left set, launch, extension, parry and impact.

Every packed frame is `320×280`, bottom-registered, and uses nearest-neighbour
resizing so runtime scale and projected root motion remain stable.
