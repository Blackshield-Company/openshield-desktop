#!/usr/bin/env python3
"""Generate Blackshield app icons (RGBA PNG) for OpenShield Desktop.

Simple programmatic placeholder per M1: matte black shield silhouette with a
blood-red cross on a black field. Converted to RGBA via PIL per the Tauri /
WebKitGTK rules. Sizes: 32x32, 128x128, 128x128@2x (256), icon.png (512).
Also emits static/favicon.png (32) for the dev server.
"""

from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
MATTE_BLACK = (16, 16, 20, 255)  # #101014
STEEL = (143, 149, 156, 255)  # #8F959C
BLOOD = (193, 18, 31, 255)  # #C1121F
TRANSPARENT = (0, 0, 0, 0)


def shield_polygon(size: int) -> list[tuple[float, float]]:
    """Shield outline: flat top, straight sides, pointed bottom."""
    w = size
    top = 0.08 * w
    shoulder = 0.12 * w
    bottom_y = 0.94 * w
    cx = w / 2
    return [
        (0.14 * w, top),
        (0.86 * w, top),
        (0.86 * w, shoulder + 0.42 * w),
        (cx, bottom_y),
        (0.14 * w, shoulder + 0.42 * w),
    ]


def cross_polygon(size: int) -> list[tuple[float, float]]:
    """Greek cross centered in the shield."""
    w = size
    cx, cy = w / 2, 0.46 * w
    arm = 0.075 * w  # half-width of cross arms
    span = 0.22 * w  # arm reach
    return [
        (cx - arm, cy - span),
        (cx + arm, cy - span),
        (cx + arm, cy - arm),
        (cx + span, cy - arm),
        (cx + span, cy + arm),
        (cx + arm, cy + arm),
        (cx + arm, cy + span),
        (cx - arm, cy + span),
        (cx - arm, cy + arm),
        (cx - span, cy + arm),
        (cx - span, cy - arm),
        (cx - arm, cy - arm),
    ]


def render(size: int) -> Image.Image:
    img = Image.new("RGBA", (size, size), TRANSPARENT)
    d = ImageDraw.Draw(img)

    # Black shield body with a thin steel rim.
    pts = shield_polygon(size)
    rim = [(x, y) for (x, y) in pts]
    d.polygon(rim, fill=STEEL)
    inset = 0.035 * size
    inner = [
        (x + (inset if x < size / 2 else -inset), y + (inset if y < size * 0.6 else -inset))
        for (x, y) in pts
    ]
    d.polygon(inner, fill=MATTE_BLACK)

    # Blood cross.
    d.polygon(cross_polygon(size), fill=BLOOD)

    return img


def main() -> None:
    icons = ROOT / "src-tauri" / "icons"
    icons.mkdir(parents=True, exist_ok=True)
    static = ROOT / "static"
    static.mkdir(exist_ok=True)

    outputs = {
        icons / "32x32.png": 32,
        icons / "128x128.png": 128,
        icons / "128x128@2x.png": 256,
        icons / "icon.png": 512,
        static / "favicon.png": 32,
    }
    for path, size in outputs.items():
        render(size).convert("RGBA").save(path)
        print(f"wrote {path} ({size}x{size})")


if __name__ == "__main__":
    main()
