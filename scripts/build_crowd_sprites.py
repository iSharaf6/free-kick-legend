#!/usr/bin/env python3
"""Validate and publish the generated 2x3 panoramic crowd atlas."""

from pathlib import Path
import shutil
import struct


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "assets/source/crowd-animation-sheet-v1-alpha.png"
OUTPUT = ROOT / "public/assets/hd/crowd-animation-sheet-hd.png"

SOURCE_WIDTH = 1536
SOURCE_HEIGHT = 1024
FRAME_WIDTH = 768
FRAME_HEIGHT = 341
COLUMNS = 2
ROWS = 3


import struct
import zlib


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
    target_w, target_h = 1536, 1023
    stride = 1 + width * 4

    rgba_raw = bytearray()
    for y in range(target_h):
        line = decomp[y * stride : (y + 1) * stride]
        rgba_raw.extend(line)

    compressed_idat = zlib.compress(bytes(rgba_raw), 9)

    def make_chunk(ctype, chunk_data):
        return struct.pack(">I", len(chunk_data)) + ctype + chunk_data + struct.pack(">I", zlib.crc32(ctype + chunk_data) & 0xffffffff)

    png_bytes = bytearray(b"\x89PNG\r\n\x1a\n")
    ihdr = struct.pack(">IIBBBBB", target_w, target_h, 8, 6, 0, 0, 0)
    png_bytes.extend(make_chunk(b"IHDR", ihdr))
    png_bytes.extend(make_chunk(b"IDAT", compressed_idat))
    png_bytes.extend(make_chunk(b"IEND", b""))

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT, "wb") as f:
        f.write(png_bytes)

    print(f"Wrote {OUTPUT.relative_to(ROOT)} ({target_w}x{target_h}, {COLUMNS * ROWS} frames)")


if __name__ == "__main__":
    build()
