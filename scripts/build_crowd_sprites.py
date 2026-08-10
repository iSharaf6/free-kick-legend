#!/usr/bin/env python3
"""Publish three identity-locked, 10-frame crowd atlases.

The image-generated boards are the donor library, not animation frames. Their
independent cells were excellent for finding hundreds of distinctive faces but
could not be played sequentially without the whole roster morphing. This build
therefore assembles one canonical seven-row cast from those donors exactly once,
then derives moving, goal and ball-out poses by moving fixed four-person groups
and drawing small arm accents over the same people. Faces, clothes, ordering,
camera and seat rails are consequently identical in all 30 runtime frames.

Every 960x196 frame renders at one-half scale in Phaser: 480x98 logical pixels,
exactly the stadium band, and two backing pixels per source pixel on the 4x HD
camera. The implementation is stdlib-only so the authored assets regenerate in
the default workspace Python without Pillow.
"""

from pathlib import Path
import struct
import zlib


ROOT = Path(__file__).resolve().parents[1]
SOURCE_DIR = ROOT / "assets/source/crowd-v3"
OUTPUT_DIR = ROOT / "public/assets/hd"

GENERATED_BOARDS = {
    "moving": "crowd-moving-generated.png",
    "goal": "crowd-goal-generated.png",
    "out": "crowd-out-generated.png",
}

SOURCE_SIZE = (1536, 1024)
COLUMNS = 2
ROWS = 5
FRAME_COUNT = COLUMNS * ROWS

# Cell borders produced by the generator.  The content boxes are deliberately
# shared across all three state boards so changing state cannot move the crowd.
CELL_LEFTS = (9, 776)
CELL_TOPS = (10, 212, 412, 614, 817)
CROP_OFFSET = (16, 5)
CROP_SIZE = (720, 147)

FRAME_SIZE = (960, 196)
SHEET_SIZE = (FRAME_SIZE[0] * COLUMNS, FRAME_SIZE[1] * ROWS)

ROSTER_ROWS = 7
ROW_PITCH = 28
ROW_ART_HEIGHT = 25
HALF_ROW_WIDTH = FRAME_SIZE[0] // 2
GROUP_WIDTH = 60
SUPPORTER_PITCH = 15

# Each canonical row concatenates two independently generated donor rows after
# a uniform 1/2 nearest-neighbour reduction. No donor is ever swapped again.
DONOR_ROWS = (
    ((0, 0), (1, 1)),
    ((2, 2), (3, 3)),
    ((4, 1), (5, 0)),
    ((6, 3), (7, 2)),
    ((8, 0), (9, 1)),
    ((1, 3), (4, 2)),
    ((5, 1), (8, 3)),
)

INK = (3, 10, 17)
RAIL_TOP = (20, 31, 39)
RAIL_BOTTOM = (7, 15, 23)
SKIN_TONES = (
    (244, 199, 143),
    (219, 156, 102),
    (180, 112, 73),
    (132, 78, 52),
    (91, 53, 39),
)
ACCENTS = (
    (226, 164, 34),
    (62, 111, 159),
    (217, 221, 208),
    (153, 54, 45),
    (50, 130, 91),
)
GOAL_LIFT = (0, 1, 3, 6, 7, 5, 3, 2, 1, 0)
OUT_SLUMP = (0, 1, 1, 2, 3, 3, 2, 1, 1, 0)

PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"


def paeth(left: int, above: int, upper_left: int) -> int:
    estimate = left + above - upper_left
    left_distance = abs(estimate - left)
    above_distance = abs(estimate - above)
    corner_distance = abs(estimate - upper_left)
    if left_distance <= above_distance and left_distance <= corner_distance:
        return left
    return above if above_distance <= corner_distance else upper_left


