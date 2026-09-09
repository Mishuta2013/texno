# -*- coding: utf-8 -*-
"""Draws the shop's range out of the real product cutouts, in two arrangements.

The showcase is what a shared link and an image search show, so it has to say
what the shop sells now: the five appliances it opened with, plus the kitchen —
a built-in oven with its hood above it, and a sink. Chosen for silhouette, not
for price: at the size a Telegram card renders them, a dishwasher is a washing
machine and a black oven on navy is a hole.

The old hero was a stock living room whose only appliance was an air
conditioner, so Google showed a sofa beside a listing for an appliance shop.

Two arrangements, because the two jobs pull in opposite directions:

  shop-*.jpg  the picture search and social previews use. Tight, bright,
              everything in frame, fitted to the three shapes Google asks for.
  hero.webp   the homepage background. The headline sits over its left half and
              three frosted cards sit over its right, so here the products keep
              clear of the copy and are dimmed to a suggestion — at full
              strength they turn into bright blobs behind the blurred glass.

Run: python scripts/make_hero.py
"""
import os, sys, math
from PIL import Image, ImageDraw, ImageFilter

sys.stdout.reconfigure(encoding='utf-8')
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
def rel(*p): return os.path.join(ROOT, *p)

W, H  = 1600, 1067
FLOOR = 900
TOP   = (0x16, 0x31, 0x5E)          # the .hero gradient stops, copied from main.css
BOT   = (0x0B, 0x1A, 0x33)

FRIDGE  = 'lg-gc-b509smsm'
WASHER  = 'bosch-wan28281ua'
BOILER  = 'atlantic-round-vmr-50'
STATION = 'fossibot-f1800-1800w-1024wh'
AC      = 'tcl-tac-09chsd-tph21if-inverter-r32-wi-fi'
OVEN    = 'gunter-hauer-eom-970-ix'                 # steel frame, not the black one
HOOD    = 'gunter-hauer-margaretka-wh'              # white cylinder — legible at any size
SINK    = 'gunter-hauer-mindel-4522-inox-honey'

# slug, height, centre x, bottom y  — sizes are compressed rather than true to
# scale: next to a 185 cm fridge the air conditioner and the power station
# would shrink to specks.
#
# Home and kitchen alternate along the row rather than sitting in two blocks,
# because Google crops this to 1:1 and 4:3 as well as 16:9 and a segregated row
# loses one half entirely in the square.
SHOWCASE = [(OVEN, 290, 203, FLOOR), (FRIDGE, 520, 455, FLOOR),
            (WASHER, 355, 688, FLOOR), (BOILER, 320, 964, FLOOR),
            (SINK, 225, 1213, FLOOR), (STATION, 185, 1443, FLOOR),
            (HOOD, 210, 203, 545), (AC, 165, 1290, 470)]

# Shifted right and spread out: at a 1280-wide viewport the hero shows source
# x 171–1429, and the headline covers everything left of about x 810.
BACKDROP = [(FRIDGE, 480, 900, FLOOR), (WASHER, 340, 1090, FLOOR),
            (BOILER, 310, 1290, FLOOR), (STATION, 175, 1470, FLOOR),
            (AC, 150, 1210, 455)]

def gradient():
    """radial-gradient(120% 130% at 80% 0%, #16315E 0%, #0B1A33 55%)"""
    img = Image.new('RGB', (W, H)); px = img.load()
    cx, cy, rx, ry = .80 * W, 0., 1.20 * W, 1.30 * H
    for y in range(H):
        dy = ((y - cy) / ry) ** 2
        for x in range(W):
            k = min(1., math.sqrt(((x - cx) / rx) ** 2 + dy) / .55)
            px[x, y] = tuple(round(TOP[i] + (BOT[i] - TOP[i]) * k) for i in range(3))
    return img.convert('RGBA')

