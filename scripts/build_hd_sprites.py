#!/usr/bin/env python3
"""Cut the generated Night Match sprite board into web-ready transparent PNGs."""

from __future__ import annotations

import colorsys
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "tmp/imagegen/football-sprite-sheet-alpha.png"
KEEPER_ANIMATION_SOURCE = ROOT / "assets/source/keeper-animation-sheet-v1-alpha.png"
KEEPER_RECOVERY_SOURCE = ROOT / "assets/source/keeper-recovery-sheet-v1-alpha.png"
OUT = ROOT / "public/assets/hd"

KEEPER_ANIMATION_SIZE = (1600, 1120)
KEEPER_RECOVERY_SIZE = (1920, 560)
KEEPER_FRAME_SIZE = (320, 280)


POSES = {
    "kicker-idle": ((42, 40, 270, 470), 240),
    "kicker-ready": ((285, 65, 540, 470), 240),
    "kicker-strike": ((825, 65, 1145, 470), 240),
    "kicker-follow": ((530, 70, 838, 470), 240),
    "kicker-celebrate": ((1110, 38, 1392, 470), 240),
    "keeper-idle-hd": ((25, 475, 320, 790), 184),
    "keeper-dive-hd": ((280, 470, 710, 780), 166),
    "keeper-dive-right-hd": ((710, 470, 1090, 790), 166),
    "keeper-catch-hd": ((1095, 465, 1392, 800), 184),
    "defender-hd": ((545, 770, 661, 1125), 188),
}

# RGB kit palettes mirror src/data/cosmetics.js. The source board is navy/gold.
KITS = {
    "kit-home": (0x17365D, 0xF3C449),
    "kit-crimson": (0x9F2837, 0xFFF0D4),
    "kit-emerald": (0x16784A, 0xF3D45B),
    "kit-sunrise": (0xE96F27, 0xFFE6A1),
    "kit-monochrome": (0x171A20, 0xE8E2D2),
    "kit-royal": (0x4E3E87, 0xE5C95E),
}


def rgb(color: int) -> tuple[int, int, int]:
    return ((color >> 16) & 255, (color >> 8) & 255, color & 255)


def remove_detached_fragments(image: Image.Image) -> Image.Image:
    """Remove isolated generation debris without softening any pixel edges."""
    out = image.copy()
    alpha = out.getchannel("A")
    width, height = out.size
    seen = bytearray(width * height)
    components: list[list[tuple[int, int]]] = []

    for y in range(height):
        for x in range(width):
            index = y * width + x
            if seen[index] or alpha.getpixel((x, y)) < 8:
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
                        ni = ny * width + nx
                        if seen[ni] or alpha.getpixel((nx, ny)) < 8:
                            continue
                        seen[ni] = 1
                        stack.append((nx, ny))
            components.append(component)

    if not components:
        return out
    largest = max(len(component) for component in components)
    minimum = max(18, round(largest * 0.025))
    pixels = out.load()
    for component in components:
        if len(component) >= minimum:
            continue
        for x, y in component:
            pixels[x, y] = (0, 0, 0, 0)
    return out


def trim_and_resize(image: Image.Image, box: tuple[int, int, int, int], height: int) -> Image.Image:
    sprite = remove_detached_fragments(image.crop(box))
    alpha_box = sprite.getchannel("A").getbbox()
    if alpha_box:
        sprite = sprite.crop(alpha_box)
    scale = height / max(sprite.height, 1)
    width = max(1, round(sprite.width * scale))
    sprite = sprite.resize((width, height), Image.Resampling.NEAREST)
    pad = 8
    canvas = Image.new("RGBA", (width + pad * 2, height + pad * 2), (0, 0, 0, 0))
    canvas.alpha_composite(sprite, (pad, pad))
    return canvas


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
            h, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
            hue = h * 360
            target = None
            if 195 <= hue <= 255 and s >= 0.24:
                target = (pr, pg, pb)
            elif 38 <= hue <= 62 and s >= 0.48 and v >= 0.52:
                target = (tr, tg, tb)
            if target:
                # Keep every hand-authored highlight/shadow while changing hue.
                lum = 0.52 + v * 0.72
                pixels[x, y] = (
                    min(255, round(target[0] * lum)),
                    min(255, round(target[1] * lum)),
                    min(255, round(target[2] * lum)),
                    a,
                )
    return out


def connected_component_boxes(image: Image.Image, minimum: int = 1000) -> list[tuple[int, int, int, int]]:
    """Return the twenty authored figures without relying on fragile crop coordinates."""
    alpha = image.getchannel("A")
    width, height = image.size
    pixels = alpha.load()
    seen = bytearray(width * height)
    boxes: list[tuple[int, int, int, int]] = []

    for y in range(height):
        for x in range(width):
            index = y * width + x
            if seen[index] or pixels[x, y] < 8:
                continue
            seen[index] = 1
            stack = [(x, y)]
            count = 0
            left = right = x
            top = bottom = y
            while stack:
                px, py = stack.pop()
                count += 1
                left = min(left, px)
                right = max(right, px)
                top = min(top, py)
                bottom = max(bottom, py)
                for oy in (-1, 0, 1):
                    for ox in (-1, 0, 1):
                        if ox == 0 and oy == 0:
                            continue
                        nx, ny = px + ox, py + oy
                        if not (0 <= nx < width and 0 <= ny < height):
                            continue
                        neighbor = ny * width + nx
                        if seen[neighbor] or pixels[nx, ny] < 8:
                            continue
                        seen[neighbor] = 1
                        stack.append((nx, ny))
            if count >= minimum:
                boxes.append((left, top, right + 1, bottom + 1))
    return boxes


