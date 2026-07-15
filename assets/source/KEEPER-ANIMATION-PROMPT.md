# Goalkeeper animation atlas v1

The camera remains locked to the current front-facing free-kick view. The source
board is stored in `keeper-animation-sheet-v1-alpha.png`; run
`python3 scripts/build_hd_sprites.py` to repack it into the runtime atlas.

## Runtime frame map

- `0–4`: idle, weight shifts, anticipation and set
- `5–9`: screen-right dive from load through landing
- `10–14`: screen-left dive from load through landing
- `15–19`: low scoop, kneeling save, chest catch, high claim and recovery

## Generation prompt

Use the goalkeeper in `football-sprite-sheet-source.png` as the identity, kit,
proportion, palette, outline and pixel-cluster reference. Create exactly twenty
frames of the same mustard-gold goalkeeper in a four-row by five-column sheet on
a perfectly flat `#ff00ff` chroma-key background. Keep one fixed front-facing
camera, a consistent character scale and generous separation between figures.
Do not draw a football; gameplay renders it separately.

Row 1: neutral ready stance, weight shift left, deep anticipation crouch, weight
shift right, explosive set stance. Row 2: five phases of a screen-right dive—load,
push, early flight, full-stretch contact and landing. Row 3: the equivalent five
screen-left phases, authored naturally rather than merely mirrored. Row 4: low
scoop, kneeling low save, chest catch, high two-hand claim and recovery stance.

Match the existing premium HD pixel art: crisp deliberate pixel clusters, dark
outlines, detailed fabric folds and anatomy, limited retro palette and consistent
highlight direction. No text, grid lines, logos, watermark, extra people,
detached debris, shadows or background variation.
