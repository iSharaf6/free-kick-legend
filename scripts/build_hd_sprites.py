#!/usr/bin/env python3
"""Cut the generated Night Match sprite board into web-ready transparent PNGs."""

from __future__ import annotations

import colorsys
from pathlib import Path

from PIL import Image, ImageOps


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "tmp/imagegen/football-sprite-sheet-alpha.png"
KEEPER_ANIMATION_SOURCE = ROOT / "assets/source/keeper-animation-sheet-v1-alpha.png"
KEEPER_RECOVERY_SOURCE = ROOT / "assets/source/keeper-recovery-sheet-v1-alpha.png"
KEEPER_DIVE_MOTION_SOURCE = ROOT / "assets/source/keeper-dive-motion-sheet-v2-alpha.png"
KEEPER_FOOTWORK_SOURCE = ROOT / "assets/source/keeper-footwork-return-sheet-v1-alpha.png"
KEEPER_RETURN_SOURCE = ROOT / "assets/source/keeper-return-transition-sheet-v2-alpha.png"
KEEPER_LOW_SAVE_SOURCE = ROOT / "assets/source/keeper-low-save-sheet-v1-alpha.png"
KEEPER_HANDLING_SOURCE = ROOT / "assets/source/keeper-handling-claims-sheet-v1-alpha.png"
KEEPER_HIGH_CLAIM_SOURCE = ROOT / "assets/source/keeper-high-claim-sheet-v1-alpha.png"
KEEPER_LOW_SMOTHER_SOURCE = ROOT / "assets/source/keeper-low-smother-sheet-v1-alpha.png"
KEEPER_MID_CATCH_SOURCE = ROOT / "assets/source/keeper-mid-catch-sheet-v1-alpha.png"
KEEPER_UPPER_PARRY_SOURCE = ROOT / "assets/source/keeper-upper-parry-sheet-v1-alpha.png"
KEEPER_TOP_TIP_SOURCE = ROOT / "assets/source/keeper-top-tip-sheet-v1-alpha.png"
KEEPER_REFLEX_FOOT_SOURCE = ROOT / "assets/source/keeper-reflex-foot-sheet-v1-alpha.png"
KEEPER_SITUATIONAL_PUNCH_SOURCE = ROOT / "assets/source/keeper-situational-punch-sheet-v1-alpha.png"
KEEPER_DISTRIBUTION_SOURCE = ROOT / "assets/source/keeper-distribution-sheet-v1-alpha.png"
KEEPER_FOOT_DISTRIBUTION_SOURCE = ROOT / "assets/source/keeper-foot-distribution-sheet-v1-alpha.png"
KEEPER_REACTIONS_SOURCE = ROOT / "assets/source/keeper-reactions-sheet-v1-alpha.png"
OUT = ROOT / "public/assets/hd"

KEEPER_ANIMATION_SIZE = (1600, 1120)
KEEPER_RECOVERY_SIZE = (1920, 560)
KEEPER_DIVE_MOTION_SIZE = (1920, 1120)
KEEPER_FOOTWORK_SIZE = (1600, 560)
KEEPER_RETURN_SIZE = (2880, 560)
KEEPER_LOW_SAVE_SIZE = (2560, 560)
KEEPER_HANDLING_SIZE = (1600, 560)
KEEPER_HIGH_CLAIM_SIZE = (1600, 360)
KEEPER_SAVE_FAMILY_SIZE = (2560, 560)
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
            # Recovery rotates the same body from horizontal to upright. Use
            # body length instead of raw image height so no frame grows while
            # the keeper rolls, kneels and stands.
            scale = 205 / max(sprite.width, sprite.height)
            sprite = sprite.resize(
                (max(1, round(sprite.width * scale)), max(1, round(sprite.height * scale))),
                Image.Resampling.NEAREST,
            )
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


