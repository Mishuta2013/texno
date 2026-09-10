#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Illustrations for the backup-power bundles.

These are drawings, not photographs, and they are meant to look it.

The reason is not squeamishness. The shop assembles a bundle from whatever
inverter and battery suit the customer, after a phone call — so there is no
assembled unit to photograph, and a photorealistic render would show hardware
nobody is going to receive. A buyer reads a product photo as a promise about
what arrives in the van. This keeps the promise limited to what is actually
fixed: the inverter's power, the battery's reserve, the display, and the cable
between them that the price covers.

Drawn with PIL rather than as SVG because everything downstream expects a
raster: scripts/gen_images.py opens photos[0] to compose the share card, and
PIL cannot read SVG.

Run: python scripts/make_kits.py
"""
import io
import json
import math
import os
import sys

from PIL import Image, ImageDraw, ImageFilter, ImageFont

sys.stdout.reconfigure(encoding='utf-8')
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'assets', 'img', 'products')

FULL, THUMB = (900, 900), (400, 400)
NAVY = (11, 26, 51)
PANEL = (22, 48, 92)
PANEL_D = (14, 31, 60)
FROST = (124, 196, 255)
WHITE = (255, 255, 255)
AMBER = (255, 122, 41)


def font(size, bold=True):
    for p in ([r'C:/Windows/Fonts/arialbd.ttf'] if bold else [r'C:/Windows/Fonts/arial.ttf']):
        if os.path.exists(p):
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()


def rounded(d, box, r, fill=None, outline=None, width=1):
    d.rounded_rectangle(box, radius=r, fill=fill, outline=outline, width=width)


def ground(size, grid=True):
    """The same navy the site's own imagery sits on, with the faint lattice the
    hero draws in CSS, so a bundle card does not look imported from elsewhere."""
    w, h = size
    img = Image.new('RGB', size, NAVY)
    d = ImageDraw.Draw(img)
    # a soft blue wash from the top right, matching .hero-glow
    glow = Image.new('L', size, 0)
    ImageDraw.Draw(glow).ellipse([w * 0.45, -h * 0.35, w * 1.35, h * 0.72], fill=120)
    img = Image.composite(Image.new('RGB', size, (46, 139, 255)), img,
                          glow.filter(ImageFilter.GaussianBlur(int(w * 0.16))))
    if grid:
        d = ImageDraw.Draw(img)
        step = int(w / 16)
        for x in range(0, w, step):
            d.line([(x, 0), (x, h)], fill=(30, 56, 100), width=1)
        for y in range(0, h, step):
            d.line([(0, y), (w, y)], fill=(30, 56, 100), width=1)
    return img


def shadow(img, box, blur, alpha=150):
    lay = Image.new('RGBA', img.size, (0, 0, 0, 0))
    ImageDraw.Draw(lay).rounded_rectangle(box, radius=int(blur * 1.2), fill=(3, 10, 24, alpha))
    img.paste(Image.alpha_composite(img.convert('RGBA'), lay.filter(ImageFilter.GaussianBlur(blur))).convert('RGB'), (0, 0))


def draw_kit(kw, kwh, size):
    """Inverter on the left with its display, battery on the right, the cable
    that comes in the box between them."""
    w, h = size
    s = w / 900.0                       # everything below is authored at 900px
    img = ground(size).convert('RGBA')
    d = ImageDraw.Draw(img)

    def S(v):
        return int(round(v * s))

    # ---- inverter ----
    ix, iy, iw, ih = S(66), S(236), S(392), S(340)
    shadow(img, [ix + S(10), iy + S(22), ix + iw + S(10), iy + ih + S(26)], S(26))
    d = ImageDraw.Draw(img)
    rounded(d, [ix, iy, ix + iw, iy + ih], S(34), fill=PANEL, outline=FROST + (120,), width=max(2, S(3)))
    # screen
    sx, sy, sw, sh = ix + S(38), iy + S(40), iw - S(76), S(116)
    rounded(d, [sx, sy, sx + sw, sy + sh], S(16), fill=PANEL_D, outline=FROST + (90,), width=max(1, S(2)))
    f = font(S(62))
    label = f'{kw} кВт'
    tw = d.textlength(label, font=f)
    d.text((sx + sw / 2 - tw / 2, sy + sh / 2 - S(40)), label, font=f, fill=FROST)
    # status lights: one live, the rest idle
    for i in range(3):
        cx = ix + S(60) + i * S(56)
        cy = iy + ih - S(72)
        r = S(15)
        d.ellipse([cx - r, cy - r, cx + r, cy + r],
                  fill=(FROST if i == 0 else (58, 96, 152)))
    # vent slots
    for i in range(5):
        vx = ix + S(56) + i * S(52)
        d.rounded_rectangle([vx, iy + ih - S(34), vx + S(26), iy + ih - S(20)], radius=S(7),
                            fill=(46, 82, 140))

    # ---- battery ----
    bx, by, bw, bh = S(548), S(212), S(292), S(452)
    shadow(img, [bx + S(10), by + S(22), bx + bw + S(10), by + bh + S(26)], S(26))
    d = ImageDraw.Draw(img)
    # terminal nub on top
    rounded(d, [bx + bw / 2 - S(44), by - S(26), bx + bw / 2 + S(44), by + S(10)], S(12),
            fill=(96, 150, 214))
    rounded(d, [bx, by, bx + bw, by + bh], S(34), fill=PANEL, outline=FROST + (120,), width=max(2, S(3)))
    # charge cells, fullest at the top
    for i in range(4):
        cy = by + S(42) + i * S(72)
        rounded(d, [bx + S(42), cy, bx + bw - S(42), cy + S(50)], S(12),
                fill=(int(124 - i * 16), int(196 - i * 26), int(255 - i * 30)))
    f = font(S(46))
    label = f'{kwh} кВт·год'
    tw = d.textlength(label, font=f)
    d.text((bx + bw / 2 - tw / 2, by + bh - S(78)), label, font=f, fill=WHITE)

    # ---- the cable the price includes ----
    cable = Image.new('RGBA', size, (0, 0, 0, 0))
    cd = ImageDraw.Draw(cable)
    x0, y0 = ix + iw, iy + ih - S(120)
    x1, y1 = bx, by + bh - S(150)
    pts = []
    for i in range(41):
        t = i / 40
        # a quadratic bend, so the cable droops the way a real one would
        mx, my = (x0 + x1) / 2, max(y0, y1) + S(150)
        px = (1 - t) ** 2 * x0 + 2 * (1 - t) * t * mx + t ** 2 * x1
        py = (1 - t) ** 2 * y0 + 2 * (1 - t) * t * my + t ** 2 * y1
        pts.append((px, py))
    cd.line(pts, fill=AMBER + (255,), width=max(3, S(11)), joint='curve')
    for pt in (pts[0], pts[-1]):
        r = S(13)
        cd.ellipse([pt[0] - r, pt[1] - r, pt[0] + r, pt[1] + r], fill=(255, 170, 110, 255))
    img.alpha_composite(cable)

    return img.convert('RGB')


def draw_cover(size=(1024, 688)):
    """The category cover, in the same hand as the product illustrations.

    No figures on it: a cover stands for the whole category, and a specific
    kW on it would claim something about all three configurations. The
    photographed covers of the other thirteen categories are generated studio
    shots; this one is a drawing until there is a real photograph to put here.
    """
    w, h = size
    s = w / 900.0
    img = ground(size, grid=False).convert('RGBA')

    def S(v):
        return int(round(v * s))

    d = ImageDraw.Draw(img)
    # inverter, left of centre
    ix, iy, iw, ih = S(150), S(160), S(300), S(258)
    shadow(img, [ix + S(8), iy + S(18), ix + iw + S(8), iy + ih + S(22)], S(22))
    d = ImageDraw.Draw(img)
    rounded(d, [ix, iy, ix + iw, iy + ih], S(28), fill=PANEL, outline=FROST + (120,), width=max(2, S(3)))
    rounded(d, [ix + S(30), iy + S(32), ix + iw - S(30), iy + S(140)], S(14),
            fill=PANEL_D, outline=FROST + (90,), width=max(1, S(2)))
    for i in range(3):
        cx, cy, r = ix + S(52) + i * S(46), iy + ih - S(56), S(12)
        d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(FROST if i == 0 else (58, 96, 152)))

    # battery, right of centre
    bx, by, bw, bh = S(520), S(140), S(232), S(340)
    shadow(img, [bx + S(8), by + S(18), bx + bw + S(8), by + bh + S(22)], S(22))
    d = ImageDraw.Draw(img)
    rounded(d, [bx + bw / 2 - S(34), by - S(20), bx + bw / 2 + S(34), by + S(8)], S(10),
            fill=(96, 150, 214))
    rounded(d, [bx, by, bx + bw, by + bh], S(28), fill=PANEL, outline=FROST + (120,), width=max(2, S(3)))
    for i in range(4):
        cy = by + S(34) + i * S(56)
        rounded(d, [bx + S(34), cy, bx + bw - S(34), cy + S(38)], S(10),
                fill=(int(124 - i * 16), int(196 - i * 26), int(255 - i * 30)))

    # the cable between them
    cable = Image.new('RGBA', size, (0, 0, 0, 0))
    cd = ImageDraw.Draw(cable)
    x0, y0 = ix + iw, iy + ih - S(90)
    x1, y1 = bx, by + bh - S(110)
    pts = []
    for i in range(41):
        t = i / 40
        mx, my = (x0 + x1) / 2, max(y0, y1) + S(110)
        pts.append(((1 - t) ** 2 * x0 + 2 * (1 - t) * t * mx + t ** 2 * x1,
                    (1 - t) ** 2 * y0 + 2 * (1 - t) * t * my + t ** 2 * y1))
    cd.line(pts, fill=AMBER + (255,), width=max(3, S(9)), joint='curve')
    for pt in (pts[0], pts[-1]):
        r = S(11)
        cd.ellipse([pt[0] - r, pt[1] - r, pt[0] + r, pt[1] + r], fill=(255, 170, 110, 255))
    img.alpha_composite(cable)
    return img.convert('RGB')


def main():
    prods = json.load(io.open(os.path.join(ROOT, 'data', 'products.json'), encoding='utf-8'))
    kits = [p for p in prods if p.get('category') == 'komplekty']
    if not kits:
        print('no bundles in products.json'); return
    for p in kits:
        kw = p['specs']['inverter_kw'].split()[0]
        kwh = p['specs']['battery_kwh'].split()[0]
        out = os.path.join(OUT, p['slug'])
        os.makedirs(out, exist_ok=True)
        draw_kit(kw, kwh, FULL).save(os.path.join(out, '1.webp'), 'WEBP', quality=90, method=6)
        draw_kit(kw, kwh, THUMB).save(os.path.join(out, 'thumb.webp'), 'WEBP', quality=90, method=6)
        print(f'{p["slug"]}  {kw} кВт / {kwh} кВт·год')
    src = os.path.join(ROOT, 'scripts', 'covers-src', 'cat-komplekty.webp')
    draw_cover().save(src, 'WEBP', quality=92, method=6)
    print('category cover ->', os.path.relpath(src, ROOT))
    print('bundles drawn:', len(kits))


if __name__ == '__main__':
    main()
