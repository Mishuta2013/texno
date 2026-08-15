#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Composite processed product photos onto magenta and lay them out as a sheet.

Transparency is invisible against a white page, so a hole in a white appliance
only shows up once the photo sits on a colour nothing in the catalogue uses.
Anything magenta on the sheet is a hole the customer would see as page
background showing through the product.

Run: python scripts/check_cutout.py <slug> [slug ...]
"""
import os
import sys
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUTDIR = os.path.join(ROOT, "assets", "img", "products")
DEST = (r"C:/Users/Dima/AppData/Local/Temp/claude/C--Claude-Code/"
        r"f7237fd4-d55b-4f73-91cd-b76f1fcaa743/scratchpad/cutout_check")
CELL = 230
COLS = 6
MAGENTA = (255, 0, 255, 255)


def sheet(slug):
    d = os.path.join(OUTDIR, slug)
    files = sorted([f for f in os.listdir(d) if f[0].isdigit()],
                   key=lambda f: int(f.split(".")[0]))
    rows = (len(files) + COLS - 1) // COLS
    out = Image.new("RGB", (COLS * CELL, rows * (CELL + 16)), (245, 247, 250))
    dr = ImageDraw.Draw(out)
    for i, f in enumerate(files):
        im = Image.open(os.path.join(d, f)).convert("RGBA").resize((CELL, CELL), Image.LANCZOS)
        bg = Image.new("RGBA", (CELL, CELL), MAGENTA)
        bg.alpha_composite(im)
        x, y = (i % COLS) * CELL, (i // COLS) * (CELL + 16)
        out.paste(bg.convert("RGB"), (x, y))
        dr.text((x + 4, y + CELL + 2), "[%d] %s" % (i + 1, f), fill=(20, 20, 20))
    os.makedirs(DEST, exist_ok=True)
    p = os.path.join(DEST, slug + ".jpg")
    out.save(p, "JPEG", quality=88)
    print("%-28s %2d photos -> %s" % (slug, len(files), p))


if __name__ == "__main__":
    for s in sys.argv[1:]:
        sheet(s)
