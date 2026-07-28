#!/usr/bin/env python3
"""Build the deterministic 2x pixel-art match pitch used at runtime."""

from pathlib import Path
import struct
import zlib

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "public/assets/hd/pitch-grass-pixel-v3.png"

WIDTH = 960
HEIGHT = 350
VANISH_X = WIDTH // 2
HORIZONTAL_BANDS = (0, 14, 32, 58, 92, 138, 196, 268, HEIGHT)

# Four restrained mower tones keep the turf graphic and compatible with the
# navy/gold character palette. Tufts use two additional authored colours.
MOWER = (
    ((24, 82, 50), (29, 94, 55)),
    ((27, 96, 55), (34, 111, 62)),
)
TUFT_LIGHT = (47, 126, 69)
TUFT_DARK = (17, 70, 42)


def hash01(x: int, y: int, seed: int = 97) -> float:
    n = ((x + seed) * 374761393 + (y + seed * 3) * 668265263) & 0xFFFFFFFF
    n = ((n ^ (n >> 13)) * 1274126177) & 0xFFFFFFFF
    return ((n ^ (n >> 16)) & 0xFFFFFFFF) / 0xFFFFFFFF


def set_pixel(pixels: bytearray, x: int, y: int, color: tuple[int, int, int]) -> None:
    if x < 0 or x >= WIDTH or y < 0 or y >= HEIGHT:
        return
    i = (y * WIDTH + x) * 3
    pixels[i:i + 3] = bytes(color)


def build_pixels() -> bytearray:
    pixels = bytearray(WIDTH * HEIGHT * 3)

    for y in range(HEIGHT):
        band = next(i for i in range(len(HORIZONTAL_BANDS) - 1)
                    if HORIZONTAL_BANDS[i] <= y < HORIZONTAL_BANDS[i + 1])
        depth_t = y / (HEIGHT - 1)
        # Convert the screen column back toward the near edge. Alternating
        # world-space lanes therefore converge cleanly on the central vanishing point.
        perspective = 0.075 + depth_t * 0.925
        for x in range(WIDTH):
            near_x = VANISH_X + (x - VANISH_X) / perspective
            lane = int((near_x + 720) // 240)
            color = MOWER[band & 1][lane & 1]
            set_pixel(pixels, x, y, color)

    # Sparse clusters, not per-pixel noise. Their footprint grows toward the
    # camera so the field follows the same perspective language as the sprites.
    for gy in range(4, HEIGHT - 3, 7):
        depth_t = gy / HEIGHT
        spacing = max(8, round(18 - depth_t * 8))
        for gx in range(-8, WIDTH + 8, spacing):
            if hash01(gx, gy, 331) < 0.46:
                continue
            jitter_x = round((hash01(gx, gy, 419) - 0.5) * spacing)
            jitter_y = round((hash01(gx, gy, 503) - 0.5) * 4)
            x = gx + jitter_x
            y = gy + jitter_y
            size = 1 if depth_t < 0.35 else 2 if depth_t < 0.72 else 3
            color = TUFT_LIGHT if hash01(gx, gy, 587) > 0.42 else TUFT_DARK
            for dx in range(size + 1):
                set_pixel(pixels, x + dx, y, color)
            if size >= 2:
                set_pixel(pixels, x + (size // 2), y - 1, color)

    # Crisp cut direction changes sell real mowing without introducing blur.
    for y in HORIZONTAL_BANDS[1:-1]:
        for x in range(WIDTH):
            if (x // 12 + y // 8) & 1:
                set_pixel(pixels, x, y, TUFT_DARK)

    return pixels


def png_chunk(chunk_type: bytes, data: bytes) -> bytes:
    crc = zlib.crc32(chunk_type + data) & 0xFFFFFFFF
    return struct.pack(">I", len(data)) + chunk_type + data + struct.pack(">I", crc)


def build() -> None:
    pixels = build_pixels()
    raw = bytearray()
    for y in range(HEIGHT):
        raw.append(0)
        start = y * WIDTH * 3
        raw.extend(pixels[start:start + WIDTH * 3])

    png = bytearray(b"\x89PNG\r\n\x1a\n")
    png.extend(png_chunk(b"IHDR", struct.pack(">IIBBBBB", WIDTH, HEIGHT, 8, 2, 0, 0, 0)))
    png.extend(png_chunk(b"IDAT", zlib.compress(bytes(raw), 9)))
    png.extend(png_chunk(b"IEND", b""))

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_bytes(png)
    print(f"Generated pixel pitch: {OUTPUT} ({WIDTH}x{HEIGHT})")


if __name__ == "__main__":
    build()
