# -*- coding: utf-8 -*-
"""Read the Gunter&Hauer feed from the structure it actually has.

The first version of this treated each offer's description as prose and hunted
phrases in it with regular expressions. That was the wrong shape entirely: the
descriptions are HTML, and they carry 1623 table rows and 1840 list items across
the feed. Flattening them threw the structure away and then tried to guess it
back — which is why a sink yielded six facts when its own table states fifteen.

Three shapes carry facts, in order of reliability:

  1. Two-cell table rows.  <tr><td>Глибина чаш(і)</td><td>220 мм</td></tr>
     Sinks, taps and dispensers publish a full table. Exact, no guessing.
  2. List items written as "Key: value".  <li>Рівень шуму: ≤58 дБ</li>
     Hoods, ovens, dishwashers, microwaves and fridges publish this way.
  3. List items with no colon.  <li>Блокування для безпеки дітей</li>
     A feature with no value. These become the "Особливості" row and give the
     description something to say beyond numbers.

Sizes stay with the prose reader below: "ШхВхГ, мм" appears twice per product,
once for the appliance and once for the cut-out, and only the words around it
say which is which.

Nothing here invents a value: a key the feed does not state is simply absent.
"""
import html
import re
import xml.etree.ElementTree as ET
from collections import OrderedDict

CAT_MAP = {
    '1009': 'duhovi-shafy', '1007': 'varylni-poverhni', '1018': 'vytyazhky',
    '1079': 'myyky', '1081': 'zmishuvachi', '1085': 'dozatory',
    '1005': 'mikrohvylovi-pechi', '1006': 'posudomyyni-mashyny', '1008': 'holodylnyky',
}
WORD_NUM = {'одна': '1', 'одну': '1', 'дві': '2', 'два': '2', 'три': '3', 'чотири': '4',
            'п’ять': '5', "п'ять": '5', 'півтори': '1.5'}

