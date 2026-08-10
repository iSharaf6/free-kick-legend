# Crowd animation V3

Generated with the built-in image-generation workflow on 2026-08-10. The
stadium screenshot is the density/camera reference; the shipped agile-winger
celebration and keeper atlas are the linework, facial-detail, shading and pixel
density references. The three 2×5 boards are retained as generation provenance
and a large donor library. They are deliberately not played cell-by-cell: a
generative model can redraw a convincing crowd but cannot guarantee that 400+
small identities survive 30 separate generations unchanged.

`scripts/build_crowd_sprites.py` instead assembles one canonical seven-row cast
from the moving board's donor rows, adding deterministic individual scarves,
caps and glasses. It then derives all 30 runtime frames from that single cast by
moving fixed four-person groups and adding state-specific arm pixels. This is
the production identity lock: faces, clothes, ordering, camera and rails are
shared bytes rather than a prompt-level aspiration.

## Inputs

- `reference-stadium.png`: wide stadium density, camera and night palette.
- `../../../public/assets/hd/kicker-hd-character-agile-winger-kit-home-celebrate.png`:
  player pixel-art reference.
- `../../../public/assets/hd/keeper-animation-sheet-hd.png`: keeper pixel-art
  reference.
- `crowd-moving-generated.png`: production face/body donor library.
- `crowd-goal-generated.png` and `crowd-out-generated.png`: pose, timing and
  expression studies retained for provenance; they are not runtime identity
  sources.

## Moving — final prompt

> Use case: stylized-concept
>
> Asset type: production 2D pixel-art football crowd animation atlas for a
> 1920×1080 arcade game.
>
> Input images: Image 1 is the strict stadium crowd density, wide camera, night
> lighting and navy/gold atmosphere reference. Image 2 and Image 3 are the
> strict pixel-art linework, facial detail, palette shading and crisp rendering
> references. Do not copy the UI, pitch, goal, footballers, goalkeeper, logos or
> text from the references.
>
> Primary request: create exactly TEN sequential ambient/moving crowd frames in
> one perfectly regular 2-column by 5-row sprite sheet, read left-to-right then
> top-to-bottom. Every cell shows the same fixed wide stadium section and the
> same packed group of at least 90 fictional supporters, seen straight-on from
> the pitch, from chest/waist up, behind one low dark safety rail. Use FIVE TO
> SIX staggered rows. Camera, crop, baseline, seats, clothing, faces, scale,
> lighting, rail and background are identical in all ten cells.
>
> Animation plan: a seamless subtle match-watching loop across frames 1–10:
> independent small head turns, blinking, quiet claps, restrained shoulder sway,
> scarf-end flutter and a few hands lifting briefly. Nobody jumps and there is
> no full-body translation. Frame 10 transitions cleanly back to frame 1.
>
> Faces: every visible supporter has a distinctive readable fictional face —
> different hair silhouette, brows, nose, mouth, age, skin tone, facial hair or
> eyewear — with no cloned faces and no faceless silhouettes. Preserve every
> identity and seat across all ten frames.
>
> Style/medium: high-quality hand-authored late-1990s arcade pixel art matching
> the player and keeper references; crisp hard pixel edges, dark 2–3 pixel
> outlines at source scale, chunky controlled clusters, readable small facial
> features, limited stepped shading, no blur, no antialiasing, no painterly
> texture and no photorealism.
>
> Composition/framing: each cell is a wide panoramic strip, not a close-up;
> people remain small and numerous like Image 1. Exact equal cells with dark
> separators, no overlap or bleed. Keep all heads and hands inside the cell.
>
> Lighting/mood: cool night stadium floodlights with warm gold highlights;
> lively and legible, not neon.
>
> Color palette: navy and royal blue dominate, muted gold/amber accents, cream,
> small amounts of maroon and forest green, and varied natural skin tones.
>
> Scene/backdrop: one consistent near-black/navy stadium seating backdrop per
> cell; no pitch, sky, field or advertising.
>
> Constraints: exactly 10 frames; exactly 2 columns by 5 rows; same identities
> and seating throughout; fictional spectators only; no football players,
> goalkeeper, goal, ball, badges, brand marks, symbols, letters, numbers, text or
> watermark.
>
> Avoid: enlarged or zoomed-in people, three-row crowd, repeated/cloned faces,
> identity drift, floating body parts, crowds shifting as one slab, camera
> movement, gradients, blur, smooth vector art, 3D rendering and photography.

## Goal scored — final prompt

