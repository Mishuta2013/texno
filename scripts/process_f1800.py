#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""One-off: process Fossibot F1800 photos -> transparent normalized WebP (matches AC pipeline).
Product shots get background cut out; the display infographic is kept on white (no cutout).
Run: python scripts/process_f1800.py
"""
import os
from PIL import Image, ImageChops, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = r"C:/Users/Dima/AppData/Local/Temp/claude/C--Claude-Code/f7237fd4-d55b-4f73-91cd-b76f1fcaa743/scratchpad/f1800"
SLUG = "fossibot-f1800-1800w-1024wh"
OUT = os.path.join(ROOT, "assets", "img", "products", SLUG)
FULL = (800, 600); THUMB = (400, 300)
FILL_W, FILL_H = 0.92, 0.86
WHITE = (255, 255, 255); SENT = (255, 0, 255); CONTENT_THRESH = 12; CUT_THRESH = 14

def content_bbox(im):
    d = ImageChops.difference(im, Image.new("RGB", im.size, WHITE)).convert("L")
    return d.point(lambda p: 255 if p > CONTENT_THRESH else 0).getbbox()

def cut(im, thresh=CUT_THRESH, feather=0.8):
    b = content_bbox(im)
    if b: im = im.crop(b)
    w, h = im.size; pad = max(10, int(0.05 * max(w, h)))
    cv = Image.new("RGB", (w + 2*pad, h + 2*pad), WHITE); cv.paste(im, (pad, pad))
    W, H = cv.size
    for s in [(0,0),(W-1,0),(0,H-1),(W-1,H-1),(W//2,0),(W//2,H-1),(0,H//2),(W-1,H//2)]:
        ImageDraw.floodfill(cv, s, SENT, thresh=thresh)
    d = ImageChops.difference(cv, Image.new("RGB", cv.size, SENT)).split()
    comb = ImageChops.lighter(ImageChops.lighter(d[0], d[1]), d[2])
    alpha = comb.point(lambda p: 0 if p <= 6 else 255).filter(ImageFilter.GaussianBlur(feather))
    out = cv.convert("RGBA"); out.putalpha(alpha)
    bb = out.getbbox()
    if bb: out = out.crop(bb)
    return out

def normalize(rgba, size, fw=FILL_W, fh=FILL_H):
    cw, ch = rgba.size
    sc = min(size[0]*fw/cw, size[1]*fh/ch)
    nw, nh = max(1, round(cw*sc)), max(1, round(ch*sc))
    r = rgba.resize((nw, nh), Image.LANCZOS)
    canvas = Image.new("RGBA", size, (0,0,0,0))
    canvas.paste(r, ((size[0]-nw)//2, (size[1]-nh)//2), r)
    return canvas

def contain_white(im, size, fw=0.98, fh=0.98):
    """keep on transparent canvas without cutout (for the infographic)."""
    rgba = im.convert("RGBA")
    return normalize(rgba, size, fw, fh)

# source file -> (out name, is_product_shot)
PLAN = [
    ("fossibot-f1800-1800w-1024wh-black (1).jpg", "1.webp", True),
    ("fossibot-f1800-1800w-1024wh-black (3).jpg", "2.webp", True),
    ("fossibot-f1800-1800w-1024wh-black (2).jpg", "3.webp", True),
    ("fossibot-f1800-1800w-1024wh-black (5).jpg", "4.webp", True),
    ("fossibot-f1800-1800w-1024wh-black.jpg",     "5.webp", True),
    ("fossibot-f1800-1800w-1024wh-black (6).jpg", "6.webp", False),
]

def main():
    os.makedirs(OUT, exist_ok=True)
    hero = None
    for src, name, is_prod in PLAN:
        im = Image.open(os.path.join(SRC, src)).convert("RGB")
        canvas = normalize(cut(im), FULL) if is_prod else contain_white(im, FULL)
        canvas.save(os.path.join(OUT, name), "WEBP", quality=88, method=6)
        if name == "1.webp":
            hero = cut(im)
        print("wrote", name)
    # thumb from hero
    th = normalize(hero, THUMB)
    th.save(os.path.join(OUT, "thumb.webp"), "WEBP", quality=86, method=6)
    print("wrote thumb.webp")

if __name__ == "__main__":
    main()