# feed key (lower-cased, punctuation trimmed) -> (our key, kind)
# kind: num — first number; count — number or number-word; cls — energy letter;
#       size — NNNxNN mm; text — as written.
COMMON = {
    'клас енергоспоживання': ('eclass', 'cls'),
    'клас енергоефективності': ('eclass', 'cls'),
    'гарантія': ('warranty', 'text'),
    'колір': ('color', 'text'),
}
FIELDS = {
    'duhovi-shafy': {
        "об'єм, л": ('volume_l', 'num'), 'обʼєм, л': ('volume_l', 'num'),
        'об’єм, л': ('volume_l', 'num'),
        'кількість функцій': ('functions', 'num'),
        'кількість стекол дверцят': ('door_glass', 'num'),
        'регулювання температури': ('temp_range', 'text'),
        'знімні спрямовувачі': ('rails', 'text'),
        'телескопічні спрямовувачі': ('tele_rails', 'text'),
    },
    'varylni-poverhni': {},
    'vytyazhky': {
        'продуктивність': ('airflow', 'num'),
        'потужність двигуна': ('motor_w', 'num'),
        'рівень шуму': ('noise_db', 'num'),
        'діаметр фланця, мм': ('flange', 'num'),
        'фронтальна панель': ('front', 'text'),
    },
    'myyky': {
        'характеристики: серія': ('series_name', 'text'), 'серія': ('series_name', 'text'),
        'тип монтажу': ('mount', 'text'),
        'матеріал': ('material', 'text'),
        'форма': ('shape', 'text'),
        'вид поверхні': ('finish', 'text'),
        'наявність крила': ('wing', 'text'),
        'розміри мийки': ('dims', 'size'),
        'кількість чаш': ('bowls', 'count'),
        'розміри чаш(і)': ('bowl_dims', 'size'), 'розміри чаші': ('bowl_dims', 'size'),
        'глибина чаш(і)': ('depth_mm', 'num'), 'глибина чаші': ('depth_mm', 'num'),
        'монтажний отвір': ('cutout', 'text'),
        'колір мийки': ('color', 'text'),
        'отвір під змішувач': ('tap_hole', 'text'),
        'товщина металу': ('thickness_mm', 'num'),
    },
    'zmishuvachi': {
        'характеристики: серія': ('series_name', 'text'), 'серія': ('series_name', 'text'),
        'матеріал': ('material', 'text'),
        'вид поверхні': ('finish', 'text'),
        'вид змішувача': ('tap_type', 'text'),
        'тип підключення': ('connection', 'text'),
        'діаметр підключення шлангів': ('hose_thread', 'text'),
        'вид виливу': ('spout', 'text'),
        'витрати води': ('flow_lmin', 'num'),
        'висота змішувача': ('height_mm', 'num'),
        'висота виливу': ('spout_h_mm', 'num'),
        'довжина виливу': ('spout_l_mm', 'num'),
        'вид картриджа': ('cartridge', 'text'),
        'довжина сполучних шлангів': ('hose_cm', 'num'),
        'діаметр монтажного отвору': ('hole_mm', 'num'),
    },
    'dozatory': {
        'матеріал корпусу': ('material', 'text'),
        'матеріал колби': ('bottle', 'text'),
        'обсяг колби': ('volume_ml', 'num'), "об'єм колби": ('volume_ml', 'num'),
        'діаметр монтажного отвору': ('hole_mm', 'num'),
        'тип монтажу': ('mount', 'text'),
    },
    'mikrohvylovi-pechi': {
        "об'єм": ('volume_l', 'num'), 'об’єм': ('volume_l', 'num'),
        'потужність мікрохвиль': ('power_mw', 'num'),
        'потужність гриля': ('power_grill', 'num'),
        'внутрішнє покриття камери': ('cavity', 'text'),
        'фронтальна панель': ('front', 'text'),
        'діаметр поворотного столика': ('plate_cm', 'num'),
        'діаметр обертової тарілки': ('plate_cm', 'num'),
    },
    'posudomyyni-mashyny': {
        'кількість комплектів': ('sets', 'num'),
        'кількість програм': ('programs', 'num'),
        'кошики': ('baskets', 'num'),
        'клас миття': ('wash_class', 'cls'),
        'клас сушки': ('dry_class', 'cls'),
        'споживання води за цикл': ('water_l', 'num'),
        'енергоспоживання за цикл': ('kwh_cycle', 'num'),
        'рівень шуму': ('noise_db', 'num'),
    },
    'holodylnyky': {
        'тип': ('fridge_type', 'text'),
        'управління': ('control', 'text'),
        'система розморожування': ('defrost', 'text'),
        'кліматичний клас': ('climate', 'text'),
        'номінальна потужність, вт': ('power_w', 'num'),
        'щоденне споживання електроенергії, квт⋅год': ('kwh_day', 'num'),
        'вага, кг': ('weight_kg', 'num'),
        'розташування морозильної камери': ('freezer_pos', 'text'),
        'тип компресора': ('compressor', 'text'),
        'загальний об’єм, л': ('volume_l', 'num'), "загальний об'єм, л": ('volume_l', 'num'),
        'потужність заморозки, кг/добу': ('freeze_cap', 'num'),
        'рівень шуму, дб': ('noise_db', 'num'),
        'корисний об’єм холодильної камери, л': ('vol_fridge', 'num'),
        "корисний об'єм холодильної камери, л": ('vol_fridge', 'num'),
        'корисний об’єм морозильної камери, л': ('vol_freezer', 'num'),
        "корисний об'єм морозильної камери, л": ('vol_freezer', 'num'),
        'клас морозильної камери': ('freezer_class', 'text'),
    },
}
# A bullet that is only a colour, a bare number, or boilerplate is not a feature.
FEAT_DROP = re.compile(
    r'^(чорний|білий|сірий|золотий|нержавіюча сталь|айворі|пісочний|бежевий|графітовий'
    r'|[\d\s.,хx×]+|.{0,3}|.{81,})$', re.I)
