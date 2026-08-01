# Player Identities V2 — Generation Record

Generated with Codex's built-in `image_gen` tool. The private photo reference was
used during generation but is deliberately not stored in the repository.

## Shared art direction

- One horizontal row of five equal slots: idle, ready, strike, follow-through,
  celebration.
- Rear three-quarter football view facing screen-right, matching the shipped
  player perspective and general scale.
- Navy kit with gold trim, white socks and dark boots. Kits are recolored by
  `scripts/build_striker_sprites.py`; kit identity is not painted separately
  into every player.
- Crisp pixel clusters, hard 1–2 pixel dark outline at final scale, 3–5 shade
  clusters, flat `#ff00ff` chroma background, no shadow, ball, text, scenery or
  extra figures.
- Each pose must change silhouette and center of mass. Do not reproduce Mica
  Vale's body, face, pose geometry or two-fists-overhead celebration.
- Frame zero is replaced during the build with its separately approved idle so
  later generation cannot weaken the accepted identity.

## Power striker — Malik Rook

Identity prompt: tall, broad and muscular; deep-brown skin; close-cropped black
hair; square facial profile; thick neck, heavy shoulders and thighs; wide,
grounded stance.

Motion prompt:

1. Preserve the approved wide planted idle.
2. Deep wide coil, long backswing and arms spread to store force.
3. Explosive heavy right-foot contact with bent plant leg and full hip drive.
4. Forceful rotation, high crossing leg and weight absorbed through the plant.
5. Roaring wide-legged power pose, fists clenched low at waist/chest level.

## Agile winger — Nico Velo

Identity prompt: visibly shorter and leaner; light-brown skin; sharp youthful
face; copper swept undercut; narrow shoulders, compact torso and long slim
limbs; staggered feet and a raised heel.

Motion prompt:

1. Preserve the approved low, springy side-on idle.
2. Sprint-start approach with long staggered stride and opposite arm drive.
3. Compact, snappy right-foot whip with a brief hop and tight arms.
4. Airborne scissoring recovery, fast pivot and asymmetric arms.
5. One-legged side-hop celebration with raised knee, one finger up and the
   opposite arm wide.

## Technical creator — Islam Sharaf

Identity prompt: use the supplied private photo for likeness; olive/light-brown
skin; thick dark curly crown; strong straight brows, almond eyes, defined nose,
angular jaw, short moustache and light jaw hair; lean athletic body; relaxed
S-curve posture and expressive long arms. The likeness must be integrated into
a new football body, not pasted onto Mica's base.

Motion prompt:

1. Preserve the approved contrapposto idle, hand on hip and feet lightly crossed.
2. Poised technical approach with quick steps and compact asymmetric arms.
3. Smooth controlled right-foot whip, upright torso and left arm extended.
4. Elegant wrap across the body, balanced pivot and opening shoulders.
5. Calm signature celebration: one hand over the heart, opposite index finger
   pointing diagonally upward.

## Rejection rule

Reject and regenerate any result that reads as the same base body with changed
hair or colors. Acceptance requires distinct proportions, face structure,
stance, center of mass, kick mechanics and celebration silhouette at game scale.
