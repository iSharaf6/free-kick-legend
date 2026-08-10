# Crowd animation atlas v3

Generated as a production asset with the built-in image generation tool, then
cropped by one pixel vertically from 1536x1024 to the exact 1536x1023 atlas grid.

## Production prompt

Create a polished, production-ready 16-bit pixel-art football stadium crowd
animation sprite sheet for a premium arcade free-kick game. Use the supplied
gameplay and menu references as the strict art direction: midnight-navy stadium,
warm gold/cream highlights, restrained brick-red accents, dense believable home
supporters, crisp square pixels, cinematic night floodlight exposure, and no
photographic texture, blur, antialiasing, gradients, text, logos, watermark, or
UI. Output one seamless 2-column by 3-row atlas, 1536x1024, with six equally
aligned 768x341 cells. Keep the camera, terraces, stair aisles, railings,
vomitories, crowd density, scale, palette, and supporter positions as consistent
as possible between cells so frame changes read as animation rather than cuts.
No gutters or captions.

Cell order, left-to-right then top-to-bottom:

1. Resting/anticipation: seated and standing supporters, subtle idle poses.
2. Chanting: scarves and clapping, slightly raised energy.
3. Arms rising: a coordinated swell before celebration.
4. Goal jump: peak body motion, fists raised, jubilant but readable.
5. Tifo celebration: a large navy-and-gold terrace tifo plus scarves.
6. Peak celebration: several navy-and-gold flags and banners, maximum energy.

The lower and middle seating bands must remain richly populated and readable
when a horizontal runtime crop is taken from each cell. Every person should feel
hand-authored in the same coherent retro sports-game world as the references.

## Runtime presentation

The production renderer uses the local `y=34..305` band from each 768x341 cell.
It places two complete crowd panels side by side, each scaled uniformly to
240x85 at the 480px logical game width. This deliberately halves supporter face
size and doubles terrace density compared with the rejected single-panel pass,
while retaining the full tifo, flag, stair, and seating composition. The banks
use different deterministic idle phases and a 60ms celebration stagger.