def build_keeper_save_family_atlas(
    source_path: Path,
    output_name: str,
    *,
    reverse_second_row: bool = False,
    mirror_second_row_columns: tuple[int, ...] = (),
) -> None:
    """Pack an eight-phase save in both authored screen directions."""
    source = Image.open(source_path).convert("RGBA")
    boxes = connected_component_boxes(source)
    if len(boxes) != 16:
        raise ValueError(f"{source_path.name} must contain 16 figures, found {len(boxes)}")

    boxes.sort(key=lambda box: (box[1] + box[3]) / 2)
    rows = []
    for row_index in range(2):
        row = boxes[row_index * 8:(row_index + 1) * 8]
        row.sort(key=lambda box: (box[0] + box[2]) / 2)
        if row_index == 1 and reverse_second_row:
            row.reverse()
        rows.append(row)

    frame_width, frame_height = KEEPER_FRAME_SIZE
    atlas = Image.new("RGBA", KEEPER_SAVE_FAMILY_SIZE, (0, 0, 0, 0))
    for row_index, row in enumerate(rows):
        for col_index, box in enumerate(row):
            if row_index == 1 and col_index in mirror_second_row_columns:
                sprite = ImageOps.mirror(source.crop(rows[0][col_index]))
            else:
                sprite = source.crop(box)
            sprite = remove_detached_fragments(sprite)
            alpha_box = sprite.getchannel("A").getbbox()
            if alpha_box:
                sprite = sprite.crop(alpha_box)
            # Body length remains constant while the silhouette rotates through
            # launch, contact and landing. This prevents visible scale pumping.
            scale = 205 / max(sprite.width, sprite.height)
            sprite = sprite.resize(
                (max(1, round(sprite.width * scale)), max(1, round(sprite.height * scale))),
                Image.Resampling.NEAREST,
            )
            if sprite.width > frame_width - 8 or sprite.height > frame_height - 8:
                raise ValueError(
                    f"{output_name} frame {row_index * 8 + col_index} does not fit: {sprite.size}"
                )
            x = col_index * frame_width + (frame_width - sprite.width) // 2
            y = row_index * frame_height + frame_height - sprite.height - 8
            atlas.alpha_composite(sprite, (x, y))
    atlas.save(OUT / output_name, optimize=True)


def build_keeper_dive_motion_atlas() -> None:
    """Pack 24 direction-authored motion phases on one visual baseline.

    Unlike the legacy dive rows, every phase uses the same bottom registration.
    Runtime can keep one origin and one world scale from planted stance through
    flight and turf impact; the projected lift supplies the airborne height.
    """
    source = Image.open(KEEPER_DIVE_MOTION_SOURCE).convert("RGBA")
    boxes = connected_component_boxes(source)
    if len(boxes) != 24:
        raise ValueError(f"keeper dive motion source must contain 24 figures, found {len(boxes)}")

    boxes.sort(key=lambda box: (box[1] + box[3]) / 2)
    rows = []
    for row_index in range(4):
        row = boxes[row_index * 6:(row_index + 1) * 6]
        row.sort(key=lambda box: (box[0] + box[2]) / 2)
        rows.append(row)

    frame_width, frame_height = KEEPER_FRAME_SIZE
    atlas = Image.new("RGBA", KEEPER_DIVE_MOTION_SIZE, (0, 0, 0, 0))
    for row_index, row in enumerate(rows):
        for col_index, box in enumerate(row):
            if row_index < 2:
                sprite = source.crop(box)
            else:
                # Image generation produced good individual silhouettes, but
                # several authored left-dive frames silently reversed their
                # body direction mid-sequence. Build the second direction as
                # a strict mirror of the clean twelve-frame master so every
                # phase is guaranteed to face the way the root is travelling.
                sprite = ImageOps.mirror(source.crop(rows[row_index - 2][col_index]))
            frame_index = row_index * 6 + col_index
            phase = frame_index % 12
            if phase <= 4:
                # Direction-authored standing poses vary slightly in source
                # size. Normalize their body height so left/right never pop.
                scale = 200 / sprite.height
            elif phase <= 9:
                # Airborne silhouettes are compared by overall reach rather
                # than height because their torso rotation changes the bounds.
                scale = 245 / max(sprite.width, sprite.height)
            else:
                # Descent and impact register by body length before recovery.
                scale = 195 / sprite.width
            if abs(scale - 1) > 0.001:
                sprite = sprite.resize(
                    (max(1, round(sprite.width * scale)), max(1, round(sprite.height * scale))),
                    Image.Resampling.NEAREST,
                )
            if sprite.width > frame_width - 8 or sprite.height > frame_height - 8:
                raise ValueError(
                    f"keeper dive motion frame {frame_index} does not fit "
                    f"inside {KEEPER_FRAME_SIZE}: {sprite.size}"
                )
            x = col_index * frame_width + (frame_width - sprite.width) // 2
            y = row_index * frame_height + frame_height - sprite.height - 8
            atlas.alpha_composite(sprite, (x, y))

    atlas.save(OUT / "keeper-dive-motion-sheet-hd.png", optimize=True)


