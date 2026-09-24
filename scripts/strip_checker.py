#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Strip a checkerboard that an image generator painted where transparency
should have been.

The three built-to-order kit shots came back "transparent" as far as the file
format goes — only a thin margin was clear — and inside it the grey-and-white
checkerboard a viewer draws for transparency was baked into the pixels, so on
the site each kit stood in a grey box while every other product floated on the
blue stage. This takes the light, colourless pixels that connect to the edge
(and any large light pocket the product encloses, such as inside a cable loop),
drops the light half of the anti-aliased rim, then re-frames with photolib's
normalize() like every other product photo.

Run: python scripts/strip_checker.py <slug> [<slug> ...]
  reads assets/img/products/<slug>/1.webp, writes 1.webp and thumb.webp back.
  Check the result on magenta: python scripts/check_cutout.py <slug>
"""
import sys, os
import numpy as np
from PIL import Image, ImageFilter, ImageDraw
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from photolib import normalize

def clean(src):
    im = Image.open(src).convert('RGBA')
    a = np.array(im).astype(np.int16)
    rgb, al = a[..., :3], a[..., 3]
    lum = rgb.mean(-1); sat = rgb.max(-1) - rgb.min(-1)
    bg = ((lum > 205) & (sat < 16)) | (al < 8)            # checker squares and the already-clear margin
    m = Image.fromarray(np.where(bg, 255, 0).astype(np.uint8), 'L').copy()   # fromarray shares a read-only buffer: floodfill would write nowhere
    ImageDraw.floodfill(m, (0, 0), 1, thresh=0)           # everything reachable from the outside
    arr = np.array(m)
    kill = arr == 1
    # enclosed pockets of checker (inside a cable loop): big and light -> background too
    val = 2
    while True:
        ys, xs = np.nonzero(arr == 255)
        if not len(ys) or val > 254: break
        ImageDraw.floodfill(m, (int(xs[0]), int(ys[0])), val, thresh=0)
        arr = np.array(m); reg = arr == val
        if reg.sum() >= 40 and lum[reg].mean() > 225: kill |= reg
        val += 1
    alpha = np.where(kill, 0, 255).astype(np.uint8)
    # the anti-aliased rim is a blend of dark body and light checker: drop its light part
    solid = Image.fromarray(alpha)
    inner = np.array(solid.filter(ImageFilter.MinFilter(7))) > 0
    rim = (alpha > 0) & ~inner
    alpha[rim & (lum > 165) & (sat < 30)] = 0
    alpha = np.array(Image.fromarray(alpha).filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.8)))
    res = Image.fromarray(np.dstack([rgb.astype(np.uint8), alpha]), 'RGBA')
    return res.crop(res.getbbox()), int(kill.sum())

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

if __name__ == '__main__':
    for slug in sys.argv[1:]:
        d = os.path.join(ROOT, 'assets', 'img', 'products', slug)
        cut, n = clean(os.path.join(d, '1.webp'))
        normalize(cut, (900, 900)).save(os.path.join(d, '1.webp'), 'WEBP', quality=90, method=6)
        normalize(cut, (400, 400)).save(os.path.join(d, 'thumb.webp'), 'WEBP', quality=90, method=6)
        print(slug, cut.size, 'cleared', n)
