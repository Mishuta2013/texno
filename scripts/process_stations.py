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
# The September 2026 additions came as D:\доп.товар.rar; their folders are
# listed by absolute path below, which os.path.join lets win over SRC.
SRC2 = ("C:/Users/Dima/AppData/Local/Temp/claude/C--Claude-Code/"
        "ef835708-7464-4b7e-ad44-5c8c051f9262/scratchpad/dop/доп.товар")
OUTDIR = os.path.join(ROOT, "assets", "img", "products")
FULL = (900, 900)
THUMB = (400, 400)
KEEP = "keep"          # publish as-is: infographic, not a product shot

PLAN = {
u"Зарядна станція ALLPOWERS R1500 LITE": ("allpowers-r1500-lite-1600w-1056wh", [
    "Allpowers_R1500_LITE1.webp",        # straight front, socket panel
    "Allpowers_R1500_LITE2.webp",        # three-quarter
    "Allpowers_R1500_LITE3.webp",        # three-quarter, other side
    "Allpowers_R1500_LITE4.webp",        # angled, handles
    "Allpowers_R1500_LITE.webp",         # back, ventilation grille
    "Allpowers_R1500_LITE6.webp",        # top
    "R1500_039.webp",                    # with a folded solar panel
    "R1500_SP037.webp",                  # with a deployed panel
    "ALLPOWERS-R1500-LITE-Portable-Power-Station-1600W-1056Wh-ALLPOWERS-124383672.webp"]),
    # dropped: ALLPOWERSB1000_3_… (a B1000 by its own filename) and
    # …-120543728 (carries another shop's "FREE SPARE 21W" promo badge)

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

u"Зарядна станція Fossibot F2400 2400W 2048Wh": ("fossibot-f2400-2400w-2048wh", [
    "zariadna-stantsiia-fossibot-f2400-2400-vt-2048-vthod-zelena-94539966227883.webp",  # straight front: display, DC and USB panels
    "zariadna-stantsiia-fossibot-f2400-2400-vt-2048-vthod-zelena-97409465416681.webp",  # 3/4 right, the three Schuko sockets
    "zariadna-stantsiia-fossibot-f2400-2400-vt-2048-vthod-zelena-22573625131998.webp",  # 3/4 left
    "zariadna-stantsiia-fossibot-f2400-2400-vt-2048-vthod-zelena-18898271938052.webp",  # 3/4, port covers open
    "zariadna-stantsiia-fossibot-f2400-2400-vt-2048-vthod-zelena-51175682266786.webp",  # angled, carry handles
    "zariadna-stantsiia-fossibot-f2400-2400-vt-2048-vthod-zelena-79329917939844.webp",  # right fan cover
    "zariadna-stantsiia-fossibot-f2400-2400-vt-2048-vthod-zelena-81223598723382.webp"]),  # left fan cover

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

# ---- September 2026 additions (D:\доп.товар.rar) ----
SRC2 + "/Станції/Зарядна станція Bluetti AC180P  1800 Вт  1440 Вт⋅год  LiFePO4 (PB931255)": ("bluetti-ac180p-1800w-1440wh", [
    "374537438.webp",            # 3/4, both Schuko sockets
    "374537437.webp",            # straight front, port panel
    "374537439.webp",            # 3/4 other side
    "374537440.webp",            # from above, handles
    "374537441.webp",            # rear, AC and solar inputs
    "374537442.webp",            # top, wireless charging pad
    "374537443.webp",            # outdoors, phone charging
    "374537444.webp"]),          # camping by the car

SRC2 + "/Станції/Зарядная станция универсальная Bluetti AC70P 864Wh 1000W": ("bluetti-ac70p-1000w-864wh", [
    "442756211.webp",            # 3/4
    "442756209.webp",            # straight front, port panel
    "442756212.webp",            # 3/4 other side
    "442756213.webp",            # from above
    "442756215.webp",            # 3/4, side port
    "442756216.webp"]),          # top, carry handle

SRC2 + "/Станції/Зарядная станция Bluetti Premium 200 V2, 2700 Вт, 2073 Втч": ("bluetti-premium-200-v2-2700w-2073wh", [
    "PR200V2_r414-a7.jpg",       # 3/4
    "PR200V2-2_if09-mq.jpg",     # straight front: 2 USB-C 100 W, 2 USB-A, Schuko pair
    "PR200V2-1_bnsv-3g.jpg",     # 3/4 other side
    "PR200V2-4_6cqo-ks.jpg",     # 3/4 from above, side switch
    "PR200V2-5_c4jb-oq.jpg",     # 3/4 from above, other side
    "PR200V2-3_8xh2-uz.jpg"]),   # from above, handles

SRC2 + "/Станції/Зарядна станція Oukitel P1500E Plus (P1500EPLUS)": ("oukitel-p1500e-plus-1800w-1536wh", [
    "564592863.webp",            # 3/4
    "564592859.webp",            # straight front, four sockets
    "564592871.webp",            # 3/4, socket covers open
    "565783001.webp"]),          # 3/4 rear, 1536Wh marking

SRC2 + "/Станції/Зарядна станція Oukitel P5000E Plus  3600 Вт  5120 Вт⋅год  LiFePO4": ("oukitel-p5000e-plus-3600w-5120wh", [
    "683732079.webp",            # 3/4, covers open: five Schuko sockets
    "683732074.webp",            # straight front
    "683732077.webp",            # 3/4 from above, 5120Wh marking
    "683732076.webp",            # from above, display and handles
    "683732075.webp",            # tilted on its wheels, handle out
    "683732078.webp"]),          # rear, fans and input panel
    # The archive's Oukitel P800 folder is the model already on the site
    # (oukitel-p800-800w-512wh, same price); its photos stay as they are.
}

# The Marstek Venus E is a stationary all-in-one backup system and lives in the
# kits category, but its photos go through the same rules.
PLAN[SRC2 + "/Резеревне живлення/Система зберігання енергії MARSTEK VENUS-E (2500 Ват, 5120 Ватгод)"] = (
    "marstek-venus-e-2500w-5120wh", [
    "1.1_a3444687-64a0-4ed7-8ed9-9f9966428883.jpg",   # 3/4 front
    "venus-e__2_1_.jpg",                               # front
    "2_887f92e6-1230-4964-a8f3-27e9a238f4b2.jpg",      # rear, cooling fins
    "3-1_96bb742d-184c-4a05-bb4b-e81cff882a8d.jpg",    # side panel: backup socket, inputs
    "3_1e582f67-42be-4b5d-8470-e75056ac50d8.jpg",      # side panel, closer
    "4_bfe1225d-e728-4a59-bb83-ad1df8236183.jpg",      # outdoors, plugged into a wall socket
    "6_73306fd3-8851-4c2d-9c8d-12621eac005c.jpg",      # indoors, one cable
    "5_61282f7a-005a-46d9-9870-9bab1ef13224.jpg"])     # app, electricity price chart


def main(only=None):
    total = 0
    for folder, (slug, files) in PLAN.items():
        if only and slug not in only:
            continue
        d = os.path.join(SRC, folder)
        # The sources live in session scratchpads that do not outlast the
        # session. Without this, a bare re-run emptied every product whose
        # folder was gone before noticing there was nothing to rebuild it from.
        if not os.path.isdir(d):
            print("%-34s SKIPPED: source folder not found" % slug)
            continue
        avail = set(os.listdir(d))
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
