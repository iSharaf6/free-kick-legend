#!/usr/bin/env python3
"""Crop and chroma-key the authored crowd panorama for the runtime."""

from pathlib import Path
import struct
import zlib

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "assets/source/crowd-panorama-v3-chroma.png"
OUTPUT = ROOT / "public/assets/hd/crowd-panorama-v3-clean.png"


def is_flat_chroma(r: int, g: int, b: int) -> bool:
    return (
        r >= 128
        and b >= 128
        and g <= 96
        and r - g >= 80
        and b - g >= 80
        and abs(r - b) <= 72
    )


def is_chroma_fringe(r: int, g: int, b: int) -> bool:
    return (
        r >= 32
        and b >= 32
        and g <= 72
        and r - g >= 24
        and b - g >= 24
        and abs(r - b) <= 64
    )


def build_chroma_mask(pixels: bytearray, width: int, height: int) -> bytearray:
    """Remove dark key spill only where it touches the keyed background."""
    mask = bytearray(width * height)
    for y in range(height):
        for x in range(width):
            i = (y * width + x) * 3
            mask[y * width + x] = is_flat_chroma(pixels[i], pixels[i + 1], pixels[i + 2])

    # The source's nearest-neighbour fringe is one pixel wide. Two adjacency
    # passes catch diagonal corners without globally deleting burgundy shirts.
    for _ in range(2):
        expanded = bytearray(mask)
        for y in range(height):
            for x in range(width):
                p = y * width + x
                if mask[p]:
                    continue
                i = p * 3
                if not is_chroma_fringe(pixels[i], pixels[i + 1], pixels[i + 2]):
                    continue
                touches_key = any(
                    mask[ny * width + nx]
                    for ny in range(max(0, y - 1), min(height, y + 2))
                    for nx in range(max(0, x - 1), min(width, x + 2))
                )
                if touches_key:
                    expanded[p] = 1
        mask = expanded
    return mask


def build() -> None:
    if not SOURCE.exists():
        raise FileNotFoundError(f"Source file missing: {SOURCE}")

    with open(SOURCE, "rb") as f:
        data = f.read()

    idx = 8
    raw = bytearray()
    width = height = 0
    while idx < len(data):
        length = struct.unpack(">I", data[idx:idx+4])[0]
        ctype = data[idx+4:idx+8]
        chunk = data[idx+8:idx+8+length]
        idx += 12 + length
        if ctype == b"IHDR":
            width, height = struct.unpack(">II", chunk[:8])
        elif ctype == b"IDAT":
            raw.extend(chunk)

    decomp = zlib.decompress(raw)
    stride = 1 + width * 3
    pixels = bytearray(width * height * 3)
    prev = bytearray(width * 3)

    for y in range(height):
        line = decomp[y * stride : (y + 1) * stride]
        ftype = line[0]
        curr = bytearray(width * 3)
        if ftype == 0:
            curr = bytearray(line[1:])
        elif ftype == 1:
            for x in range(width * 3):
                curr[x] = (line[1 + x] + (curr[x - 3] if x >= 3 else 0)) & 0xff
        elif ftype == 2:
            for x in range(width * 3):
                curr[x] = (line[1 + x] + prev[x]) & 0xff
        elif ftype == 3:
            for x in range(width * 3):
                curr[x] = (line[1 + x] + ((curr[x - 3] if x >= 3 else 0) + prev[x]) // 2) & 0xff
        elif ftype == 4:
            for x in range(width * 3):
                a = curr[x - 3] if x >= 3 else 0
                b = prev[x]
                c = prev[x - 3] if x >= 3 else 0
                p = a + b - c
                pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
                pr = a if pa <= pb and pa <= pc else (b if pb <= pc else c)
                curr[x] = (line[1 + x] + pr) & 0xff
        pixels[y * width * 3 : (y + 1) * width * 3] = curr
        prev = curr

    chroma_mask = build_chroma_mask(pixels, width, height)

    # Derive the tight content rectangle after keying. The source has a large
    # magenta area above and below the stand plus a few key-colour edge columns.
    opaque = []
    for y in range(height):
        for x in range(width):
            idx_p = (y * width + x) * 3
            if not chroma_mask[y * width + x]:
                opaque.append((x, y))

    if not opaque:
        raise ValueError("Source contains no non-chroma crowd pixels")

    crop_x0 = min(x for x, _ in opaque)
    crop_y0 = min(y for _, y in opaque)
    crop_x1 = max(x for x, _ in opaque) + 1
    crop_y1 = max(y for _, y in opaque) + 1
    crop_w = crop_x1 - crop_x0
    crop_h = crop_y1 - crop_y0

    rgba_raw = bytearray()
    for y in range(crop_y0, crop_y0 + crop_h):
        rgba_raw.append(0)  # Filter type 0 (None)
        for x in range(crop_x0, crop_x1):
            idx_p = (y * width + x) * 3
            r, g, b = pixels[idx_p], pixels[idx_p+1], pixels[idx_p+2]
            if chroma_mask[y * width + x]:
                rgba_raw.extend([0, 0, 0, 0])
            else:
                rgba_raw.extend([r, g, b, 255])

    compressed_idat = zlib.compress(bytes(rgba_raw), 9)

    def make_chunk(ctype, chunk_data):
        return struct.pack(">I", len(chunk_data)) + ctype + chunk_data + struct.pack(">I", zlib.crc32(ctype + chunk_data) & 0xffffffff)

    png_bytes = bytearray(b"\x89PNG\r\n\x1a\n")
    ihdr = struct.pack(">IIBBBBB", crop_w, crop_h, 8, 6, 0, 0, 0)
    png_bytes.extend(make_chunk(b"IHDR", ihdr))
    png_bytes.extend(make_chunk(b"IDAT", compressed_idat))
    png_bytes.extend(make_chunk(b"IEND", b""))

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT, "wb") as f:
        f.write(png_bytes)

    print(
        f"Generated clean transparent crowd PNG: {OUTPUT} "
        f"from crop x={crop_x0}, y={crop_y0}, width={crop_w}, height={crop_h}"
    )


if __name__ == "__main__":
    build()