def build_keeper_animation_atlas() -> None:
    """Pack the generated 4x5 keeper board into a Phaser-ready atlas."""
    source = Image.open(KEEPER_ANIMATION_SOURCE).convert("RGBA")
    boxes = connected_component_boxes(source)
    if len(boxes) != 20:
        raise ValueError(f"keeper animation source must contain 20 figures, found {len(boxes)}")

    # The authored sheet has four visually separated rows. Group by vertical
    # centre, then order each row from screen-left to screen-right.
    boxes.sort(key=lambda box: (box[1] + box[3]) / 2)
    rows = []
    for row_index in range(4):
        row = boxes[row_index * 5:(row_index + 1) * 5]
        row.sort(key=lambda box: (box[0] + box[2]) / 2)
        rows.append(row)

    frame_width, frame_height = KEEPER_FRAME_SIZE
    atlas = Image.new("RGBA", KEEPER_ANIMATION_SIZE, (0, 0, 0, 0))
    for row_index, row in enumerate(rows):
        for col_index, box in enumerate(row):
            sprite = source.crop(box)
            if sprite.width > frame_width - 8 or sprite.height > frame_height - 8:
                raise ValueError(
                    f"keeper frame {row_index * 5 + col_index} does not fit "
                    f"inside {KEEPER_FRAME_SIZE}: {sprite.size}"
                )
            x = col_index * frame_width + (frame_width - sprite.width) // 2
            if row_index in (0, 3):
                # Standing, handling and recovery poses share one foot line.
                y = row_index * frame_height + frame_height - sprite.height - 8
            else:
                # Airborne frames stay centred so their authored reach remains stable.
                y = row_index * frame_height + (frame_height - sprite.height) // 2
            atlas.alpha_composite(sprite, (x, y))

    atlas.save(OUT / "keeper-animation-sheet-hd.png", optimize=True)


def build_keeper_recovery_atlas() -> None:
    """Pack twelve direction-specific turf recovery frames on one foot line."""
    source = Image.open(KEEPER_RECOVERY_SOURCE).convert("RGBA")
    boxes = connected_component_boxes(source)
    if len(boxes) != 12:
        raise ValueError(f"keeper recovery source must contain 12 figures, found {len(boxes)}")

    boxes.sort(key=lambda box: (box[1] + box[3]) / 2)
    rows = []
    for row_index in range(2):
        row = boxes[row_index * 6:(row_index + 1) * 6]
        row.sort(key=lambda box: (box[0] + box[2]) / 2)
        rows.append(row)

    frame_width, frame_height = KEEPER_FRAME_SIZE
    atlas = Image.new("RGBA", KEEPER_RECOVERY_SIZE, (0, 0, 0, 0))
    for row_index, row in enumerate(rows):
        for col_index, box in enumerate(row):
            sprite = source.crop(box)
            if sprite.width > frame_width - 8 or sprite.height > frame_height - 8:
                raise ValueError(
                    f"keeper recovery frame {row_index * 6 + col_index} does not fit "
                    f"inside {KEEPER_FRAME_SIZE}: {sprite.size}"
                )
            x = col_index * frame_width + (frame_width - sprite.width) // 2
            # Every impact, roll, kneel and rise pose shares the exact same
            # bottom edge. Runtime can therefore pin originY=1 to the turf.
            y = row_index * frame_height + frame_height - sprite.height - 8
            atlas.alpha_composite(sprite, (x, y))

    atlas.save(OUT / "keeper-recovery-sheet-hd.png", optimize=True)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    source = Image.open(SOURCE).convert("RGBA")
    build_keeper_animation_atlas()
    build_keeper_recovery_atlas()

    # Remove the footballs baked into action/dive reference poses; gameplay owns
    # a separate simulated ball, so these pixels must never double-render.
    for box in ((466, 352, 542, 440), (790, 350, 870, 440), (330, 490, 430, 590), (990, 485, 1090, 590)):
        source.paste((0, 0, 0, 0), box)

    built: dict[str, Image.Image] = {}
    for name, (box, height) in POSES.items():
        built[name] = trim_and_resize(source, box, height)

    for name, sprite in built.items():
        if name.startswith("kicker-"):
            pose = name.removeprefix("kicker-")
            for kit_id, (primary, trim) in KITS.items():
                recolor_kit(sprite, primary, trim).save(OUT / f"kicker-hd-{kit_id}-{pose}.png", optimize=True)
        else:
            sprite.save(OUT / f"{name}.png", optimize=True)

    # The classic match ball is isolated from the source board and kept at a
    # one-texture-pixel to one-device-pixel size in the 2× renderer.
    ball_source = Image.open(SOURCE).convert("RGBA")
    ball = trim_and_resize(ball_source, (476, 358, 543, 432), 42)
    ball.save(OUT / "ball-classic-hd.png", optimize=True)


if __name__ == "__main__":
    main()
