#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Square 96px thumbnails of the category covers, for the catalog panel and the
home page's "all categories" card.

The smallest cover is a 400px landscape at about 20 KB; the panel shows fourteen
of them at 40px. A centre crop slightly inside the full height keeps the
appliance filling the square, at about a kilobyte each.

Run after a cover changes: python scripts/make_cat_thumbs.py
"""
import glob
import os
import sys

from PIL import Image

sys.stdout.reconfigure(encoding='utf-8')
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'scripts', 'covers-src')
OUT = os.path.join(ROOT, 'assets', 'img', 'covers')

for f in sorted(glob.glob(os.path.join(SRC, 'cat-*.webp'))):
    key = os.path.basename(f)[4:-5]
    im = Image.open(f).convert('RGB')
    w, h = im.size
    side = int(h * 0.86)
    x0, y0 = (w - side) // 2, (h - side) // 2
    out = os.path.join(OUT, 'cat-%s@thumb.webp' % key)
    im.crop((x0, y0, x0 + side, y0 + side)).resize((96, 96), Image.LANCZOS).save(out, 'WEBP', quality=82, method=6)
    print('%-24s %.1f KB' % (key, os.path.getsize(out) / 1024))
