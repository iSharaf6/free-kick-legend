#!/usr/bin/env python3
"""Normalize generated matchday art into fixed, bottom-anchored PNG sprites."""

from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "assets" / "source" / "generated"
PUBLIC = ROOT / "public" / "assets"


def keep_largest_component(image):
    """Drop isolated chroma remnants while preserving the main opaque sprite."""
    alpha = image.getchannel("A")
    width, height = image.size
    visible = {(x, y) for y in range(height) for x in range(width) if alpha.getpixel((x, y)) > 24}
    components = []
    while visible:
        seed = visible.pop()
        component = {seed}
        stack = [seed]
        while stack:
            x, y = stack.pop()
            for point in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
                if point in visible:
                    visible.remove(point)
                    component.add(point)
                    stack.append(point)
        components.append(component)
    if not components:
        return image
    keep = max(components, key=len)
    pixels = image.load()
    for y in range(height):
        for x in range(width):
            if (x, y) not in keep:
                pixels[x, y] = (0, 0, 0, 0)
    return image


def extract_slots(source_name, outputs):
    source = Image.open(SOURCE / source_name).convert("RGBA")
    slot_width = source.width / len(outputs)
    for index, (relative_path, size, padding, clean_islands) in enumerate(outputs):
        left = round(index * slot_width)
        right = round((index + 1) * slot_width)
        slot = source.crop((left, 0, right, source.height))
        if clean_islands:
            slot = keep_largest_component(slot)
        alpha_box = slot.getchannel("A").getbbox()
        if alpha_box is None:
            raise RuntimeError(f"slot {index} in {source_name} has no visible pixels")
        subject = slot.crop(alpha_box)
        target_w, target_h = size
        usable_w = target_w - padding * 2
        usable_h = target_h - padding * 2
        scale = min(usable_w / subject.width, usable_h / subject.height)
        resized = subject.resize(
            (max(1, round(subject.width * scale)), max(1, round(subject.height * scale))),
            Image.Resampling.NEAREST,
        )
        canvas = Image.new("RGBA", size, (0, 0, 0, 0))
        x = (target_w - resized.width) // 2
        y = target_h - padding - resized.height
        canvas.alpha_composite(resized, (x, y))
        destination = PUBLIC / relative_path
        destination.parent.mkdir(parents=True, exist_ok=True)
        canvas.save(destination, optimize=True)
        print(f"wrote {destination.relative_to(ROOT)}")


def main():
    extract_slots(
        "trackside-media-sheet-v2-alpha.png",
        [
            ("sprites/trackside-photographer-kneel-v2.png", (128, 128), 5, False),
            ("sprites/trackside-camera-operator-v2.png", (128, 128), 4, False),
            ("sprites/trackside-camera-pedestal-v2.png", (128, 128), 5, False),
            ("sprites/trackside-photographer-seat-v2.png", (128, 128), 5, False),
        ],
    )
    extract_slots(
        "goal-celebration-static-v2-alpha.png",
        [
            ("fx/goal-spark-fountain-static-v2.png", (96, 160), 4, False),
            ("fx/goal-flare-static-v2.png", (112, 160), 4, True),
            ("fx/goal-flags-static-v2.png", (160, 128), 4, False),
        ],
    )


if __name__ == "__main__":
    main()
