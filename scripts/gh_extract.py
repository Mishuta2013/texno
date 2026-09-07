# -*- coding: utf-8 -*-
"""Pull structured facts out of the Gunter&Hauer YML feed.

The feed carries no <param> elements: every fact lives inside one HTML
description per offer, written as "Ключ: значення" or bare "Ключ значення"
pairs. Each category words them differently, so the phrases are listed per
category and matched by name. Whatever the feed does not state is left out —
nothing here invents a number.
"""
import html
import re
import xml.etree.ElementTree as ET
from collections import Counter, OrderedDict

CAT_MAP = {
    '1009': 'duhovi-shafy', '1007': 'varylni-poverhni', '1018': 'vytyazhky',
    '1079': 'myyky', '1081': 'zmishuvachi', '1085': 'dozatory',
    '1005': 'mikrohvylovi-pechi', '1006': 'posudomyyni-mashyny', '1008': 'holodylnyky',
}
WORD_NUM = {'одна': '1', 'одну': '1', 'дві': '2', 'два': '2', 'три': '3', 'чотири': '4',
            'п’ять': '5', "п'ять": '5', 'півтори': '1.5'}
# our key -> phrases that introduce it, in the order they are worth trying
FIELDS = {
    'duhovi-shafy': [
        ('volume_l', ["Об'єм, л", 'Обʼєм, л', 'Об’єм, л', 'Обсяг, л', 'Загальний об’єм, л'], 'num'),
        ('functions', ['Кількість функцій'], 'num'),
        ('control', ['Управління'], 'word'),
        ('cleaning', ['Очищення'], 'phrase'),
        ('eclass', ['Клас енергоспоживання', 'Клас енергоефективності'], 'cls'),
        ('color', ['Колір'], 'color'),
    ],
    'varylni-poverhni': [
        ('hob_type', ['Тип поверхні', 'Тип'], 'word'),
        ('burners', ['Кількість конфорок'], 'num'),
        ('control', ['Управління'], 'word'),
        ('color', ['Колір'], 'color'),
    ],
    'vytyazhky': [
        ('airflow', ['Продуктивність'], 'num'),
        ('noise_db', ['Рівень шуму'], 'num'),
        ('motor_w', ['Потужність двигуна'], 'num'),
        ('control', ['Управління', 'Тип керування'], 'word'),
        ('color', ['Колір'], 'color'),
    ],
    'myyky': [
        ('bowls', ['Кількість чаш'], 'count'),
        ('bowl_dims', ['Розміри чаш(і)', 'Розміри чаші', 'Розміри чаш'], 'size'),
        ('depth_mm', ['Глибина чаші', 'Глибина'], 'num'),
        ('flange', ['Діаметр фланця, мм', 'Діаметр фланця'], 'num'),
        ('material', ['Матеріал мийки', 'Матеріал'], 'phrase'),
        ('color', ['Колір'], 'color'),
    ],
    'zmishuvachi': [
        ('tap_type', ['Вид змішувача'], 'phrase'),
        ('material', ['Матеріал корпусу', 'Матеріал'], 'phrase'),
        ('finish', ['Вид поверхні'], 'phrase'),
        ('connection', ['Тип підключення'], 'phrase'),
        ('series', ['Серія'], 'phrase'),
        ('height_mm', ['Висота змішувача', 'Висота'], 'num'),
        ('color', ['Колір'], 'color'),
    ],
    'dozatory': [
        ('volume_ml', ['Обсяг колби', "Об'єм колби", 'Обʼєм колби'], 'num'),
        ('material', ['Матеріал корпусу', 'Матеріал'], 'phrase'),
        ('bottle', ['Матеріал колби'], 'phrase'),
        ('hole_mm', ['Діаметр монтажного отвору'], 'num'),
        ('mount', ['Тип монтажу'], 'phrase'),
        ('color', ['Колір'], 'color'),
    ],
    'mikrohvylovi-pechi': [
        ('volume_l', ["Об'єм, л", 'Обʼєм, л', 'Об’єм, л', 'Обсяг, л'], 'num'),
        ('power_mw', ['Потужність мікрохвиль'], 'num'),
        ('power_grill', ['Потужність гриля'], 'num'),
        ('control', ['Управління'], 'word'),
        ('color', ['Колір'], 'color'),
    ],
    'posudomyyni-mashyny': [
        ('sets', ['Кількість комплектів'], 'num'),
        ('programs', ['Кількість програм'], 'num'),
        ('eclass', ['Клас енергоспоживання', 'Клас енергоефективності'], 'cls'),
        ('noise_db', ['Рівень шуму'], 'num'),
        ('color', ['Колір'], 'color'),
    ],
    'holodylnyky': [
        ('fridge_type', ['Тип'], 'word'),
        ('volume_l', ['Загальний об’єм, л', "Загальний об'єм, л"], 'num'),
        ('vol_fridge', ['Корисний об’єм холодильної камери, л', "Корисний об'єм холодильної камери, л"], 'num'),
        ('vol_freezer', ['Корисний об’єм морозильної камери, л', "Корисний об'єм морозильної камери, л"], 'num'),
        ('freezer_pos', ['Розташування морозильної камери'], 'word'),
        ('defrost', ['Система розморожування'], 'word'),
        ('compressor', ['Тип компресора'], 'phrase'),
        ('control', ['Управління'], 'word'),
        ('climate', ['Кліматичний клас'], 'cls_list'),
        ('eclass', ['Клас енергоспоживання', 'Клас енергоефективності'], 'cls'),
    ],
}
GENERIC_STOP = r'(?=\s+[А-ЯЄІЇҐA-Z][^:]{2,44}:|\s{2,}|$)'
EXTRA_STOP = ['Особливості', 'Характеристики', 'Технічні параметри', 'Гарантія',
              'Основна інформація', 'Комплектація', 'Габаритні розміри', 'Розміри',
              'Отвір під змішувач', 'Тип монтажу', 'Зручний монтаж', 'Повна комплектація',
              'Вага', 'Країна', 'Виробник']
