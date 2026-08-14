#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Process washing-machine photos -> per-slug WebP (800x600 + 400x300 thumb).
White-background product shots get the flood-fill cutout (like ACs); lifestyle/
interior shots are kept as-is, contain-fitted. First image = first white-bg shot.
Run: python scripts/process_washers.py
"""
import os, re
from PIL import Image, ImageChops, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = r"C:/Users/Dima/AppData/Local/Temp/claude/C--Claude-Code/f7237fd4-d55b-4f73-91cd-b76f1fcaa743/scratchpad/washers/Стиральні машинки"
OUTDIR = os.path.join(ROOT, "assets", "img", "products")
FULL = (800, 600); THUMB = (400, 300)
FILL_W, FILL_H = 0.92, 0.86
WHITE = (255, 255, 255); SENT = (255, 0, 255); CONTENT_THRESH = 12; CUT_THRESH = 14
MAX_PHOTOS = 8

FOLDERS = {
    "Стиральная машина   Edler   EWF7012PIBG": "edler-ewf7012pibg",
    "Стиральная машина   HAIER   HW70-B14929-S": "haier-hw70-b14929-s",
    "Стиральная машина BEKO BM1WFSU36243WW": "beko-bm1wfsu36243ww",
    "Стиральная машина Edler EWF6031": "edler-ewf6031",
    "Стиральная машина GORENJE WNGPI61SBSUA": "gorenje-wngpi61sbs-ua",
    "Стиральная машина Grifon GWMS-7121 IW": "grifon-gwms-7121-iw",
    "Стиральная машина Grifon GWMSS-6100I": "grifon-gwmss-6100i",
    "Стиральная машина INDESIT OMTWSE 61051 WK UA": "indesit-omtwse-61051-wk-ua",
    "Стиральная машина LG F2Y2NS3WE": "lg-f2y2ns3we",
    "Стиральная машина LIBERTON LWM-4950": "liberton-lwm-4950",
    "Стиральная машина SAMSUNG WW70FG3M05AWLF": "samsung-ww70fg3m05awlf",
    "Стиральные машины Edler EWF5014SSIP": "edler-ewf5014ssip",
}

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

def is_white_bg(im):
    """corners + border mostly near-white -> catalogue shot"""
    w, h = im.size
    pts = [(2,2),(w-3,2),(2,h-3),(w-3,h-3),(w//2,2),(w//2,h-3),(2,h//2),(w-3,h//2)]
    ok = 0
    for x, y in pts:
        r, g, b = im.getpixel((x, y))[:3]
        if r > 240 and g > 240 and b > 240: ok += 1
    return ok >= 7

def nat(fn):
    m = re.search(r"(\d+)(?=\.\w+$)", fn)
    return (int(m.group(1)) if m else 9999, fn.lower())

def main():
    total = 0
    for folder, slug in FOLDERS.items():
        src = os.path.join(SRC, folder)
        files = sorted([f for f in os.listdir(src) if f.lower().endswith((".webp",".jpg",".jpeg",".png"))], key=nat)
        # main-named files first
        files.sort(key=lambda f: 0 if "main" in f.lower() else 1)
        white, life = [], []
        for f in files:
            im = Image.open(os.path.join(src, f)).convert("RGB")
            (white if is_white_bg(im) else life).append((f, im))
        ordered = (white + life)[:MAX_PHOTOS]
        if not ordered:
            print("!! no images:", slug); continue
        out = os.path.join(OUTDIR, slug); os.makedirs(out, exist_ok=True)
        hero = None
        for i, (f, im) in enumerate(ordered, 1):
            if is_white_bg(im):
                canvas = normalize(cut(im), FULL)
            else:
                canvas = normalize(im.convert("RGBA"), FULL, 0.98, 0.98)
            canvas.save(os.path.join(out, f"{i}.webp"), "WEBP", quality=86, method=6)
            if i == 1: hero = cut(im) if is_white_bg(im) else im.convert("RGBA")
        normalize(hero, THUMB).save(os.path.join(out, "thumb.webp"), "WEBP", quality=84, method=6)
        total += len(ordered)
        print(f"{slug}: {len(ordered)} photos ({len(white)} cutout, {len(life)} lifestyle)")
    print("total:", total)

if __name__ == "__main__":
    main()