def grid_cell_box(source: Image.Image, row: int, rows: int, col: int, cols: int):
    """Return a combined alpha box for one logical contact-sheet cell."""
    left = round(col * source.width / cols)
    right = round((col + 1) * source.width / cols)
    top = round(row * source.height / rows)
    bottom = round((row + 1) * source.height / rows)
    cell = source.crop((left, top, right, bottom))
    alpha_box = cell.getchannel("A").getbbox()
    if alpha_box is None:
        raise ValueError(f"empty sprite cell row={row} col={col}")
    return cell, alpha_box


def grouped_actor_boxes(source: Image.Image, row_counts: tuple[int, ...]):
    """Group detached football props with the nearest large keeper figure."""
    components = connected_component_boxes(source, minimum=80)
    frame_count = sum(row_counts)
    ranked = sorted(
        components,
        key=lambda box: (box[2] - box[0]) * (box[3] - box[1]),
        reverse=True,
    )
    actors = ranked[:frame_count]
    props = [
        box for box in components
        if box not in actors and (box[2] - box[0]) * (box[3] - box[1]) >= 400
    ]
    if len(actors) != frame_count:
        raise ValueError(f"expected {frame_count} keeper figures, found {len(actors)}")

    actors.sort(key=lambda box: (box[1] + box[3]) / 2)
    ordered = []
    cursor = 0
    for count in row_counts:
        row = actors[cursor:cursor + count]
        row.sort(key=lambda box: (box[0] + box[2]) / 2)
        ordered.extend(row)
        cursor += count

    grouped = []
    for actor in ordered:
        grouped.append({"actor": actor, "combined": actor})
    for prop in props:
        prop_x = (prop[0] + prop[2]) / 2
        prop_y = (prop[1] + prop[3]) / 2
        nearest = min(
            range(len(ordered)),
            key=lambda index: (
                ((ordered[index][0] + ordered[index][2]) / 2 - prop_x) ** 2 +
                ((ordered[index][1] + ordered[index][3]) / 2 - prop_y) ** 2
            ),
        )
        actor = grouped[nearest]["combined"]
        grouped[nearest]["combined"] = (
            min(actor[0], prop[0]), min(actor[1], prop[1]),
            max(actor[2], prop[2]), max(actor[3], prop[3]),
        )
    return grouped


