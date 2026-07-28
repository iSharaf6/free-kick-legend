#!/usr/bin/env python3
"""Key, normalize and pack five authored five-frame crowd animation sets."""

from pathlib import Path
import struct
import zlib

from build_chroma_crowd import build_chroma_mask

ROOT = Path(__file__).resolve().parents[1]
SOURCE_DIR = ROOT / "assets/source"
OUTPUT_DIR = ROOT / "public/assets/hd"
SET_COUNT = 5
FRAME_COUNT = 5
FRAME_W = 384
FRAME_H = 216


def decode_rgb_png(path: Path) -> tuple[int, int, bytearray]:
    data = path.read_bytes()
    if data[:8] != b"\x89PNG\r\n\x1a\n":
        raise ValueError(f"Not a PNG: {path}")

    width = height = 0
    compressed = bytearray()
    offset = 8
    while offset < len(data):
        length = struct.unpack(">I", data[offset:offset + 4])[0]
        kind = data[offset + 4:offset + 8]
        chunk = data[offset + 8:offset + 8 + length]
        offset += length + 12
        if kind == b"IHDR":
            width, height, depth, color_type = struct.unpack(">IIBB", chunk[:10])
            if depth != 8 or color_type != 2:
                raise ValueError(f"Expected 8-bit RGB PNG: {path}")
        elif kind == b"IDAT":
            compressed.extend(chunk)

    decoded = zlib.decompress(compressed)
    row_bytes = width * 3
    stride = row_bytes + 1
    pixels = bytearray(width * height * 3)
    previous = bytearray(row_bytes)

    for y in range(height):
        row = decoded[y * stride:(y + 1) * stride]
        filter_type = row[0]
        current = bytearray(row_bytes)
        for i in range(row_bytes):
            raw = row[i + 1]
            left = current[i - 3] if i >= 3 else 0
            up = previous[i]
            upper_left = previous[i - 3] if i >= 3 else 0
            if filter_type == 0:
                value = raw
            elif filter_type == 1:
                value = raw + left
            elif filter_type == 2:
                value = raw + up
            elif filter_type == 3:
                value = raw + ((left + up) // 2)
            elif filter_type == 4:
                prediction = left + up - upper_left
                distances = (abs(prediction - left), abs(prediction - up), abs(prediction - upper_left))
                predictor = (left, up, upper_left)[distances.index(min(distances))]
                value = raw + predictor
            else:
                raise ValueError(f"Unsupported PNG filter {filter_type}: {path}")
            current[i] = value & 0xFF
        pixels[y * row_bytes:(y + 1) * row_bytes] = current
        previous = current
    return width, height, pixels


def frame_bbox(mask: bytearray, width: int, height: int, frame: int) -> tuple[int, int, int, int]:
    x0 = round(frame * width / FRAME_COUNT)
    x1 = round((frame + 1) * width / FRAME_COUNT)
    visible = [
        (x, y)
        for y in range(height)
        for x in range(x0, x1)
        if not mask[y * width + x]
    ]
    if not visible:
        raise ValueError(f"Frame {frame} contains no crowd pixels")
    left = min(x for x, _ in visible)
    top = min(y for _, y in visible)
    right = max(x for x, _ in visible) + 1
    bottom = max(y for _, y in visible) + 1
    return left, top, right, bottom


def pack_set(source: Path, output: Path) -> None:
    width, height, pixels = decode_rgb_png(source)
    mask = build_chroma_mask(pixels, width, height)
    atlas = bytearray(FRAME_W * FRAME_COUNT * FRAME_H * 4)

    for frame in range(FRAME_COUNT):
        left, top, right, bottom = frame_bbox(mask, width, height, frame)
        crop_w = right - left
        crop_h = bottom - top
        for out_y in range(FRAME_H):
            source_y = top + min(crop_h - 1, (out_y * crop_h) // FRAME_H)
            for out_x in range(FRAME_W):
                source_x = left + min(crop_w - 1, (out_x * crop_w) // FRAME_W)
                source_index = source_y * width + source_x
                target_x = frame * FRAME_W + out_x
                target_index = (out_y * FRAME_W * FRAME_COUNT + target_x) * 4
                if mask[source_index]:
                    atlas[target_index:target_index + 4] = b"\x00\x00\x00\x00"
                else:
                    rgb = source_index * 3
                    atlas[target_index:target_index + 4] = bytes((
                        pixels[rgb], pixels[rgb + 1], pixels[rgb + 2], 255
                    ))

    raw = bytearray()
    atlas_row = FRAME_W * FRAME_COUNT * 4
    for y in range(FRAME_H):
        raw.append(0)
        raw.extend(atlas[y * atlas_row:(y + 1) * atlas_row])

    def chunk(kind: bytes, payload: bytes) -> bytes:
        crc = zlib.crc32(kind + payload) & 0xFFFFFFFF
        return struct.pack(">I", len(payload)) + kind + payload + struct.pack(">I", crc)

    png = bytearray(b"\x89PNG\r\n\x1a\n")
    png.extend(chunk(b"IHDR", struct.pack(">IIBBBBB", FRAME_W * FRAME_COUNT, FRAME_H, 8, 6, 0, 0, 0)))
    png.extend(chunk(b"IDAT", zlib.compress(bytes(raw), 9)))
    png.extend(chunk(b"IEND", b""))
    output.write_bytes(png)


def build() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    for set_number in range(1, SET_COUNT + 1):
        source = SOURCE_DIR / f"crowd-set-{set_number}-chroma.png"
        output = OUTPUT_DIR / f"crowd-set-{set_number}-atlas.png"
        pack_set(source, output)
        print(f"Generated crowd set {set_number}: {output} ({FRAME_W * FRAME_COUNT}x{FRAME_H})")


if __name__ == "__main__":
    build()
