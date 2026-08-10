#!/usr/bin/env python3
"""Validate and publish the generated v3 2x3 crowd animation atlas."""

from pathlib import Path
import shutil
import struct


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "assets/source/crowd-animation-sheet-v3.png"
OUTPUT = ROOT / "public/assets/hd/crowd-animation-sheet-v3.png"

SOURCE_WIDTH = 1536
SOURCE_HEIGHT = 1023
FRAME_WIDTH = 768
FRAME_HEIGHT = 341
COLUMNS = 2
ROWS = 3


def build() -> None:
    header = SOURCE.read_bytes()[:24]
    if header[:8] != b"\x89PNG\r\n\x1a\n":
        raise ValueError(f"{SOURCE} is not a PNG")
    width, height = struct.unpack(">II", header[16:24])
    if (width, height) != (SOURCE_WIDTH, SOURCE_HEIGHT):
        raise ValueError(f"Expected {SOURCE_WIDTH}x{SOURCE_HEIGHT}, got {width}x{height}")

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(SOURCE, OUTPUT)
    print(f"Wrote {OUTPUT.relative_to(ROOT)} ({width}x{height}, {COLUMNS * ROWS} frames)")


if __name__ == "__main__":
    build()