def build_keeper_action_atlas(
    source_path: Path,
    output_name: str,
    row_counts: tuple[int, ...],
    atlas_columns: int,
    group_props: bool = False,
) -> None:
    """Pack regular or mixed-column action boards into contiguous frames.

    The distribution source intentionally uses 6/6/6/10 cells. Flattening the
    authored row order into a seven-column runtime sheet keeps frame ids 0–27
    contiguous for Phaser while retaining deterministic source extraction.
    """
    source = Image.open(source_path).convert("RGBA")
    frame_width, frame_height = KEEPER_FRAME_SIZE
    frame_count = sum(row_counts)
    atlas_rows = (frame_count + atlas_columns - 1) // atlas_columns
    atlas = Image.new(
        "RGBA",
        (atlas_columns * frame_width, atlas_rows * frame_height),
        (0, 0, 0, 0),
    )

    if group_props:
        ordered_boxes = [entry["combined"] for entry in grouped_actor_boxes(source, row_counts)]
    else:
        boxes = connected_component_boxes(source)
        if len(boxes) != frame_count:
            raise ValueError(
                f"{source_path.name} must contain {frame_count} isolated figures, found {len(boxes)}"
            )
        boxes.sort(key=lambda box: (box[1] + box[3]) / 2)
        ordered_boxes = []
        cursor = 0
        for count in row_counts:
            row = boxes[cursor:cursor + count]
            row.sort(key=lambda box: (box[0] + box[2]) / 2)
            ordered_boxes.extend(row)
            cursor += count

    for frame_index, box in enumerate(ordered_boxes):
        sprite = remove_detached_fragments(source.crop(box))
        scale = min(
            205 / max(sprite.height, 1),
            (frame_width - 16) / max(sprite.width, 1),
            (frame_height - 16) / max(sprite.height, 1),
        )
        sprite = sprite.resize(
            (max(1, round(sprite.width * scale)), max(1, round(sprite.height * scale))),
            Image.Resampling.NEAREST,
        )
        atlas_col = frame_index % atlas_columns
        atlas_row = frame_index // atlas_columns
        x = atlas_col * frame_width + (frame_width - sprite.width) // 2
        y = atlas_row * frame_height + frame_height - sprite.height - 8
        atlas.alpha_composite(sprite, (x, y))

    if atlas.size != (atlas_columns * frame_width, atlas_rows * frame_height):
        raise ValueError(f"unexpected atlas size for {output_name}: {atlas.size}")
    atlas.save(OUT / output_name, optimize=True)


def build_keeper_footwork_atlas() -> None:
    """Pack five planted shuffle frames per screen direction."""
    source = Image.open(KEEPER_FOOTWORK_SOURCE).convert("RGBA")
    frame_width, frame_height = KEEPER_FRAME_SIZE
    atlas = Image.new("RGBA", KEEPER_FOOTWORK_SIZE, (0, 0, 0, 0))
    for row in range(2):
        for col in range(5):
            cell, box = grid_cell_box(source, row, 2, col, 5)
            sprite = cell.crop(box)
            scale = 205 / sprite.height
            sprite = sprite.resize(
                (max(1, round(sprite.width * scale)), 205),
                Image.Resampling.NEAREST,
            )
            if sprite.width > frame_width - 8:
                raise ValueError(f"keeper footwork frame {row * 5 + col} is too wide: {sprite.size}")
            x = col * frame_width + (frame_width - sprite.width) // 2
            y = row * frame_height + frame_height - sprite.height - 8
            atlas.alpha_composite(sprite, (x, y))
    atlas.save(OUT / "keeper-footwork-sheet-hd.png", optimize=True)


