#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Put generated bundle photographs into the catalogue.

The shots arrive 2048x2048 with a transparent background already — the model
cuts them out itself when the prompt asks for it — so there is nothing to
remove, only to trim and centre. normalize() is the same one every other
product photo goes through, so a bundle sits in the grid at the same scale as
a fridge.

Run: python scripts/install_kit_shots.py <folder-with-pngs>
  expects kit-2-5.png, kit-8.png, kit-5.png
"""
import io
import json
import os
import sys

from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from photolib import normalize                                   # noqa: E402

sys.stdout.reconfigure(encoding='utf-8')
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'assets', 'img', 'products')
FULL, THUMB = (900, 900), (400, 400)

# which generated file belongs to which bundle
PLAN = {
    'komplekt-invertor-4-kvt-akumulyator-2-5-kvt-god': 'kit-2-5.png',
    'komplekt-invertor-4-kvt-akumulyator-8-kvt-god': 'kit-8.png',
    'komplekt-invertor-6-kvt-akumulyator-5-kvt-god': 'kit-5.png',
}


def main(src_dir):
    prods = json.load(io.open(os.path.join(ROOT, 'data', 'products.json'), encoding='utf-8'))
    slugs = {p['slug'] for p in prods}
    done = 0
    for slug, fname in PLAN.items():
        if slug not in slugs:
            print('no such product:', slug); continue
        src = os.path.join(src_dir, fname)
        if not os.path.exists(src):
            print('missing, skipped:', fname); continue
        im = Image.open(src).convert('RGBA')
        bb = im.getbbox()                      # trim the transparent margin
        if bb:
            im = im.crop(bb)
        out = os.path.join(OUT, slug)
        os.makedirs(out, exist_ok=True)
        normalize(im, FULL).save(os.path.join(out, '1.webp'), 'WEBP', quality=90, method=6)
        normalize(im, THUMB).save(os.path.join(out, 'thumb.webp'), 'WEBP', quality=90, method=6)
        print('%-52s <- %s  (%dx%d)' % (slug, fname, im.width, im.height))
        done += 1
    print('installed:', done)


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else '.')
