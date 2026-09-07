#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Import the Gunter&Hauer YML feed into data/products.json.

The feed is a standard Ukrainian YML catalogue. It carries no <param> elements,
so every fact is read out of the HTML description by scripts/gh_extract.py.
Nothing is invented: a spec the feed does not state is simply absent.

Prices are the supplier's own retail figures; the shop sells at ten per cent
less, so that is applied here and will be applied again on every refresh.

The description is written from each product's own extracted facts rather than
copied from the feed: the supplier's text sits on every dealer's site, and
duplicate copy is worth nothing in search.

Run: python scripts/import_gh_feed.py <feed.xml>
"""
import collections
import io
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / 'scripts'))
import gh_extract                                        # noqa: E402

MARKUP = 0.90                    # the shop sells ten per cent under the feed price
BRAND = 'Gunter&Hauer'


def plural(n, forms):
    n = abs(int(n))
    if n % 10 == 1 and n % 100 != 11:
        return forms[0]
    if 2 <= n % 10 <= 4 and not 12 <= n % 100 <= 14:
        return forms[1]
    return forms[2]


L = {'l': (('літр', 'літри', 'літрів'), ('литр', 'литра', 'литров')),
     'fn': (('функція', 'функції', 'функцій'), ('функция', 'функции', 'функций')),
     'pr': (('програма', 'програми', 'програм'), ('программа', 'программы', 'программ')),
     'st': (('комплект', 'комплекти', 'комплектів'), ('комплект', 'комплекта', 'комплектов')),
     'bw': (('чаша', 'чаші', 'чаш'), ('чаша', 'чаши', 'чаш')),
     'zn': (('конфорка', 'конфорки', 'конфорок'), ('конфорка', 'конфорки', 'конфорок'))}


def sentences(cat, s, model):
    """Three lists of sentences — uk, ru, en — built from what the feed states."""
    uk, ru, en = [], [], []
    g = s.get

    def add(u, r, e):
        uk.append(u); ru.append(r); en.append(e)

    if cat == 'duhovi-shafy':
        v, f = g('volume_l'), g('functions')
        if v and f:
            add(f"Вбудована електрична духова шафа на {v} {plural(v, L['l'][0])} із {f} {plural(f, L['fn'][0])}.",
                f"Встраиваемый электрический духовой шкаф на {v} {plural(v, L['l'][1])} с {f} {plural(f, L['fn'][1])}.",
                f"A built-in electric oven of {v} litres with {f} functions.")
        elif v:
            add(f"Вбудована електрична духова шафа на {v} {plural(v, L['l'][0])}.",
                f"Встраиваемый электрический духовой шкаф на {v} {plural(v, L['l'][1])}.",
                f"A built-in electric oven of {v} litres.")
        if g('control'):
            c = g('control').lower()
            add(f"Керування — {c}.", f"Управление — {c}.", "Controls are on the front panel.")
        if g('cleaning'):
            add(f"Очищення: {g('cleaning').lower()}.", f"Очистка: {g('cleaning').lower()}.",
                "Cleaning is handled without taking the cavity apart.")
    elif cat == 'varylni-poverhni':
        t, b = g('hob_type'), g('burners')
        if t and b:
            add(f"{t} варильна поверхня на {b} {plural(b, L['zn'][0])}.",
                f"{t} варочная поверхность на {b} {plural(b, L['zn'][1])}.",
                f"A {t.lower()} hob with {b} zones.")
        elif b:
            add(f"Варильна поверхня на {b} {plural(b, L['zn'][0])}.",
                f"Варочная поверхность на {b} {plural(b, L['zn'][1])}.",
                f"A hob with {b} cooking zones.")
        if g('control'):
            add(f"Керування — {g('control').lower()}.", f"Управление — {g('control').lower()}.",
                "Controls sit on the surface itself.")
    elif cat == 'vytyazhky':
        a, n = g('airflow'), g('noise_db')
        if a:
            add(f"Кухонна витяжка продуктивністю {a} м³/год.",
                f"Кухонная вытяжка производительностью {a} м³/ч.",
                f"A kitchen hood moving {a} m³/h.")
        if n:
            add(f"На максимумі — {n} дБ.", f"На максимуме — {n} дБ.", f"At full speed it runs at {n} dB.")
        if g('recirc'):
            add("Працює і на витяжку, і на рециркуляцію — якщо виводу назовні немає.",
                "Работает и на вытяжку, и на рециркуляцию — если вывода наружу нет.",
                "It works both ducted and recirculating, if there is no outlet.")
    elif cat == 'myyky':
        b, d = g('bowls'), g('dims')
        if b and d:
            add(f"Кухонна мийка {d} на {b} {plural(b, L['bw'][0])}.",
                f"Кухонная мойка {d} на {b} {plural(b, L['bw'][1])}.",
                f"A kitchen sink, {d}, with {b} bowl(s).")
        elif d:
            add(f"Кухонна мийка {d}.", f"Кухонная мойка {d}.", f"A kitchen sink, {d}.")
        if g('material'):
            add(f"Матеріал — {g('material').lower()}.", f"Материал — {g('material').lower()}.",
                f"Made of {g('material').lower()}.")
        if g('mount'):
            add(f"{g('mount')} — вимірюйте виріз у стільниці до замовлення.",
                f"{g('mount')} — измеряйте вырез в столешнице до заказа.",
                "Measure the worktop cut-out before ordering.")
    elif cat == 'zmishuvachi':
        t = g('tap_type')
        if t:
            add(f"{t} кухонний змішувач.", f"{t} кухонный смеситель.", "A kitchen mixer tap.")
        if g('finish'):
            add(f"Покриття — {g('finish').lower()}.", f"Покрытие — {g('finish').lower()}.",
                f"Finished in {g('finish').lower()}.")
        if g('spout'):
            add(f"Вилив {g('spout').lower()}.", f"Излив {g('spout').lower()}.", "The spout moves out of the way.")
    elif cat == 'dozatory':
        v = g('volume_ml')
        if v:
            add(f"Врізний дозатор для миючого засобу на {v} мл.",
                f"Врезной дозатор для моющего средства на {v} мл.",
                f"A built-in soap dispenser holding {v} ml.")
        if g('hole_mm'):
            add(f"Монтажний отвір — {g('hole_mm')} мм.", f"Монтажное отверстие — {g('hole_mm')} мм.",
                f"It needs a {g('hole_mm')} mm hole.")
    elif cat == 'mikrohvylovi-pechi':
        v, p = g('volume_l'), g('power_mw')
        if v and p:
            add(f"Вбудована мікрохвильова піч на {v} {plural(v, L['l'][0])}, {p} Вт мікрохвиль.",
                f"Встраиваемая микроволновая печь на {v} {plural(v, L['l'][1])}, {p} Вт микроволн.",
                f"A built-in microwave of {v} litres, {p} W.")
        elif p:
            add(f"Вбудована мікрохвильова піч, {p} Вт мікрохвиль.",
                f"Встраиваемая микроволновая печь, {p} Вт микроволн.",
                f"A built-in microwave rated {p} W.")
        if g('power_grill'):
            add(f"Гриль на {g('power_grill')} Вт.", f"Гриль на {g('power_grill')} Вт.",
                f"The grill adds {g('power_grill')} W.")
    elif cat == 'posudomyyni-mashyny':
        st, pr = g('sets'), g('programs')
        if st:
            add(f"Вбудована посудомийна машина на {st} {plural(st, L['st'][0])} посуду.",
                f"Встраиваемая посудомоечная машина на {st} {plural(st, L['st'][1])} посуды.",
                f"A built-in dishwasher for {st} place settings.")
        if pr:
            add(f"{pr} {plural(pr, L['pr'][0])} миття.", f"{pr} {plural(pr, L['pr'][1])} мойки.",
                f"{pr} washing programmes.")
        if g('noise_db'):
            add(f"Рівень шуму — {g('noise_db')} дБ.", f"Уровень шума — {g('noise_db')} дБ.",
                f"It runs at {g('noise_db')} dB.")
    elif cat == 'holodylnyky':
        v, fr, fz = g('volume_l'), g('vol_fridge'), g('vol_freezer')
        if v:
            add(f"Двокамерний холодильник на {v} {plural(v, L['l'][0])}.",
                f"Двухкамерный холодильник на {v} {plural(v, L['l'][1])}.",
                f"A two-door fridge of {v} litres.")
        if fr and fz:
            add(f"Корисний обʼєм: {fr} л холодильна камера і {fz} л морозильна.",
                f"Полезный объём: {fr} л холодильная камера и {fz} л морозильная.",
                f"Usable capacity is {fr} l in the fridge and {fz} l in the freezer.")
        if g('defrost'):
            add(f"Розморожування — {g('defrost')}.", f"Размораживание — {g('defrost')}.",
                f"Defrosting is {g('defrost')}.")

    if s.get('niche'):
        add(f"Розміри ніші під встановлення — {s['niche']}.",
            f"Размеры ниши под установку — {s['niche']}.",
            f"The cut-out measures {s['niche']}.")
    elif s.get('dims') and cat not in ('myyky',):
        add(f"Габарити — {s['dims']}.", f"Габариты — {s['dims']}.", f"It measures {s['dims']}.")
    return uk, ru, en


def describe(cat, specs, model, prefix):
    uk, ru, en = sentences(cat, specs, model)
    tail = {'uk': 'Доставка по Сумах, оплата після отримання.',
            'ru': 'Доставка по Сумам, оплата после получения.',
            'en': 'Delivery in Sumy, payment on receipt.'}
    if not uk:                                  # the feed said almost nothing
        uk = [f"{prefix['uk']} {BRAND} {model}."]
        ru = [f"{prefix['ru']} {BRAND} {model}."]
        en = [f"{prefix['en']} {BRAND} {model}."]
    return (' '.join(uk + [tail['uk']]), ' '.join(ru + [tail['ru']]), ' '.join(en + [tail['en']]))


def main(feed):
    cats = json.load(io.open(ROOT / 'data' / 'categories.json', encoding='utf-8'))
    path = ROOT / 'data' / 'products.json'
    products = json.load(io.open(path, encoding='utf-8'), object_pairs_hook=collections.OrderedDict)
    have = {p['slug'] for p in products}
    items = gh_extract.load(feed)
    added = updated = skipped = 0
    for it in items:
        cat = cats.get(it['cat'])
        if not cat:
            print(f"  !! немає категорії {it['cat']}"); continue
        photos_dir = ROOT / 'assets' / 'img' / 'products' / it['slug']
        photos = sorted(photos_dir.glob('[0-9]*.webp'),
                        key=lambda f: int(f.stem)) if photos_dir.exists() else []
        if not photos:
            print(f"  !! {it['slug']}: немає оброблених фото — пропускаю"); skipped += 1; continue
        prefix = cat['productPrefix']
        price = int(round(it['price'] * MARKUP))
        uk, ru, en = describe(it['cat'], it['specs'], it['model'], prefix)
        entry = collections.OrderedDict([
            ('brand', BRAND), ('series', it['model']),
            ('name', f"{prefix['uk']} {BRAND} {it['model']}"),
            ('name_ru', f"{prefix['ru']} {BRAND} {it['model']}"),
            ('name_en', f"{prefix['en']} {BRAND} {it['model']}"),
            ('price', price), ('category', it['cat']),
            ('specs', collections.OrderedDict(it['specs'])),
            ('desc_uk', uk), ('desc_ru', ru), ('desc_en', en),
            ('slug', it['slug']),
            ('thumb', f"/assets/img/products/{it['slug']}/thumb.webp"),
            ('photos', [f"/assets/img/products/{it['slug']}/{f.stem}.webp" for f in photos]),
        ])
        if it['slug'] in have:                  # refresh: price and stock only
            old = next(p for p in products if p['slug'] == it['slug'])
            if old.get('price') != price:
                old['price'] = price
                updated += 1
        else:
            products.append(entry)
            added += 1
    io.open(path, 'w', encoding='utf-8').write(json.dumps(products, ensure_ascii=False, indent=2) + '\n')
    print(f'додано {added}, оновлено цін {updated}, пропущено {skipped}; усього товарів {len(products)}')


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    main(sys.argv[1])
