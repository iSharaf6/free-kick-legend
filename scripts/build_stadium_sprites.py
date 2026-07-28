#!/usr/bin/env python3
"""Build runtime security and CALYNX pixel sprites from authored sources."""

from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
GUARD_SOURCE = ROOT / "assets/source/security-guards-sheet-v1-alpha.png"
GUARD_OUTPUT = ROOT / "public/assets/hd/security-guards-sheet-hd.png"
LOGO_REFERENCE = ROOT / "assets/source/calynx-logo-reference.png"
LOGO_OUTPUT = ROOT / "public/assets/hd/calynx-logo-pixel.png"

GUARD_COUNT = 6
GUARD_FRAME_W = 88
GUARD_FRAME_H = 204
GUARD_CONTENT_H = 196


def occupied_runs(alpha: Image.Image) -> list[tuple[int, int]]:
    occupied = [
        x for x in range(alpha.width)
        if alpha.crop((x, 0, x + 1, alpha.height)).getbbox()
    ]
    runs: list[list[int]] = []
    for x in occupied:
        if not runs or x > runs[-1][1] + 1:
            runs.append([x, x])
        else:
            runs[-1][1] = x
    return [(start, end) for start, end in runs]


def build_guards() -> None:
    source = Image.open(GUARD_SOURCE).convert("RGBA")
    runs = occupied_runs(source.getchannel("A"))
    if len(runs) != GUARD_COUNT:
        raise RuntimeError(f"expected {GUARD_COUNT} guards, found {len(runs)}")

    sheet = Image.new("RGBA", (GUARD_FRAME_W * GUARD_COUNT, GUARD_FRAME_H))
    for frame, (start, end) in enumerate(runs):
        strip = source.crop((start, 0, end + 1, source.height))
        bbox = strip.getchannel("A").getbbox()
        if bbox is None:
            raise RuntimeError(f"guard frame {frame} is empty")
        guard = strip.crop(bbox)
        scale = min(
            GUARD_CONTENT_H / guard.height,
            (GUARD_FRAME_W - 8) / guard.width,
        )
        size = (
            max(1, round(guard.width * scale)),
            max(1, round(guard.height * scale)),
        )
        guard = guard.resize(size, Image.Resampling.NEAREST)
        # Pixel sprites use hard coverage. Chroma removal already despilled the
        # edge; this final threshold prevents translucent halos under WebGL.
        alpha = guard.getchannel("A").point(lambda value: 255 if value >= 96 else 0)
        guard.putalpha(alpha)
        x = frame * GUARD_FRAME_W + (GUARD_FRAME_W - guard.width) // 2
        y = GUARD_FRAME_H - 4 - guard.height
        sheet.alpha_composite(guard, (x, y))

    GUARD_OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(GUARD_OUTPUT, optimize=True)


def build_logo() -> None:
    # Derive the sprite from the supplied logo itself. The old version used a
    # hand-authored block font and a substitute cat; thresholding the original
    # blue silhouette preserves the real lowercase letterforms, spacing,
    # descender, and running lynx exactly before reducing them to board pixels.
    reference = Image.open(LOGO_REFERENCE).convert("RGB")
    mask = Image.new("L", reference.size)
    mask.putdata([
        255 if blue > 110 and blue - red > 55 and blue - green > 45 else 0
        for red, green, blue in reference.get_flattened_data()
    ])
    bbox = mask.getbbox()
    if bbox is None:
        raise RuntimeError("CALYNX reference contains no blue logo pixels")

    mask = mask.crop(bbox).resize((66, 20), Image.Resampling.LANCZOS)
    # A low threshold retains the mascot's fine whiskers and face at twenty
    # pixels tall. Coverage is still binary for clean nearest-neighbour output.
    mask = mask.point(lambda value: 255 if value >= 72 else 0)
    logo = Image.new("RGBA", mask.size, (248, 242, 223, 0))
    logo.putalpha(mask)
    logo.save(LOGO_OUTPUT, optimize=True)


if __name__ == "__main__":
    build_guards()
    build_logo()
    print(
        f"wrote {GUARD_OUTPUT.relative_to(ROOT)} "
        f"({GUARD_COUNT} x {GUARD_FRAME_W}x{GUARD_FRAME_H})"
    )
    print(f"wrote {LOGO_OUTPUT.relative_to(ROOT)} (66x20)")
