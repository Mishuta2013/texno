#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Square crops of the category covers for the catalog panel.

  @tile  320px  the phone and tablet tiles and the home page's category cards.
                The 96px squares that used to sit beside it were for icons in
                the desktop list, which is text now.

A centre crop slightly inside the full height keeps the appliance filling the
square. Run after a cover changes: python scripts/make_cat_thumbs.py
"""
import glob
import os
import sys

from PIL import Image

sys.stdout.reconfigure(encoding='utf-8')
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'scripts', 'covers-src')
OUT = os.path.join(ROOT, 'assets', 'img', 'covers')
SIZES = (('tile', 320, 84),)

for f in sorted(glob.glob(os.path.join(SRC, 'cat-*.webp'))):
    key = os.path.basename(f)[4:-5]
    im = Image.open(f).convert('RGB')
    w, h = im.size
    side = int(h * 0.86)
    x0, y0 = (w - side) // 2, (h - side) // 2
    sq = im.crop((x0, y0, x0 + side, y0 + side))
    sizes = []
    for name, px, q in SIZES:
        out = os.path.join(OUT, 'cat-%s@%s.webp' % (key, name))
        sq.resize((px, px), Image.LANCZOS).save(out, 'WEBP', quality=q, method=6)
        sizes.append('%s %.1f KB' % (name, os.path.getsize(out) / 1024))
    print('%-22s %s' % (key, ' | '.join(sizes)))
