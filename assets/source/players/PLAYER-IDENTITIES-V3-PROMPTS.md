# Player Identities V3 — Generation Record

Generated with Codex's built-in `image_gen` tool. Islam Sharaf's private photo
reference was used during generation but is deliberately not stored in the
repository. The checked-in chroma and alpha strips are the approved derivative
game assets.

## Shared art direction

- One horizontal row of eight poses: idle, ready, wind-up, strike,
  follow-through, recovery, watch-the-ball and celebration.
- Rear three-quarter football view facing screen-right, with one identity,
  costume and camera across the complete strip.
- Navy kit with gold trim, white socks and dark boots. Kit variants are produced
  by `scripts/build_striker_sprites.py` from the approved home-kit source.
- Crisp pixel clusters, hard dark outline, deliberate shading ramps, flat
  `#ff00ff` chroma background, and no shadow, ball, text or scenery.
- Every pose changes silhouette, weight distribution and limb rhythm while the
  body scale remains stable. The watch pose must keep the head and torso aimed
  upfield after the follow-through.
- Reject any result that reads as one shared base body with only hair or palette
  changes. Identity requires different proportions, facial structure, stance,
  kick mechanics, recovery and celebration silhouette at game scale.

## Mica Vale — balanced specialist

Compact average-athletic number 17. Balanced approach, clean plant, controlled
right-foot contact, stable recovery, upright tracking pose, then the original
two-fists-raised celebration. His motion tempo is the neutral reference.

## Malik Rook — power striker

Tall, broad and visibly muscular number 9 with deep-brown skin, close-cropped
hair, square profile, thick neck, heavy shoulders and thighs. Use a wide load,
long backswing, explosive hip drive, high crossing follow-through, grounded
heavy recovery, imposing upfield watch and a low-fisted roar. His runtime
presentation scale is intentionally 14% larger; this is cosmetic only.

## Nico Velo — agile winger

Shorter lean number 7 with light-brown skin, sharp youthful face, copper swept
undercut, narrow shoulders and long slim limbs. Use quick approach steps,
compact whip contact, an airborne scissoring follow-through, staggered landing,
alert watch pose and a one-knee celebration. His frame timing is fastest.

## Islam Sharaf — technical creator

Use the supplied private photo for likeness: olive/light-brown skin, thick dark
curly crown, straight brows, almond eyes, defined nose, angular jaw, short
moustache and light jaw hair. Build a genuinely lean-muscular V-taper with
squared shoulders, defined but natural limbs, planted football stance and a
focused upfield gaze—not a contrapposto or crossed-ankle fashion pose.

Motion direction: precise short approach, clear backswing, controlled wrapped
right-foot contact, balanced across-body follow-through, two-foot recovery,
planted upfield tracking pose and a restrained single-fist celebration. The
face, torso and limb proportions must remain consistent through all eight
frames and must not reuse Mica Vale's body geometry.

## Runtime normalization

The build detects the eight connected player silhouettes across each source
strip, preserves a single per-character scale, and places every result on a
256×256 transparent canvas with a shared bottom-centre registration point.
Runtime animation therefore changes authored poses without cropping, resizing
or teleporting the body core between frames.
