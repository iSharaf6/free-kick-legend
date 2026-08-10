#!/usr/bin/env python3
"""Build the authored goal pyrotechnics: a planted unit, stage gerb and shell.

Both sheets are simulated rather than drawn. A gerb and a firework are particle
systems in the real world, and hand-placing sparks per frame is what makes
pixel pyro read as noise: the sparks jump instead of travelling, so the eye
sees ten unrelated stills rather than one continuous spray.

Here a single deterministic simulation is run once and *sampled* at each frame
time, so every spark occupies consecutive positions along its own ballistic arc
from frame to frame. That is the whole trick - it is what makes ten frames read
as motion.

Colour comes from particle age, not from a random palette pick, so the plume
grades white-hot at the nozzle through gold and amber to a dull ember at the
tips, exactly as a real gerb does. Every colour is drawn from the game's own
Night Match '98 palette (src/pixelart.js).
"""

from pathlib import Path
import math
import random
import struct
import zlib

ROOT = Path(__file__).resolve().parents[1]
MORTAR_OUTPUT = ROOT / "public/assets/fx/goal-pyro-unit-v1.png"
GERB_OUTPUT = ROOT / "public/assets/fx/goal-pyro-fountain-strip-v2.png"
SHELL_OUTPUT = ROOT / "public/assets/fx/goal-firework-shell-v1.png"

# ----------------------------------------------------------------- gerb sheet
GERB_FRAMES = 10
GERB_W = 96
GERB_H = 256
# Nozzle mouth, in frame pixels. The mortar body sits below it.
NOZZLE_X = GERB_W // 2
NOZZLE_Y = 246

# Seconds of burn the ten frames sample. A real gerb runs for seconds; this is
# the readable slice of it - ignition, build, full burn, decay.
GERB_DURATION = 0.86
GERB_SUBSTEP = 1.0 / 720.0
GERB_GRAVITY = 560.0
# Light drag only. At 1.9 the plume stalled around a third of the frame height,
# which is the difference between a stage gerb and a sparkler.
GERB_DRAG = 0.85

# ---------------------------------------------------------------- shell sheet
SHELL_FRAMES = 12
SHELL_W = 128
SHELL_H = 128
SHELL_DURATION = 1.02
SHELL_SUBSTEP = 1.0 / 720.0
SHELL_GRAVITY = 96.0
# Enough drag for the stars to slow into a ball, not so much that they stall
# into a static ring two frames after the break.
SHELL_DRAG = 1.85

# Night Match '98 palette. The gerb grades along this ramp by particle age.
FLAME_RAMP = (
    (0.00, (255, 250, 236)),  # white hot, right at the nozzle
    (0.13, (255, 238, 190)),
    (0.28, (255, 216, 122)),
    (0.44, (243, 196, 73)),   # PAL.gold
    (0.60, (255, 166, 60)),
    (0.76, (201, 104, 50)),   # PAL.orange
    (0.89, (140, 58, 24)),
    (1.00, (74, 30, 18)),
)

MORTAR_BODY = (58, 50, 44)
MORTAR_RIM = (112, 94, 72)
MORTAR_LIGHT = (150, 126, 92)
MORTAR_SHADOW = (30, 26, 24)
SMOKE = (74, 66, 84)


def ramp_colour(t: float) -> tuple:
    """Sample the flame ramp at normalised age t."""
    t = max(0.0, min(1.0, t))
    for i in range(len(FLAME_RAMP) - 1):
        t0, c0 = FLAME_RAMP[i]
        t1, c1 = FLAME_RAMP[i + 1]
        if t <= t1:
            k = 0.0 if t1 == t0 else (t - t0) / (t1 - t0)
            return (
                round(c0[0] + (c1[0] - c0[0]) * k),
                round(c0[1] + (c1[1] - c0[1]) * k),
                round(c0[2] + (c1[2] - c0[2]) * k),
            )
    return FLAME_RAMP[-1][1]