HOMOGLYPH = str.maketrans('АВСЕНКМОРТХІ', 'ABCEHKMOPTXI')


def txt(x):
    return re.sub(r'\s+', ' ', re.sub(r'<[^>]+>', ' ', x or '')).replace('\xa0', ' ').strip()


def norm_key(k):
    return k.strip().rstrip(':').strip().lower()


def coerce(kind, v):
    v = v.strip(' .,;:')
    if not v:
        return None
    if kind == 'num':
        m = re.search(r'(\d+(?:[.,]\d+)?)', v)
        return m.group(1).replace(',', '.') if m else None
    if kind == 'count':
        m = re.search(r'(\d+)', v)
        if m:
            return m.group(1)
        return WORD_NUM.get(v.split()[0].lower())
    if kind == 'cls':
        m = re.search(r'\b([A-G]\+*)', v.translate(HOMOGLYPH))
        return m.group(1) if m else None
    if kind == 'size':
        m = re.search(r'(\d+)\s*[хxX×]\s*(\d+)', v)
        return f'{m.group(1)} × {m.group(2)} мм' if m else None
    # The feed writes its table values in lower case — "нержавіюча сталь",
    # "чорний". A spec table wants them capitalised, and spec-values.json keys
    # its translations on the capitalised form.
    return (v[0].upper() + v[1:]) if 1 < len(v) <= 60 else None


def pairs(desc):
    """(key, value) from two-cell table rows and from "Key: value" list items."""
    out = []
    for tr in re.findall(r'<tr[^>]*>(.*?)</tr>', desc, re.S | re.I):
        cells = [c for c in (txt(x) for x in re.findall(r'<td[^>]*>(.*?)</td>', tr, re.S | re.I)) if c]
        if len(cells) == 2 and 1 < len(cells[0]) <= 48:
            out.append((cells[0], cells[1]))
    for li in re.findall(r'<li[^>]*>(.*?)</li>', desc, re.S | re.I):
        whole = txt(li)
        m = re.match(r'^([^:]{2,44}):\s*(.+)$', whole)
        if m and not m.group(1)[0].isdigit():
            out.append((m.group(1), m.group(2)))
    return out


def features(desc):
    """List items that state a capability rather than a value."""
    seen, out = set(), []
    for li in re.findall(r'<li[^>]*>(.*?)</li>', desc, re.S | re.I):
        whole = txt(li)
        if ':' in whole[:46]:
            continue
        whole = whole.rstrip('.')
        low = whole.lower()
        if FEAT_DROP.match(whole) or low in seen:
            continue
        seen.add(low)
        out.append(whole)
    return out


def dims_of(txt_flat, name):
    m = re.search(r'(?:Габаритні розміри|Габарити|Розміри)[^:]{0,20}:\s*ШхВхГ,?\s*мм:?\s*'
                  r'(\d+)\s*[хxX×]\s*(\d+)\s*[хxX×]\s*(\d+)', txt_flat)
    if m:
        return f'{m.group(1)} × {m.group(2)} × {m.group(3)} мм'
    m = re.search(r'Розміри мийки\s*(\d+)\s*[хxX×]\s*(\d+)', txt_flat)
    if m:
        return f'{m.group(1)} × {m.group(2)} мм'
    m = re.search(r'\((\d+)\s*[хxX×]\s*(\d+)\s*см\)', name or '')
    return f'{m.group(1)} × {m.group(2)} см' if m else None


HOB_WORDS = (('індукцій', 'Індукційна'), ('комбінован', 'Комбінована'),
             ('газов', 'Газова'), ('склокерамічн', 'Електрична'), ('електричн', 'Електрична'))