> Use case: stylized-concept
>
> Asset type: production 2D pixel-art football crowd GOAL-SCORED animation atlas.
>
> Input images: Image 1 is the strict roster, seating, framing, scale, palette,
> rail, background, grid and identity reference. Image 2 is the stadium
> energy/density reference. Images 3–4 are the strict facial linework, pixel
> clusters, outlines and stepped-shading reference.
>
> Primary request: create exactly TEN sequential goal-celebration frames in one
> perfectly regular 2-column by 5-row sprite sheet. Use the same fixed wide
> camera and same dense group from Image 1, in the exact same seats, clothing and
> identity. Change only their coordinated but individually varied goal reactions.
>
> Animation plan: frame 1 recognition; frame 2 bodies compress and eyes widen;
> frames 3–4 arms and fists rise in a travelling ripple; frames 5–6 peak with
> open cheering mouths, scarves overhead, claps and a few small planted jumps;
> frames 7–8 energetic landing and continued cheering; frame 9 arms lower;
> frame 10 settles toward the ordinary moving pose. Each supporter reacts on a
> slightly different beat. Camera, rail, seating, crop, lighting and scale never
> move.
>
> Faces: every supporter retains the exact distinctive fictional identity from
> Image 1; expressions become joyful but facial geometry, hair, skin tone,
> facial hair and eyewear do not change.
>
> Style/medium: high-quality hand-authored late-1990s arcade pixel art matching
> the player and keeper references; hard pixel edges, dark source outlines,
> controlled clusters, readable small features and limited stepped shading; no
> blur, antialiasing or photorealism.
>
> Composition/framing: exactly the same zoomed-out five-to-six-row panoramic
> section in every cell; 2 columns × 5 rows only; equal cells; dark separators;
> all hands and scarves remain inside; the rail stays fixed.
>
> Constraints: exactly 10 frames; same people, seats, clothes, crop and scale;
> fictional spectators only; no UI, pitch, sky, goal, goalkeeper, player, ball,
> badges, logos, letters, numbers, text or watermark.
>
> Avoid: zoom changes, camera movement, whole-crowd translation, cloned faces,
> identity drift, floating limbs, clipped hands, painterly texture, gradients,
> blur, 3D and photography.

## Ball out / MISS — final prompt

> Use case: stylized-concept
>
> Asset type: production 2D pixel-art football crowd BALL-OUT / OFF-TARGET
> reaction atlas.
>
> Input images: Image 1 is the strict roster, seating, framing, scale, palette,
> rail, background, grid and identity reference. Image 2 is the stadium
> density/camera reference. Images 3–4 are the strict facial linework, pixel
> clusters, outlines and stepped-shading reference.
>
> Primary request: create exactly TEN sequential frames reacting to a shot going
> out/off target, in one perfectly regular 2-column by 5-row sprite sheet. Use
> the same fixed camera and same dense group from Image 1, in the exact same
> seats, clothing and identity. Change only their varied disappointed poses and
> expressions.
>
> Animation plan: frames 1–2 heads and eyes track the shot wide; frame 3
> realization/wince; frames 4–5 strongest reaction with some hands on heads,
> open disappointed mouths, palms up and a few pointing where it went out;
> frames 6–7 shoulders slump and supporters exchange resigned looks; frame 8 a
> few small frustrated claps; frame 9 hands lower; frame 10 settles toward the
> moving pose. No celebration, jumping or victory scarves. Camera, rail,
> seating, crop, lighting and scale never move.
>
> Faces: every supporter retains the exact distinctive fictional identity from
> Image 1; expressions change to surprise/disappointment but facial geometry,
> hair, skin tone, facial hair and eyewear do not change.
>
> Style/medium: high-quality hand-authored late-1990s arcade pixel art matching
> the player and keeper references; hard pixel edges, dark source outlines,
> controlled clusters, readable small features and limited stepped shading; no
> blur, antialiasing or photorealism.
>
> Composition/framing: exactly the same zoomed-out five-to-six-row panoramic
> section in every cell; 2 columns × 5 rows only; equal cells; dark separators;
> hands stay inside and the rail remains fixed.
>
> Constraints: exactly 10 frames; same people, seats, clothes, crop and scale;
> fictional spectators only; no visible ball, UI, pitch, sky, goal, goalkeeper,
> player, badges, logos, letters, numbers, text or watermark.
>
> Avoid: celebration poses, jumping, victory scarves, zoom changes, camera
> movement, whole-crowd translation, cloned faces, identity drift, floating
> limbs, clipped hands, painterly texture, gradients, blur, 3D and photography.

## Runtime contract

- Generated donor boards: 1536×1024 RGB, 2 columns × 5 rows.
- Canonical runtime cast: seven fixed tiers × 64 supporter face tiles = 448
  visible identity slots, assembled once from distinct donor rows.
- Runtime frame: 960×196 RGB; canonical row art uses integer nearest-neighbour
  sampling and never changes identity source after assembly.
- Runtime sheet: 1920×980, exactly ten frames.
- Phaser display: uniform 0.5 scale = 480×98 logical pixels.
- Frame 0 is byte-identical across moving, goal and out. Frame 9 is a distinct,
  identity-matched one-pixel micro-settle for a clean return to moving. The seven
  three-pixel rail bands are byte-identical in every frame. Animated groups move
  only within a bounded ±7-pixel vertical window.
- State mapping: `GOAL` → goal; semantic `MISS` / OFF TARGET → out; all other
  gameplay time → moving.