class Canvas:
    """An RGBA frame buffer that composites by keeping the brighter sample.

    Pyro is emissive: two overlapping sparks do not average into something
    dimmer, they build a hotter core. Straight alpha-over averaging is what
    makes simulated sparks look like dirty smoke, so every write here takes the
    max of what is already there.
    """

    def __init__(self, width: int, height: int):
        self.w = width
        self.h = height
        self.buf = bytearray(width * height * 4)

    def plot(self, x: int, y: int, colour: tuple, intensity: float) -> None:
        if intensity <= 0.0 or x < 0 or y < 0 or x >= self.w or y >= self.h:
            return
        intensity = min(1.0, intensity)
        i = (y * self.w + x) * 4
        r = round(colour[0] * intensity)
        g = round(colour[1] * intensity)
        b = round(colour[2] * intensity)
        a = round(255 * intensity)
        buf = self.buf
        if a > buf[i + 3]:
            buf[i + 3] = a
        if r > buf[i]:
            buf[i] = r
        if g > buf[i + 1]:
            buf[i + 1] = g
        if b > buf[i + 2]:
            buf[i + 2] = b

    def block(self, x: int, y: int, w: int, h: int, colour: tuple, intensity: float) -> None:
        for dy in range(h):
            for dx in range(w):
                self.plot(x + dx, y + dy, colour, intensity)


def write_png(path: Path, width: int, height: int, buf: bytearray) -> None:
    raw = bytearray()
    stride = width * 4
    for y in range(height):
        raw.append(0)
        raw.extend(buf[y * stride:(y + 1) * stride])

    def chunk(kind: bytes, data: bytes) -> bytes:
        crc = zlib.crc32(kind + data) & 0xFFFFFFFF
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", crc)

    png = bytearray(b"\x89PNG\r\n\x1a\n")
    png.extend(chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)))
    png.extend(chunk(b"IDAT", zlib.compress(bytes(raw), 9)))
    png.extend(chunk(b"IEND", b""))
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(png)


class Spark:
    __slots__ = ("x", "y", "vx", "vy", "born", "life", "size", "glow", "trail")

    def __init__(self, x, y, vx, vy, born, life, size, glow):
        self.x = x
        self.y = y
        self.vx = vx
        self.vy = vy
        self.born = born
        self.life = life
        self.size = size
        self.glow = glow
        # Recent positions, so a spark can be drawn as a streak rather than a
        # dot. A 1px dot moving 9px between frames reads as a dotted line; the
        # streak is what makes it read as a spark in flight.
        self.trail = []


GERB_PEAK_RATE = 9800.0


def gerb_emission(t: float) -> float:
    """Sparks per second at burn time t. Ignition spike, plateau, decay.

    The plateau runs to 72% of the burn so the plume is at full height for the
    middle third of the strip. Decaying earlier left the tallest frame at frame
    six with three limp frames after it, which reads as the gerb running out
    rather than as a celebration.
    """
    p = t / GERB_DURATION
    if p < 0.07:
        return GERB_PEAK_RATE * (p / 0.07) ** 0.7
    if p < 0.72:
        return GERB_PEAK_RATE
    return GERB_PEAK_RATE * max(0.0, 1.0 - (p - 0.72) / 0.28) ** 1.4


def snapshot(sparks, t):
    """Freeze the live set into plain tuples.

    Storing the Spark objects themselves looks equivalent and is not: they keep
    being integrated after the snapshot is taken, so every frame ends up drawing
    the *final* position of each spark and the ten frames come out identical.
    """
    frozen = []
    for s in sparks:
        age = (t - s.born) / s.life
        frozen.append((s.x, s.y, age, s.size, s.glow, tuple(s.trail)))
    return frozen


