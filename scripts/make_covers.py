#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Category card covers, from the generated hero shots in scripts/covers-src/.

The shots are studio product photographs made for the site's own palette: deep
navy backdrop, cool blue rim light. They are deliberately unbranded — no logo,
no lettering, no readable display — because a made-up badge on a model nobody
sells would mislead a buyer. They illustrate the category; the real thing with a
real name and price lives one click away on the product pages.

The sources are 3:2, the card wants something much wider and shorter. Cropping
to that would cut the top and bottom off a fridge or a boiler, so instead the
whole frame is scaled to fit the height and the backdrop is stretched sideways
to fill the margins. The outer columns are near-flat navy, so the join is
invisible and no product loses its head.

Two files per category: 800px for the desktop card, 400px for the 2-up phone
grid.

Run: python scripts/make_covers.py
"""
import pathlib
import sys

from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "scripts" / "covers-src"
OUT = ROOT / "assets" / "img" / "covers"
OG = ROOT / "assets" / "og"

CATS = ["kondicioneri", "pralni-mashyny", "holodylnyky", "zaryadni-stantsii", "boylery"]
RATIO = 40 / 17          # 2.35:1 — a 379px card gets a 161px cover instead of 213px
WIDTHS = (1200, 800, 400)   # 1200 for the category hero on a wide screen


def widen(im, ratio):
    """Fit the whole frame into a wider canvas, extending the backdrop sideways
    rather than cropping the product off the top and bottom."""
    w, h = im.size
    ch = int(round(w / ratio))
    if ch >= h:                                   # source is already wider than asked
        y = (h - ch) // 2
        return im.crop((0, y, w, y + ch))
    nw = int(round(w * ch / h))
    small = im.resize((nw, ch), Image.LANCZOS)
    canvas = Image.new("RGB", (w, ch))
    pad = (w - nw) // 2
    canvas.paste(small.crop((0, 0, 1, ch)).resize((pad + 1, ch), Image.LANCZOS), (0, 0))
    canvas.paste(small.crop((nw - 1, 0, nw, ch)).resize((w - nw - pad + 1, ch), Image.LANCZOS), (pad + nw - 1, 0))
    canvas.paste(small, (pad, 0))
    return canvas


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    OG.mkdir(parents=True, exist_ok=True)
    total = 0.0
    for cat in CATS:
        full = widen(Image.open(SRC / f"cat-{cat}.webp").convert("RGB"), RATIO)
        for wpx in WIDTHS:
            name = f"cat-{cat}.webp" if wpx == 800 else f"cat-{cat}@{wpx}.webp"
            f = OUT / name
            full.resize((wpx, int(round(wpx / RATIO))), Image.LANCZOS).save(f, "WEBP", quality=82, method=6)
            kb = f.stat().st_size / 1024
            total += kb
            print(f"  {name:34s} {wpx}x{int(round(wpx / RATIO))}  {kb:6.1f} KB")
        # share card: 1200x630 is what Viber, Telegram and Facebook crop to, and
        # JPEG is the one format all three render
        og = widen(Image.open(SRC / f"cat-{cat}.webp").convert("RGB"), 1200 / 630)
        f = OG / f"cat-{cat}.jpg"
        og.resize((1200, 630), Image.LANCZOS).save(f, "JPEG", quality=84, optimize=True, progressive=True)
        kb = f.stat().st_size / 1024
        total += kb
        print(f"  {f.name:34s} 1200x630  {kb:6.1f} KB")
    # The home page hero. Its left third sits under a dark veil carrying the
    # headline, so the group has to live in the right two thirds: scale it to fit
    # there and stretch the backdrop out to the left rather than crop the fridge
    # off. Same slot and same alt as the photo it replaces.
    HW, HH = 1600, 1067
    src = Image.open(SRC / "hero-appliances.webp").convert("RGB")
    gw = int(HW * 0.72)
    grp = src.resize((gw, int(src.height * gw / src.width)), Image.LANCZOS)
    hero = Image.new("RGB", (HW, HH))
    x, y = HW - gw, (HH - grp.height) // 2
    hero.paste(grp.crop((0, 0, 1, grp.height)).resize((x + 1, grp.height), Image.LANCZOS), (0, y))
    hero.paste(grp, (x, y))
    hero.paste(hero.crop((0, y, HW, y + 1)).resize((HW, y + 1), Image.LANCZOS), (0, 0))
    bot = y + grp.height
    hero.paste(hero.crop((0, bot - 1, HW, bot)).resize((HW, HH - bot + 1), Image.LANCZOS), (0, bot - 1))
    f = ROOT / "assets" / "img" / "site" / "hero.webp"
    hero.save(f, "WEBP", quality=82, method=6)
    kb = f.stat().st_size / 1024
    total += kb
    print(f"  {'hero.webp (home page)':34s} {HW}x{HH}  {kb:6.1f} KB")
    print(f"  {'TOTAL':34s}            {total:6.1f} KB")


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()
