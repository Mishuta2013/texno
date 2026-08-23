#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Generate PWA icons + Open Graph images. Run: python scripts/gen_images.py"""
import os, sys, json
from PIL import Image, ImageDraw, ImageFont, ImageFilter
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import make_hero                      # the product line-up on the default card

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ICONS = os.path.join(ROOT, "assets", "icons"); os.makedirs(ICONS, exist_ok=True)
OG = os.path.join(ROOT, "assets", "og"); os.makedirs(OG, exist_ok=True)
NAVY = (11, 26, 51); BLUE = (46, 139, 255); FROST = (124, 196, 255); WHITE = (255, 255, 255)

def font(sz, bold=True):
    for p in ([r"C:/Windows/Fonts/arialbd.ttf"] if bold else [r"C:/Windows/Fonts/arial.ttf"]):
        if os.path.exists(p): return ImageFont.truetype(p, sz)
    return ImageFont.load_default()

def rrect(d, box, r, **kw): d.rounded_rectangle(box, radius=r, **kw)

def icon(size, maskable=False):
    """Brand mark, not a product.

    This used to draw an air-conditioner indoor unit with airflow lines, from
    when the shop sold only air conditioners. It is a five-category store now,
    so the icon is the monogram: a white crossbar over a frost stem, with the
    blue rule that runs through the rest of the branding. Kept geometric so the
    inline SVG favicon in build.mjs can be an exact match.
    """
    im = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    pad = int(size * 0.10) if maskable else 0
    rrect(d, [pad, pad, size - pad, size - pad], int(size * 0.22), fill=NAVY)
    s = float(size)
    r = max(2, int(s * 0.03))
    rrect(d, [s*0.435, s*0.26, s*0.565, s*0.74], r, fill=FROST)   # stem
    rrect(d, [s*0.24, s*0.26, s*0.76, s*0.39], r, fill=WHITE)     # crossbar, over the stem
    rrect(d, [s*0.32, s*0.80, s*0.68, s*0.86], r, fill=BLUE)      # baseline rule
    return im

for sz in (192, 512):
    icon(sz).save(os.path.join(ICONS, f"icon-{sz}.png"))
icon(512, maskable=True).save(os.path.join(ICONS, "maskable-512.png"))
icon(180).save(os.path.join(ICONS, "apple-touch-icon.png"))

def og_bg():
    im = Image.new("RGB", (1200, 630), NAVY)
    g = Image.new("L", (1200, 630), 0); dg = ImageDraw.Draw(g)
    dg.ellipse([700, -200, 1500, 500], fill=120)
    glow = Image.new("RGB", (1200, 630), BLUE)
    im = Image.composite(glow, im, g.filter(ImageFilter.GaussianBlur(160)))
    return im

def fitted(d, text, size, maxw, bold=False):
    """Largest font at or below `size` whose line still fits `maxw`."""
    while size > 14:
        f = font(size, bold)
        if d.textlength(text, font=f) <= maxw:
            return f
        size -= 1
    return font(14, bold)


# One card per language: the Ukrainian one used to be served on the Russian and
# English pages too, so a shared link previewed in the wrong language.
OG_TEXT = {
    "uk": ("Побутова техніка у Сумах",
           "Холодильники · пральні машини · кондиціонери · бойлери · зарядні станції",
           "Доставка та монтаж по Сумах · оплата після встановлення"),
    "ru": ("Бытовая техника в Сумах",
           "Холодильники · стиральные машины · кондиционеры · бойлеры · зарядные станции",
           "Доставка и монтаж по Сумам · оплата после установки"),
    "en": ("Home appliances in Sumy",
           "Fridges · washing machines · air conditioners · water heaters · power stations",
           "Delivery and installation in Sumy · pay after setup"),
}

def default_og(lang="uk"):
    """The card link previews show. The words alone said the shop sells five
    categories; the strip along the bottom shows them, using the same line-up
    scripts/make_hero.py also builds for search."""
    im = og_bg(); d = ImageDraw.Draw(im)
    tagline, cats, serv = OG_TEXT[lang]
    d.text((80, 70), "TEXNO PLAZA", font=font(86), fill=WHITE)
    d.text((84, 178), tagline, font=fitted(d, tagline, 48, 1032), fill=FROST)
    # five categories overrun 1200px at the old fixed 32pt, so the line is fitted
    d.text((84, 250), cats, font=fitted(d, cats, 30, 1032), fill=(210, 225, 245))
    d.text((84, 296), serv, font=fitted(d, serv, 28, 1032), fill=(150, 180, 220))

    art = make_hero.lineup()
    h = 268
    art = art.resize((max(1, round(h * art.width / art.height)), h), Image.LANCZOS)
    im.paste(art, ((1200 - art.width) // 2, 630 - h - 26), art)
    im.save(os.path.join(OG, "default.jpg" if lang == "uk" else "default-%s.jpg" % lang), quality=86)

# What the shop actually promises for this kind of product. A washing machine
# card used to read "монтаж під ключ · гарантія до 5 років", which is the air
# conditioner's offer and nobody else's.
TAGLINE = {
    "kondicioneri":     "Монтаж під ключ · оплата після встановлення",
    "pralni-mashyny":   "Доставка та підключення у Сумах",
    "holodylnyky":      "Доставка по Сумах · оплата після отримання",
    "zaryadni-stantsii": "Доставка по Сумах · офіційна гарантія",
    "boylery":          "Доставка по Сумах · гарантія на бак до 8 років",
    None:               "Доставка по Сумах · оплата після отримання",
}


def product_og(p):
    im = og_bg(); d = ImageDraw.Draw(im)
    # product cutout on right
    fp = os.path.join(ROOT, p["photos"][0].lstrip("/")) if p.get("photos") else None
    if fp and os.path.exists(fp):
        u = Image.open(fp).convert("RGBA"); u.thumbnail((560, 440), Image.LANCZOS)
        im.paste(u, (1200 - u.width - 60, (630 - u.height) // 2), u)
    d.text((70, 90), "TEXNO PLAZA", font=font(40), fill=FROST)
    name = p["name"]
    # wrap name
    f = font(46); words = name.split(); line = ""; y = 200
    for w in words:
        if d.textlength(line + " " + w, font=f) > 560 and line:
            d.text((70, y), line, font=f, fill=WHITE); y += 58; line = w
        else: line = (line + " " + w).strip()
    d.text((70, y), line, font=f, fill=WHITE); y += 74
    d.text((70, y), f"{p['price']:,} грн".replace(",", " "), font=font(54), fill=FROST)
    d.text((70, y + 78), TAGLINE.get(p.get("category"), TAGLINE[None]), font=font(28, False), fill=(210, 225, 245))
    im.save(os.path.join(OG, p["slug"] + ".jpg"), quality=84)

for _l in OG_TEXT: default_og(_l)
products = json.load(open(os.path.join(ROOT, "data", "products.json"), encoding="utf-8"))
for p in products: product_og(p)
print(f"icons + default OG + {len(products)} product OG generated")
