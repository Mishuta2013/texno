#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Refrigerator photos -> per-slug WebP.

Two things this does differently from the earlier bulk scripts:

1. ORDER IS EXPLICIT. Every model lists its source files in the order they
   should appear (closed front first, then angles, then open/interior, then
   details, then diagrams). Junk — award badges, near-duplicates — is simply
   not listed. Reviewed by eye on contact sheets built by contact_sheet.py.

2. THE CUTOUT IS CHECKED. Flood-fill happily eats white fridge bodies and
   glass shelves. After cutting we sample a grid inside the content box; if
   too much of the interior went transparent, the cut is thrown away and the
   original photo is used as-is. Colour never silently disappears.

Run: python scripts/process_fridges.py
"""
import os
from PIL import Image, ImageChops, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = r"C:/Users/Dima/AppData/Local/Temp/claude/C--Claude-Code/f7237fd4-d55b-4f73-91cd-b76f1fcaa743/scratchpad/fridges/холодильники"
OUTDIR = os.path.join(ROOT, "assets", "img", "products")
FULL = (900, 900); THUMB = (400, 400)          # fridges are tall -> square canvas
FILL_W, FILL_H = 0.92, 0.94
WHITE = (255, 255, 255); SENT = (255, 0, 255)
CONTENT_THRESH = 12; CUT_THRESH = 14
MAX_INTERIOR_HOLES = 12.0                       # % — above this the cut is rejected

# folder -> (slug, [source files in display order])
PLAN = {
"Холодильник LG GA-B509MEWM": ("lg-ga-b509mewm", [
    "gc-b509mewm_01_front_with_medals_for_comfy_1.webp", "18_gc-b509mewm_rightside.jpg.webp",
    "19_gc-b509mewm_side.jpg.webp", "03_gc-b509mewm_frontallopen_food1.webp",
    "15_gc-b509mewm_leftsideopen_food2.jpg.webp", "05_gc-b509mewm_frontallopen.webp",
    "17_gc-b509mewm_leftsideopen.jpg.webp", "06_gc-b509mewm_display.webp",
    "07_gc-b509mewm_doorcooling_led.webp", "08_gc-b509mewm_drawer_food1.webp",
    "09_gc-b509mewm_drawer_detail3.webp", "10_gc-b509mewm_drawer_1.webp",
    "12_gc-b509mewm_drawer_3.webp", "13_gc-b509mewm_drawer_4.webp",
    "20_gc-b509mewm_se_back.jpg.webp"]),

"Холодильник LG GC-B509SMSM": ("lg-gc-b509smsm", [
    "406377123.webp", "406377117.webp", "406377120.webp",
    "406377126.webp", "406377131.webp", "406377135.webp", "406377129.webp", "406377133.webp",
    "406377145.webp", "406377138.webp", "406377140.webp", "406377147.webp", "406377150.webp",
    "406377152.webp", "406377154.webp", "406377142.webp", "290148881.webp",
    "406377160.webp", "406377163.webp"]),          # 484863224 = award badges -> dropped

"Холодильник BEKO RCNA406I30 XB": ("beko-rcna406i30xb", [
    "21798591.webp", "272805014.webp", "21798593.webp", "272805015.webp",
    "272805017.webp", "21798594.webp", "21798595.webp", "21798596.webp",
    "21798597.webp", "21798605.webp", "21798598.webp", "21798599.webp", "272805018.webp",
    "21798600.webp", "21798601.webp", "21798602.webp", "21798604.webp",
    "272805019.webp", "272805020.webp"]),          # 21798592 = different colour body -> dropped

"Холодильник Samsung RB38C600ES9UA": ("samsung-rb38c600es9-ua", [
    "444988872.webp", "444988873.webp", "444988874.webp",
    "444988876.webp", "444988875.webp", "451016770.webp",
    "451016774.webp", "451016772.webp", "451016769.webp",
    "451016775.webp", "451016773.webp"]),          # 451016771 = stock family photo -> dropped

"Холодильник EDLER ED-120 DT": ("edler-ed-120dt", [
    "img_4107_.webp", "img_4108_.webp", "img_4111_.webp",
    "img_4114_.webp", "img_4130_.webp", "img_4119_.webp", "img_4120__1.webp", "img_4128_.webp",
    "img_4115_.webp", "img_4117_.webp", "img_4118_.webp", "img_4121_.webp", "img_4122_.webp",
    "img_4123_.webp", "img_4124_.webp", "img_4125_.webp", "img_4127_.webp",
    "img_4110_.webp", "bg_54.webp"]),              # img_4132 = packaging/leaflet -> dropped

"Холодильник GRUNHELM GRW-143DD": ("grunhelm-grw-143dd", [
    "84071-jpg-1-500x450.jpg", "84071-2-jpg-11-500x450.jpg", "84071-1-jpg-12-500x450.jpg",
    "84071-3-jpg-10-500x450.jpg", "84071-4-1-jpg-9-500x450.jpg", "84071-5-jpg-8-500x450.jpg",
    "84071-6-2-jpg-7-500x450.jpg", "84071-7-2-jpg-6-500x450.jpg", "84071-9-jpg-4-500x450.jpg",
    "84071-10-jpg-3-500x450.jpg", "84071-11-jpg-2-500x450.jpg"]),

"Холодильник GRUNHELM BRH-S176M55-W": ("grunhelm-brh-s176m55-w", [
    "110863_16.webp", "110863_1_1.webp", "110863_2_1.webp",
    "brh-s176m55w_-_new.webp", "110863_4_1.webp", "110863_10_1.webp"]),

"Холодильник EDLER ED-118WH": ("edler-ed-118wh", [
    "ed-118wh_closed_door.webp", "ed-118wh_open_door.webp"]),

"Холодильник EDLER ED-489CRM": ("edler-ed-489crm", [
    "ed-489crm_closed_door.webp", "ed-489crm_open_door.webp"]),
}


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
    """% of sampled points inside the content box that ended up transparent."""
    a = rgba.split()[3]
    bb = rgba.getbbox()
    if not bb:
        return 100.0
    x0, y0, x1, y1 = bb
    pts = []
    for i in range(1, 10):
        for j in range(1, 10):
            pts.append(a.getpixel((x0 + (x1 - x0) * i // 10, y0 + (y1 - y0) * j // 10)))
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
    """Cut the background out when it is safe; otherwise keep the photo intact."""
    if not is_white_bg(im):
        return im.convert("RGBA"), "kept (scene)"
    cutout = cut(im)
    holes = interior_holes(cutout)
    if holes > MAX_INTERIOR_HOLES:
        b = content_bbox(im)
        return (im.crop(b) if b else im).convert("RGBA"), f"kept (cut ate {holes:.0f}%)"
    return cutout, "cut"


def main():
    total = 0
    for folder, (slug, files) in PLAN.items():
        d = os.path.join(SRC, folder)
        avail = set(os.listdir(d)) if os.path.isdir(d) else set()
        out = os.path.join(OUTDIR, slug)
        os.makedirs(out, exist_ok=True)
        for old in os.listdir(out):
            os.remove(os.path.join(out, old))
        n, hero, notes = 0, None, {}
        for f in files:
            if f not in avail:
                print(f"  !! missing: {slug}/{f}")
                continue
            im = Image.open(os.path.join(d, f)).convert("RGB")
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
    main()
