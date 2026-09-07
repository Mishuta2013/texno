#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Blog covers and article illustrations for the kitchen ranges.

Three sizes, because three things use them: the blog card wants 800x450, the
article body wants 1200x675 for a retina screen and 800x450 below it, and a
share card has to be 1200x630 JPEG — that is the one shape Viber, Telegram and
Facebook all crop to and the one format all three render.

Sources are the generated editorial shots in scripts/art-src/. They illustrate
an idea — a tape measure across a cut-out, a magnet on a pan base — and never
stand in for a product photograph: nothing here is presented as a thing we sell
or as work we did.

Run: python scripts/make_kitchen_art.py
"""
import pathlib
import sys

from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / 'scripts' / 'art-src'
COVERS = ROOT / 'assets' / 'img' / 'covers'
BLOG = ROOT / 'assets' / 'img' / 'blog'
OG = ROOT / 'assets' / 'og'

# generated name -> blog article slug
BLOG_COVERS = {
    'bl-myyku': 'yak-obraty-kuhonnu-myyku',
    'bl-vytyazhky': 'yaka-produktyvnist-vytyazhky-potribna',
    'bl-varylni': 'indukciya-sklokeramika-chy-gaz',
    'bl-zmishuvach': 'yak-obraty-kuhonnyy-zmishuvach',
}
# in-article and category illustrations keep their own names
ILLUSTRATIONS = [
    'il-myyky-vymir', 'il-myyky-dvi-chashi', 'il-myyky-material',
    'il-vytyazhky-kuhnya', 'il-vytyazhky-filtr', 'il-vytyazhky-pohyla',
    'il-hob-magnit', 'il-hob-gaz', 'il-hob-vyriz',
    'il-tap-vysokyy', 'il-tap-vysuvnyy', 'il-tap-pokryttya',
    'seo-kuhonna-tehnika', 'seo-vbudovana-tehnika', 'seo-myyka-zmishuvach',
    'seo-posudomyyna',
]


def crop_to(im, ratio):
    """Centre crop to a ratio without ever letterboxing."""
    w, h = im.size
    if w / h > ratio:
        nw = int(round(h * ratio))
        return im.crop(((w - nw) // 2, 0, (w - nw) // 2 + nw, h))
    nh = int(round(w / ratio))
    return im.crop((0, (h - nh) // 2, w, (h - nh) // 2 + nh))


def main():
    for d in (COVERS, BLOG, OG):
        d.mkdir(parents=True, exist_ok=True)
    total = 0.0
    missing = []

    for name, slug in BLOG_COVERS.items():
        f = SRC / f'{name}.jpg'
        if not f.exists():
            missing.append(name)
            continue
        im = Image.open(f).convert('RGB')
        wide = crop_to(im, 16 / 9)
        out = COVERS / f'blog-{slug}.webp'
        wide.resize((800, 450), Image.LANCZOS).save(out, 'WEBP', quality=82, method=6)
        total += out.stat().st_size / 1024
        print(f'  {out.name:44s} 800x450   {out.stat().st_size / 1024:6.1f} KB')
        share = crop_to(im, 1200 / 630).resize((1200, 630), Image.LANCZOS)
        f2 = OG / f'blog-{slug}.jpg'
        share.save(f2, 'JPEG', quality=84, optimize=True, progressive=True)
        total += f2.stat().st_size / 1024
        print(f'  {f2.name:44s} 1200x630  {f2.stat().st_size / 1024:6.1f} KB')

    for name in ILLUSTRATIONS:
        f = SRC / f'{name}.jpg'
        if not f.exists():
            missing.append(name)
            continue
        wide = crop_to(Image.open(f).convert('RGB'), 16 / 9)
        for w in (1200, 800):
            out = BLOG / (f'{name}.webp' if w == 800 else f'{name}@{w}.webp')
            wide.resize((w, int(round(w * 9 / 16))), Image.LANCZOS).save(
                out, 'WEBP', quality=80, method=6)
            total += out.stat().st_size / 1024
        print(f'  {name:44s} 1200+800  '
              f'{(BLOG / (name + "@1200.webp")).stat().st_size / 1024:6.1f} KB')

    if missing:
        print('  !! немає вихідних файлів:', ', '.join(missing))
    print(f'  {"РАЗОМ":44s}           {total:6.1f} KB')


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    main()