def simulate_gerb(seed: int):
    """Run the burn once and return a snapshot of live sparks at each frame."""
    rng = random.Random(seed)
    sparks = []
    snapshots = []
    frame_times = [(i + 1) * (GERB_DURATION / GERB_FRAMES) for i in range(GERB_FRAMES)]
    next_frame = 0
    carry = 0.0

    t = 0.0
    # Two steps of headroom. Integrating to exactly GERB_DURATION leaves t just
    # short of the last frame time, so the final frame is never sampled and the
    # strip ships with a blank tenth frame.
    steps = int(GERB_DURATION / GERB_SUBSTEP) + 2
    for _ in range(steps):
        # ---- emit
        carry += gerb_emission(t) * GERB_SUBSTEP
        while carry >= 1.0:
            carry -= 1.0
            # Two populations: a tight, fast core jet and a wider, slower
            # spray. One alone looks like either a laser or a dandelion; a real
            # gerb is both at once.
            if rng.random() < 0.58:
                angle = rng.gauss(0.0, 0.075)
                speed = rng.uniform(430.0, 700.0)
                life = rng.uniform(0.34, 0.64)
                size = 1
                glow = rng.uniform(0.88, 1.0)
            else:
                angle = rng.gauss(0.0, 0.26)
                speed = rng.uniform(190.0, 430.0)
                life = rng.uniform(0.36, 0.78)
                size = 1 if rng.random() < 0.74 else 2
                glow = rng.uniform(0.58, 0.94)
            sparks.append(Spark(
                x=NOZZLE_X + rng.uniform(-1.6, 1.6),
                y=NOZZLE_Y + rng.uniform(-1.0, 1.0),
                vx=math.sin(angle) * speed,
                vy=-math.cos(angle) * speed,
                born=t,
                life=life,
                size=size,
                glow=glow,
            ))

        # ---- integrate
        alive = []
        for s in sparks:
            if t - s.born > s.life:
                continue
            s.trail.append((s.x, s.y))
            if len(s.trail) > 6:
                s.trail.pop(0)
            s.vy += GERB_GRAVITY * GERB_SUBSTEP
            damp = 1.0 - GERB_DRAG * GERB_SUBSTEP
            s.vx *= damp
            s.vy *= damp
            s.x += s.vx * GERB_SUBSTEP
            s.y += s.vy * GERB_SUBSTEP
            alive.append(s)
        sparks = alive

        t += GERB_SUBSTEP
        if next_frame < GERB_FRAMES and t >= frame_times[next_frame]:
            snapshots.append(snapshot(sparks, t))
            next_frame += 1

    while len(snapshots) < GERB_FRAMES:
        snapshots.append([])
    return snapshots


def draw_mortar(canvas: Canvas, x: int, y: int) -> None:
    """The stage unit the gerb is fired from - a squat steel tube on a plate."""
    canvas.block(x - 7, y + 8, 15, 2, MORTAR_SHADOW, 1.0)   # base plate shadow
    canvas.block(x - 6, y + 6, 13, 2, MORTAR_RIM, 1.0)      # base plate
    canvas.block(x - 4, y - 1, 9, 8, MORTAR_BODY, 1.0)      # tube body
    canvas.block(x - 4, y - 1, 1, 8, MORTAR_SHADOW, 1.0)    # left shade
    canvas.block(x + 3, y - 1, 1, 8, MORTAR_LIGHT, 1.0)     # lit edge
    canvas.block(x - 4, y - 2, 9, 1, MORTAR_LIGHT, 1.0)     # mouth rim
    canvas.block(x - 2, y + 2, 1, 4, MORTAR_LIGHT, 0.55)    # body highlight


def build_mortar() -> None:
    """Write the permanent, unlit stage unit as its own transparent plate.

    The unit is stadium hardware, not part of the flame animation. Keeping it in
    a separate image lets gameplay render it with normal blending before a goal,
    throughout the burn and after the transient additive plume has gone away.
    """
    unit = Canvas(GERB_W, GERB_H)
    draw_mortar(unit, NOZZLE_X, NOZZLE_Y)
    write_png(MORTAR_OUTPUT, GERB_W, GERB_H, unit.buf)
    print(f"Generated mortar: {MORTAR_OUTPUT} ({GERB_W}x{GERB_H})")


