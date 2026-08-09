#!/usr/bin/env python3
"""Normalize generated goal-celebration art into fixed eight-frame sheets."""

from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "assets/source/generated"
OUTPUT = ROOT / "public/assets/fx"
FRAME_COUNT = 8

# Shared source crops keep the fixtures and carried banner locked to one
# baseline instead of allowing each generated silhouette to drift.
SHEETS = (
    ("goal-celebration-v3/goal-spark-fountain-sheet-v3-alpha.png", "goal-spark-fountain-sheet-v3.png", (88, 824), (128, 192)),
    ("goal-celebration-v3/goal-flare-sheet-v3-alpha.png", "goal-flare-sheet-v3.png", (120, 824), (128, 192)),
    ("goal-celebration-v4/goal-crowd-banner-sheet-v4-alpha.png", "goal-crowd-banner-sheet-v4.png", (280, 444), (256, 128)),
)


def build(source_name: str, output_name: str, vertical_crop: tuple[int, int], frame_size: tuple[int, int]) -> None:
    source = Image.open(SOURCE / source_name).convert("RGBA")
    frame_width, frame_height = frame_size
    crop_top, crop_bottom = vertical_crop
    source_height = crop_bottom - crop_top
    # Round the proportional boundaries so a source whose generated width is
    # not divisible by eight still maps to exactly eight complete frames.
    boundaries = [round(source.width * index / FRAME_COUNT) for index in range(FRAME_COUNT + 1)]
    target = Image.new("RGBA", (frame_width * FRAME_COUNT, frame_height), (0, 0, 0, 0))

    for index, (left, right) in enumerate(zip(boundaries, boundaries[1:])):
        frame = source.crop((left, crop_top, right, crop_bottom))
        scale = min((frame_width - 8) / frame.width, (frame_height - 8) / source_height)
        resized = frame.resize(
            (max(1, round(frame.width * scale)), max(1, round(frame.height * scale))),
            Image.Resampling.NEAREST,
        )
        x = index * frame_width + (frame_width - resized.width) // 2
        y = frame_height - 4 - resized.height
        target.alpha_composite(resized, (x, y))

    target.save(OUTPUT / output_name, optimize=True)


if __name__ == "__main__":
    for sheet in SHEETS:
        build(*sheet)
