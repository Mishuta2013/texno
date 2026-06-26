#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Phase 2: cut out background + normalize source photos into per-slug WebP FILES
(full 800x600 + 400x300 thumb), and rewrite data/products.json photos[] to paths.
Run: python scripts/process_images.py
"""
import json, re, os, sys
from PIL import Image, ImageChops, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = r"C:/Rozetka_Automation/ФОТО_SRC/ФОТО"
OUTDIR = os.path.join(ROOT, "assets", "img", "products")
PRODUCTS = os.path.join(ROOT, "data", "products.json")
FULL = (800, 600)
THUMB = (400, 300)
FILL_W, FILL_H = 0.94, 0.88
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

def normalize(rgba, size):
    cw, ch = rgba.size
    sc = min(size[0]*FILL_W/cw, size[1]*FILL_H/ch)
    nw, nh = max(1, round(cw*sc)), max(1, round(ch*sc))
    r = rgba.resize((nw, nh), Image.LANCZOS)
    canvas = Image.new("RGBA", size, (0,0,0,0))
    canvas.paste(r, ((size[0]-nw)//2, (size[1]-nh)//2), r)
    return canvas

def nat(fn):
    m = re.match(r"\s*(\d+)", fn); return (int(m.group(1)) if m else 9999, fn.lower())

def folders():
    return sorted([d for d in os.listdir(SRC) if os.path.isdir(os.path.join(SRC, d))],
                  key=lambda s: int(s.split(" - ")[0]))

def main():
    products = json.load(open(PRODUCTS, encoding="utf-8"))
    flds = folders()
    assert len(flds) == len(products), (len(flds), len(products))
    rel = lambda slug, n: f"/assets/img/products/{slug}/{n}"
    total = 0
    for p in products:
        fld = flds[p["srcIndex"]]
        fp = os.path.join(SRC, fld)
        files = sorted([f for f in os.listdir(fp) if f.lower().endswith((".webp",".jpg",".jpeg",".png"))], key=nat)
        outd = os.path.join(OUTDIR, p["slug"]); os.makedirs(outd, exist_ok=True)
        photos = []
        for j, f in enumerate(files):
            base = cut(Image.open(os.path.join(fp, f)).convert("RGB"))
            full = normalize(base, FULL)
            name = f"{j+1}.webp"
            full.save(os.path.join(outd, name), "WEBP", quality=80, method=4)
            photos.append(rel(p["slug"], name)); total += 1
            if j == 0:
                normalize(base, THUMB).save(os.path.join(outd, "thumb.webp"), "WEBP", quality=78, method=4)
        p["photos"] = photos
        p["thumb"] = rel(p["slug"], "thumb.webp")
        print(f"[{p['srcIndex']+1:02d}/52] {len(photos)} imgs  {p['slug'][:46]}")
    json.dump(products, open(PRODUCTS, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    sz = sum(os.path.getsize(os.path.join(dp, f)) for dp,_,fs in os.walk(OUTDIR) for f in fs)
    print(f"\nDONE  {total} full + 52 thumbs  | assets total {round(sz/1e6,2)} MB | products.json updated")

if __name__ == "__main__":
    main()
