#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Gunter&Hauer feed photos -> per-slug cut-out WebP, same as the other ranges.

The cutout itself is the flood fill from process_fridges2.py, imported rather
than copied. What is not imported is that file's two accept/reject tests: both
were written for refrigerators and both get this range wrong. See studio_bg and
enclosed_holes below.

Frames whose background is a real kitchen are kept as they are — cutting one
would eat the picture — but they are moved behind the cut-out shots, so the
frame the catalogue shows is always the product on its own.

Source folders come from the downloader and are named by product slug.

Run: python scripts/process_gh_photos.py <source-dir> [--after=<slug>]
     --after resumes an interrupted run at the next folder in sorted order.
"""
import importlib.util
import pathlib
import re
import sys

from PIL import Image, ImageDraw

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUTDIR = ROOT / 'assets' / 'img' / 'products'
MAX_PHOTOS = 15
MAX_HOLES = 8.0                  # per cent of the silhouette that may be unreachable

spec = importlib.util.spec_from_file_location('pf2', ROOT / 'scripts' / 'process_fridges2.py')
pf2 = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pf2)


def ring(im):
    """Luminance of the one-pixel frame around the image, sorted."""
    w, h = im.size
    px = im.load()
    sx, sy = max(1, w // 80), max(1, h // 80)
    vals = ([px[x, 1] for x in range(0, w, sx)] + [px[x, h - 2] for x in range(0, w, sx)]
            + [px[1, y] for y in range(0, h, sy)] + [px[w - 2, y] for y in range(0, h, sy)])
    return sorted(sum(c[:3]) / 3 for c in vals)


def studio_bg(im):
    """Is this the product on a seamless white backdrop?

    is_white_bg in process_fridges2.py samples eight fixed points and wants
    seven of them white. A fridge stands in the middle of its frame and passes.
    A cooker hood is photographed edge to edge and runs off both sides, so two
    of the eight land on the product and the whole photo is written off as a
    kitchen scene — which is why most of this range came out as a white box on
    the card instead of a cut-out. Judge the whole border instead: a backdrop is
    uniformly light even when the product crosses it.
    """
    lum = ring(im)
    return lum[len(lum) // 2] >= 246 and sum(1 for v in lum if v >= 244) / len(lum) >= 0.60


def enclosed_holes(rgba):
    """Percentage of the silhouette that the flood fill ate out of the product.

    interior_holes in process_fridges2.py samples a 9x9 grid across the bounding
    box and counts transparent points. For a slab-shaped fridge that measures
    what it says. For a tap, an L-shaped sink or a thin wide hood, most of the
    bounding box is honest background, so a perfectly good cutout scored 28% and
    was thrown away. What actually matters is transparency the outside cannot
    reach: background is reachable from the border, a hole bitten into the
    product is not.
    """
    a = rgba.split()[3].point(lambda p: 255 if p > 40 else 0)
    w, h = a.size
    for s in [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1),
              (w // 2, 0), (w // 2, h - 1), (0, h // 2), (w - 1, h // 2)]:
        if a.getpixel(s) == 0:
            ImageDraw.floodfill(a, s, 128)
    hist = a.histogram()
    return 100.0 * hist[0] / max(1, hist[255] + hist[0])


def prepare(im):
    """-> (rgba, kind, note). kind is 'cut' or 'scene' and drives the order."""
    if not studio_bg(im):
        return im.convert('RGBA'), 'scene', 'сцена'
    cutout = pf2.cut(im)
    holes = enclosed_holes(cutout)
    if holes > MAX_HOLES:
        b = pf2.content_bbox(im)
        return (im.crop(b) if b else im).convert('RGBA'), 'scene', f'заливка з\'їла {holes:.0f}%'
    return cutout, 'cut', 'вирізано'


def is_banner(im):
    """A marketing slide, not a photograph.

    Five products lead with one: the range name set in a serif logo, the tap in
    the middle and half a dozen claims in white-on-red callouts around it. It is
    the supplier's own artwork and belongs in the gallery, but not as the first
    frame, which is the picture the whole catalogue shows. The tell is that pure
    callout red — no photograph in this feed has any, while a warm wooden
    chopping board on a white worktop, which fooled a looser test, has none of
    it either.
    """
    small = im.copy()
    small.thumbnail((200, 200))
    px = small.convert('RGB').tobytes()
    n = len(px) // 3
    red = white = 0
    for i in range(0, len(px), 3):
        r, g, b = px[i], px[i + 1], px[i + 2]
        if r > 150 and r - g > 110 and r - b > 110:
            red += 1
        if r > 238 and g > 238 and b > 238:
            white += 1
    return red > 0.012 * n and white > 0.40 * n


# Cut-outs first, then kitchen scenes, then the supplier's marketing slides.
# Within each group the supplier's own order is kept.
RANK = {'cut': 0, 'scene': 1, 'banner': 2}


def main(src_dir, after=None):
    src = pathlib.Path(src_dir)
    folders = sorted(p for p in src.iterdir() if p.is_dir())
    if after:
        folders = [p for p in folders if p.name > after]
        print(f'продовжую після {after}: лишилось {len(folders)}')
    total = kept = 0
    for d in folders:
        files = sorted(d.glob('*.*'), key=lambda f: int(re.sub(r'\D', '', f.stem) or 0))[:MAX_PHOTOS]
        if not files:
            print(f'  !! {d.name}: немає файлів')
            continue
        frames, notes = [], {}
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
            if is_banner(im):
                frames.append((RANK['banner'], im.convert('RGBA')))
                notes['слайд'] = notes.get('слайд', 0) + 1
                continue
            rgba, kind, note = prepare(im)
            frames.append((RANK[kind], rgba))
            notes[note] = notes.get(note, 0) + 1
        if not frames:
            print(f'  !! {d.name}: жодного придатного кадру')
            continue
        frames.sort(key=lambda p: p[0])          # stable: keeps the supplier's order inside a group
        out = OUTDIR / d.name
        out.mkdir(parents=True, exist_ok=True)
        for old in out.glob('*.webp'):
            old.unlink()
        # The encoder can fail on a frame for reasons that have nothing to do
        # with the frame — a long run once died on "encoding error 1", which is
        # libwebp running out of memory, and took the forty-seven products after
        # it with it. Nothing here is worth aborting a three-hour run for: drop
        # the frame, say so, carry on.
        written = 0
        for _, rgba in frames:
            try:
                pf2.normalize(rgba, pf2.FULL).save(
                    out / f'{written + 1}.webp', 'WEBP', quality=88, method=6)
            except Exception as e:
                print(f'  !! {d.name}: кадр {written + 1} не закодувався ({type(e).__name__}: {e})')
                continue
            if written == 0:
                pf2.normalize(rgba, pf2.THUMB).save(out / 'thumb.webp', 'WEBP', quality=86, method=6)
            written += 1
        if not written:
            print(f'  !! {d.name}: жоден кадр не записався')
            continue
        total += 1
        kept += written
        print(f'{d.name}: {written} фото  {notes}', flush=True)
    print(f'\nготово: {total} товарів, {kept} зображень')


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    # --after <slug> resumes an interrupted run: folders are walked in sorted
    # order, so everything up to and including that name is already done.
    after = next((a.split('=', 1)[1] for a in sys.argv[1:] if a.startswith('--after=')), None)
    main(args[0] if args else '.', after)
