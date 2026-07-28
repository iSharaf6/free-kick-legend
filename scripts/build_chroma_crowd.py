#!/usr/bin/env python3
"""Chroma key magenta out of crowd-panorama-v3-chroma.png and output crowd-panorama-v3-clean.png"""

from pathlib import Path
import struct
import zlib

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "assets/source/crowd-panorama-v3-chroma.png"
OUTPUT = ROOT / "public/assets/hd/crowd-panorama-v3-clean.png"


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

    # Crop vertical top magenta block (y=271 to y=860) -> height = 590
    crop_y0 = 271
    crop_h = 590
    crop_w = width

    rgba_raw = bytearray()
    for y in range(crop_y0, crop_y0 + crop_h):
        rgba_raw.append(0)  # Filter type 0 (None)
        for x in range(crop_w):
            idx_p = (y * width + x) * 3
            r, g, b = pixels[idx_p], pixels[idx_p+1], pixels[idx_p+2]
            # Key out magenta (R > 220, G < 40, B > 220)
            if r > 220 and g < 40 and b > 220:
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

    print(f"Generated clean transparent crowd PNG: {OUTPUT} ({crop_w}x{crop_h})")


if __name__ == "__main__":
    build()
