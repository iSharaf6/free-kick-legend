#!/usr/bin/env python3
"""Repack the generated 3x3 crowd board into equal, baseline-locked frames."""

from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "assets/source/crowd-animation-sheet-v1-alpha.png"
OUTPUT = ROOT / "public/assets/hd/crowd-animation-sheet-hd.png"

SOURCE_WIDTH = 1536
SOURCE_HEIGHT = 1024
FRAME_WIDTH = 512
FRAME_HEIGHT = 342
ROW_BOUNDS = ((0, 341), (341, 682), (682, 1024))
RAIL_BASELINE = 326


def build() -> None:
    source = Image.open(SOURCE).convert("RGBA")
    if source.size != (SOURCE_WIDTH, SOURCE_HEIGHT):
        raise ValueError(f"Expected {SOURCE_WIDTH}x{SOURCE_HEIGHT}, got {source.size}")

    sheet = Image.new("RGBA", (FRAME_WIDTH * 3, FRAME_HEIGHT * 3), (0, 0, 0, 0))
    frame_index = 0

    for row, (top, bottom) in enumerate(ROW_BOUNDS):
        for column in range(3):
            left = column * FRAME_WIDTH
            frame = source.crop((left, top, left + FRAME_WIDTH, bottom))
            bounds = frame.getchannel("A").getbbox()
            if bounds is None:
                raise ValueError(f"Crowd frame {frame_index} is empty")

            subject_center = (bounds[0] + bounds[2]) / 2
            offset_x = round(FRAME_WIDTH / 2 - subject_center)
            offset_y = RAIL_BASELINE - bounds[3]

            cell = Image.new("RGBA", (FRAME_WIDTH, FRAME_HEIGHT), (0, 0, 0, 0))
            cell.alpha_composite(frame, (offset_x, offset_y))
            sheet.alpha_composite(cell, (column * FRAME_WIDTH, row * FRAME_HEIGHT))
            frame_index += 1

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(OUTPUT, optimize=True)
    print(f"Wrote {OUTPUT.relative_to(ROOT)} ({sheet.width}x{sheet.height}, {frame_index} frames)")


if __name__ == "__main__":
    build()
