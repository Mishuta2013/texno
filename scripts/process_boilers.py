#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Water-heater photos -> per-slug WebP.

Same two rules as process_washers.py:

1. ORDER IS EXPLICIT. Each model lists its sources in display order — straight
   front first, then angles, then back, then the underside and the pipe stubs,
   then the installation diagram and the rating plate, then the room scene, and
   the carton last. Reviewed by eye on the contact sheets from contact_sheet.py.

2. WRONG-MODEL SHOTS ARE DROPPED. The Elite 80 folder ships a render whose own
   filename says 100 litres; the bodies are near-identical, so it would pass
   unnoticed on the page and still be the wrong tank. It is not listed.

Background removal lives in photolib.prepare(). Atlantic bodies are white on
white — the same case the washing machines exercised — so the hole-filling and
the retightening tolerance there are what keep the tank solid.

Run: python scripts/process_boilers.py [slug ...]
"""
import os
import sys
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from photolib import prepare, normalize                      # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = (u"C:/Users/Dima/AppData/Local/Temp/claude/C--Claude-Code/"
       u"6d3a4449-c5b0-4259-9c6f-39f88b64f134/scratchpad/unpack/boiler/"
       u"\u0432\u043e\u0434\u043e\u043d\u0430\u0433\u0440\u0456\u0432\u0430\u0447\u0438 "
       u"\u0430\u0431\u043e \u0431\u043e\u0439\u043b\u0435\u0440\u0438")
OUTDIR = os.path.join(ROOT, "assets", "img", "products")
FULL = (900, 900)
THUMB = (400, 400)

B = u"\u0412\u043e\u0434\u043e\u043d\u0430\u0433\u0440\u0456\u0432\u0430\u0447 Atlantic "   # "Водонагрівач Atlantic "

# folder -> (slug, [source files in display order])
PLAN = {
B + u"Opro Profi VM 030 D400S (1200W)": ("atlantic-opro-profi-vm-030-d400s", [
    "Opro Profi VM 030-1-700x700.webp",        # straight front, thermometer
    "Opro Profi VM 030-2-700x700.webp",        # left three-quarter
    "Opro Profi VM 030-3-700x700.webp",        # right three-quarter
    "Opro Profi VM 030-4-700x700.webp",        # back, wall bracket
    "Opro Profi VM 030-5-700x700.webp"]),      # bathroom scene

B + u"Opro Profi VM 050 D400S (1500W)": ("atlantic-opro-profi-vm-050-d400s", [
    "img_0_41_2388_0_1_39H6sb.webp",           # straight front
    "img_0_41_2388_0_1_pnupcL.webp",           # left three-quarter
    "img_0_41_2388_0_1_UdTHOj.webp",           # right three-quarter
    "img_0_41_2388_0_1_zboNwz.webp",           # back, wall bracket
    "img_0_41_2388_0_1_JvMmjG.webp",           # bathroom scene
    "img_0_41_2388_0_1_XlLSLD.webp"]),         # carton

B + u"Opro Profi VM 080 D400S (1500W": ("atlantic-opro-profi-vm-080-d400s", [
    "atlantic-opro-profi-vm-080-d400s-1500w-front-min-500x500_1_.webp",
    "atlantic_opro_profi_vm_080_d400s_1500w_.webp",
    "atlantic-opro-profi-vm-080-d400s-1500w-left-min-500x500_1_.webp",
    "atlantic-opro-profi-vm-080-d400s-1500w-right-min-500x500_1_.webp",
    "atlantic-opro-profi-vm-080-d400s-1500w-back-min-500x500_1_.webp",
    "atlantic-opro-profi-patrubki-min-500x500_1_.webp",       # cold/hot stubs
    "atlantic_opro_profi_80_.webp",                           # fitting diagram
    "o_pro_profi_1.webp",                                     # dimensions table
    "atlantic-opro-profi-vm-080-d400s-1500w-interior-min-500x500_1_.webp",
    "atlantic-opro-profi-vm-80-d400s-1500w-box-min-500x500_1_.webp"]),

u"Atlantic Round Eco VMR 80 (1200W)": ("atlantic-round-eco-vmr-80", [
    "265282278.webp",        # straight front
    "265282289.webp",        # right three-quarter, rating plate
    "265282299.webp",        # back, wall bracket
    "265282309.webp",        # underside
    "265282321.webp",        # cold/hot stubs
    "265282331.webp",        # wall bracket detail
    "265282236.webp",        # dimensions diagram
    "265282078.webp",        # safety valve supplied with it
    "265282347.webp",        # kitchen scene
    "265282377.webp"]),      # carton

B + u"Round Eco VMR 50 (1200W) NEW": ("atlantic-round-eco-vmr-50", [
    "round-eco-vmr-50-front-new-min-325x450.webp",
    "round-eco-vmr-50-left-new-min-325x450.webp",
    "round-eco-vmr-50-right-new-min-325x450.webp",
    "round-eco-50-back-325x450.webp",
    "round-eco-down-325x450.webp",
    "round-eco-patrubki-325x450.webp",
    "round-eco-schema-min-325x450.webp",
    "round-eco-vmr-50-interior-min-325x450.webp",
    "941290-styker-round-eco-vmr50-upakovka-325x450.webp",     # rating plate
    "round-eco-vmr-50-box-min-325x450.webp"]),

B + u"Round VMR  50 (1500W)": ("atlantic-round-vmr-50", [
    "542273494.webp",        # straight front
    "542273495.webp",        # left three-quarter
    "542273496.webp",        # right three-quarter
    "542273497.webp",        # back, wall bracket
    "542273499.webp",        # underside
    "542273498.webp",        # pipe stubs
    "542273501.webp",        # installation diagram
    "542273502.webp",        # kitchen scene
    "542273500.webp"]),      # carton

B + u"Round VMR  80 (1500W)": ("atlantic-round-vmr-80", [
    "round-vmr-80-front-new-min-325x450.webp",
    "round-vmr-80-left-new-min-325x450.webp",
    "round-vmr-80-right-new-min-325x450.webp",
    "round-vmr-80-back-new-min-325x450.webp",
    "round-vmr-down-new-min-325x450.webp",
    "round-vmr-patrubki-new-min-325x450.webp",
    "round-schema-min-325x450.webp",
    "round-vmr-80-interior-new-min-325x450.webp",
    "951267-styker-round-vmr80-bak-325x450.webp",
    "951267-styker-round-vmr80-upakovka-325x450.webp",
    "round-vmr-80-box-new-min-325x450.webp"]),

B + u"Round VMR 100 (1500W)": ("atlantic-round-vmr-100", [
    "round-vmr-100-front-new-min-325x450.webp",
    "round-vmr-100-left-new-min-325x450.webp",
    "round-vmr-100-right-new-min-325x450.webp",
    "round-vmr-100-back-min-325x450.webp",
    "round-vmr-down-new-min-325x450.webp",
    "round-vmr-patrubki-new-min-325x450.webp",
    "round-schema-min-325x450.webp",
    "round-vmr-100-interior-new-min-325x450.webp",
    "961293-styker-round-vmr100-bak-325x450.webp",
    "961293-styker-round-vmr100-upakovka-325x450.webp",
    "round-vmr-100-box-new-min-325x450.webp"]),

B + u"Steatite Ego Slim VM 050 D325-1-BC 1500W (EG)": (
    "atlantic-steatite-ego-slim-vm-050-d325", [
    "atlantic-ego-slim-steatite-50-front.webp",
    "atlantic-ego-slim-steatite-50-left.webp",
    "atlantic_steatite_ego_slim.webp",          # fitting diagram
    "atlantic-ego-slim-steatite-50-interior.webp"]),

B + u"Steatite Ego Slim VM 080 D325-1-BC 1500W (EG)": (
    "atlantic-steatite-ego-slim-vm-080-d325", [
    "atlantic-ego-slim-steatite-80-11.jpg",     # straight front
    "atlantic-ego-slim-steatite-80-12.jpg",     # angled, pipe stubs visible
    "atlantic-ego-slim-steatite-80-13.jpg",     # bathroom scene
    "851392-steatite_ego_slim_vm_080_d325-1-bc.jpg",   # energy label
    "atlantic-ego-slim-steatite-80-14.jpg"]),   # rating plate

B + u"Steatite Elite VM 050 D400S-2-BC 1500W (EG)": (
    "atlantic-steatite-elite-vm-050-d400s", [
    "603448998.webp",        # straight front
    "603448999.webp",        # left three-quarter
    "603449000.webp",        # right three-quarter
    "603449001.webp",        # back, wall bracket
    "603449002.webp",        # ECO / MAX control dial
    "603449004.webp",        # pipe stubs
    "603449003.webp",        # bathroom scene
    "603449005.webp"]),      # carton

B + u"Steatite Elite VM 080 D400S-2-BC (1500W)": (
    "atlantic-steatite-elite-vm-080-d400s", [
    "atlantic-steatite-elite-80-front-min-gray-500x500.jpg",
    "atlantic-steatite-elite-80-left-min-gray-500x500.webp",
    "atlantic-steatite-elite-vm-080-d400s-2-bc-2100-back-min-500x500_1.webp",
    "atlantic-steatite-elite-panel-min-500x500_1.webp",
    "atlantic-steatite-elite-patrubki-min-500x500_1.webp",
    "steatite_elite_1.webp",                    # dimensions table
    "atlantic-steatite-elite-vm-080-d400s-2-bc-2100-interior-min-500x500_1.webp",
    "atlantic-steatite-elite-vm-080-d400s-2-bc-1500-box-min-500x500_1.webp"]),
    # dropped: atlantic-steatite-elite-100-right-min-gray-500x500.webp (100 L body)
}


def main(only=None):
    total = 0
    for folder, (slug, files) in sorted(PLAN.items()):
        # the Eco 80 came in a separate archive, so it sits beside the main folder
        d = (os.path.join(SRC, folder) if folder.startswith(B)
             else os.path.join(os.path.dirname(os.path.dirname(SRC)), "eco80", folder))
        if only and slug not in only:
            continue
        avail = set(os.listdir(d)) if os.path.isdir(d) else set()
        if not avail:
            print("%-40s SOURCE FOLDER MISSING" % slug)
            continue
        missing = [f for f in files if f not in avail]
        extra = sorted(avail - set(files))
        out = os.path.join(OUTDIR, slug)
        os.makedirs(out, exist_ok=True)
        for old in os.listdir(out):
            p = os.path.join(out, old)
            if os.path.isfile(p):
                os.remove(p)
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
        print("%-40s %2d photos  %s%s" % (slug, n, notes, flags))
    print("total water-heater photos: %d" % total)


if __name__ == "__main__":
    main(set(sys.argv[1:]) or None)
