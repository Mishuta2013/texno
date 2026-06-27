#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Generate PWA icons + Open Graph images. Run: python scripts/gen_images.py"""
import os, json
from PIL import Image, ImageDraw, ImageFont, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ICONS = os.path.join(ROOT, "assets", "icons"); os.makedirs(ICONS, exist_ok=True)
OG = os.path.join(ROOT, "assets", "og"); os.makedirs(OG, exist_ok=True)
NAVY = (11, 26, 51); BLUE = (46, 139, 255); FROST = (124, 196, 255); WHITE = (255, 255, 255)

def font(sz, bold=True):
    for p in ([r"C:/Windows/Fonts/arialbd.ttf"] if bold else [r"C:/Windows/Fonts/arial.ttf"]):
        if os.path.exists(p): return ImageFont.truetype(p, sz)
    return ImageFont.load_default()

def rrect(d, box, r, **kw): d.rounded_rectangle(box, radius=r, **kw)

def icon(size, maskable=False):
    im = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    pad = int(size * 0.10) if maskable else 0
    rrect(d, [pad, pad, size - pad, size - pad], int(size * 0.22), fill=NAVY)
    # AC unit
    s = size
    bx = [s*0.24, s*0.40, s*0.76, s*0.56]
    rrect(d, bx, int(s*0.03), outline=BLUE, width=max(3, int(s*0.022)))
    # airflow lines
    for i, x in enumerate([0.34, 0.50, 0.66]):
        d.line([s*x, s*0.60, s*x, s*0.60 + s*(0.06 + i % 2 * 0.02)], fill=FROST, width=max(2, int(s*0.018)))
    return im

for sz in (192, 512):
    icon(sz).save(os.path.join(ICONS, f"icon-{sz}.png"))
icon(512, maskable=True).save(os.path.join(ICONS, "maskable-512.png"))
icon(180).save(os.path.join(ICONS, "apple-touch-icon.png"))

def og_bg():
    im = Image.new("RGB", (1200, 630), NAVY)
    g = Image.new("L", (1200, 630), 0); dg = ImageDraw.Draw(g)
    dg.ellipse([700, -200, 1500, 500], fill=120)
    glow = Image.new("RGB", (1200, 630), BLUE)
    im = Image.composite(glow, im, g.filter(ImageFilter.GaussianBlur(160)))
    return im

def default_og():
    im = og_bg(); d = ImageDraw.Draw(im)
    d.text((80, 210), "TEXNO PLAZA", font=font(92), fill=WHITE)
    d.text((84, 330), "Кондиціонери у Сумах", font=font(54), fill=FROST)
    d.text((84, 410), "Монтаж під ключ за 1 день · оплата після встановлення", font=font(32, False), fill=(210, 225, 245))
    im.save(os.path.join(OG, "default.jpg"), quality=86)

def product_og(p):
    im = og_bg(); d = ImageDraw.Draw(im)
    # product cutout on right
    fp = os.path.join(ROOT, p["photos"][0].lstrip("/")) if p.get("photos") else None
    if fp and os.path.exists(fp):
        u = Image.open(fp).convert("RGBA"); u.thumbnail((560, 440), Image.LANCZOS)
        im.paste(u, (1200 - u.width - 60, (630 - u.height) // 2), u)
    d.text((70, 90), "TEXNO PLAZA", font=font(40), fill=FROST)
    name = p["name"]
    # wrap name
    f = font(46); words = name.split(); line = ""; y = 200
    for w in words:
        if d.textlength(line + " " + w, font=f) > 560 and line:
            d.text((70, y), line, font=f, fill=WHITE); y += 58; line = w
        else: line = (line + " " + w).strip()
    d.text((70, y), line, font=f, fill=WHITE); y += 74
    d.text((70, y), f"{p['price']:,} грн".replace(",", " "), font=font(54), fill=FROST)
    d.text((70, y + 78), "Монтаж під ключ · гарантія до 5 років", font=font(28, False), fill=(210, 225, 245))
    im.save(os.path.join(OG, p["slug"] + ".jpg"), quality=84)

default_og()
products = json.load(open(os.path.join(ROOT, "data", "products.json"), encoding="utf-8"))
for p in products: product_og(p)
print(f"icons + default OG + {len(products)} product OG generated")
