#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Add the models from the supplier's list ("Нові товари") to the catalogue.

The list gives brand, product type, article, the manufacturer's recommended
price (РРЦ) and the shop's discounted price. Photos and the spec table come
from the model's public product card, collected into scratch JSON in a browser
session and matched by the exact article. A model whose card was not found is
reported and skipped: nothing here is guessed.

  price = "Ціна зі знижкою" from the list (owner, 2026-10-23)
  rrp   = РРЦ, shown struck through by build.mjs when it is above the price

Photos: up to 12 per model, cut out with scripts/photolib.py like the earlier
fridge and washer batches, saved as 900px WebP plus the 400px thumb.

  python scripts/import_supplier_list.py <cards.json> <supplier.json> [--photos] [--apply] [--only kind,kind]

--photos downloads and processes photos; --apply writes data/products.json.
--shard=k/n processes photos only for every n-th model (run n copies in parallel);
--resume skips models whose photos are already done.
"""
import io
import json
import os
import re
import sys
import time
import urllib.request

from PIL import Image, ImageDraw

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import photolib  # noqa: E402
from supplier_specs import MAPPERS  # noqa: E402
from supplier_text import describe  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PRODUCTS = os.path.join(ROOT, "data", "products.json")
OUT = os.path.join(ROOT, "assets", "img", "products")
IMG_BASE = "https://content.rozetka.com.ua/goods/images/original/"
FULL, THUMB = (900, 900), (400, 400)

# supplier type -> (category, uk prefix, ru prefix, en prefix, kind)
TYPES = {
    "Холод. з нижньою мороз. кам.": ("holodylnyky", "Холодильник", "Холодильник", "Refrigerator", "fridge"),
    "Холод. Side-by-Side": ("holodylnyky", "Холодильник Side-by-Side", "Холодильник Side-by-Side", "Side-by-Side refrigerator", "fridge"),
    "Вбудовані холодильники": ("holodylnyky", "Вбудований холодильник", "Встраиваемый холодильник", "Built-in refrigerator", "fridge"),
    "Морозильники вертикальні": ("holodylnyky", "Морозильна камера", "Морозильная камера", "Upright freezer", "freezer"),
    "Морозильні скрині": ("holodylnyky", "Морозильна скриня", "Морозильный ларь", "Chest freezer", "freezer"),
    "Праль. маш. вузькі 40-49 см": ("pralni-mashyny", "Пральна машина", "Стиральная машина", "Washing machine", "washer"),
    "Праль. маш. стандарт від 50 см": ("pralni-mashyny", "Пральна машина", "Стиральная машина", "Washing machine", "washer"),
    "Прально-сушильні машини": ("pralni-mashyny", "Прально-сушильна машина", "Стирально-сушильная машина", "Washer-dryer", "washer"),
    "Сушильні машини": ("pralni-mashyny", "Сушильна машина", "Сушильная машина", "Tumble dryer", "dryer"),
    "Вбуд. мікрохвильові печі": ("mikrohvylovi-pechi", "Вбудована мікрохвильова піч", "Встраиваемая микроволновая печь", "Built-in microwave", "micro"),
    "Духовки електричні": ("duhovi-shafy", "Духова шафа", "Духовой шкаф", "Built-in oven", "oven"),
    "Пилосос акумуляторний ручний": ("pylososy", "Акумуляторний пилосос", "Аккумуляторный пылесос", "Cordless vacuum cleaner", "vacuum"),
    "Вбуд. посудомийні машини": ("posudomyyni-mashyny", "Вбудована посудомийна машина", "Встраиваемая посудомоечная машина", "Built-in dishwasher", "dish"),
}
BRANDS = {"LG": "LG", "SAMSUNG": "Samsung", "WHIRLPOOL": "Whirlpool", "BOSCH": "Bosch",
          "EDLER": "Edler", "SIEMENS": "Siemens", "GORENJE": "Gorenje", "HOTPOINT": "Hotpoint"}


# photo 1 picked by eye after the contact-sheet check (2026-10-23): the automatic
# first cut-out was an open door, a badge strip, a back view or an install drawing
HERO = {
    "lg-gc-b509emkm": 2, "lg-gc-b509fnmw": 2, "samsung-rb38c6b6d39-ua": 2,
    "samsung-rb53dg703es9ua": 2, "bosch-wgb24401ua": 2, "samsung-vs20c8522tn-uk": 3,
    "samsung-vs80f28dgs-uk": 2, "edler-ewd-1070isw": 2, "lg-gc-q257cafv": 3,
    "lg-gc-q257cbfv": 3, "whirlpool-wmw57dhmx": 2, "whirlpool-wmf200g": 2,
    "bosch-hbg7341b1": 2, "edler-ebd-4525p": 2, "edler-ebd-6020p": 2, "edler-ed-413ibgd": 2,
    "hotpoint-hsio3o23wfe": 2, "whirlpool-wic3c33pfe": 3,
}


def slugify(s):
    return re.sub(r"-{2,}", "-", re.sub(r"[^a-z0-9]+", "-", s.lower())).strip("-")


def fetch(url, tries=3):
    for k in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            return urllib.request.urlopen(req, timeout=30).read()
        except Exception:
            time.sleep(1.5 * (k + 1))
    return None


def whiten_backdrop(im, tol=18):
    """A flat non-white studio backdrop (Edler's green, Whirlpool's black) -> white.

    photolib only knows white backgrounds and keeps anything else whole, which
    puts a green or black box in the catalogue. When the outer frame of the
    photo is one even colour, flood that colour from the border to white and
    let photolib cut it as usual. A busy border (a kitchen scene) is left alone.
    """
    w, h = im.size
    px = im.load()
    border = [px[x, y] for x in range(0, w, 7) for y in (0, 1, h - 2, h - 1)] + \
             [px[x, y] for y in range(0, h, 7) for x in (0, 1, w - 2, w - 1)]
    mean = [sum(c[i] for c in border) / len(border) for i in range(3)]
    spread = max(max(abs(c[i] - mean[i]) for c in border) for i in range(3))
    if spread > 24 or min(mean) > 235:          # busy edge, or already white
        return im
    im = im.copy()
    for x, y in ((0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1), (w // 2, 0), (w // 2, h - 1), (0, h // 2), (w - 1, h // 2)):
        if max(abs(a - b) for a, b in zip(im.getpixel((x, y)), mean)) <= tol:
            ImageDraw.floodfill(im, (x, y), (255, 255, 255), thresh=tol)
    return im


def photos(slug, ids):
    d = os.path.join(OUT, slug)
    os.makedirs(d, exist_ok=True)
    for f in os.listdir(d):
        p = os.path.join(d, f)
        if os.path.isfile(p):
            os.remove(p)
    shots, notes = [], {}
    for iid in ids[:12]:
        # a Rozetka image id, or a full URL when the card came from another shop
        raw = fetch(iid if iid.startswith("http") else IMG_BASE + iid)
        if not raw:
            notes["download failed"] = notes.get("download failed", 0) + 1
            continue
        try:
            src = Image.open(io.BytesIO(raw))
            src.load()
        except Exception:
            notes["unreadable"] = notes.get("unreadable", 0) + 1
            continue
        if min(src.size) < 300:
            notes["too small"] = notes.get("too small", 0) + 1
            continue
        # originals run to 4000+ px; the cut-out is pure Python and the page needs 900
        src.thumbnail((1800, 1800), Image.LANCZOS)
        alpha = src.convert("RGBA").split()[3] if src.mode in ("RGBA", "LA", "P") else None
        if alpha is not None:
            # transparent only if the frame is: a PNG with an opaque white backdrop and
            # a few clear pixels inside is not a cut-out
            w, h = alpha.size
            edge = [alpha.getpixel((x, y)) for x in range(0, w, 9) for y in (0, h - 1)] +                    [alpha.getpixel((x, y)) for y in range(0, h, 9) for x in (0, w - 1)]
            alpha = alpha if sum(a < 16 for a in edge) > 0.9 * len(edge) else None
        if alpha is not None:
            # the shop already published a transparent render — use it as it is
            rgba, how = src.convert("RGBA"), "alpha"
            rgba = rgba.crop(rgba.getbbox())
        else:
            rgba, how = photolib.prepare(whiten_backdrop(src.convert("RGB")))
        notes[how] = notes.get(how, 0) + 1
        shots.append((rgba, how))
    # the catalogue thumb and photo 1 must be the product alone: shops sometimes
    # lead with an open-door or interior shot, so the first clean cut-out goes first
    first = next((k for k, (_, how) in enumerate(shots) if how in ("cut", "alpha")), 0)
    if shots:
        shots.insert(0, shots.pop(first))
    # a hand-picked photo 1 where the first cut-out is still wrong (open door, badges,
    # back view); the number is the photo's place in that automatic order
    k = HERO.get(slug)
    if k and k <= len(shots):
        shots.insert(0, shots.pop(k - 1))
    for n, (rgba, _) in enumerate(shots, 1):
        photolib.normalize(rgba, FULL).save(os.path.join(d, f"{n}.webp"), "WEBP", quality=88, method=6)
    if shots:
        photolib.normalize(shots[0][0], THUMB).save(os.path.join(d, "thumb.webp"), "WEBP", quality=86, method=6)
    return len(shots), notes


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    do_photos, do_apply = "--photos" in sys.argv, "--apply" in sys.argv
    only, shard, resume = None, None, "--resume" in sys.argv
    for a in sys.argv:
        if a.startswith("--shard="):
            shard = tuple(int(x) for x in a.split("=", 1)[1].split("/"))
        if a.startswith("--only="):
            only = set(a.split("=", 1)[1].split(","))
    cards = {c["i"]: c for c in json.load(open(args[0], encoding="utf-8"))}
    supplier = json.load(open(args[1], encoding="utf-8"))
    products = json.load(open(PRODUCTS, encoding="utf-8"))
    taken = {p["slug"] for p in products}
    new, skipped, seq = [], [], 0
    # cards are numbered over the models NOT yet on the site, in list order —
    # number the same way here, never by the row's place in the whole list
    for i, row in enumerate(r for r in supplier if not r.get("site")):
        t = TYPES.get(row["type"])
        card = cards.get(i) or {}
        if not t:
            skipped.append((row["art"], "type not handled: " + row["type"])); continue
        cat, pre_uk, pre_ru, pre_en, kind = t
        if only and kind not in only:
            continue
        if card.get("miss") or not card.get("ch"):
            skipped.append((row["art"], "no product card found")); continue
        # a washer + dryer set card carries the other machine's photos and specs
        if re.search(r"\+|комплект", card.get("t") or "", re.I):
            skipped.append((row["art"], "card is a bundle, not this model alone")); continue
        brand = BRANDS.get(row["brand"].strip().upper(), row["brand"].strip().title())
        model = re.sub(r"\s+", " ", str(row["art"]).strip())
        slug = slugify(f"{brand} {model}")
        if slug in taken:
            skipped.append((model, "slug already in catalogue: " + slug)); continue
        specs, flags = MAPPERS[kind](card["ch"], kind, row["type"])
        if len(specs) < 5:
            skipped.append((model, f"card too sparse ({len(specs)} specs)")); continue
        uk, ru, en = describe(kind, brand, model, specs)
        price, rrp = int(round(float(row["sale"]))), int(round(float(row["rrp"])))
        p = {"brand": brand, "series": model,
             "name": f"{pre_uk} {brand} {model}",
             "name_ru": f"{pre_ru} {brand} {model}", "name_en": f"{pre_en} {brand} {model}",
             "price": price, "category": cat, **{k: v for k, v in flags.items() if v},
             "specs": specs, "desc_uk": uk, "desc_ru": ru, "desc_en": en, "slug": slug,
             "thumb": f"/assets/img/products/{slug}/thumb.webp", "photos": []}
        if rrp > price:
            p["rrp"] = rrp
        n = 0
        done = os.path.isfile(os.path.join(OUT, slug, "thumb.webp"))
        mine = shard is None or seq % shard[1] == shard[0]
        seq += 1
        if do_photos and mine and not (resume and done):
            n, notes = photos(slug, card.get("im") or [])
            print(f"{slug}: {n} photos {notes}", flush=True)
        else:
            d = os.path.join(OUT, slug)
            n = len([f for f in os.listdir(d) if re.fullmatch(r"\d+\.webp", f)]) if os.path.isdir(d) else 0
        if n == 0 and (do_apply or (do_photos and mine)):
            skipped.append((model, "no usable photos")); continue
        p["photos"] = [f"/assets/img/products/{slug}/{k}.webp" for k in range(1, n + 1)]
        taken.add(slug)
        new.append(p)
    print(f"\nnew: {len(new)}  skipped: {len(skipped)}")
    for a, why in skipped:
        print("  skip", a, "—", why)
    report = os.path.join(os.path.dirname(args[0]), "import_preview.json")
    json.dump(new, open(report, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print("preview:", report)
    if do_apply:
        products.extend(new)
        with open(PRODUCTS, "w", encoding="utf-8", newline="\r\n") as f:
            f.write(json.dumps(products, ensure_ascii=False, indent=2))
        print("written:", PRODUCTS, len(products))


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()
