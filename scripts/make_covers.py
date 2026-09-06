#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Category covers: a real product from our own catalogue, standing in a room.

The product photo is the real cut-out we already ship on its own page — nothing
about the thing being sold is invented. The room behind it is generated, and it
is thrown far out of focus on purpose: that keeps it as atmosphere rather than a
claim, and it makes the composite impossible to spot, because there is no sharp
edge anywhere for the eye to catch a mismatch on.

Everything is graded toward the brand navy so the five covers read as one family
and sit with the header. Rooms live in scripts/covers-src/ at 1600x900 — small,
because they are only ever seen blurred.

Two files per category: 800px for the desktop card, 400px for the 2-up phone
grid. Blurred backgrounds compress to almost nothing, so the whole set is ~42 KB.

Run: python scripts/make_covers.py
"""
import io
import json
import pathlib
import sys

from PIL import Image, ImageDraw, ImageEnhance, ImageFilter

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "scripts" / "covers-src"
OUT = ROOT / "assets" / "img" / "covers"
W, H = 1600, 900                      # rendered at 2x, downscaled on save

# product, height as a share of the frame, centre x, how it is mounted,
# how far to pull the room toward navy, and a brightness lift for dark rooms
PLAN = {
    "kondicioneri":      ("tcl-tac-09chsd-tph21if-inverter-r32-wi-fi", 0.30, 0.52, "wall",  0.34, 1.00),
    "pralni-mashyny":    ("haier-hw70-b14929-s",                       0.70, 0.52, "floor", 0.38, 1.00),
    "holodylnyky":       ("lg-gc-b509smsm",                            0.84, 0.52, "floor", 0.36, 1.00),
    "zaryadni-stantsii": ("fossibot-f1800-1800w-1024wh",               0.52, 0.52, "floor", 0.28, 1.16),
    "boylery":           ("atlantic-round-eco-vmr-80",                 0.62, 0.52, "wall",  0.40, 0.96),
}


def build(cat, prods, slug, hshare, cx, mount, grade, lift):
    room = Image.open(SRC / f"room-{cat}.webp").convert("RGB")
    r = max(W / room.width, H / room.height)
    room = room.resize((int(room.width * r) + 1, int(room.height * r) + 1), Image.LANCZOS)
    ox, oy = (room.width - W) // 2, (room.height - H) // 2
    room = room.crop((ox, oy, ox + W, oy + H)).filter(ImageFilter.GaussianBlur(26))
    room = ImageEnhance.Brightness(room).enhance(1.08 * lift)
    room = Image.blend(room, Image.new("RGB", (W, H), (14, 32, 64)), grade)

    # vignette: darker edges keep the eye on the product
    v = Image.new("L", (W, H), 0)
    ImageDraw.Draw(v).ellipse((-W * 0.22, -H * 0.32, W * 1.22, H * 1.32), fill=255)
    room = Image.composite(room, ImageEnhance.Brightness(room).enhance(0.70),
                           v.filter(ImageFilter.GaussianBlur(220)))
    # soft key light behind the product so a dark appliance still separates
    glow = Image.new("L", (W, H), 0)
    gy = H * 0.42 if mount == "wall" else H * 0.55
    ImageDraw.Draw(glow).ellipse((W * cx - W * 0.30, gy - H * 0.40, W * cx + W * 0.30, gy + H * 0.40), fill=95)
    room = Image.composite(ImageEnhance.Brightness(room).enhance(1.34), room,
                           glow.filter(ImageFilter.GaussianBlur(170)))

    src = Image.open(str(ROOT) + prods[slug]["photos"][0]).convert("RGBA")
    im = src.crop(src.getbbox())
    th = int(H * hshare)
    w = max(1, int(im.width * th / im.height))
    if w > W * 0.62:                              # never let a wide unit crowd the frame
        th = int(th * (W * 0.62) / w)
        w = int(W * 0.62)
    im = im.resize((w, th), Image.LANCZOS)
    px = int(W * cx - w / 2)
    py = int(H * 0.955 - th) if mount == "floor" else int(H * 0.30 - th * 0.30)

    out = room.convert("RGBA")
    if mount == "floor":
        # contact shadow: without it a floor-standing appliance floats
        cs = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        ImageDraw.Draw(cs).ellipse((px + w * 0.06, py + th - th * 0.045,
                                    px + w * 0.94, py + th + th * 0.055), fill=(0, 0, 0, 165))
        out = Image.alpha_composite(out, cs.filter(ImageFilter.GaussianBlur(26)))
    drop = Image.new("RGBA", im.size, (0, 0, 0, 0))
    drop.paste((0, 0, 0, 120 if mount == "floor" else 105), (0, 0), im.split()[3])
    dl = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    dl.alpha_composite(drop.filter(ImageFilter.GaussianBlur(38)), (px + int(w * 0.03), py + int(th * 0.05)))
    out = Image.alpha_composite(out, dl)
    top = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    top.alpha_composite(im, (px, py))
    return Image.alpha_composite(out, top).convert("RGB")


def main():
    prods = {p["slug"]: p for p in json.load(io.open(ROOT / "data" / "products.json", encoding="utf-8"))}
    OUT.mkdir(parents=True, exist_ok=True)
    total = 0.0
    for cat, args in PLAN.items():
        full = build(cat, prods, *args)
        for wpx in (800, 400):
            name = f"cat-{cat}.webp" if wpx == 800 else f"cat-{cat}@{wpx}.webp"
            f = OUT / name
            full.resize((wpx, wpx * 9 // 16), Image.LANCZOS).save(f, "WEBP", quality=80, method=6)
            kb = f.stat().st_size / 1024
            total += kb
            print(f"  {name:34s} {wpx}px  {kb:6.1f} KB")
    print(f"  {'TOTAL':34s}        {total:6.1f} KB")


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()
