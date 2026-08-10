#!/usr/bin/env python3
"""Validate and publish the two generated 10-frame crowd atlases."""

from pathlib import Path
import shutil
import struct


ROOT = Path(__file__).resolve().parents[1]
SHEETS = (
    ("crowd-watching-sheet-v1.png", 1024, 1535),
    ("crowd-goal-sheet-v1.png", 1086, 1445),
)


def png_size(path: Path) -> tuple[int, int]:
    header = path.read_bytes()[:24]
    if header[:8] != b"\x89PNG\r\n\x1a\n":
        raise ValueError(f"{path} is not a PNG")
    return struct.unpack(">II", header[16:24])


def build() -> None:
    output_dir = ROOT / "public/assets/hd"
    output_dir.mkdir(parents=True, exist_ok=True)
    for filename, width, height in SHEETS:
        source = ROOT / "assets/source" / filename
        output = output_dir / filename
        actual = png_size(source)
        if actual != (width, height):
            raise ValueError(f"Expected {filename} at {width}x{height}, got {actual[0]}x{actual[1]}")
        shutil.copyfile(source, output)
        print(f"Wrote {output.relative_to(ROOT)} ({width}x{height}, 10 frames)")


if __name__ == "__main__":
    build()