def build_keeper_return_atlas() -> None:
    """Pack ten grounded return-to-set phases per travel direction."""
    source = Image.open(KEEPER_RETURN_SOURCE).convert("RGBA")
    boxes = connected_component_boxes(source)
    if len(boxes) != 18:
        raise ValueError(f"keeper return source must contain 18 figures, found {len(boxes)}")

    boxes.sort(key=lambda box: (box[1] + box[3]) / 2)
    rows = []
    for row_index in range(2):
        row = boxes[row_index * 9:(row_index + 1) * 9]
        row.sort(key=lambda box: (box[0] + box[2]) / 2)
        rows.append(row)

    frame_width, frame_height = KEEPER_FRAME_SIZE
    atlas = Image.new("RGBA", KEEPER_RETURN_SIZE, (0, 0, 0, 0))
    for row_index, row in enumerate(rows):
        for col_index, box in enumerate(row):
            sprite = remove_detached_fragments(source.crop(box))
            alpha_box = sprite.getchannel("A").getbbox()
            if alpha_box:
                sprite = sprite.crop(alpha_box)
            scale = 205 / sprite.height
            sprite = sprite.resize(
                (max(1, round(sprite.width * scale)), 205),
                Image.Resampling.NEAREST,
            )
            if sprite.width > frame_width - 8:
                raise ValueError(
                    f"keeper return frame {row_index * 9 + col_index} is too wide: {sprite.size}"
                )
            x = col_index * frame_width + (frame_width - sprite.width) // 2
            y = row_index * frame_height + frame_height - sprite.height - 8
            atlas.alpha_composite(sprite, (x, y))
    atlas.save(OUT / "keeper-return-sheet-hd.png", optimize=True)


def build_keeper_low_save_atlas() -> None:
    """Pack eight low side-save phases per screen direction."""
    source = Image.open(KEEPER_LOW_SAVE_SOURCE).convert("RGBA")
    boxes = connected_component_boxes(source)
    if len(boxes) != 16:
        raise ValueError(f"keeper low-save source must contain 16 figures, found {len(boxes)}")

    boxes.sort(key=lambda box: (box[1] + box[3]) / 2)
    rows = []
    for row_index in range(2):
        row = boxes[row_index * 8:(row_index + 1) * 8]
        row.sort(key=lambda box: (box[0] + box[2]) / 2)
        rows.append(row)

    frame_width, frame_height = KEEPER_FRAME_SIZE
    atlas = Image.new("RGBA", KEEPER_LOW_SAVE_SIZE, (0, 0, 0, 0))
    for row_index, row in enumerate(rows):
        for col_index, box in enumerate(row):
            sprite = remove_detached_fragments(source.crop(box))
            if col_index <= 3:
                scale = 205 / sprite.height
            else:
                # Low-flight silhouettes register by reach so launch, parry and
                # turf impact retain a constant body scale while rotating.
                scale = 250 / max(sprite.width, sprite.height)
            sprite = sprite.resize(
                (max(1, round(sprite.width * scale)), max(1, round(sprite.height * scale))),
                Image.Resampling.NEAREST,
            )
            if sprite.width > frame_width - 8 or sprite.height > frame_height - 8:
                raise ValueError(
                    f"keeper low-save frame {row_index * 8 + col_index} does not fit: {sprite.size}"
                )
            x = col_index * frame_width + (frame_width - sprite.width) // 2
            y = row_index * frame_height + frame_height - sprite.height - 8
            atlas.alpha_composite(sprite, (x, y))
    atlas.save(OUT / "keeper-low-save-sheet-hd.png", optimize=True)


def build_keeper_handling_atlas() -> None:
    """Pack low and chest handling into two regular four-frame rows."""
    source = Image.open(KEEPER_HANDLING_SOURCE).convert("RGBA")
    frame_width, frame_height = KEEPER_FRAME_SIZE
    atlas = Image.new("RGBA", KEEPER_HANDLING_SIZE, (0, 0, 0, 0))
    grouped = grouped_actor_boxes(source, (4, 4, 5))
    for row in range(2):
        cells = grouped[row * 4:(row + 1) * 4]
        # One row-wide scale preserves real pose compression between frames.
        reference_height = max(cell["actor"][3] - cell["actor"][1] for cell in cells)
        scale = 205 / reference_height
        for col, cell in enumerate(cells):
            sprite = source.crop(cell["combined"])
            sprite = sprite.resize(
                (max(1, round(sprite.width * scale)), max(1, round(sprite.height * scale))),
                Image.Resampling.NEAREST,
            )
            if sprite.width > frame_width - 8 or sprite.height > frame_height - 8:
                raise ValueError(f"keeper handling frame {row * 5 + col} does not fit: {sprite.size}")
            x = col * frame_width + (frame_width - sprite.width) // 2
            y = row * frame_height + frame_height - sprite.height - 8
            atlas.alpha_composite(sprite, (x, y))
    atlas.save(OUT / "keeper-handling-sheet-hd.png", optimize=True)