# "Колір" is the one field the feed writes loosely: several offers follow it with
# the model code out of a nearby heading. A colour has no digits in it.
BAD_COLOR = re.compile(r'\d')
# Класи енергоспоживання у стрічці набрані українською розкладкою: А, В, С.
HOMOGLYPH = str.maketrans('АВСЕНКМОРТХІ', 'ABCEHKMOPTXI')


def text_of(x):
    return re.sub(r'\s+', ' ', re.sub(r'<[^>]+>', ' ', html.unescape(x or ''))).replace('\xa0', ' ').strip()


def model_of(o):
    name = o.findtext('name') or ''
    m = re.match(r'^\s*([A-Za-zА-Яа-яЄІЇҐ0-9][A-Za-z0-9 \-\./]{1,24}?)\s*:', name)
    return (m.group(1).strip() if m else (o.findtext('vendorCode') or '').strip())


def slug_of(o):
    return re.sub(r'[^a-z0-9]+', '-', 'gunter-hauer-' + model_of(o).lower()).strip('-')


def stop_for(phrases, others):
    """A value ends where the next known key starts. These runs have no colons —
    "Матеріал нержавіюча сталь Вид поверхні Gold PVD" — so the only reliable
    boundary is the vocabulary of the other keys."""
    keys = sorted({k for k in list(others) + EXTRA_STOP if k not in phrases}, key=len, reverse=True)
    alt = '|'.join(re.escape(k) for k in keys)
    return r'(?=\s+(?:' + alt + r')|\s+[А-ЯЄІЇҐA-Z][^:]{2,44}:|\s{2,}|$)' if alt else GENERIC_STOP


MODEL_RUN = r'\s*(?:[A-Z0-9][A-Za-z0-9 \-/\.]{0,24}:)?\s*'


def grab(txt, phrases, kind, others=()):
    stop = stop_for(phrases, others)
    head = MODEL_RUN if kind == 'color' else r'\s*:?\s*'
    for ph in phrases:
        m = re.search(re.escape(ph) + head + r'(.{1,60}?)' + stop, txt)
        if not m:
            continue
        v = m.group(1).strip(' .,;:')
        if not v:
            continue
        if kind == 'num':
            d = re.search(r'(\d+(?:[.,]\d+)?)', v)
            if d:
                return d.group(1).replace(',', '.')
        elif kind == 'count':
            d = re.search(r'(\d+)', v)
            if d:
                return d.group(1)
            w = WORD_NUM.get(v.split()[0].lower())
            if w:
                return w
        elif kind == 'cls':
            d = re.search(r'\b([A-G]\+*)', v.translate(HOMOGLYPH))
            if d:
                return d.group(1)
        elif kind == 'cls_list':
            # "N,SN,ST Можливість перенавішування дверцят" — the climate classes
            # and then the next sentence, which has no key of its own to stop at.
            d = re.match(r'[A-Z]+(?:\s*[,/]\s*[A-Z]+)*', v)
            if d:
                return d.group(0).replace(' ', '')
        elif kind == 'size':
            d = re.search(r'(\d+)\s*[хx×]\s*(\d+)', v)
            if d:
                return f'{d.group(1)} × {d.group(2)} мм'
        elif kind == 'color':
            v = v.split(',')[0].strip()
            v = re.sub(r'^(?:мийки|корпусу|поверхні)\s+', '', v, flags=re.I)
            if 1 < len(v) <= 30 and not BAD_COLOR.search(v):
                return v[0].upper() + v[1:]
        else:                                   # word / phrase
            v = v.split(',')[0].strip() if kind == 'word' else v
            if 1 < len(v) <= 46:
                return v[0].upper() + v[1:]
    return None


