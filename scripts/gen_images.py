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
    """The shop's mark: an air-conditioner indoor unit over three airflow lines.

    It spent a while as a "T" monogram, on the reasoning that a fourteen-category
    store should not advertise one shelf. The owner asked for the original back,
    which is theirs to decide — a mark identifies a shop, it does not have to
    inventory it.

    The geometry is the 0-100 viewBox of the inline SVG favicon in build.mjs,
    scaled, so the tab icon and the installed-app icon are the same drawing.
    PIL strokes inward from the box while SVG centres the stroke on the path,
    so the box is widened by half the stroke to put the outer edges in the
    same place.
    """
    im = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    pad = int(size * 0.10) if maskable else 0
    rrect(d, [pad, pad, size - pad, size - pad], int(size * 0.22), fill=NAVY)
    s = size / 100.0                       # authored against the SVG viewBox

    def u(v):
        return v * s

    w = max(2, int(round(5 * s)))          # the unit's casing
    rrect(d, [u(13.5), u(37.5), u(86.5), u(60.5)], u(8.5), outline=BLUE, width=w)
    lw = max(2, int(round(4 * s)))         # airflow, round-capped like the SVG
    for x, y1 in ((30, 70), (50, 72), (70, 70)):
        d.line([(u(x), u(64)), (u(x), u(y1))], fill=FROST, width=lw)
        for yy in (64, y1):                # PIL has no line caps; draw them
            r = lw / 2.0
            d.ellipse([u(x) - r, u(yy) - r, u(x) + r, u(yy) + r], fill=FROST)
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
#
# Two category lines, not one. Thirteen categories on a single line get fitted
# down to something nobody reads at the size Telegram renders a card; split by
# room, the home line and the kitchen line each stay legible — and the split
# itself is the message, because the shop was five categories when this card
# was last written and the preview still said so.
OG_TEXT = {
    "uk": ("Побутова та кухонна техніка у Сумах",
           "Холодильники · пральні машини · кондиціонери · бойлери · зарядні станції",
           "Мийки · змішувачі · витяжки · варильні поверхні · духові шафи · посудомийні",
           "Доставка та монтаж по Сумах · оплата після встановлення"),
    "ru": ("Бытовая и кухонная техника в Сумах",
           "Холодильники · стиральные машины · кондиционеры · бойлеры · зарядные станции",
           "Мойки · смесители · вытяжки · варочные поверхности · духовые шкафы · посудомоечные",
           "Доставка и монтаж по Сумам · оплата после установки"),
    "en": ("Home and kitchen appliances in Sumy",
           "Fridges · washing machines · air conditioners · water heaters · power stations",
           "Sinks · taps · hoods · hobs · ovens · dishwashers · microwaves",
           "Delivery and installation in Sumy · pay after setup"),
}

def default_og(lang="uk"):
    """The card link previews show. The words alone said the shop sells five
    categories; the strip along the bottom shows them, using the same line-up
    scripts/make_hero.py also builds for search."""
    im = og_bg(); d = ImageDraw.Draw(im)
    tagline, home, kitchen, serv = OG_TEXT[lang]
    d.text((80, 44), "TEXNO PLAZA", font=font(70), fill=WHITE)
    d.text((84, 126), tagline, font=fitted(d, tagline, 44, 1032), fill=FROST)
    # a category line overruns 1200px well before it runs out of categories,
    # so both are fitted rather than trusted to a fixed size
    d.text((84, 186), home, font=fitted(d, home, 26, 1032), fill=(210, 225, 245))
    d.text((84, 220), kitchen, font=fitted(d, kitchen, 26, 1032), fill=(210, 225, 245))
    d.text((84, 260), serv, font=fitted(d, serv, 24, 1032), fill=(150, 180, 220))

    art = make_hero.lineup()
    h = 304
    art = art.resize((max(1, round(h * art.width / art.height)), h), Image.LANCZOS)
    im.paste(art, ((1200 - art.width) // 2, 630 - h - 24), art)
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

COLL_PRICE = {"uk": ("від", "грн"), "ru": ("от", "грн"), "en": ("from", "UAH")}


def collection_og(e):
    """The card for a tag or brand page — "Газові варильні поверхні у Сумах".

    Same hand as product_og, so a shared link to a shelf and a shared link to
    one model look like the same shop. Everything written on it comes from
    scripts/.og-collections.json, which build.mjs fills from the page itself:
    the heading, the price floor, the count and the category's own promises,
    already in the page's language. The photo is the page's first product.
    """
    im = og_bg(); d = ImageDraw.Draw(im)
    fp = os.path.join(ROOT, e["photo"].lstrip("/")) if e.get("photo") else None
    if fp and os.path.exists(fp):
        u = Image.open(fp).convert("RGBA"); u.thumbnail((520, 420), Image.LANCZOS)
        im.paste(u, (1200 - u.width - 60, (630 - u.height) // 2), u)
    d.text((70, 90), "TEXNO PLAZA", font=font(40), fill=FROST)
    f = font(46); lines, line = [], ""
    for w in e["title"].split():
        if line and d.textlength(line + " " + w, font=f) > 560:
            lines.append(line); line = w
        else:
            line = (line + " " + w).strip()
    lines.append(line)
    if len(lines) > 3:                      # a long English heading: smaller, not clipped
        f = font(38)
    y = 190
    for ln in lines[:4]:
        d.text((70, y), ln, font=f, fill=WHITE); y += 58 if f.size >= 46 else 48
    y += 16
    pre, cur = COLL_PRICE.get(e["lang"], COLL_PRICE["uk"])
    lo = f"{e['lo']:,}".replace(",", " ")
    price = f"{lo} {cur}" if e["lo"] == e["hi"] else f"{pre} {lo} {cur}"
    d.text((70, y), price, font=font(54), fill=FROST)
    d.text((70, y + 78), e["count"], font=fitted(d, e["count"], 28, 560), fill=(210, 225, 245))
    if e.get("trust"):
        d.text((70, y + 118), e["trust"], font=fitted(d, e["trust"], 24, 560, False), fill=(150, 180, 220))
    out = os.path.join(ROOT, e["file"].lstrip("/"))
    os.makedirs(os.path.dirname(out), exist_ok=True)
    im.save(out, quality=84)


if __name__ == "__main__":
    # No argument redraws everything; "collections", "products" or "defaults"
    # redraws just that set — the tag and brand cards change with the catalogue,
    # the 273 product cards mostly do not.
    only = set(sys.argv[1:])
    if not only or "defaults" in only:
        for _l in OG_TEXT: default_og(_l)
    if not only or "products" in only:
        products = json.load(open(os.path.join(ROOT, "data", "products.json"), encoding="utf-8"))
        for p in products: product_og(p)
        print(f"{len(products)} product OG generated")
    if not only or "collections" in only:
        mf = os.path.join(ROOT, "scripts", ".og-collections.json")
        if not os.path.exists(mf):
            print("no scripts/.og-collections.json yet — run node scripts/build.mjs first")
        else:
            coll = json.load(open(mf, encoding="utf-8"))
            for e in coll: collection_og(e)
            print(f"{len(coll)} tag/brand OG generated")