def build_keeper_high_claim_atlas() -> None:
    """Pack the five-frame jump while retaining authored baseline clearance."""
    source = Image.open(KEEPER_HIGH_CLAIM_SOURCE).convert("RGBA")
    cells = grouped_actor_boxes(source, (5,))
    grounded_reference = max(
        cells[index]["actor"][3] - cells[index]["actor"][1] for index in (0, 4)
    )
    scale = 205 / grounded_reference
    baseline = max(cells[index]["actor"][3] for index in (0, 4))
    frame_width, frame_height = (320, 360)
    atlas = Image.new("RGBA", KEEPER_HIGH_CLAIM_SIZE, (0, 0, 0, 0))
    for col, cell in enumerate(cells):
        sprite = source.crop(cell["combined"])
        sprite = sprite.resize(
            (max(1, round(sprite.width * scale)), max(1, round(sprite.height * scale))),
            Image.Resampling.NEAREST,
        )
        clearance = max(0, round((baseline - cell["actor"][3]) * scale))
        if sprite.width > frame_width - 8 or sprite.height + clearance > frame_height - 8:
            raise ValueError(f"keeper high-claim frame {col} does not fit: {sprite.size}, lift={clearance}")
        x = col * frame_width + (frame_width - sprite.width) // 2
        y = frame_height - sprite.height - clearance - 8
        atlas.alpha_composite(sprite, (x, y))
    atlas.save(OUT / "keeper-high-claim-sheet-hd.png", optimize=True)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    source = Image.open(SOURCE).convert("RGBA")
    build_keeper_animation_atlas()
    build_keeper_recovery_atlas()
    build_keeper_dive_motion_atlas()
    build_keeper_footwork_atlas()
    build_keeper_return_atlas()
    build_keeper_low_save_atlas()
    build_keeper_handling_atlas()
    build_keeper_high_claim_atlas()
    build_keeper_save_family_atlas(
        KEEPER_LOW_SMOTHER_SOURCE,
        "keeper-low-smother-sheet-hd.png",
    )
    build_keeper_save_family_atlas(
        KEEPER_MID_CATCH_SOURCE,
        "keeper-mid-catch-sheet-hd.png",
    )
    build_keeper_save_family_atlas(
        KEEPER_UPPER_PARRY_SOURCE,
        "keeper-upper-parry-sheet-hd.png",
        reverse_second_row=True,
    )
    build_keeper_save_family_atlas(
        KEEPER_TOP_TIP_SOURCE,
        "keeper-top-tip-sheet-hd.png",
    )
    build_keeper_save_family_atlas(
        KEEPER_REFLEX_FOOT_SOURCE,
        "keeper-reflex-foot-sheet-hd.png",
        mirror_second_row_columns=(4,),
    )
    build_keeper_action_atlas(
        KEEPER_SITUATIONAL_PUNCH_SOURCE,
        "keeper-situational-punch-sheet-hd.png",
        (6, 6, 6, 6),
        6,
    )
    build_keeper_action_atlas(
        KEEPER_DISTRIBUTION_SOURCE,
        "keeper-distribution-sheet-hd.png",
        (6, 6, 6, 10),
        7,
        group_props=True,
    )
    build_keeper_action_atlas(
        KEEPER_FOOT_DISTRIBUTION_SOURCE,
        "keeper-foot-distribution-sheet-hd.png",
        (6, 6, 6, 6, 6),
        6,
        group_props=True,
    )
    build_keeper_action_atlas(
        KEEPER_REACTIONS_SOURCE,
        "keeper-reactions-sheet-hd.png",
        (6, 6, 6),
        6,
    )

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
