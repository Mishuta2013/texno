#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Tightly cropped cut-outs of every product, for the home page's shop window
and category tiles.

The 400px thumbnails keep the product centred on a square with generous
transparent margins, which is right in a catalogue card and wrong anywhere
products have to stand together on one floor: a fridge in a square came out a
third smaller than its neighbours, and three of them side by side overflowed
their tile sideways. These are cropped to the product itself.

Writes assets/img/products/<slug>/cut.webp (longest side 520px) and
data/cutouts.json ({slug: [width, height]}), which build.mjs reads for the
image size attributes. Photos without transparency are skipped; the build falls
back to the thumbnail for them. Safe to re-run: a cut-out newer than its source
is kept as it is.

Run: python scripts/make_cutouts.py
"""
import os
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASE = os.path.join(ROOT, "assets", "img", "products")
OUT_JSON = os.path.join(ROOT, "data", "cutouts.json")
LONG = 520
ALPHA_MIN = 10       # ignore near-invisible fringe pixels when finding the edges
PAD = 0.012          # a hair of room so drop shadows are not clipped at the edge


def bbox(im):
    a = im.getchannel("A").point(lambda v: 255 if v > ALPHA_MIN else 0)
    return a.getbbox()


def main():
    sizes, made, kept, skipped = {}, 0, 0, []
    for slug in sorted(os.listdir(BASE)):
        d = os.path.join(BASE, slug)
        src = os.path.join(d, "1.webp")
        if not os.path.isfile(src):
            continue
        dst = os.path.join(d, "cut.webp")
        if os.path.exists(dst) and os.path.getmtime(dst) >= os.path.getmtime(src):
            with Image.open(dst) as c:
                sizes[slug] = list(c.size)
            kept += 1
            continue
        with Image.open(src) as im:
            if im.mode != "RGBA" or im.getchannel("A").getextrema()[0] > ALPHA_MIN:
                skipped.append(slug)          # no transparent background to crop to
                continue
            box = bbox(im)
            if not box:
                skipped.append(slug)
                continue
            w, h = im.size
            p = round(max(w, h) * PAD)
            box = (max(0, box[0] - p), max(0, box[1] - p), min(w, box[2] + p), min(h, box[3] + p))
            cut = im.crop(box)
            s = LONG / max(cut.size)
            if s < 1:
                cut = cut.resize((round(cut.width * s), round(cut.height * s)), Image.LANCZOS)
            cut.save(dst, "WEBP", quality=82, method=6)
            sizes[slug] = list(cut.size)
            made += 1
    with open(OUT_JSON, "w", encoding="utf-8", newline="\n") as f:
        # one product per line, so a diff shows which cut-outs changed
        f.write("{\n" + ",\n".join(f'  "{k}": [{w}, {h}]' for k, (w, h) in sorted(sizes.items())) + "\n}\n")
    print(f"cut-outs: {made} made, {kept} kept, {len(skipped)} without transparency")
    if skipped:
        print("  skipped:", ", ".join(skipped))


if __name__ == "__main__":
    main()
