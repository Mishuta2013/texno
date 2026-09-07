#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Gunter&Hauer feed photos -> per-slug cut-out WebP, same as the other ranges.

The supplier ships its shots on white, which is what the flood-fill cutout in
process_fridges2.py expects, so the machinery is imported from there rather than
copied. Interior and detail frames whose background is not white are kept as
they are: cutting them would eat the picture.

Source folders come from the downloader and are named by product slug.

Run: python scripts/process_gh_photos.py <source-dir>
"""
import importlib.util
import os
import pathlib
import re
import sys

from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUTDIR = ROOT / 'assets' / 'img' / 'products'
MAX_PHOTOS = 15

spec = importlib.util.spec_from_file_location('pf2', ROOT / 'scripts' / 'process_fridges2.py')
pf2 = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pf2)


def main(src_dir):
    src = pathlib.Path(src_dir)
    folders = sorted(p for p in src.iterdir() if p.is_dir())
    total = kept = 0
    for d in folders:
        files = sorted(d.glob('*.*'), key=lambda f: int(re.sub(r'\D', '', f.stem) or 0))[:MAX_PHOTOS]
        if not files:
            print(f'  !! {d.name}: немає файлів')
            continue
        out = OUTDIR / d.name
        out.mkdir(parents=True, exist_ok=True)
        for old in out.glob('*.webp'):
            old.unlink()
        n, hero = 0, None
        notes = {}
        for f in files:
            try:
                im = Image.open(f).convert('RGB')
            except Exception as e:
                print(f'  !! {d.name}/{f.name}: {type(e).__name__}')
                continue
            # The supplier ships up to 2000px; the cutout is a flood fill, so its
            # cost is per pixel and the output is 900x900 anyway. Shrinking first
            # took the run from ninety minutes to twenty and changes nothing you
            # can see.
            if max(im.size) > 1200:
                im.thumbnail((1200, 1200), Image.LANCZOS)
            rgba, how = pf2.prepare(im)
            notes[how] = notes.get(how, 0) + 1
            n += 1
            pf2.normalize(rgba, pf2.FULL).save(out / f'{n}.webp', 'WEBP', quality=88, method=6)
            if n == 1:
                hero = rgba
        if hero is not None:
            pf2.normalize(hero, pf2.THUMB).save(out / 'thumb.webp', 'WEBP', quality=86, method=6)
        total += 1
        kept += n
        print(f'{d.name}: {n} фото  {notes}', flush=True)
    print(f'\nготово: {total} товарів, {kept} зображень')


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    main(sys.argv[1] if len(sys.argv) > 1 else '.')