def build_gerb() -> None:
    snapshots = simulate_gerb(0x5EED1A)
    sheet = Canvas(GERB_W * GERB_FRAMES, GERB_H)

    for frame, snapshot in enumerate(snapshots):
        ox = frame * GERB_W
        rng = random.Random(0xC0FFEE + frame)

        # Smoke first: it sits behind the sparks and only ever whispers.
        burn = frame / (GERB_FRAMES - 1)
        for _ in range(int(26 + 54 * burn)):
            sx = NOZZLE_X + rng.gauss(0.0, 7.0 + 12.0 * burn)
            sy = NOZZLE_Y - rng.uniform(0.0, 30.0 + 150.0 * burn)
            sheet.plot(ox + int(sx), int(sy), SMOKE, rng.uniform(0.05, 0.16))

        for px, py, age, size, glow, trail in snapshot:
            colour = ramp_colour(age)
            # Sparks cool and dim together; the tail of the arc must not be as
            # loud as the nozzle or the plume loses its shape entirely.
            intensity = glow * (1.0 - age * age * 0.72)

            for i, (tx, ty) in enumerate(trail):
                fade = (i + 1) / (len(trail) + 1)
                sheet.plot(ox + int(tx), int(ty), colour, intensity * fade * 0.55)

            sx, sy = int(px), int(py)
            if size >= 2:
                sheet.block(ox + sx, sy, 2, 2, colour, intensity)
            else:
                sheet.plot(ox + sx, sy, colour, intensity)

        # The nozzle core: the one place hot enough to blow out to pure white.
        core = gerb_emission((frame + 1) * (GERB_DURATION / GERB_FRAMES)) / GERB_PEAK_RATE
        if core > 0.02:
            height = int(26 * core)
            for dy in range(0, height + 1):
                fall = 1.0 - dy / (height + 1.0)
                half = max(0, int(4.2 * core * fall))
                for dx in range(-half, half + 1):
                    sheet.plot(ox + NOZZLE_X + dx, NOZZLE_Y - dy,
                               (255, 252, 242), min(1.0, core * fall * 1.25))

    write_png(GERB_OUTPUT, GERB_W * GERB_FRAMES, GERB_H, sheet.buf)
    print(f"Generated gerb: {GERB_OUTPUT} ({GERB_W * GERB_FRAMES}x{GERB_H}, {GERB_FRAMES} frames)")


