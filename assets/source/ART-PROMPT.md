# HD football sprite source prompt

Built-in image generation was used with the supplied fighting-game screenshot as a pixel-density/detail reference and the existing Free Kick Legend menu as the palette/football-identity reference.

> Create an original, logo-free, high-detail pixel-art sprite sheet for a fictional free-kick game. Use dense hand-authored character detail, crisp dark outlines, cloth folds, hair clusters, anatomy, shading, readable silhouettes, and consistent top-left stadium lighting. Include one navy-and-gold striker in idle, ready, strike, follow-through, and celebration poses; one amber goalkeeper in ready, left-dive, right-dive, and catch poses; and a three-player wall. Use a flat `#ff00ff` chroma-key background, equal cells, full bodies, consistent scale, no overlap, no text, no watermark, no real team, no famous athlete, and no trademarks.

The generated source is `football-sprite-sheet-source.png`. `scripts/build_hd_sprites.py` removes gameplay-owned ball pixels from action poses, crops the frames, and creates six recolored kit variants under `public/assets/hd/`.