def read_rgb_png(path: Path) -> tuple[int, int, bytearray]:
    """Read the generator's non-interlaced, 8-bit RGB PNG without Pillow."""
    data = path.read_bytes()
    if not data.startswith(PNG_SIGNATURE):
        raise ValueError(f"{path}: not a PNG")

    width = height = 0
    idat = bytearray()
    offset = len(PNG_SIGNATURE)
    while offset < len(data):
        length = struct.unpack(">I", data[offset:offset + 4])[0]
        chunk_type = data[offset + 4:offset + 8]
        chunk = data[offset + 8:offset + 8 + length]
        offset += 12 + length
        if chunk_type == b"IHDR":
            width, height, depth, color_type, compression, filtering, interlace = struct.unpack(
                ">IIBBBBB", chunk
            )
            if (depth, color_type, compression, filtering, interlace) != (8, 2, 0, 0, 0):
                raise ValueError(
                    f"{path}: expected non-interlaced 8-bit RGB PNG, got "
                    f"depth={depth}, color={color_type}, interlace={interlace}"
                )
        elif chunk_type == b"IDAT":
            idat.extend(chunk)
        elif chunk_type == b"IEND":
            break

    if not width or not height or not idat:
        raise ValueError(f"{path}: incomplete PNG")

    packed = zlib.decompress(idat)
    row_bytes = width * 3
    expected = height * (row_bytes + 1)
    if len(packed) != expected:
        raise ValueError(f"{path}: expected {expected} decoded bytes, got {len(packed)}")

    pixels = bytearray(width * height * 3)
    previous = bytearray(row_bytes)
    for y in range(height):
        source = packed[y * (row_bytes + 1):(y + 1) * (row_bytes + 1)]
        filter_type = source[0]
        encoded = source[1:]
        current = bytearray(row_bytes)
        for i, value in enumerate(encoded):
            left = current[i - 3] if i >= 3 else 0
            above = previous[i]
            upper_left = previous[i - 3] if i >= 3 else 0
            if filter_type == 0:
                decoded = value
            elif filter_type == 1:
                decoded = value + left
            elif filter_type == 2:
                decoded = value + above
            elif filter_type == 3:
                decoded = value + ((left + above) // 2)
            elif filter_type == 4:
                decoded = value + paeth(left, above, upper_left)
            else:
                raise ValueError(f"{path}: unsupported PNG filter {filter_type}")
            current[i] = decoded & 0xFF
        pixels[y * row_bytes:(y + 1) * row_bytes] = current
        previous = current
    return width, height, pixels


def png_chunk(chunk_type: bytes, data: bytes) -> bytes:
    checksum = zlib.crc32(chunk_type + data) & 0xFFFFFFFF
    return struct.pack(">I", len(data)) + chunk_type + data + struct.pack(">I", checksum)


def write_rgb_png(path: Path, width: int, height: int, pixels: bytearray) -> None:
    row_bytes = width * 3
    scanlines = bytearray()
    for y in range(height):
        scanlines.append(0)
        scanlines.extend(pixels[y * row_bytes:(y + 1) * row_bytes])
    header = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
    encoded = bytearray(PNG_SIGNATURE)
    encoded.extend(png_chunk(b"IHDR", header))
    encoded.extend(png_chunk(b"IDAT", zlib.compress(bytes(scanlines), 9)))
    encoded.extend(png_chunk(b"IEND", b""))
    path.write_bytes(encoded)


def frame_box(column: int, row: int) -> tuple[int, int, int, int]:
    left = CELL_LEFTS[column] + CROP_OFFSET[0]
    top = CELL_TOPS[row] + CROP_OFFSET[1]
    return left, top, left + CROP_SIZE[0], top + CROP_SIZE[1]


def resize_region(
    source: bytearray,
    source_width: int,
    box: tuple[int, int, int, int],
    target_width: int,
    target_height: int,
) -> bytearray:
    """Nearest-neighbour resize through destination pixel centres."""
    left, top, right, bottom = box
    source_height = len(source) // (source_width * 3)
    if left < 0 or top < 0 or right > source_width or bottom > source_height:
        raise ValueError(f"invalid RGB crop {box} inside {source_width}x{source_height}")
    crop_width = right - left
    crop_height = bottom - top
    source_x = [((x * 2 + 1) * crop_width) // (target_width * 2) for x in range(target_width)]
    source_y = [((y * 2 + 1) * crop_height) // (target_height * 2) for y in range(target_height)]
    output = bytearray(target_width * target_height * 3)
    for y, crop_y in enumerate(source_y):
        source_row = (top + crop_y) * source_width * 3
        output_row = y * target_width * 3
        for x, crop_x in enumerate(source_x):
            source_offset = source_row + (left + crop_x) * 3
            output_offset = output_row + x * 3
            output[output_offset:output_offset + 3] = source[source_offset:source_offset + 3]
    return output


def generated_frames(source: bytearray, source_width: int) -> list[bytearray]:
    frames = []
    for frame_index in range(FRAME_COUNT):
        column = frame_index % COLUMNS
        row = frame_index // COLUMNS
        frames.append(resize_region(source, source_width, frame_box(column, row), *FRAME_SIZE))
    return frames


def set_pixel(pixels: bytearray, width: int, height: int, x: int, y: int, color: tuple[int, int, int]) -> None:
    if not (0 <= x < width and 0 <= y < height):
        return
    offset = (y * width + x) * 3
    pixels[offset:offset + 3] = bytes(color)


def draw_line(
    pixels: bytearray,
    width: int,
    height: int,
    x0: int,
    y0: int,
    x1: int,
    y1: int,
    color: tuple[int, int, int],
) -> None:
    dx = abs(x1 - x0)
    sx = 1 if x0 < x1 else -1
    dy = -abs(y1 - y0)
    sy = 1 if y0 < y1 else -1
    error = dx + dy
    while True:
        set_pixel(pixels, width, height, x0, y0, color)
        if x0 == x1 and y0 == y1:
            return
        doubled = error * 2
        if doubled >= dy:
            error += dy
            x0 += sx
        if doubled <= dx:
            error += dx
            y0 += sy


def fill_rect(
    pixels: bytearray,
    width: int,
    height: int,
    x: int,
    y: int,
    rect_width: int,
    rect_height: int,
    color: tuple[int, int, int],
) -> None:
    x0 = max(0, x)
    y0 = max(0, y)
    x1 = min(width, x + rect_width)
    y1 = min(height, y + rect_height)
    row = bytes(color) * max(0, x1 - x0)
    for py in range(y0, y1):
        offset = (py * width + x0) * 3
        pixels[offset:offset + len(row)] = row


def add_identity_details(row_pixels: bytearray, roster_row: int) -> None:
    """Keep small accessories on the cast itself, never on reaction layers."""
    for supporter in range(FRAME_SIZE[0] // SUPPORTER_PITCH):
        signature = (supporter * 37 + roster_row * 53 + 17) % 17
        center_x = supporter * SUPPORTER_PITCH + SUPPORTER_PITCH // 2
        accent = ACCENTS[(supporter + roster_row * 2) % len(ACCENTS)]
        if signature in (0, 1, 2):
            fill_rect(row_pixels, FRAME_SIZE[0], ROW_ART_HEIGHT, center_x - 3, 12, 7, 1, accent)
        elif signature in (3, 4):
            fill_rect(row_pixels, FRAME_SIZE[0], ROW_ART_HEIGHT, center_x - 3, 1, 6, 1, accent)
        elif signature == 5:
            # A tiny glasses bridge remains legible at the 2x backing scale.
            fill_rect(row_pixels, FRAME_SIZE[0], ROW_ART_HEIGHT, center_x - 3, 6, 2, 1, INK)
            fill_rect(row_pixels, FRAME_SIZE[0], ROW_ART_HEIGHT, center_x + 1, 6, 2, 1, INK)
            set_pixel(row_pixels, FRAME_SIZE[0], ROW_ART_HEIGHT, center_x, 6, INK)


def build_roster_rows(donors: list[bytearray]) -> list[bytearray]:
    donor_band_height = FRAME_SIZE[1] // 4
    roster = []
    for roster_row, ((left_frame, left_band), (right_frame, right_band)) in enumerate(DONOR_ROWS):
        left_top = left_band * donor_band_height
        right_top = right_band * donor_band_height
        left_half = resize_region(
            donors[left_frame], FRAME_SIZE[0],
            (0, left_top, FRAME_SIZE[0], left_top + donor_band_height),
            HALF_ROW_WIDTH, ROW_ART_HEIGHT,
        )
        right_half = resize_region(
            donors[right_frame], FRAME_SIZE[0],
            (0, right_top, FRAME_SIZE[0], right_top + donor_band_height),
            HALF_ROW_WIDTH, ROW_ART_HEIGHT,
        )
        row_pixels = bytearray(FRAME_SIZE[0] * ROW_ART_HEIGHT * 3)
        for y in range(ROW_ART_HEIGHT):
            target = y * FRAME_SIZE[0] * 3
            half = y * HALF_ROW_WIDTH * 3
            row_pixels[target:target + HALF_ROW_WIDTH * 3] = left_half[half:half + HALF_ROW_WIDTH * 3]
            row_pixels[target + HALF_ROW_WIDTH * 3:target + FRAME_SIZE[0] * 3] = (
                right_half[half:half + HALF_ROW_WIDTH * 3]
            )
        add_identity_details(row_pixels, roster_row)
        roster.append(row_pixels)
    return roster


def group_offset(state: str, frame_index: int, roster_row: int, group: int) -> int:
    if frame_index == 0:
        return 0
    if state == "moving":
        if frame_index == FRAME_COUNT - 1:
            return -1 if (group * 5 + roster_row * 3) % 13 == 0 else 0
        wave = (-1, 0, 1, 0, 0, -1, 0, 1)
        return wave[(frame_index + group * 3 + roster_row * 2) % len(wave)]
    if state == "goal":
        if frame_index == FRAME_COUNT - 1:
            return -1 if (group * 7 + roster_row * 5) % 17 == 0 else 0
        lift = GOAL_LIFT[frame_index]
        return -max(0, lift - ((group + roster_row + frame_index) % 3))
    if state == "out":
        if frame_index == FRAME_COUNT - 1:
            return 1 if (group * 3 + roster_row * 7) % 19 == 0 else 0
        slump = OUT_SLUMP[frame_index]
        offset = max(0, slump - ((group + roster_row + frame_index) % 2))
        # The rise and settle halves intentionally revisit the same broad pose,
        # but sparse one-pixel group motion keeps all ten authored sprites
        # distinct without redrawing or changing any supporter identity.
        if (group * 5 + roster_row * 3 + frame_index * 7) % 17 == frame_index % 5:
            offset += 1
        return offset
    raise ValueError(f"unknown crowd state: {state}")


def copy_group(
    frame: bytearray,
    row_pixels: bytearray,
    roster_row: int,
    group: int,
    y_offset: int,
) -> None:
    source_x = group * GROUP_WIDTH
    width = min(GROUP_WIDTH, FRAME_SIZE[0] - source_x)
    target_y = roster_row * ROW_PITCH + y_offset
    for y in range(ROW_ART_HEIGHT):
        destination_y = target_y + y
        if not 0 <= destination_y < FRAME_SIZE[1]:
            continue
        source_offset = (y * FRAME_SIZE[0] + source_x) * 3
        destination_offset = (destination_y * FRAME_SIZE[0] + source_x) * 3
        frame[destination_offset:destination_offset + width * 3] = (
            row_pixels[source_offset:source_offset + width * 3]
        )


def draw_reaction_arms(frame: bytearray, state: str, frame_index: int) -> None:
    if frame_index == 0 or state == "moving":
        return
    goal_lift = GOAL_LIFT[frame_index] if state == "goal" else 0
    out_slump = OUT_SLUMP[frame_index] if state == "out" else 0
    for roster_row in range(ROSTER_ROWS):
        for supporter in range(FRAME_SIZE[0] // SUPPORTER_PITCH):
            if (supporter * 11 + roster_row * 7) % 5 == 0:
                continue
            center_x = supporter * SUPPORTER_PITCH + SUPPORTER_PITCH // 2
            group = center_x // GROUP_WIDTH
            offset = group_offset(state, frame_index, roster_row, group)
            base_y = roster_row * ROW_PITCH + offset
            shoulder_y = base_y + 15
            skin = SKIN_TONES[(supporter * 3 + roster_row) % len(SKIN_TONES)]
            if state == "goal":
                local_lift = max(0, goal_lift - ((group + roster_row + frame_index) % 3))
                if local_lift <= 0:
                    continue
                hand_y = base_y + max(1, 9 - local_lift)
                draw_line(frame, *FRAME_SIZE, center_x - 3, shoulder_y, center_x - 6, hand_y, skin)
                draw_line(frame, *FRAME_SIZE, center_x + 3, shoulder_y, center_x + 6, hand_y, skin)
                set_pixel(frame, *FRAME_SIZE, center_x - 6, hand_y - 1, skin)
                set_pixel(frame, *FRAME_SIZE, center_x + 6, hand_y - 1, skin)
            elif out_slump > 0:
                # Both hands close over the head while the rigid identity tile
                # settles down into the seat.
                draw_line(frame, *FRAME_SIZE, center_x - 3, shoulder_y, center_x - 5, base_y + 7, skin)
                draw_line(frame, *FRAME_SIZE, center_x + 3, shoulder_y, center_x + 5, base_y + 7, skin)
                set_pixel(frame, *FRAME_SIZE, center_x - 3, base_y + 4, skin)
                set_pixel(frame, *FRAME_SIZE, center_x + 3, base_y + 4, skin)


def render_frame(roster: list[bytearray], state: str, frame_index: int) -> bytearray:
    frame = bytearray(bytes(INK) * (FRAME_SIZE[0] * FRAME_SIZE[1]))
    for roster_row, row_pixels in enumerate(roster):
        for group in range((FRAME_SIZE[0] + GROUP_WIDTH - 1) // GROUP_WIDTH):
            copy_group(
                frame,
                row_pixels,
                roster_row,
                group,
                group_offset(state, frame_index, roster_row, group),
            )
    draw_reaction_arms(frame, state, frame_index)
    # Rails are the final foreground pass, so even raised arms from the row
    # behind cannot redraw or displace the fixed stand structure.
    for roster_row in range(ROSTER_ROWS):
        rail_y = roster_row * ROW_PITCH + ROW_ART_HEIGHT
        fill_rect(frame, *FRAME_SIZE, 0, rail_y, FRAME_SIZE[0], 1, RAIL_TOP)
        fill_rect(frame, *FRAME_SIZE, 0, rail_y + 1, FRAME_SIZE[0], 2, RAIL_BOTTOM)
    return frame


def build_sheet(state: str, roster: list[bytearray]) -> Path:
    output = bytearray(SHEET_SIZE[0] * SHEET_SIZE[1] * 3)
    for frame_index in range(FRAME_COUNT):
        frame = render_frame(roster, state, frame_index)
        column = frame_index % COLUMNS
        row = frame_index // COLUMNS
        for y in range(FRAME_SIZE[1]):
            source_offset = y * FRAME_SIZE[0] * 3
            destination_offset = (
                ((row * FRAME_SIZE[1] + y) * SHEET_SIZE[0]) + column * FRAME_SIZE[0]
            ) * 3
            output[destination_offset:destination_offset + FRAME_SIZE[0] * 3] = (
                frame[source_offset:source_offset + FRAME_SIZE[0] * 3]
            )

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    output_path = OUTPUT_DIR / f"crowd-{state}-sheet-v3.png"
    write_rgb_png(output_path, *SHEET_SIZE, output)
    return output_path


def build() -> None:
    moving_source = None
    moving_width = 0
    for state, filename in GENERATED_BOARDS.items():
        source_path = SOURCE_DIR / filename
        source_width, source_height, source = read_rgb_png(source_path)
        if (source_width, source_height) != SOURCE_SIZE:
            raise ValueError(
                f"{source_path}: expected {SOURCE_SIZE}, got {(source_width, source_height)}"
            )
        if state == "moving":
            moving_source = source
            moving_width = source_width
    if moving_source is None:
        raise ValueError("moving crowd donor board is missing")

    roster = build_roster_rows(generated_frames(moving_source, moving_width))
    outputs = [build_sheet(state, roster) for state in GENERATED_BOARDS]
    for output in outputs:
        print(
            f"Wrote {output.relative_to(ROOT)} "
            f"({SHEET_SIZE[0]}x{SHEET_SIZE[1]}, {FRAME_COUNT} frames)"
        )


if __name__ == "__main__":
    build()
