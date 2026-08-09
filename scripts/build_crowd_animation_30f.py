#!/usr/bin/env python3
"""Build 30-frame match-crowd sprite atlases from one approved seed.

The seed remains frame 00 exactly.  Subsequent frames use integer-only pixel
motion, so the stadium architecture never drifts and the animation remains
crisp at Phaser's logical 480x270 resolution.  The idle motion loops; goal and
ball-out reactions use neutral bookends so they can return to idle cleanly.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
from pathlib import Path

from PIL import Image, ImageDraw


FRAME_WIDTH = 960
FRAME_HEIGHT = 218
FRAME_COUNT = 30
ATLAS_COLUMNS = 3
ATLAS_ROWS = 10
CROWD_TOP = 72


IDLE_FLASH_EVENTS = (
    (2, 108, 127),
    (5, 236, 171),
    (8, 356, 135),
    (11, 461, 185),
    (14, 568, 122),
    (17, 680, 174),
    (20, 786, 137),
    (23, 882, 181),
    (26, 164, 191),
)

GOAL_FLASH_EVENTS = (
    (3, 82, 143),
    (4, 876, 133),
    (6, 177, 184),
    (7, 713, 162),
    (9, 306, 128),
    (10, 540, 187),
    (12, 928, 176),
    (13, 426, 149),
    (15, 119, 195),
    (16, 639, 122),
    (18, 791, 191),
    (20, 246, 157),
    (22, 498, 178),
    (24, 844, 145),
)

MOTION_PROFILES = {
    "idle": {
        "texture_key": "crowd-match-animated-v1",
        "frame_prefix": "crowd-match",
        "frame_rate": 12,
        "repeat": -1,
        "description": "Seamless ambient supporter ripple with sparse camera flashes.",
    },
    "goal": {
        "texture_key": "crowd-match-goal-v1",
        "frame_prefix": "crowd-goal",
        "frame_rate": 18,
        "repeat": 0,
        "description": "One-shot scoring reaction: two jumping crowd waves, gold lift and camera flashes.",
    },
    "out": {
        "texture_key": "crowd-match-out-v1",
        "frame_prefix": "crowd-out",
        "frame_rate": 15,
        "repeat": 0,
        "description": "One-shot ball-out reaction: collective recoil, disappointed dip and recovery.",
    },
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--motion", choices=tuple(MOTION_PROFILES), default="idle")
    parser.add_argument("--seed", type=Path, required=True)
    parser.add_argument("--frames-dir", type=Path, required=True)
    parser.add_argument("--atlas", type=Path, required=True)
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--preview", type=Path, required=True)
    parser.add_argument("--contact-sheet", type=Path, required=True)
    return parser.parse_args()


def frame_distance(frame: int, event: int) -> int:
    direct = abs(frame - event)
    return min(direct, FRAME_COUNT - direct)


def add_camera_flashes(
    frame: Image.Image,
    index: int,
    events: tuple[tuple[int, int, int], ...],
    *,
    loop: bool,
) -> None:
    draw = ImageDraw.Draw(frame, "RGBA")
    for event, x, y in events:
        distance = frame_distance(index, event) if loop else abs(index - event)
        if distance > 1:
            continue
        alpha = 220 if distance == 0 else 82
        radius = 2 if distance == 0 else 1
        draw.rectangle((x - radius, y - radius, x + radius, y + radius), fill=(255, 244, 192, alpha))
        draw.point((x - 4, y), fill=(255, 194, 73, alpha))
        draw.point((x + 4, y), fill=(255, 194, 73, alpha))
        draw.point((x, y - 4), fill=(255, 227, 149, alpha))
        draw.point((x, y + 4), fill=(255, 227, 149, alpha))


def crowd_ramp(y: int) -> float:
    return min(1.0, max(0.0, (y - CROWD_TOP) / 34.0))


def displacement(motion: str, index: int, x: int) -> float:
    if motion == "idle":
        phase = math.tau * index / FRAME_COUNT
        return (
            2.0 * (math.sin(phase + x / 67.0) - math.sin(x / 67.0))
            + 0.95 * (math.sin(phase * 2.0 + x / 31.0) - math.sin(x / 31.0))
        )

    progress = index / (FRAME_COUNT - 1)
    envelope = math.sin(math.pi * progress) ** 0.72
    if motion == "goal":
        # Two upward waves travel across the stand.  A positive source offset
        # makes supporters appear higher in the destination frame.
        jump = max(0.0, math.sin(progress * math.pi * 3.0 + x / 116.0))
        ripple = 1.15 * math.sin(progress * math.tau * 2.0 + x / 58.0)
        return envelope * (2.3 + 5.2 * jump + ripple)

    # Ball-out reaction: the stand recoils, sinks and recovers.  Negative
    # source offsets move the visible supporters downward without moving the
    # roof, lights or stadium architecture.
    recoil = 0.9 * math.sin(progress * math.tau + x / 104.0)
    return -envelope * (3.1 + recoil)


def add_reaction_tint(frame: Image.Image, motion: str, index: int) -> None:
    if motion == "idle":
        return
    progress = index / (FRAME_COUNT - 1)
    envelope = math.sin(math.pi * progress) ** 0.8
    overlay = Image.new("RGBA", frame.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    if motion == "goal":
        color = (255, 177, 44, round(17 * envelope))
    else:
        color = (8, 24, 48, round(22 * envelope))
    draw.rectangle((0, CROWD_TOP + 14, FRAME_WIDTH, FRAME_HEIGHT), fill=color)
    frame.paste(Image.alpha_composite(frame.convert("RGBA"), overlay).convert("RGB"))


def animate_frame(seed: Image.Image, index: int, motion: str) -> Image.Image:
    # Frame zero is deliberately locked to the approved generated seed.
    if index == 0:
        return seed.copy()

    source = seed.load()
    frame = seed.copy()
    target = frame.load()

    # A stadium-wave displacement with a smooth horizontal phase.  Sampling
    # whole source columns avoids interpolation blur and keeps every pixel
    # cluster intact.  The displacement fades in below the fixed roof line.
    for x in range(FRAME_WIDTH):
        lift = displacement(motion, index, x)
        for y in range(CROWD_TOP, FRAME_HEIGHT):
            offset = round(lift * crowd_ramp(y))
            sample_y = min(FRAME_HEIGHT - 1, max(CROWD_TOP, y + offset))
            target[x, y] = source[x, sample_y]

    add_reaction_tint(frame, motion, index)
    if motion == "idle":
        add_camera_flashes(frame, index, IDLE_FLASH_EVENTS, loop=True)
    elif motion == "goal":
        add_camera_flashes(frame, index, GOAL_FLASH_EVENTS, loop=False)
    return frame


def save_png(image: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, format="PNG", optimize=True)


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> None:
    args = parse_args()
    profile = MOTION_PROFILES[args.motion]
    seed = Image.open(args.seed).convert("RGB")
    if seed.size != (FRAME_WIDTH, FRAME_HEIGHT):
        raise ValueError(
            f"Seed must be {FRAME_WIDTH}x{FRAME_HEIGHT}; got {seed.width}x{seed.height}"
        )

    args.frames_dir.mkdir(parents=True, exist_ok=True)
    frames = [animate_frame(seed, index, args.motion) for index in range(FRAME_COUNT)]
    for index, frame in enumerate(frames):
        save_png(frame, args.frames_dir / f"{profile['frame_prefix']}-{index:02d}.png")

    atlas = Image.new("RGB", (FRAME_WIDTH * ATLAS_COLUMNS, FRAME_HEIGHT * ATLAS_ROWS))
    for index, frame in enumerate(frames):
        x = (index % ATLAS_COLUMNS) * FRAME_WIDTH
        y = (index // ATLAS_COLUMNS) * FRAME_HEIGHT
        atlas.paste(frame, (x, y))
    save_png(atlas, args.atlas)

    preview_frames = [
        frame.resize((FRAME_WIDTH // 2, FRAME_HEIGHT // 2), Image.Resampling.NEAREST)
        for frame in frames
    ]
    args.preview.parent.mkdir(parents=True, exist_ok=True)
    preview_frames[0].save(
        args.preview,
        save_all=True,
        append_images=preview_frames[1:],
        duration=round(1000 / profile["frame_rate"]),
        loop=0,
        disposal=2,
        optimize=False,
    )

    samples = (0, 5, 10, 15, 20, 25)
    contact = Image.new("RGB", (FRAME_WIDTH * 3, FRAME_HEIGHT * 2))
    for slot, frame_index in enumerate(samples):
        contact.paste(
            frames[frame_index],
            ((slot % 3) * FRAME_WIDTH, (slot // 3) * FRAME_HEIGHT),
        )
    save_png(contact, args.contact_sheet)

    manifest = {
        "version": 1,
        "motion": args.motion,
        "textureKey": profile["texture_key"],
        "image": args.atlas.name,
        "frameWidth": FRAME_WIDTH,
        "frameHeight": FRAME_HEIGHT,
        "frameCount": FRAME_COUNT,
        "columns": ATLAS_COLUMNS,
        "rows": ATLAS_ROWS,
        "frameRate": profile["frame_rate"],
        "repeat": profile["repeat"],
        "sequence": list(range(FRAME_COUNT)),
        "anchor": {"x": 0.5, "y": 0},
        "recommendedDisplay": {"width": 480, "height": 109},
        "reducedMotionFrame": 0,
        "returnTo": "crowd-match-idle-v1" if args.motion != "idle" else None,
        "atlasSha256": sha256(args.atlas),
        "notes": (
            f"{profile['description']} Frame 00 is the exact approved seed; "
            "architecture and floodlights stay fixed with integer-only supporter motion."
        ),
    }
    args.manifest.parent.mkdir(parents=True, exist_ok=True)
    args.manifest.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")

    print(f"Wrote {FRAME_COUNT} frames to {args.frames_dir}")
    print(f"Wrote {args.atlas} ({atlas.width}x{atlas.height})")
    print(f"Wrote {args.preview}")
    print(f"Wrote {args.manifest}")


if __name__ == "__main__":
    main()