def simulate_shell(seed: int):
    """A peony shell: one symmetric radial burst, then gravity takes over."""
    rng = random.Random(seed)
    sparks = []
    cx, cy = SHELL_W / 2.0, SHELL_H / 2.0

    # Stars are seeded on a jittered sphere and projected, so the burst has a
    # dense rim and a sparser middle the way a real shell does, instead of the
    # flat ring a pure 2D circle produces.
    star_count = 420
    for i in range(star_count):
        theta = (i / star_count) * math.tau + rng.gauss(0.0, 0.022)
        # z-jitter foreshortens some stars towards the viewer.
        depth = rng.uniform(-1.0, 1.0)
        radial = math.sqrt(max(0.0, 1.0 - depth * depth))
        # A wide speed spread fills the disc. Every star leaving at the same
        # speed is what produced a hollow dotted ring instead of a firework.
        speed = rng.uniform(56.0, 162.0) * radial
        sparks.append(Spark(
            x=cx, y=cy,
            vx=math.cos(theta) * speed,
            vy=math.sin(theta) * speed,
            born=0.0,
            # Long-lived stars: a shell that is spent by two thirds of the
            # sheet leaves the last four frames empty, which on a 12-frame
            # animation reads as the effect being cut off rather than fading.
            life=rng.uniform(0.86, 1.16),
            size=1,
            glow=rng.uniform(0.80, 1.0),
        ))
    # A handful of bright pistil stars in the middle, slower and shorter-lived.
    for _ in range(26):
        theta = rng.uniform(0.0, math.tau)
        speed = rng.uniform(26.0, 58.0)
        sparks.append(Spark(
            x=cx, y=cy,
            vx=math.cos(theta) * speed,
            vy=math.sin(theta) * speed,
            born=0.0,
            life=rng.uniform(0.34, 0.58),
            size=1,
            glow=1.0,
        ))

    snapshots = []
    frame_times = [(i + 1) * (SHELL_DURATION / SHELL_FRAMES) for i in range(SHELL_FRAMES)]
    next_frame = 0
    t = 0.0
    # Trail samples are decimated, not taken every substep. Sampling every step
    # gives a 22-sample tail spanning four pixels - invisible. Every eighth step
    # spans a quarter of a second of flight, which is the radial ray the eye
    # actually reads as a firework.
    trail_stride = 8
    for step in range(int(SHELL_DURATION / SHELL_SUBSTEP) + 2):
        alive = []
        for s in sparks:
            if t > s.life:
                continue
            if step % trail_stride == 0:
                s.trail.append((s.x, s.y))
                if len(s.trail) > 18:
                    s.trail.pop(0)
            s.vy += SHELL_GRAVITY * SHELL_SUBSTEP
            damp = 1.0 - SHELL_DRAG * SHELL_SUBSTEP
            s.vx *= damp
            s.vy *= damp
            s.x += s.vx * SHELL_SUBSTEP
            s.y += s.vy * SHELL_SUBSTEP
            alive.append(s)
        sparks = alive
        t += SHELL_SUBSTEP
        if next_frame < SHELL_FRAMES and t >= frame_times[next_frame]:
            snapshots.append(snapshot(sparks, t))
            next_frame += 1

    while len(snapshots) < SHELL_FRAMES:
        snapshots.append([])
    return snapshots


def build_shell() -> None:
    """Author the shell in pure luminance so the game can tint it any colour.

    A gold-authored shell tinted blue comes out muddy, because tinting is a
    multiply. Greyscale art multiplied by a hue gives that hue cleanly, which
    is how one 12-frame sheet supplies the whole colour spread of a display.
    """
    snapshots = simulate_shell(0xB00000)
    sheet = Canvas(SHELL_W * SHELL_FRAMES, SHELL_H)

    for frame, snapshot in enumerate(snapshots):
        ox = frame * SHELL_W
        life = frame / (SHELL_FRAMES - 1)

        for px, py, age, _size, glow, trail in snapshot:
            # White at the flash, cooling to a dim ember as the star burns out.
            level = 255 if age < 0.14 else round(255 * (1.0 - age * 0.42))
            colour = (level, level, level)
            # Stars hold their brightness through the middle of the burn and
            # drop away at the end. A linear fade makes the whole display look
            # like it is dimming from the moment it breaks.
            intensity = glow * max(0.0, 1.0 - age ** 2.4)

            span = len(trail)
            for i, (tx, ty) in enumerate(trail):
                # Squared falloff: bright right behind the star, gone by the
                # tail. Linear makes the whole tail one flat grey smear.
                fade = ((i + 1) / (span + 1)) ** 2
                sheet.plot(ox + int(tx), int(ty), colour, intensity * fade * 0.95)
            sheet.plot(ox + int(px), int(py), colour, intensity)

        # The break flash: two frames of a hot core before the stars separate.
        if life < 0.2:
            flash = 1.0 - life / 0.2
            radius = int(3 + 9 * flash)
            for dy in range(-radius, radius + 1):
                for dx in range(-radius, radius + 1):
                    d = math.hypot(dx, dy)
                    if d > radius:
                        continue
                    sheet.plot(ox + SHELL_W // 2 + dx, SHELL_H // 2 + dy,
                               (255, 255, 255), flash * (1.0 - d / (radius + 1)) ** 1.6)

    write_png(SHELL_OUTPUT, SHELL_W * SHELL_FRAMES, SHELL_H, sheet.buf)
    print(f"Generated shell: {SHELL_OUTPUT} ({SHELL_W * SHELL_FRAMES}x{SHELL_H}, {SHELL_FRAMES} frames)")


