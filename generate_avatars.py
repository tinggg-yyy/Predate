#!/usr/bin/env python3
"""Generate avatar PNGs from profiles.json grid data.
Renders only original cells (1-4, # variants) — impression overlays are skipped.
Output: avatars/<name>.png  (transparent bg, green pixels)

Usage:
  python3 generate_avatars.py              # regenerate all profiles
  python3 generate_avatars.py --name 恶比  # regenerate one profile by display name
"""

import json
import os
import sys

from PIL import Image, ImageDraw, ImageFont

PROFILES_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "profiles.json")
OUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "avatars")
CELL = 16          # px per grid cell — larger = crisper pixels
SIZE = CELL * 32   # 512 × 512
GREEN = (57, 255, 20)

FONT_PATH = "/System/Library/Fonts/STHeiti Medium.ttc"

BLOCK_ALPHA = {1: 64, 2: 125, 3: 191, 4: 255, "pixel": 255}
TEXT_ALPHA  = {"#": 255, "#4": 255, "text": 255,
               "#1": 64, "#2": 125, "#3": 191}


def is_original(cell):
    if cell is None or cell == "/":
        return False
    if isinstance(cell, list):      # [char, alpha] — impression overlay
        return False
    if isinstance(cell, int) or cell in BLOCK_ALPHA or cell in TEXT_ALPHA:
        return True
    return False


def cell_alpha(cell):
    if isinstance(cell, int):
        return BLOCK_ALPHA.get(cell, 255)
    return BLOCK_ALPHA.get(cell) or TEXT_ALPHA.get(cell) or 255


def render_avatar(grid, grid_text, out_path):
    img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    font_size = CELL - 2   # slightly smaller than cell so chars don't bleed
    try:
        font = ImageFont.truetype(FONT_PATH, font_size)
    except Exception:
        font = ImageFont.load_default()

    for y in range(32):
        for x in range(32):
            cell = grid[y][x]
            if not is_original(cell):
                continue

            px = x * CELL
            py = y * CELL
            alpha = cell_alpha(cell)
            color = GREEN + (alpha,)

            if cell in BLOCK_ALPHA or isinstance(cell, int):
                draw.rectangle([px, py, px + CELL - 1, py + CELL - 1], fill=color)
            else:
                text = grid_text or "#"
                bbox = font.getbbox(text)
                tw = bbox[2] - bbox[0]
                th = bbox[3] - bbox[1]
                tx = px + (CELL - tw) // 2 - bbox[0]
                ty = py + (CELL - th) // 2 - bbox[1]
                draw.text((tx, ty), text, font=font, fill=color)

    img.save(out_path, "PNG")
    print(f"saved → {os.path.basename(out_path)}")


def main():
    target_name = None
    args = sys.argv[1:]
    if "--name" in args:
        idx = args.index("--name")
        if idx + 1 < len(args):
            target_name = args[idx + 1]

    os.makedirs(OUT_DIR, exist_ok=True)

    with open(PROFILES_PATH, encoding="utf-8") as f:
        profiles = json.load(f)

    for p in profiles:
        name = p.get("name") or p.get("username", "unknown")
        if target_name and name != target_name:
            continue
        grid = p.get("grid")
        grid_text = p.get("gridText", "")
        if not grid:
            continue
        safe_name = name.replace(" ", "_").replace("/", "_")
        out_path = os.path.join(OUT_DIR, f"{safe_name}.png")
        render_avatar(grid, grid_text, out_path)


if __name__ == "__main__":
    main()