def dims_of(txt, name):
    m = re.search(r'(?:Габаритні розміри|Габарити|Розміри)[^:]{0,20}:\s*ШхВхГ,?\s*мм:?\s*'
                  r'(\d+)\s*[хx×]\s*(\d+)\s*[хx×]\s*(\d+)', txt)
    if m:
        return f'{m.group(1)} × {m.group(2)} × {m.group(3)} мм'
    m = re.search(r'Розміри мийки\s*(\d+)\s*[хx×]\s*(\d+)', txt)
    if m:
        return f'{m.group(1)} × {m.group(2)} мм'
    m = re.search(r'\((\d+)\s*[хx×]\s*(\d+)\s*см\)', name or '')
    if m:
        return f'{m.group(1)} × {m.group(2)} см'
    return None


def specs_of(cat, txt, name):
    s = OrderedDict()
    allph = [p for _, ps, _ in FIELDS.get(cat, []) for p in ps]
    for key, phrases, kind in FIELDS.get(cat, []):
        v = grab(txt, phrases, kind, allph)
        if v:
            s[key] = v
    d = dims_of(txt, name)
    if d:
        s['dims'] = d
    m = re.search(r'Розміри для вбудовування[^:]*:\s*ШхВхГ,?\s*мм:?\s*(\d+)\s*[хx×]\s*(\d+)\s*[хx×]\s*(\d+)', txt)
    if m:
        s['niche'] = f'{m.group(1)} × {m.group(2)} × {m.group(3)} мм'
    low = txt.lower()
    if cat == 'myyky' and 'mount' not in s:
        s['mount'] = ('Підстільна' if 'підстіль' in low or 'під стільниц' in low
                      else 'Врізна' if 'верхній монтаж' in low or 'врізн' in low else None)
        if not s['mount']:
            del s['mount']
    if cat == 'zmishuvachi' and 'spout' not in s:
        sp = 'Висувний' if 'висувн' in low else 'Поворотний' if 'обертання виливу' in low or 'поворотн' in low else None
        if sp:
            s['spout'] = sp
    if cat == 'varylni-poverhni':
        # "CER 640 – електричну варильну поверхню", "2 конфорки Hi-Light: 1,2
        # кВт ... 2 конфорки Hi-Light: 1,8 кВт", "Сенсорне управління" — the hob
        # descriptions carry no key/value pairs at all, so each fact is read out
        # of the sentence that states it.
        if 'hob_type' not in s:
            # Every hob description opens the same way — "GH 631 BE –
            # комбіновану варильну поверхню Gunter & Hauer" — and that one word
            # is the only place the type is stated. Scanning the whole text for
            # "газ" instead would call a combined hob a gas one, because it
            # burns gas on three of its four zones.
            m = re.search(r'[–—-]\s*(\w+)у\s+варильну\s+поверхню', txt)
            head = (m.group(1).lower() if m else '')
            for word, val in (('індукцій', 'Індукційна'), ('комбінован', 'Комбінована'),
                              ('газов', 'Газова'), ('склокерамічн', 'Електрична'),
                              ('електричн', 'Електрична')):
                if head.startswith(word[:8]):
                    s['hob_type'] = val
                    break
            else:
                for word, val in (('індукцій', 'Індукційна'), ('комбінован', 'Комбінована'),
                                  ('склокерамічн', 'Електрична'), ('електричн', 'Електрична'),
                                  ('газов', 'Газова')):
                    if word in low:
                        s['hob_type'] = val
                        break
        if 'burners' not in s:
            n = sum(int(d) for d in re.findall(r'(\d+)\s+(?:[а-яїієґ]+\s+){0,2}конфорк', low))
            if 1 <= n <= 6:
                s['burners'] = str(n)
        if 'control' not in s:
            m = re.search(r'(Сенсорн\w*|Механічн\w*|Електронн\w*)\s+(?:управління|керування)', txt, re.I)
            if m:
                s['control'] = m.group(0)[0].upper() + m.group(0)[1:].lower()
    if cat == 'vytyazhky' and 'рециркуляц' in low:
        s['recirc'] = 'Так'
    if 'dims' in s and 'width_cm' not in s:
        m = re.match(r'(\d+)\s*×', s['dims'])
        if m:
            w = int(m.group(1))
            unit_cm = s['dims'].endswith('см')
            cm = w if unit_cm else round(w / 10)
            if 20 <= cm <= 120:
                s['width_cm'] = str(cm)
    return s


def load(path):
    r = ET.parse(path).getroot()
    out = []
    for o in r.find('shop').find('offers'):
        cat = CAT_MAP.get(o.findtext('categoryId'))
        if not cat:
            continue
        if re.match(r'\s*(?:Килимок|Дошка|Сушарка|Коландер)\b', o.findtext('name') or '', re.I):
            continue                            # accessory filed under the range it fits
        txt = text_of(o.findtext('description'))
        out.append(dict(
            slug=slug_of(o), model=model_of(o), cat=cat,
            available=(o.get('available', 'true') != 'false'),
            name=o.findtext('name'), price=int(o.findtext('price') or 0),
            code=o.findtext('vendorCode'),
            pictures=[p.text for p in o.findall('picture')],
            specs=specs_of(cat, txt, o.findtext('name') or ''),
            text=txt))
    return out
