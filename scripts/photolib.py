#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Shared background-removal for product photos.

The problem this solves: most appliances are white and are shot on a white
background, so a flood fill started from the corners walks straight through the
soft edge of the body and eats the product from the inside. The result is a
photo with holes in it — the customer sees the blue page gradient through the
washing machine.

Four defences, applied in order:

  edge_wall()   the boundary of a white body is a faint gradient, not a colour
                change. Detect it, paint it black in a working copy, and the
                flood fill has a wall to stop at instead of walking inside.

  fill_holes()  every transparent blob that is NOT connected to the border is
                background that leaked inside. Paint it back. This fixes
                enclosed holes without touching the outer silhouette.

  swallowed()   the acceptance test. Measures how much of the photo's visible
                detail the cut turned transparent — not how empty the bounding
                box is, which would punish every open-door and side shot.

  adaptive tolerance  while the cut still eats detail, retry tighter. A tight
                tolerance can leave a thin white halo, invisible on a light
                background; a bite out of the product is not. If every
                tolerance eats too much, the photo is kept whole (trimmed
                only) — colour never silently disappears.
"""
from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageOps

WHITE = (255, 255, 255)
SENT = (255, 0, 255)          # sentinel colour the flood fill paints with
CONTENT_THRESH = 12
TOLERANCES = (26, 20, 15, 11, 8)   # tried loosest first
MAX_EATEN = 0.4      # % of visible detail the cut may turn transparent
SALVAGE_EATEN = 2.0  # above this the cut is thrown away and the photo kept whole


def content_bbox(im):
    d = ImageChops.difference(im, Image.new("RGB", im.size, WHITE)).convert("L")
    return d.point(lambda p: 255 if p > CONTENT_THRESH else 0).getbbox()


def is_white_bg(im):
    w, h = im.size
    pts = [(2, 2), (w - 3, 2), (2, h - 3), (w - 3, h - 3),
           (w // 2, 2), (w // 2, h - 3), (2, h // 2), (w - 3, h // 2)]
    ok = sum(1 for x, y in pts if all(c > 240 for c in im.getpixel((x, y))[:3]))
    return ok >= 7


def fill_holes(alpha):
    """Reopen only the transparent area reachable from the border.

    Anything transparent that the border cannot reach is background that leaked
    into the product, so it is painted opaque again.
    """
    w, h = alpha.size
    # 0 = transparent, 255 = opaque. Flood the transparent side from the frame.
    mask = alpha.point(lambda p: 0 if p < 128 else 255).convert("L")
    work = mask.copy()
    seeds = [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1),
             (w // 2, 0), (w // 2, h - 1), (0, h // 2), (w - 1, h // 2)]
    for s in seeds:
        if work.getpixel(s) == 0:
            ImageDraw.floodfill(work, s, 128, thresh=0)
    outside = work.point(lambda p: 255 if p == 128 else 0)   # true background
    # keep the original soft edge where the pixel really is outside the product,
    # force everything the border cannot reach back to fully opaque
    return Image.composite(alpha, Image.new("L", alpha.size, 255), outside)


def edge_wall(im, strength=8):
    """A mask of the product's outline, dilated to close hairline gaps.

    A white machine on a white background has no colour difference at its
    boundary — only a faint gradient. Detecting that gradient and painting it
    black inside the flood-fill working copy gives the fill a wall to stop at,
    which is what keeps it out of the body.
    """
    g = ImageOps.autocontrast(im.convert("L").filter(ImageFilter.GaussianBlur(0.6)))
    e = g.filter(ImageFilter.FIND_EDGES)
    return e.point(lambda p: 255 if p > strength else 0).filter(ImageFilter.MaxFilter(3))


def _cut_once(im, thresh, feather=0.8):
    b = content_bbox(im)
    if b:
        im = im.crop(b)
    w, h = im.size
    pad = max(10, int(0.05 * max(w, h)))
    cv = Image.new("RGB", (w + 2 * pad, h + 2 * pad), WHITE)
    cv.paste(im, (pad, pad))
    # flood fill a guide copy whose outlines are walled off, then use the
    # resulting mask on the real pixels
    guide = cv.copy()
    guide.paste((0, 0, 0), (0, 0), edge_wall(cv))
    W, H = cv.size
    for s in [(0, 0), (W - 1, 0), (0, H - 1), (W - 1, H - 1),
              (W // 2, 0), (W // 2, H - 1), (0, H // 2), (W - 1, H // 2)]:
        if guide.getpixel(s) != (0, 0, 0):
            ImageDraw.floodfill(guide, s, SENT, thresh=thresh)
    d = ImageChops.difference(guide, Image.new("RGB", guide.size, SENT)).split()
    comb = ImageChops.lighter(ImageChops.lighter(d[0], d[1]), d[2])
    alpha = comb.point(lambda p: 0 if p <= 6 else 255).filter(ImageFilter.MinFilter(3))
    alpha = fill_holes(alpha)
    eaten = swallowed(cv, alpha)
    out = cv.convert("RGBA")
    out.putalpha(alpha.filter(ImageFilter.GaussianBlur(feather)))
    bb = out.getbbox()
    return (out.crop(bb) if bb else out), eaten


def swallowed(rgb, alpha):
    """% of the photo's visible detail that the cut turned transparent.

    Judging a cut by how much of its bounding box is transparent punishes every
    honest shot of an open door or a side view, where the box really is mostly
    air. What actually matters is whether anything the customer can see got
    eaten — so measure only over pixels that differ from the white background,
    and ignore the ambiguous white body.
    """
    diff = ImageChops.difference(rgb, Image.new("RGB", rgb.size, WHITE)).convert("L")
    ink = diff.point(lambda p: 255 if p > 25 else 0)
    n = sum(ink.histogram()[128:])
    if n < 200:
        return 0.0
    gone = ImageChops.multiply(ink, alpha.point(lambda p: 255 if p < 40 else 0))
    return sum(gone.histogram()[128:]) / float(n) * 100.0


def interior_holes(rgba):
    """% of sampled points inside the content box that are transparent."""
    a = rgba.split()[3]
    bb = rgba.getbbox()
    if not bb:
        return 100.0
    x0, y0, x1, y1 = bb
    pts = [a.getpixel((x0 + (x1 - x0) * i // 12, y0 + (y1 - y0) * j // 12))
           for i in range(1, 12) for j in range(1, 12)]
    return sum(1 for v in pts if v < 40) / len(pts) * 100.0


def prepare(im):
    """Return (RGBA image, note). Never returns a photo the cut has eaten into."""
    if not is_white_bg(im):
        return im.convert("RGBA"), "kept (scene)"
    best, best_eaten, best_t = None, 1e9, None
    for thresh in TOLERANCES:
        cutout, eaten = _cut_once(im, thresh)
        if eaten <= MAX_EATEN:
            return cutout, ("cut" if thresh == TOLERANCES[0] else "cut t=%d" % thresh)
        if eaten < best_eaten:
            best, best_eaten, best_t = cutout, eaten, thresh
    if best_eaten <= SALVAGE_EATEN:            # a nick, not a bite
        return best, "cut t=%d (-%.1f%%)" % (best_t, best_eaten)
    b = content_bbox(im)
    return (im.crop(b) if b else im).convert("RGBA"), "kept (ate %.0f%%)" % best_eaten


def normalize(rgba, size, fw=0.92, fh=0.94):
    cw, ch = rgba.size
    sc = min(size[0] * fw / cw, size[1] * fh / ch)
    nw, nh = max(1, round(cw * sc)), max(1, round(ch * sc))
    r = rgba.resize((nw, nh), Image.LANCZOS)
    canvas = Image.new("RGBA", size, (0, 0, 0, 0))
    canvas.paste(r, ((size[0] - nw) // 2, (size[1] - nh) // 2), r)
    return canvas
