#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Second batch of refrigerator photos (31 models) -> per-slug WebP.

Same cutout machinery as process_fridges.py, but the display order is given as
1-based indices into each folder's sorted file list rather than filenames — the
sources are numeric IDs from the supplier and typing them out invites typos.

Order policy, applied after reviewing a numbered contact sheet of every folder:
closed front first (it becomes the thumbnail), then other closed angles, then
the doors open, then interior details, then the back or a dimensions diagram.
Award-badge composites and near-duplicates are left out.

Run: python scripts/process_fridges2.py
"""
import os, sys
from PIL import Image, ImageChops, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = (r"C:/Users/Dima/AppData/Local/Temp/claude/C--Claude-Code/"
       r"6d3a4449-c5b0-4259-9c6f-39f88b64f134/scratchpad/fridges2/Холодильники доп")
OUTDIR = os.path.join(ROOT, "assets", "img", "products")
FULL = (900, 900); THUMB = (400, 400)
FILL_W, FILL_H = 0.92, 0.94
WHITE = (255, 255, 255); SENT = (255, 0, 255)
CONTENT_THRESH = 12; CUT_THRESH = 14
MAX_INTERIOR_HOLES = 12.0

# folder suffix -> (slug, [1-based indices into sorted(os.listdir(folder))])
PLAN = {
 "LG GC-B459EEYM": ("lg-gc-b459eeym", [1,10,12,18,2,17,4,3,11,6,8,16,9,15,14]),
 "LG GC-B459EQYM": ("lg-gc-b459eqym", [1,12,13,19,2,10,3,11,8,18,7,9,14,15]),
 "LG GC-B459FNPW": ("lg-gc-b459fnpw", [2,10,13,4,7,11,5,6,16,8,17,9,1,15]),
 "LG GC-B459SECL": ("lg-gc-b459secl", [16,1,2,3,5,7,4,6,8,9,12,10,13,14]),
 "LG GC-B459SLCL": ("lg-gc-b459slcl", [1,2,3,5,7,9,4,6,8,10,11,12,14,15]),
 "LG GC-B509EEKM": ("lg-gc-b509eekm", [5,13,16,6,15,8,7,14,12,11,3,4,18,17]),
 "LG GC-B509EESM": ("lg-gc-b509eesm", [1,10,12,13,14,20,16,17,29,23,22,27,31,32]),
 "LG GC-B509EETM": ("lg-gc-b509eetm", [2,11,20,3,9,14,4,15,10,1,19,7,8,17]),
 "LG GC-B509EMLM": ("lg-gc-b509emlm", [2,20,12,3,10,14,4,15,11,8,19,7,9,17]),
 "LG GC-B509EMTM": ("lg-gc-b509emtm", [5,1,2,20,6,16,8,7,17,12,10,13,11,4]),
 "LG GC-B509EQTM": ("lg-gc-b509eqtm", [1,10,11,19,2,14,4,3,15,9,7,18,8,16]),
 "LG GC-B509FTZW": ("lg-gc-b509ftzw", [2,10,11,3,6,4,17,20,7,14,9,16,18,5]),
 "LG GC-B509SESM": ("lg-gc-b509sesm", [1,2,14,3,7,5,4,6,11,8,9,12,13,10]),

 "Samsung RB34C670EWWUA": ("samsung-rb34c670eww-ua", [1,2,3,4,5,6,7,8,9]),
 "Samsung RB38C603EELUA": ("samsung-rb38c603eel-ua", list(range(1,13))),
 "Samsung RB38C603ES9UA": ("samsung-rb38c603es9-ua", list(range(1,13))),
 "Samsung RB38C603EWWUA": ("samsung-rb38c603eww-ua", list(range(1,12))),
 "Samsung RB38C676EB1UA": ("samsung-rb38c676eb1-ua", [1,2,3,6,8,5,7,9,10,11,4,12,13]),
 "Samsung RB38C676EELUA": ("samsung-rb38c676eel-ua", list(range(1,12))),
 "Samsung RB38C676ES9UA": ("samsung-rb38c676es9-ua", [1,2,3,6,8,5,7,9,10,11,4,12,13]),
 "Samsung RB38C679EB1UA": ("samsung-rb38c679eb1-ua", list(range(1,13))),
 "Samsung RB50DG601EB1UA": ("samsung-rb50dg601eb1-ua", [1,2,4,5,3,6,7,8,9,10]),
 "Samsung RB50DG602ES9UA": ("samsung-rb50dg602es9-ua", [1,2,4,5,3,6,7,8,9,10]),
 "Samsung RB53DG703EB1UA": ("samsung-rb53dg703eb1-ua", [1,2,4,5,3,6,7,8,9,10]),

 "Whirlpool WHK 26403 XP6E": ("whirlpool-whk-26403-xp6e", [8,1,2,3,6,5,4,7]),
 "Whirlpool WHK 26404 XP5E": ("whirlpool-whk-26404-xp5e", [8,1,2,3,6,5,4,7]),
 "Whirlpool WHK 26413 X6EA1": ("whirlpool-whk-26413-x6ea1", [1,2,4,3,5,9,12,11,10,13,7,6,8]),
 "Whirlpool WHK 25364 XP4E": ("whirlpool-whk-25364-xp4e", [1,2,4,3,5,6,7]),
 "Whirlpool WHK 26362 XP4E": ("whirlpool-whk-26362-xp4e", [2,3,1]),
 "Whirlpool WHK 26372 X5EA3": ("whirlpool-whk-26372-x5ea3", [1,3,2,8,5,14,11,12,9,13,10,6,4,7]),
}

# GC-B509EESM's folder also holds 15 AVIF frames of a black LG with a plain door
# — a different model that arrived in the wrong folder. Indices above stop at 32
# for that slug, which is where the beige photos end.


def content_bbox(im):
    d = ImageChops.difference(im, Image.new("RGB", im.size, WHITE)).convert("L")
    return d.point(lambda p: 255 if p > CONTENT_THRESH else 0).getbbox()


def is_white_bg(im):
    w, h = im.size
    pts = [(2, 2), (w - 3, 2), (2, h - 3), (w - 3, h - 3),
           (w // 2, 2), (w // 2, h - 3), (2, h // 2), (w - 3, h // 2)]
    ok = sum(1 for x, y in pts if all(c > 240 for c in im.getpixel((x, y))[:3]))
    return ok >= 7


def cut(im, thresh=CUT_THRESH, feather=0.8):
    b = content_bbox(im)
    if b:
        im = im.crop(b)
    w, h = im.size
    pad = max(10, int(0.05 * max(w, h)))
    cv = Image.new("RGB", (w + 2 * pad, h + 2 * pad), WHITE)
    cv.paste(im, (pad, pad))
    W, H = cv.size
    for s in [(0, 0), (W - 1, 0), (0, H - 1), (W - 1, H - 1),
              (W // 2, 0), (W // 2, H - 1), (0, H // 2), (W - 1, H // 2)]:
        ImageDraw.floodfill(cv, s, SENT, thresh=thresh)
    d = ImageChops.difference(cv, Image.new("RGB", cv.size, SENT)).split()
    comb = ImageChops.lighter(ImageChops.lighter(d[0], d[1]), d[2])
    alpha = comb.point(lambda p: 0 if p <= 6 else 255).filter(ImageFilter.GaussianBlur(feather))
    out = cv.convert("RGBA")
    out.putalpha(alpha)
    bb = out.getbbox()
    return out.crop(bb) if bb else out


def interior_holes(rgba):
    a = rgba.split()[3]
    bb = rgba.getbbox()
    if not bb:
        return 100.0
    x0, y0, x1, y1 = bb
    pts = [a.getpixel((x0 + (x1 - x0) * i // 10, y0 + (y1 - y0) * j // 10))
           for i in range(1, 10) for j in range(1, 10)]
    return sum(1 for v in pts if v < 40) / len(pts) * 100


def normalize(rgba, size, fw=FILL_W, fh=FILL_H):
    cw, ch = rgba.size
    sc = min(size[0] * fw / cw, size[1] * fh / ch)
    nw, nh = max(1, round(cw * sc)), max(1, round(ch * sc))
    r = rgba.resize((nw, nh), Image.LANCZOS)
    canvas = Image.new("RGBA", size, (0, 0, 0, 0))
    canvas.paste(r, ((size[0] - nw) // 2, (size[1] - nh) // 2), r)
    return canvas


def prepare(im):
    if not is_white_bg(im):
        return im.convert("RGBA"), "kept (scene)"
    cutout = cut(im)
    holes = interior_holes(cutout)
    if holes > MAX_INTERIOR_HOLES:
        b = content_bbox(im)
        return (im.crop(b) if b else im).convert("RGBA"), f"kept (cut ate {holes:.0f}%)"
    return cutout, "cut"


def main():
    # Folder names vary: "Двокамерний холодильник LG …", "Холодильник Whirlpool …",
    # "Холодильник з морозильною камерою Whirlpool …". Key on the brand word
    # onwards so all three shapes reduce to the same thing.
    brands = ("LG", "Samsung", "Whirlpool")
    folders = {}
    for f in os.listdir(SRC):
        if not os.path.isdir(os.path.join(SRC, f)):
            continue
        for br in brands:
            i = f.find(br + " ")
            if i >= 0:
                folders[f[i:]] = f
                break
    total = 0
    for key, (slug, picks) in PLAN.items():
        folder = folders.get(key)
        if folder is None:
            print(f"  !! no folder for {key}"); continue
        d = os.path.join(SRC, folder)
        files = sorted(os.listdir(d))
        out = os.path.join(OUTDIR, slug)
        os.makedirs(out, exist_ok=True)
        for old in os.listdir(out):
            os.remove(os.path.join(out, old))
        n, hero, notes = 0, None, {}
        for i in picks:
            if not (1 <= i <= len(files)):
                print(f"  !! {slug}: index {i} outside 1..{len(files)}"); continue
            im = Image.open(os.path.join(d, files[i - 1])).convert("RGB")
            rgba, how = prepare(im)
            notes[how] = notes.get(how, 0) + 1
            n += 1
            normalize(rgba, FULL).save(os.path.join(out, f"{n}.webp"), "WEBP", quality=88, method=6)
            if n == 1:
                hero = rgba
        if hero is not None:
            normalize(hero, THUMB).save(os.path.join(out, "thumb.webp"), "WEBP", quality=86, method=6)
        total += n
        print(f"{slug}: {n} photos  {notes}")
    print("total:", total)


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()
