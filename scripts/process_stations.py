#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Power-station photos -> per-slug WebP.

Same rules as process_fridges.py / process_washers.py: the display order is
written out per model after reviewing contact sheets, nothing the owner sent is
dropped except real junk, and the cutout is the safety-checked one in photolib.

One addition for this category. Vendors ship a lot of infographic slides —
white sheets of text, icons and charging-time charts. Cutting the background
out of those leaves the text floating on the page's blue gradient, so a file
can be tagged KEEP to be published as-is. Scene photos are detected
automatically; only white-background infographics need the tag.

Run: python scripts/process_stations.py [slug ...]
"""
import os
import sys
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from photolib import prepare, normalize, content_bbox            # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = ("C:/Users/Dima/AppData/Local/Temp/claude/C--Claude-Code/"
       "f7237fd4-d55b-4f73-91cd-b76f1fcaa743/scratchpad/stations/станции")
OUTDIR = os.path.join(ROOT, "assets", "img", "products")
FULL = (900, 900)
THUMB = (400, 400)
KEEP = "keep"          # publish as-is: infographic, not a product shot

PLAN = {
"Зарядна станція Aferiy AF-P310-EC-H 3600W 3840Wh (Aferiy AF-P310-EC-H)": ("aferiy-af-p310-3600w-3840wh", [
    "632354950.webp",            # 3/4, wheels and handle
    "632354931.webp",            # front, port panel
    "632354939.webp",            # rear
    "632346169.webp",            # app control
    "632354976.webp",            # with one expansion battery
    "632354957.webp",            # paired
    "632354967.webp"]),          # with two expansions

"Зарядна станція ALLPOWERS S2000 Pro 2400W 1451Wh (S2000 PRO)": ("allpowers-s2000-pro-2400w-1451wh", [
    "allpowers_s2000_pro_eu_1_b544dbbe-385e-4cc2-a1d5-9d721cbfbf7e.webp",   # 3/4
    "allpowers_s2000_pro_eu_4_f400e973-9690-4971-8ffe-24e64a44733d.jpg",    # front panel
    "ALLPOWERSS2000_1_1ce8c48d-afc5-4b44-ba91-038d27ae8ac2.jpg",            # 3/4 left
    "ALLPOWERSS2000_2_e82c55aa-ed6e-4a3a-94ae-9731256ef5a3.jpg",            # 3/4 right
    "ALLPOWERS-S2000-Pro-Portable-Power-Station-2400W-1451Wh-ALLPOWERS-120818669.webp",
    "ALLPOWERS-S2000-Pro-Portable-Power-Station-2400W-1451Wh-ALLPOWERS-120825887.webp",
    "ALLPOWERS-S2000-Pro-Portable-Power-Station-2400W-1451Wh-ALLPOWERS-30152370.webp",
    "S2000_200WSolarPanel_1800x1800_1e1e8e0f-3276-4975-aba5-1d6a41e71765.jpg",
    "S2000-4-100W-Flexible-Solar-Panel_1800x1800_1800x1800_9702fd22-215a-4a41-9546-a392c4029fd0.jpg"]),
    # ...122555544 dropped: carries another shop's red "FREE solar panel" banner

"Зарядна станція Ctolity AP1000 LiFePO4 1800 Вт": ("ctolity-ap1000-1800w-1024wh", [
    "654428296.webp",            # 3/4
    "654428295.webp",            # front, port panel
    "654428297.webp"]),          # top

"Зарядна станція OUKITEL P2001E Plus": ("oukitel-p2001e-plus-2400w-2048wh", [
    "464621884.webp",            # 3/4
    "464621889.webp",            # 3/4 other side
    "464621886.webp",            # front, all sockets
    "464621897.webp",            # rear
    "464621893.webp",            # side, 2048Wh badge
    "464621902.webp"]),          # with the supplied cables

"Зарядна станція Oukitel P800": ("oukitel-p800-800w-512wh", [
    "652942179.webp",            # 3/4
    "652942180.webp",            # 3/4 other side
    "652942178.webp",            # front, port panel
    "652942181.webp"]),          # carry handle raised

"Зарядна станція Pecron 3600W 3072Wh (E3600LFP)": ("pecron-e3600lfp-3600w-3072wh", [
    "504661384.webp",                 # 3/4
    "504661396.webp",                 # front, port panel
    ("504661462.webp", KEEP),         # charging times
    ("504661424.webp", KEEP),         # what it runs, for how long
    ("504661447.webp", KEEP),         # outdoor use
    "504661479.webp",                 # app
    "504661494.webp",                 # app screens
    "504661506.webp",                 # BMS
    "504661406.webp",                 # camping
    "504661415.webp"]),               # at home

"Зарядна станція Pecron E1500LFP 2200W 1536Wh (E1500LFP)": ("pecron-e1500lfp-2200w-1536wh", [
    "498548535.webp",                 # 3/4
    ("498548540.webp", KEEP),         # key features
    ("498548541.webp", KEEP),         # what it runs
    ("498548543.webp", KEEP),         # charging times
    "498548539.webp",                 # 3500+ cycles
    "498548538.webp",                 # app
    "498548537.webp",                 # home office
    "498548542.webp",                 # working from home
    "498548536.webp"]),               # in the car

"Зарядна станція Pecron E300LFP 600W (288Wh) LiFePO4": ("pecron-e300lfp-600w-288wh", [
    "651889944.webp",                 # 3/4
    "651889945.webp",                 # rear
    "651889946.webp",                 # top, wireless pad
    ("651889947.webp", KEEP),         # display legend
    "651889949.webp",                 # app
    "651889948.webp",                 # carried by hand
    "651889950.webp",                 # solar charging
    "651889952.webp"]),               # camping
}


def main(only=None):
    total = 0
    for folder, (slug, files) in PLAN.items():
        if only and slug not in only:
            continue
        d = os.path.join(SRC, folder)
        avail = set(os.listdir(d)) if os.path.isdir(d) else set()
        names = [f if isinstance(f, str) else f[0] for f in files]
        missing = [f for f in names if f not in avail]
        extra = sorted(avail - set(names))
        out = os.path.join(OUTDIR, slug)
        os.makedirs(out, exist_ok=True)
        for old in os.listdir(out):
            os.remove(os.path.join(out, old))
        n, notes = 0, {}
        for f in files:
            name, force_keep = (f, False) if isinstance(f, str) else (f[0], f[1] == KEEP)
            if name not in avail:
                continue
            im = Image.open(os.path.join(d, name)).convert("RGB")
            if force_keep:
                b = content_bbox(im)
                rgba, note = (im.crop(b) if b else im).convert("RGBA"), "kept (infographic)"
            else:
                rgba, note = prepare(im)
            notes[note] = notes.get(note, 0) + 1
            n += 1
            normalize(rgba, FULL).save(os.path.join(out, "%d.webp" % n),
                                       "WEBP", quality=90, method=6)
            if n == 1:
                normalize(rgba, THUMB).save(os.path.join(out, "thumb.webp"),
                                            "WEBP", quality=90, method=6)
        total += n
        flags = ""
        if missing:
            flags += "  MISSING:%s" % ",".join(missing)
        if extra:
            flags += "  UNLISTED:%s" % ",".join(extra)
        print("%-34s %2d photos  %s%s" % (slug, n, notes, flags))
    print("total power-station photos: %d" % total)


if __name__ == "__main__":
    main(set(sys.argv[1:]) or None)
