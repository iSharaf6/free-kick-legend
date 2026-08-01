#!/usr/bin/env python3
"""Build every non-Mica player/kit/pose texture from approved base art.

Each player owns one identity strip in the home palette. Kits remain a separate
concern: this builder palette-swaps the authored navy/gold cloth into the six
runtime kit palettes. The approved idle is stored independently and deliberately
replaces frame zero, so image-generation drift can never alter a signed-off
silhouette while producing the motion frames.
"""

from __future__ import annotations

import colorsys
from dataclasses import dataclass
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
SOURCE_ROOT = ROOT / "assets/source/players"
OUT = ROOT / "public/assets/hd"

POSES = ("idle", "ready", "strike", "follow", "celebrate")
FRAME_SIZE = 256
CONTENT_BASELINE = 247
CONTENT_MARGIN = 8


@dataclass(frozen=True)
class PlayerSource:
    source: Path
    approved_idle: Path
    idle_height: int


PLAYERS = {
    "character-power-striker": PlayerSource(
        source=SOURCE_ROOT / "power-striker/source-strip-v1-alpha.png",
        approved_idle=SOURCE_ROOT / "power-striker/approved-idle-v1-alpha.png",
        idle_height=240,
    ),
    "character-agile-winger": PlayerSource(
        source=SOURCE_ROOT / "agile-winger/source-strip-v1-alpha.png",
        approved_idle=SOURCE_ROOT / "agile-winger/approved-idle-v1-alpha.png",
        idle_height=205,
    ),
    "character-islam-sharaf": PlayerSource(
        source=SOURCE_ROOT / "islam-sharaf/source-strip-v2-alpha.png",
        approved_idle=SOURCE_ROOT / "islam-sharaf/approved-idle-v2-alpha.png",
        idle_height=228,
    ),
}

# RGB kit palettes mirror src/data/cosmetics.js. Every source strip is navy/gold.
KITS = {
    "kit-home": (0x17365D, 0xF2C832),
    "kit-crimson": (0x9F2837, 0xFFF0D4),
    "kit-emerald": (0x16784A, 0xF3D45B),
    "kit-sunrise": (0xE96F27, 0xFFE6A1),
    "kit-monochrome": (0x171A20, 0xE8E2D2),
    "kit-royal": (0x5C378F, 0xF0C95A),
}


def rgb(color: int) -> tuple[int, int, int]:
    return ((color >> 16) & 255, (color >> 8) & 255, color & 255)


def largest_component(image: Image.Image, threshold: int = 8) -> Image.Image:
    """Keep the connected player and discard generation debris near a slot."""
    source = image.convert("RGBA")
    alpha = source.getchannel("A")
    width, height = source.size
    alpha_pixels = alpha.load()
    source_pixels = source.load()
    seen = bytearray(width * height)
    components: list[list[tuple[int, int]]] = []

    for y in range(height):
        for x in range(width):
            index = y * width + x
            if seen[index] or alpha_pixels[x, y] <= threshold:
                continue
            seen[index] = 1
            stack = [(x, y)]
            component: list[tuple[int, int]] = []
            while stack:
                px, py = stack.pop()
                component.append((px, py))
                for oy in (-1, 0, 1):
                    for ox in (-1, 0, 1):
                        if ox == 0 and oy == 0:
                            continue
                        nx, ny = px + ox, py + oy
                        if not (0 <= nx < width and 0 <= ny < height):
                            continue
                        neighbor = ny * width + nx
                        if seen[neighbor] or alpha_pixels[nx, ny] <= threshold:
                            continue
                        seen[neighbor] = 1
                        stack.append((nx, ny))
            components.append(component)

    if not components:
        raise ValueError("No player pixels were detected in a generated frame")
    component = max(components, key=len)
    left = min(x for x, _ in component)
    right = max(x for x, _ in component)
    top = min(y for _, y in component)
    bottom = max(y for _, y in component)
    isolated = Image.new("RGBA", (right - left + 1, bottom - top + 1), (0, 0, 0, 0))
    pixels = isolated.load()
    for x, y in component:
        pixels[x - left, y - top] = source_pixels[x, y]
    return isolated


def extract_frames(strip: Image.Image) -> list[Image.Image]:
    step = strip.width / len(POSES)
    frames = []
    for index in range(len(POSES)):
        left = round(index * step)
        right = round((index + 1) * step)
        frames.append(largest_component(strip.crop((left, 0, right, strip.height))))
    return frames


def fit_frame(frame: Image.Image, scale: float) -> Image.Image:
    """Scale one pose onto a fixed canvas while preserving the common baseline."""
    limit = FRAME_SIZE - CONTENT_MARGIN
    scale = min(scale, limit / frame.width, limit / frame.height)
    width = max(1, round(frame.width * scale))
    height = max(1, round(frame.height * scale))
    sprite = frame.resize((width, height), Image.Resampling.NEAREST)
    canvas = Image.new("RGBA", (FRAME_SIZE, FRAME_SIZE), (0, 0, 0, 0))
    x = (FRAME_SIZE - width) // 2
    y = CONTENT_BASELINE - height
    canvas.alpha_composite(sprite, (x, y))
    return canvas


def normalize_player(source: PlayerSource) -> list[Image.Image]:
    generated = extract_frames(Image.open(source.source).convert("RGBA"))
    generated_idle = generated[0]
    identity_scale = source.idle_height / generated_idle.height
    frames = [fit_frame(frame, identity_scale) for frame in generated]

    # Lock frame zero back to the accepted Phase-2 idle. Its scale derives from
    # the same target height, so the animation retains a coherent body scale.
    approved_idle = largest_component(Image.open(source.approved_idle).convert("RGBA"))
    frames[0] = fit_frame(approved_idle, source.idle_height / approved_idle.height)
    return frames


def recolor_kit(image: Image.Image, primary: int, trim: int) -> Image.Image:
    out = image.copy()
    pixels = out.load()
    pr, pg, pb = rgb(primary)
    tr, tg, tb = rgb(trim)
    for y in range(out.height):
        for x in range(out.width):
            r, g, b, a = pixels[x, y]
            if a < 8:
                continue
            h, saturation, value = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
            hue = h * 360
            target = None
            if 195 <= hue <= 255 and saturation >= 0.24:
                target = (pr, pg, pb)
            elif 35 <= hue <= 65 and saturation >= 0.42 and value >= 0.48:
                target = (tr, tg, tb)
            if target:
                luminance = 0.52 + value * 0.72
                pixels[x, y] = (
                    min(255, round(target[0] * luminance)),
                    min(255, round(target[1] * luminance)),
                    min(255, round(target[2] * luminance)),
                    a,
                )
    return out


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for character_id, source in PLAYERS.items():
        frames = normalize_player(source)
        for pose, frame in zip(POSES, frames, strict=True):
            for kit_id, (primary, trim) in KITS.items():
                output = OUT / f"kicker-hd-{character_id}-{kit_id}-{pose}.png"
                recolor_kit(frame, primary, trim).save(output, optimize=True)


if __name__ == "__main__":
    main()