def specs_of(cat, desc, flat, name):
    s = OrderedDict()
    table = {**COMMON, **FIELDS.get(cat, {})}
    for k, v in pairs(desc):
        f = table.get(norm_key(k))
        if not f or f[0] in s:
            continue
        got = coerce(f[1], v)
        if got:
            s[f[0]] = got

    d = dims_of(flat, name)
    if d:
        s.setdefault('dims', d)
    m = re.search(r'Розміри для вбудовування[^:]*:\s*ШхВхГ,?\s*мм:?\s*'
                  r'(\d+)\s*[хxX×]\s*(\d+)\s*[хxX×]\s*(\d+)', flat)
    if m:
        s['niche'] = f'{m.group(1)} × {m.group(2)} × {m.group(3)} мм'

    low = flat.lower()
    if cat == 'varylni-poverhni':
        # Hobs publish no table at all: the type is in the opening sentence and
        # the zones are one list item per burner.
        m = re.search(r'[–—-]\s*(\w+)у\s+варильну\s+поверхню', flat)
        head = (m.group(1).lower() if m else '')
        for word, val in HOB_WORDS:
            if head.startswith(word[:8]):
                s['hob_type'] = val
                break
        else:
            for word, val in HOB_WORDS:
                if word in low:
                    s['hob_type'] = val
                    break
        n = sum(int(x) for x in re.findall(r'(\d+)\s+(?:[а-яїієґ]+\s+){0,2}конфорк', low))
        if 1 <= n <= 6:
            s['burners'] = str(n)
        m = re.search(r'(Сенсорн\w*|Механічн\w*|Електронн\w*)\s+(?:управління|керування)', flat, re.I)
        if m:
            s['control'] = m.group(0)[0].upper() + m.group(0)[1:].lower()
    if cat == 'vytyazhky':
        if 'рециркуляц' in low:
            s['recirc'] = 'Так'
        # Hoods state how they are controlled as a plain list item, not as a
        # key/value pair, so it arrives as a feature. It belongs in the table.
        if 'control' not in s:
            m = re.search(r'(Сенсорн\w*|Механічн\w*|Електронн\w*)\s+(?:управління|керування)',
                          flat, re.I)
            if m:
                s['control'] = m.group(0)[0].upper() + m.group(0)[1:].lower()
    if cat == 'myyky' and 'mount' not in s:
        s['mount'] = ('Підстільна' if 'підстіль' in low or 'під стільниц' in low
                      else 'Врізна' if 'врізн' in low else None)
        if not s['mount']:
            del s['mount']

    if 'dims' in s and 'width_cm' not in s:
        m = re.match(r'(\d+)\s*×', s['dims'])
        if m:
            w = int(m.group(1))
            cm = w if s['dims'].endswith('см') else round(w / 10)
            if 20 <= cm <= 120:
                s['width_cm'] = str(cm)
    return s


def model_of(o):
    name = o.findtext('name') or ''
    m = re.match(r'^\s*([A-Za-zА-Яа-яЄІЇҐ0-9][A-Za-z0-9 \-\./]{1,24}?)\s*:', name)
    return (m.group(1).strip() if m else (o.findtext('vendorCode') or '').strip())


def slug_of(o):
    return re.sub(r'[^a-z0-9]+', '-', 'gunter-hauer-' + model_of(o).lower()).strip('-')


def load(path):
    r = ET.parse(path).getroot()
    out = []
    for o in r.find('shop').find('offers'):
        cat = CAT_MAP.get(o.findtext('categoryId'))
        if not cat:
            continue
        if re.match(r'\s*(?:Килимок|Дошка|Сушарка|Коландер)\b', o.findtext('name') or '', re.I):
            continue                            # accessory filed under the range it fits
        desc = html.unescape(o.findtext('description') or '')
        flat = txt(desc)
        out.append(dict(
            slug=slug_of(o), model=model_of(o), cat=cat,
            available=(o.get('available', 'true') != 'false'),
            name=o.findtext('name'), price=int(o.findtext('price') or 0),
            code=o.findtext('vendorCode'),
            pictures=[p.text for p in o.findall('picture')],
            specs=specs_of(cat, desc, flat, o.findtext('name') or ''),
            features=features(desc),
            text=flat))
    return out