def build_preview(path: Path) -> None:
    """Composite both sheets onto the game's night sky.

    Authored pyro is transparent art on nothing, and judging it against a white
    page is misleading in the exact direction that matters: sparks that look
    crisp on white can vanish against a dark stand. This writes what the player
    will actually see.
    """
    import os

    def read_sheet(p: Path):
        raw = p.read_bytes()
        width = struct.unpack(">I", raw[16:20])[0]
        height = struct.unpack(">I", raw[20:24])[0]
        idat = bytearray()
        i = 8
        while i < len(raw):
            length = struct.unpack(">I", raw[i:i + 4])[0]
            kind = raw[i + 4:i + 8]
            if kind == b"IDAT":
                idat.extend(raw[i + 8:i + 8 + length])
            i += 12 + length
        data = zlib.decompress(bytes(idat))
        out = bytearray(width * height * 4)
        stride = width * 4
        prev = bytearray(stride)
        pos = 0
        for y in range(height):
            filt = data[pos]
            pos += 1
            line = bytearray(data[pos:pos + stride])
            pos += stride
            if filt == 1:
                for x in range(4, stride):
                    line[x] = (line[x] + line[x - 4]) & 0xFF
            elif filt == 2:
                for x in range(stride):
                    line[x] = (line[x] + prev[x]) & 0xFF
            elif filt == 3:
                for x in range(stride):
                    left = line[x - 4] if x >= 4 else 0
                    line[x] = (line[x] + ((left + prev[x]) >> 1)) & 0xFF
            elif filt == 4:
                for x in range(stride):
                    a = line[x - 4] if x >= 4 else 0
                    b = prev[x]
                    c = prev[x - 4] if x >= 4 else 0
                    p = a + b - c
                    pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
                    pr = a if (pa <= pb and pa <= pc) else (b if pb <= pc else c)
                    line[x] = (line[x] + pr) & 0xFF
            out[y * stride:(y + 1) * stride] = line
            prev = line
        return width, height, out

    mw, mh, mortar = read_sheet(MORTAR_OUTPUT)
    gw, gh, gerb = read_sheet(GERB_OUTPUT)
    sw, sh, shell = read_sheet(SHELL_OUTPUT)
    width = max(gw, sw)
    height = gh + sh
    canvas = bytearray(width * height * 4)
    # PAL.night, the colour the stand actually sits on.
    for i in range(0, len(canvas), 4):
        canvas[i], canvas[i + 1], canvas[i + 2], canvas[i + 3] = 0x0B, 0x16, 0x24, 255

    def composite(src, sx_w, sx_h, oy):
        for y in range(sx_h):
            for x in range(sx_w):
                si = (y * sx_w + x) * 4
                a = src[si + 3] / 255.0
                if a <= 0.0:
                    continue
                di = ((y + oy) * width + x) * 4
                for c in range(3):
                    # Additive, exactly as the game blends it.
                    canvas[di + c] = min(255, canvas[di + c] + int(src[si + c] * a))

    composite(gerb, gw, gh, 0)
    # The permanent unit is a separate runtime layer. Tile it over every burn
    # frame here so the diagnostic preview still shows the complete gerb.
    for frame in range(GERB_FRAMES):
        for y in range(mh):
            for x in range(mw):
                si = (y * mw + x) * 4
                a = mortar[si + 3] / 255.0
                if a <= 0.0:
                    continue
                di = (y * width + frame * GERB_W + x) * 4
                # Normal alpha-over, matching the static fixture in Phaser.
                for c in range(3):
                    canvas[di + c] = round(
                        mortar[si + c] * a + canvas[di + c] * (1.0 - a)
                    )
    composite(shell, sw, sh, gh)
    write_png(path, width, height, canvas)
    print(f"Preview: {path} ({width}x{height})")


if __name__ == "__main__":
    import os

    build_mortar()
    build_gerb()
    build_shell()
    preview = os.environ.get("PYRO_PREVIEW")
    if preview:
        build_preview(Path(preview))
