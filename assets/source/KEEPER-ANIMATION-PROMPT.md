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

## Ground recovery extension

The source board `keeper-recovery-sheet-v1-alpha.png` is repacked into
`public/assets/hd/keeper-recovery-sheet-hd.png` as twelve `320×280` frames:

- `0–5`: recovery after a screen-right dive
- `6–11`: recovery after a screen-left dive

Each direction uses six phases: turf impact, side-lying settle, glove/elbow
brace, both knees, one-foot half-rise and balanced ready crouch. Every frame is
packed against one shared bottom edge so Phaser can anchor it directly to the
projected pitch with `originY = 1`.

The generated strip used the original twenty-frame goalkeeper board as the
strict identity and pixel-style reference. It requested exactly two rows of six
figures on flat `#ff00ff`, naturally authored per direction, with no ball,
shadow, text, detached parts or extra figures. The runtime alpha source was
produced with the built-in image generator followed by local chroma-key removal.
