#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Small versions of every product photo for the gallery strip.

The thumbnail row under the main product image was loading the full 900x900
files and drawing them at about 80x60. Sixteen photos meant more than half a
megabyte fetched to render a row of postage stamps. These 240px copies do the
same job for roughly a tenth of the bytes; the full file is still what opens in
the viewer.

Writes assets/img/products/<slug>/sm/<n>.webp. Safe to re-run: it skips a
thumbnail that is already newer than its source.

Run: python scripts/make_thumbs.py
"""
import os
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASE = os.path.join(ROOT, "assets", "img", "products")
SIZE = 240


def main():
    made = skipped = 0
    total_src = total_out = 0
    for slug in sorted(os.listdir(BASE)):
        d = os.path.join(BASE, slug)
        if not os.path.isdir(d):
            continue
        out_dir = os.path.join(d, "sm")
        os.makedirs(out_dir, exist_ok=True)
        for f in os.listdir(d):
            if not f.endswith(".webp") or not f[0].isdigit():
                continue
            src = os.path.join(d, f)
            dst = os.path.join(out_dir, f)
            total_src += os.path.getsize(src)
            if os.path.exists(dst) and os.path.getmtime(dst) >= os.path.getmtime(src):
                total_out += os.path.getsize(dst)
                skipped += 1
                continue
            im = Image.open(src).convert("RGBA")
            im.thumbnail((SIZE, SIZE), Image.LANCZOS)
            im.save(dst, "WEBP", quality=82, method=6)
            total_out += os.path.getsize(dst)
            made += 1
    print("thumbnails written: %d, already current: %d" % (made, skipped))
    print("full-size total: %.1f MB -> thumbnails %.1f MB"
          % (total_src / 1048576.0, total_out / 1048576.0))


if __name__ == "__main__":
    main()
