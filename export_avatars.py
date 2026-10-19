#!/usr/bin/env python3
"""Export grid drawings from profiles.json to PNG avatars."""

import json
import os
from PIL import Image, ImageDraw, ImageFont

PROFILES_PATH = os.path.join(os.path.dirname(__file__), "profiles.json")
AVATARS_DIR   = os.path.join(os.path.dirname(__file__), "avatars")
FONT_PATH     = os.path.join(os.path.dirname(__file__), "public", "fonts", "zpix.ttf")

SIZE      = 1024
CELL      = SIZE // 32   # 32 px per cell
GAP       = 2
BG        = (169, 176, 162, 255)   # #a9b0a2
DEAD      = (162, 169, 155, 255)   # #a2a99b
INK       = (40,  56,  24,  255)
SHADOW_A  = 0.60

PIXEL_ALPHA = {1: 0.25, 2: 0.49, 3: 0.75, 4: 1.0}
TEXT_ALPHA  = {"#1": 0.25, "#2": 0.49, "#3": 0.75, "#4": 1.0,
               "#": 1.0, "text": 1.0}

os.makedirs(AVATARS_DIR, exist_ok=True)

try:
    font = ImageFont.truetype(FONT_PATH, 26)
except Exception:
    font = ImageFont.load_default()


def ink_rgba(alpha: float) -> tuple:
    return (INK[0], INK[1], INK[2], int(alpha * 255))


def draw_pixel(draw: ImageDraw.ImageDraw, gx: int, gy: int, alpha: float):
    color = ink_rgba(alpha)
    x0 = gx * CELL + GAP
    y0 = gy * CELL + GAP
    draw.rectangle([x0, y0, x0 + CELL - GAP * 2 - 1, y0 + CELL - GAP * 2 - 1], fill=color)


def draw_char(img: Image.Image, gx: int, gy: int, ch: str, alpha: float):
    cx = gx * CELL + CELL // 2
    cy = gy * CELL + CELL // 2

    # shadow layer
    shadow_layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow_layer)
    sd.text((cx + 3, cy + 3), ch, font=font, fill=ink_rgba(alpha * SHADOW_A), anchor="mm")
    img.alpha_composite(shadow_layer)

    # ink layer
    ink_layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    id_ = ImageDraw.Draw(ink_layer)
    id_.text((cx, cy), ch, font=font, fill=ink_rgba(alpha), anchor="mm")
    img.alpha_composite(ink_layer)


def render_grid(grid: list, grid_text: str) -> Image.Image:
    img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))  # transparent
    draw = ImageDraw.Draw(img)

    for gy in range(32):
        for gx in range(32):
            cell = grid[gy][gx]
            if cell is None or cell == "/" or cell == "":
                continue
            if cell == "pixel" or cell == 4:
                draw_pixel(draw, gx, gy, 1.0)
            elif isinstance(cell, int) and cell in PIXEL_ALPHA:
                draw_pixel(draw, gx, gy, PIXEL_ALPHA[cell])
            elif isinstance(cell, str) and cell in PIXEL_ALPHA:
                draw_pixel(draw, gx, gy, PIXEL_ALPHA[int(cell)])
            elif cell in TEXT_ALPHA:
                draw_char(img, gx, gy, grid_text, TEXT_ALPHA[cell])
            elif isinstance(cell, str) and cell.startswith("#") and len(cell) == 2:
                a = TEXT_ALPHA.get(cell, 1.0)
                draw_char(img, gx, gy, grid_text, a)
            elif isinstance(cell, list):
                draw_char(img, gx, gy, cell[0], cell[1] if isinstance(cell[1], float) else 1.0)
            elif isinstance(cell, str) and cell != "/":
                draw_char(img, gx, gy, cell, 1.0)

    return img


def main():
    with open(PROFILES_PATH, encoding="utf-8") as f:
        profiles = json.load(f)

    for p in profiles:
        name      = p.get("name", "").strip()
        grid      = p.get("grid")
        grid_text = p.get("gridText", "")

        if not name or not grid:
            continue

        out_path = os.path.join(AVATARS_DIR, f"{name}.png")
        img = render_grid(grid, grid_text)
        img.save(out_path)
        print(f"  ✓ {name}.png")

    print("Done.")


if __name__ == "__main__":
    main()
