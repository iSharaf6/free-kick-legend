# Crowd watching and goal atlases

Both production sheets were generated with the built-in image generation tool.
The supplied supporter-strip image defined the readable crowd anatomy, while
the shipped player sprites defined the high-fidelity pixel rendering. Electric
blue and acid-lime team cloth act as deliberately isolated palette-mask hues so
runtime code can recolour shirts, scarves, flags, hanging banners and tifos to
the equipped player's jersey without changing skin, hair or architecture.

## Watching atlas prompt

Create exactly ten aligned frames of one football home end calmly watching
play, in a strict 2-column by 5-row sprite atlas. Use the supplied crowd for
clear individual supporter faces, diverse grouping and readable small-body
poses. Render the supporters as smaller versions of the supplied game player:
realistic pixel anatomy, face shading, dark outlines and fabric folds.

Keep the same camera, cast, faces, positions, terrace rail, hanging banners,
stairs and background in all frames. Show a dense recurring crowd with
individually distinguishable faces, permanent hanging supporter banners, small
scarves and flags. Frames progress through attentive idle, leaning, two clap
poses, scarf lift, pointing, tense clasping, flags left, flags right with a
mini-tifo, then settle. Architecture never moves.

All recolourable team cloth uses only electric-blue hues centred on `#0057FF`
and acid-lime hues centred on `#B7FF00`; these hues never appear in skin, hair,
architecture or light. No words, real logos, pitch, UI or watermark.

The generated 1024x1536 sheet was cropped by one pixel to 1024x1535, yielding
two columns and five exact 512x307 source cells.

## Goal atlas prompt

Create exactly ten aligned goal-celebration frames for the same recurring crowd
and home end as the watching atlas, again in a strict 2-column by 5-row atlas.
Preserve the exact cast, faces, positions, architecture, rail and permanent
hanging banners. Progress through instant reaction, arms rising, jump, peak
jump, large tifo unfurl, held tifo, reverse ripple with flags left, flags right
and scarves, lowering tifo, then an excited settle.

Keep side faces visible around the tifo. Add restrained camera flashes and two
small red flare glows only at the peak. Preserve the electric-blue and acid-lime
palette-mask contract for every shirt, scarf, flag, hanging banner and tifo.

The generated 1086x1448 sheet was cropped by three pixels to 1086x1445,
yielding two columns and five exact 543x289 source cells.

## Runtime presentation

The stand places three independently phased panels side by side. Watching cells
use a 512x181 display crop and goal cells a 543x192 crop; each panel derives one
uniform scalar from its 160px display width, keeping people and tifos unstretched.
The result is 10 watching sprites and 10 goal sprites, with smooth crossfades,
goal staging, reduced-motion holds, and live equipped-kit recolouring.