def grid(img):
    """the faint 54px lattice the hero also draws in CSS"""
    lay = Image.new('RGBA', (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(lay)
    for x in range(0, W, 54): d.line([(x, 0), (x, H)], fill=(124, 196, 255, 16))
    for y in range(0, H, 54): d.line([(0, y), (W, y)], fill=(124, 196, 255, 16))
    mask = Image.new('L', (W, H), 0)
    ImageDraw.Draw(mask).ellipse([.70 * W - 1.2 * W, .10 * H - .8 * H,
                                  .70 * W + 1.2 * W, .10 * H + .8 * H], fill=255)
    lay.putalpha(Image.composite(lay.split()[3], Image.new('L', (W, H), 0),
                                 mask.filter(ImageFilter.GaussianBlur(120))))
    img.alpha_composite(lay)

def glow(img):
    lay = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(lay).ellipse([W - 500, -340, W + 340, 500], fill=(46, 139, 255, 82))
    img.alpha_composite(lay.filter(ImageFilter.GaussianBlur(150)))

def load(slug, h):
    im = Image.open(rel('assets', 'img', 'products', slug, '1.webp')).convert('RGBA')
    im = im.crop(im.getbbox())
    return im.resize((max(1, round(h * im.width / im.height)), h), Image.LANCZOS)

def products(items, strength, floor_light=True):
    """the appliances on their own transparent layer, so the backdrop can fade
       the whole group without washing out the gradient behind it"""
    lay = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    left = min(cx - load(s, h).width / 2 for s, h, cx, _ in items)
    right = max(cx + load(s, h).width / 2 for s, h, cx, _ in items)

    if floor_light:
        pool = Image.new('RGBA', (W, H), (0, 0, 0, 0))   # a dark floor cannot be
        ImageDraw.Draw(pool).ellipse([left - 90, FLOOR - 120, right + 90, FLOOR + 120],
                                     fill=(96, 168, 255, 46))   # seen against dark navy,
        lay.alpha_composite(pool.filter(ImageFilter.GaussianBlur(90)))  # so light stands in
        seam = Image.new('RGBA', (W, H), (0, 0, 0, 0))
        ImageDraw.Draw(seam).ellipse([left - 40, FLOOR - 9, right + 40, FLOOR + 9],
                                     fill=(150, 205, 255, 60))
        lay.alpha_composite(seam.filter(ImageFilter.GaussianBlur(9)))

    for slug, h, cx, by in items:
        art = load(slug, h)
        if by == FLOOR:                                  # the wall unit touches nothing
            sh = Image.new('RGBA', (W, H), (0, 0, 0, 0))
            rx, ry = art.width * .52, max(7, art.width * .055)
            ImageDraw.Draw(sh).ellipse([cx - rx, by + 2 - ry, cx + rx, by + 2 + ry],
                                       fill=(3, 10, 24, 210))
            lay.alpha_composite(sh.filter(ImageFilter.GaussianBlur(12)))
        lay.alpha_composite(art, (round(cx - art.width / 2), by - art.height))

    if strength < 1:
        a = lay.split()[3].point(lambda v: round(v * strength))
        lay.putalpha(a)
    return lay

def canvas(items, strength):
    img = gradient()
    grid(img); glow(img)
    img.alpha_composite(products(items, strength))
    return img

def backdrop(cw, ch):
    """Gradient, lattice and glow at the requested shape.

    Cropped to the aspect and then resized, never squeezed: the lattice is
    square in the CSS this copies, and a stretched one reads as a fault.
    Anchored to the top right, which is where the glow lives."""
    bg = gradient(); grid(bg); glow(bg)
    sc = max(cw / W, ch / H)
    bw, bh = cw / sc, ch / sc
    return bg.convert('RGB').crop((round(W - bw), 0, W, round(bh))).resize((cw, ch), Image.LANCZOS)


def place(bg, art, wide=.96, tall=.70, drop=.58):
    """Stand the line-up on the card, whole.

    The three shapes used to be crops of one 1600x1067 canvas, which worked
    while the row was five appliances wide. At eight it is ~1490px across,
    wider than the square's 1067px window, so the square cut the oven and the
    air conditioner in half down the middle. Fitting the group to each shape
    costs a little size and cuts nothing."""
    cw, ch = bg.size
    sc = min(cw * wide / art.width, ch * tall / art.height)
    a = art.resize((max(1, round(art.width * sc)), max(1, round(art.height * sc))), Image.LANCZOS)
    # Vertically it sits a little below centre — the row is 2.5:1 and the square
    # frame is 1:1, so wherever it goes there is empty ground; below centre it
    # reads as standing on something rather than floating.
    x, y = (cw - a.width) // 2, round((ch - a.height) * drop)
    # the floor they stand on: a dark surface cannot be seen against dark navy,
    # so light stands in for it, exactly as products() does at full size
    lay = Image.new('RGBA', (cw, ch), (0, 0, 0, 0))
    ImageDraw.Draw(lay).ellipse([x - 70 * sc, y + a.height - 120 * sc,
                                 x + a.width + 70 * sc, y + a.height + 120 * sc],
                                fill=(96, 168, 255, 46))
    lay = lay.filter(ImageFilter.GaussianBlur(90 * sc))
    seam = Image.new('RGBA', (cw, ch), (0, 0, 0, 0))
    ImageDraw.Draw(seam).ellipse([x - 30 * sc, y + a.height - 9 * sc,
                                  x + a.width + 30 * sc, y + a.height + 9 * sc],
                                 fill=(150, 205, 255, 60))
    lay.alpha_composite(seam.filter(ImageFilter.GaussianBlur(max(1., 9 * sc))))
    out = bg.convert('RGBA')
    out.alpha_composite(lay)
    out.alpha_composite(a, (x, y))
    return out.convert('RGB')


def main():
    # --- what search and social show ------------------------------------
    art = lineup()
    for name, (cw, ch) in {'shop-16x9': (1600, 900), 'shop-4x3': (1280, 960),
                           'shop-1x1': (1040, 1040)}.items():
        card = place(backdrop(cw, ch), art)
        card.save(rel('assets', 'img', 'site', '%s.jpg' % name), 'JPEG',
                  quality=88, optimize=True, progressive=True)
        print('assets/img/site/%s.jpg  %dx%d' % (name, cw, ch))

    # --- the homepage backdrop -------------------------------------------
    hero = canvas(BACKDROP, 0.40)
    veil = Image.new('RGBA', (W, H), (0, 0, 0, 0)); vd = ImageDraw.Draw(veil)
    for x in range(W):                       # deepen the side the headline sits on
        vd.line([(x, 0), (x, H)], fill=(11, 26, 51, int(210 * max(0., 1. - x / (W * .52)) ** 1.35)))
    hero.alpha_composite(veil)
    hero.convert('RGB').save(rel('assets', 'img', 'site', 'hero.webp'), 'WEBP', quality=88, method=6)
    print('assets/img/site/hero.webp  %dx%d' % (W, H))

def lineup():
    """The products alone on a transparent ground — gen_images.py draws the
       Open Graph card on its own background, so it imports this rather than
       reading a file nothing on the site ever serves."""
    lay = products(SHOWCASE, 1.0, floor_light=False)
    return lay.crop(lay.getbbox())

if __name__ == '__main__':
    main()
