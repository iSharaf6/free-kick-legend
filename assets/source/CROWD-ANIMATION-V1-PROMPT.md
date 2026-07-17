# Crowd animation V1

Generated with the built-in image-generation workflow using the current game
screenshot as a strict style reference. The original chroma-key board and the
cleaned alpha board are kept beside this prompt. `scripts/build_crowd_sprites.py`
baseline-locks and repacks the board into the runtime 3x3 atlas.

## Final prompt

> Use case: stylized-concept
>
> Asset type: production 2D pixel-art football crowd animation sprite atlas for
> the referenced game.
>
> Input image: use the supplied game screenshot only as the strict visual-style,
> camera, lighting, pixel-density, and palette reference.
>
> Primary request: Create exactly NINE sequential crowd animation frames arranged
> in a perfectly regular 3-column by 3-row sprite sheet, read left-to-right then
> top-to-bottom. Each cell shows the same packed group of fictional football
> supporters from the waist up, pressed together behind one low dark stadium
> safety rail, seen straight-on from the pitch.
>
> Animation plan: frames 1-6 are a seamless calm match loop with subtle independent
> shoulder sways, head bobs, scarf movement and small claps; nobody leaves the
> ground. Frames 7-9 are a clear goal reaction: crouched anticipation, everyone
> jumping with arms and scarves raised, then an energetic landing cheer. Preserve
> the exact same supporters, clothing colors, order, anatomy and scale in every
> frame.
>
> Style/medium: dense hand-authored late-1990s arcade pixel art matching the
> screenshot, crisp dark 2-3 pixel outlines, chunky readable faces, clustered hair,
> fabric folds, controlled limited shading, no blur and no painterly rendering.
>
> Composition/framing: exact equal-sized cells, same fixed straight-on camera and
> baseline in every cell, one continuous crowd band per cell, generous internal
> padding, all heads and hands fully visible, no overlaps between cells. The people
> should fill each cell strongly so they read when scaled down behind the goal.
>
> Lighting/mood: cool night stadium light from upper left, lively but not neon.
>
> Color palette: navy, muted red, warm gold, cream, forest green, muted sky blue,
> and varied natural skin tones; strong contrast against the key background.
>
> Scene/backdrop: perfectly flat solid #ff00ff chroma-key background only, with no
> stadium, floor, seats, sky, shadows, gradients, texture, reflections, or lighting
> variation.
>
> Constraints: exactly 9 frames; same identities and clothes every frame; fictional
> supporters only; one low rail included consistently; no footballers, goalkeeper,
> pitch, goal, logos, club badges, letters, numbers, text, or watermark. Do not use
> #ff00ff inside the subjects or rail. Crisp pixel edges only.
