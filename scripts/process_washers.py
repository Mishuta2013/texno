#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Washing-machine photos -> per-slug WebP.

Same two rules as process_fridges.py:

1. ORDER IS EXPLICIT. Each model lists its sources in display order — straight
   front first, then angles, then open door / drum, then control panel and
   details, then back and diagrams, then room scenes. Reviewed by eye on the
   contact sheets from contact_sheet.py. Warranty badges and infographic
   overlays are not used as the lead photo.

2. NOTHING IS DROPPED. Every source file the owner supplied is published;
   there is no per-model cap.

Background removal lives in photolib.prepare(), which fills interior holes and
retightens the tolerance until the body of a white machine on a white
background comes out solid. Run: python scripts/process_washers.py
"""
import os
import sys
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from photolib import prepare, normalize                      # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = (u"C:/Users/Dima/AppData/Local/Temp/claude/C--Claude-Code/"
       u"f7237fd4-d55b-4f73-91cd-b76f1fcaa743/scratchpad/washers/\u0421\u0442\u0438\u0440\u0430\u043b\u044c\u043d\u0456 \u043c\u0430\u0448\u0438\u043d\u043a\u0438")
OUTDIR = os.path.join(ROOT, "assets", "img", "products")
FULL = (900, 900)
THUMB = (400, 400)

# folder -> (slug, [source files in display order])
PLAN = {
u"Пральна машина Bosch WAN28281UA": ("bosch-wan28281ua", [
    "wan28281ua.webp",               # straight front
    "wan28281ua_1_.webp",            # control panel
    "wan28281ua_1.webp",             # drum
    "wan28281ua_3.webp",             # side, VarioDrum moulding
    "ebc89fc14b874f609605aceadf137e35-(1)_4b063.webp",   # kitchen scene
    "6979c365122044d7b386a1e31cbfd89e_a39a7.webp",       # utility-room scene
    "a6be329c30b04e85b5417d709598fdac_d9382.webp"]),     # bathroom scene

u"\u0421\u0442\u0438\u0440\u0430\u043b\u044c\u043d\u0430\u044f \u043c\u0430\u0448\u0438\u043d\u0430   Edler   EWF7012PIBG": ("edler-ewf7012pibg", [
    "main-1-720x720.webp",            # straight front
    "add-1-720x720.webp",             # control panel
    "add-2-720x720.webp"]),           # feature infographic

u"\u0421\u0442\u0438\u0440\u0430\u043b\u044c\u043d\u0430\u044f \u043c\u0430\u0448\u0438\u043d\u0430   HAIER   HW70-B14929-S": ("haier-hw70-b14929-s", [
    "28_31020008_09_01_f_hw70-b14929-s-78476-m.webp",   # straight front
    "28_31020008_09_03_l_hw70-b14929-s-m.webp",         # 3/4 left
    "28_31020008_09_04_l_hw70-b14929-s-m.webp",         # 3/4 right
    "28_31020008_09_02_o_hw70-b14929-s-m.webp",         # door open
    "28_31020008_09_05_o_hw70-b14929-s-m.webp",         # door open, angle
    "28_31020008_09_06_p_hw70-b14929-s-m.webp",         # panel
    "28_31020008_09_07_p_hw70-b14929-s-m.webp",         # panel, angle
    "28_31020008_09_08_p_hw70-b14929-s-m.webp",         # drum
    "28_31020008_09_09_p_hw70-b14929-s-m.webp",         # detail
    "28_31020008_09_14_b_hw70-b14929-s-m.webp",         # back
    "28_31020008_09_10_m_hw70-b14929-s-m.webp",         # scenes
    "28_31020008_09_11_m_hw70-b14929-s-m.webp",
    "28_31020008_09_12_m_hw70-b14929-s-m.webp",
    "28_31020008_09_13_m_hw70-b14929-s-m.webp",
    "Haier-HW70-B14929-S_6056d.webp"]),                 # warranty badge — last, never the lead

u"\u0421\u0442\u0438\u0440\u0430\u043b\u044c\u043d\u0430\u044f \u043c\u0430\u0448\u0438\u043d\u0430 BEKO BM1WFSU36243WW": ("beko-bm1wfsu36243ww", [
    "7004540022_2.webp",                                # clean straight front (no badge)
    "7004540022_mdm2_bm1wfsu36233wb_low_2.webp",        # 3/4
    "7004540022_mdm2_bm1wfsu36233wb_low_3.webp",        # door open
    "7004540022_mdm2_bm1wfsu36233wb_low_4.webp",        # door detail
    "7004540022_mdm2_bm1wfsu36233wb_low_6.webp",        # door open
    "bm1wfsu36233wb_3690645.webp",                      # door open, 3/4
    "7004540022_mdm2_bm1wfsu36233wb_low_10.webp",       # panel, angle
    "7004540022_mdm2_bm1wfsu36233wb_low_9.webp",        # panel
    "7004540022_mdm2_bm1wfsu36233wb_low_8.webp",        # detergent drawer
    "7004540022_mdm2_bm1wfsu36233wb_low_11.webp",       # room scene
    "7004540022_1.webp"]),                              # badged shot — kept, but last

u"\u0421\u0442\u0438\u0440\u0430\u043b\u044c\u043d\u0430\u044f \u043c\u0430\u0448\u0438\u043d\u0430 Edler EWF6031": ("edler-ewf6031", [
    "1754634293-769131-01.webp",      # straight front
    "1754634291-769131-03.webp",      # door / drum
    "1754634294-769131-02.webp",      # panel
    "1754634292-769131-04.webp",      # filter hatch
    "1754634292-opt-769131-5.webp"]), # bathroom scene

u"\u0421\u0442\u0438\u0440\u0430\u043b\u044c\u043d\u0430\u044f \u043c\u0430\u0448\u0438\u043d\u0430 GORENJE WNGPI61SBSUA": ("gorenje-wngpi61sbs-ua", [
    "mabagor-1200wx1200h-mabagor-imagelib-full-trim-e-e-ee568b6b50e27f1a5519df66479e827e-278245-fpng.webp",  # straight front
    "mabagor-1200wx1200h-mabagor-imagelib-full-trim-1-e-1e388d568762754881dad9ed2c2d0deb-278262-fpng.webp",  # 3/4 left
    "mabagor-1200wx1200h-mabagor-imagelib-full-trim-3-e-3ecdfc550e7ab38cc6fcc35c9cff7e9e-278244-fpng.webp",  # 3/4 right
    "mabagor-1200wx1200h-mabagor-imagelib-full-trim-9-2-92ea99b6c3608921cbd2234b7740973b-278256-fpng.webp",  # door open
    "mabagor-1200wx1200h-mabagor-imagelib-full-trim-8-b-8b5488246bfa977ab3289137ef1d9378-279739-5.webp",     # dimensions
    "mabagor-1200wx1200h-mabagor-imagelib-full-trim-f-8-f871634c393a8ce8d8ccc3e3d1f261fa-278267-fpng.webp",  # panel
    "mabagor-1200wx1200h-mabagor-imagelib-full-trim-d-d-dd3278e5b0e9dd2c5daa59cf855e0d1a-278251-fpng.webp",  # detergent drawer
    "mabagor-1200wx1200h-mabagor-imagelib-full-trim-0-6-069c619b44bfe9bf43c9ca13fe0aa038-279583-2.webp"]),   # room scene

u"\u0421\u0442\u0438\u0440\u0430\u043b\u044c\u043d\u0430\u044f \u043c\u0430\u0448\u0438\u043d\u0430 Grifon GWMS-7121 IW": ("grifon-gwms-7121-iw", [
    "gwms-7121iw-549189-2256801_1_.jpg",     # straight front
    "gwms-7121iw-549189-2256803_1_.webp",    # 3/4
    "gwms-7121iw-549189-2256807_1_.webp",    # front, closer
    "gwms-7121iw-549189-2256802_1_.webp",    # door open
    "gwms-7121iw-549189-2256804_1_.webp",    # door open, 3/4
    "gwms-7121iw-549189-2256808.webp",       # drum
    "gwms-7121iw-549189-2256809.webp",       # detergent drawer
    "gwms-7121iw-549189-2256810.webp",       # pump filter
    "gwms-7121iw-549189-2256806_1_.webp",    # side
    "gwms-7121iw-549189-2256805_1_.webp"]),  # back

u"\u0421\u0442\u0438\u0440\u0430\u043b\u044c\u043d\u0430\u044f \u043c\u0430\u0448\u0438\u043d\u0430 Grifon GWMSS-6100I": ("grifon-gwmss-6100i", [
    "img05623.webp",      # straight front
    "img05638.webp",      # 3/4
    "img05629.webp",      # front, closer
    "img05625.webp",      # door open
    "img05642.webp",      # door open, 3/4
    "img05648.webp",      # drum
    "img05668.webp",      # drum, closer
    "img05661.webp",      # panel
    "img05653.webp",      # detergent drawer
    "img05669.webp",      # drawer, out
    "img05655.webp",      # pump filter
    "img05644.webp",      # side
    "img05644_1_.webp",   # side with depth
    "img05657.webp"]),    # inlet hose

u"\u0421\u0442\u0438\u0440\u0430\u043b\u044c\u043d\u0430\u044f \u043c\u0430\u0448\u0438\u043d\u0430 INDESIT OMTWSE 61051 WK UA": ("indesit-omtwse-61051-wk-ua", [
    "indesit_omtwse_61051_wk_ua_5.webp",   # straight front
    "omtwse-61051-wk-ua-_-_-1.webp",       # 3/4
    "omtwse-61051-wk-ua-_-_-3.webp",       # door open, 3/4
    "omtwse-61051-wk-ua-_-_-4.webp",       # door open
    "omtwse-61051-wk-ua-_-_-13.webp",      # drum
    "omtwse-61051-wk-ua-_-_-12.webp",      # panel with drawer
    "omtwse-61051-wk-ua-_-_-10.webp",      # panel, angle
    "omtwse-61051-wk-ua-_-_-11.webp",      # programme list
    "omtwse-61051-wk-ua-_-_-14.webp",      # pump filter
    "omtwse-61051-wk-ua-_-_-15.webp",      # back
    "omtwse-61051-wk-ua-_-_-16.webp",      # dimensions
    "indesit_omtwse_61051_wk_ua_1.webp",   # room scenes
    "omtwse-61051-wk-ua-_-_-5.webp",
    "omtwse-61051-wk-ua-_-_-7.webp",
    "omtwse-61051-wk-ua-_-_-8.webp",
    "omtwse-61051-wk-ua-_-_-9.webp"]),

u"\u0421\u0442\u0438\u0440\u0430\u043b\u044c\u043d\u0430\u044f \u043c\u0430\u0448\u0438\u043d\u0430 LG F2Y2NS3WE": ("lg-f2y2ns3we", [
    "large01_9.webp",     # straight front
    "large03_13.webp",    # front, closer
    "large08_13.webp",    # 3/4
    "large09_13.webp",    # 3/4 other side
    "large10_13.webp",    # 3/4
    "large02_12.webp",    # door open
    "large11_13.webp",    # door open, 3/4
    "large05_16.webp",    # drum
    "large04_14.webp",    # panel
    "large07_14.webp",    # detergent drawer out
    "large06_14.webp",    # drawer, top view
    "large12_14.webp",    # side
    "large13_10.webp"]),  # back

u"\u0421\u0442\u0438\u0440\u0430\u043b\u044c\u043d\u0430\u044f \u043c\u0430\u0448\u0438\u043d\u0430 LIBERTON LWM-4950": ("liberton-lwm-4950", [
    "LWM-4950.png"]),

u"\u0421\u0442\u0438\u0440\u0430\u043b\u044c\u043d\u0430\u044f \u043c\u0430\u0448\u0438\u043d\u0430 SAMSUNG WW70FG3M05AWLF": ("samsung-ww70fg3m05awlf", [
    "ww70fg3m05awle_001_front_white.webp",              # straight front
    "ww70fg3m05awle_002_l_perspective_white.webp",      # 3/4
    "ww70fg3m05awle_004_front-open_white.webp",         # door open
    "ww70fg3m05awle_007_detail2_white.webp",            # panel detail
    "ww70fg3m05awle_005_r_side_white.webp",             # side
    "ww70fg3m05awle_006_back_white.webp",               # back
    "ww70fg3m05awle_001_front_white-removebg-preview_1.webp"]),   # duplicate of the front shot

u"\u0421\u0442\u0438\u0440\u0430\u043b\u044c\u043d\u044b\u0435 \u043c\u0430\u0448\u0438\u043d\u044b Edler EWF5014SSIP": ("edler-ewf5014ssip", [
    "EWF5014SSIP-038d8b47d1474e93a25a6c66e7996181_266b3.webp",   # clean straight front
    "EWF5014SSIP 2_b5659.webp"]),                                # feature infographic
}


def main(only=None):
    total = 0
    for folder, (slug, files) in PLAN.items():
        if only and slug not in only:
            continue
        d = os.path.join(SRC, folder)
        avail = set(os.listdir(d)) if os.path.isdir(d) else set()
        missing = [f for f in files if f not in avail]
        extra = sorted(avail - set(files))
        out = os.path.join(OUTDIR, slug)
        os.makedirs(out, exist_ok=True)
        for old in os.listdir(out):
            os.remove(os.path.join(out, old))
        n, notes = 0, {}
        for f in files:
            if f not in avail:
                continue
            im = Image.open(os.path.join(d, f)).convert("RGB")
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
        print("%-28s %2d photos  %s%s" % (slug, n, notes, flags))
    print("total washing-machine photos: %d" % total)


if __name__ == "__main__":
    main(set(sys.argv[1:]) or None)
