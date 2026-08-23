# -*- coding: utf-8 -*-
"""Draws the shop's range — fridge, washing machine, air conditioner, boiler,
power station — out of the real product cutouts, in two arrangements.

The old hero was a stock living room whose only appliance was an air
conditioner, so Google showed a sofa beside a listing for a shop that sells
five categories.

Two arrangements, because the two jobs pull in opposite directions:

  shop-*.jpg  the picture search and social previews use. Tight, bright,
              everything in frame, cropped to the three shapes Google asks for.
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

# slug, height, centre x, bottom y  — sizes are compressed rather than true to
# scale: next to a 185 cm fridge the air conditioner and the power station
# would shrink to specks.
SHOWCASE = [(FRIDGE, 520, 720, FLOOR), (WASHER, 360, 950, FLOOR),
            (BOILER, 330, 1235, FLOOR), (STATION, 190, 1462, FLOOR),
            (AC, 167, 1130, 470)]

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

def main():
    # --- what search and social show ------------------------------------
    shop = canvas(SHOWCASE, 1.0).convert('RGB')
    GROUP = 1075
    for name, (cw, ch) in {'shop-16x9': (1600, 900), 'shop-4x3': (1280, 960),
                           'shop-1x1': (1040, 1040)}.items():
        sc = max(cw / W, ch / H)
        bw, bh = cw / sc, ch / sc
        l = min(max(GROUP - bw / 2, 0), W - bw)
        t = min(max(FLOOR - bh * .62, 0), H - bh)
        shop.crop((round(l), round(t), round(l + bw), round(t + bh))) \
            .resize((cw, ch), Image.LANCZOS) \
            .save(rel('assets', 'img', 'site', '%s.jpg' % name), 'JPEG', quality=88, optimize=True, progressive=True)
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
