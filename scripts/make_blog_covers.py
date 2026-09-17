#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Blog covers for articles that have no editorial shot of their own.

The water heater, dishwasher and oven guides are illustrated with the same
unbranded studio shot as their category card (scripts/covers-src/), so a reader
who clicks through from the article sees the shelf they expected. Nothing here
is a photograph of a model we sell or of work we did.

The shots fill the frame top to bottom — a boiler would lose its head to a 16:9
crop — so the frame is fitted to the height and the near-flat navy backdrop is
stretched sideways, the same way make_covers.py builds the category cards.

  800x450 WebP   blog card and article header
  1200x630 JPEG  share card (Viber, Telegram, Facebook)

Run: python scripts/make_blog_covers.py
"""
import pathlib
import sys

from PIL import Image

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from make_covers import widen  # noqa: E402

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / 'scripts' / 'covers-src'
COVERS = ROOT / 'assets' / 'img' / 'covers'
OG = ROOT / 'assets' / 'og'

# article slug -> category shot
ARTICLES = {
    'yak-obraty-boyler': 'boylery',
    'yak-obraty-posudomyynu-mashynu': 'posudomyyni-mashyny',
    'yak-obraty-duhovu-shafu': 'duhovi-shafy',
}


def main():
    for slug, cat in ARTICLES.items():
        src = Image.open(SRC / f'cat-{cat}.webp').convert('RGB')
        card = widen(src, 16 / 9).resize((800, 450), Image.LANCZOS)
        f1 = COVERS / f'blog-{slug}.webp'
        card.save(f1, 'WEBP', quality=82, method=6)
        share = widen(src, 1200 / 630).resize((1200, 630), Image.LANCZOS)
        f2 = OG / f'blog-{slug}.jpg'
        share.save(f2, 'JPEG', quality=84, optimize=True, progressive=True)
        print(f'  {slug:34s} {f1.stat().st_size / 1024:6.1f} KB  og {f2.stat().st_size / 1024:6.1f} KB')


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    main()
