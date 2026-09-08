#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Import the Gunter&Hauer YML feed into data/products.json.

The feed is a standard Ukrainian YML catalogue. It carries no <param> elements,
so every fact is read out of the HTML description by scripts/gh_extract.py.
Nothing is invented: a spec the feed does not state is simply absent.

Prices are the supplier's own retail figures; the shop sells at ten per cent
less, so that is applied here and again on every refresh.

The description is written from each product's own extracted facts rather than
copied from the feed: the supplier's text sits on every dealer's site, and
duplicate copy is worth nothing in search.

Three languages, and none of them may leak into another. The feed speaks
Ukrainian, so every value that goes into a Russian or English sentence is
translated through TERMS; a value nobody has translated drops its sentence in
that language rather than producing "A електрична hob". The Ukrainian text never
loses a sentence, and the other two lose only the fact that has no wording.

Run: python scripts/import_gh_feed.py <feed.xml>
"""
import collections
import io
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / 'scripts'))
import gh_extract2 as gh_extract                         # noqa: E402

MARKUP = 0.90                    # the shop sells ten per cent under the feed price
BRAND = 'Gunter&Hauer'

# Everything the feed states in words, in the three languages the site speaks.
# Keys are lower-cased so a stray capital does not lose the translation.
TERMS = {
    # hob type — the adjective agrees with "поверхня" / "поверхность"
    'індукційна': ('індукційна', 'индукционная', 'induction'),
    'електрична': ('електрична', 'электрическая', 'electric'),
    'газова': ('газова', 'газовая', 'gas'),
    'комбінована': ('комбінована', 'комбинированная', 'combined gas and electric'),
    # controls
    'сенсорне управління': ('сенсорне', 'сенсорное', 'touch controls'),
    'сенсорне управління touch': ('сенсорне', 'сенсорное', 'touch controls'),
    'механічне управління': ('механічне', 'механическое', 'knobs'),
    'механічне': ('механічне', 'механическое', 'knobs'),
    'електронне управління': ('електронне', 'электронное', 'electronic controls'),
    'сенсорне управління / поворотний перемикач':
        ('сенсорне, з поворотним перемикачем', 'сенсорное, с поворотным переключателем',
         'touch controls with a rotary knob'),
    'сенсорне управління / утоплювані перемикачі':
        ('сенсорне, з утоплюваними перемикачами', 'сенсорное, с утапливаемыми переключателями',
         'touch controls with push-in knobs'),
    'механічне управління / поворотні перемикачі':
        ('механічне, поворотні перемикачі', 'механическое, поворотные переключатели',
         'rotary knobs'),
    'електронне управління / поворотний перемикач':
        ('електронне, з поворотним перемикачем', 'электронное, с поворотным переключателем',
         'electronic controls with a rotary knob'),
    # cleaning
    'очищення парою': ('парою', 'паром', 'steam cleaning'),
    # sinks and dispensers
    'врізна': ('врізне', 'врезная', 'inset'),
    'підстільна': ('підстільне', 'подстольная', 'undermount'),
    'на стільницю або в отвір на мийці':
        ('на стільницю або в отвір мийки', 'на столешницу или в отверстие мойки',
         'into the worktop or a spare sink hole'),
    # taps
    'одноважільний': ('одноважільний', 'однорычажный', 'single-lever'),
    'двоважільний': ('двоважільний', 'двухвентильный', 'two-handle'),
    'поворотний': ('поворотний', 'поворотный', 'a swivel'),
    'висувний': ('висувний', 'выдвижной', 'a pull-out'),
    # materials and finishes
    'нержавіюча сталь': ('нержавіюча сталь', 'нержавеющая сталь', 'stainless steel'),
    'латунь': ('латунь', 'латунь', 'brass'),
    'пластик': ('пластик', 'пластик', 'plastic'),
    'матове полірування': ('матове полірування', 'матовая полировка', 'a matt finish'),
    'матова': ('матова', 'матовая', 'a matt finish'),
    'полірована': ('полірована', 'полированная', 'a polished finish'),
    'gold pvd': ('Gold PVD', 'Gold PVD', 'a Gold PVD coating'),
    'gold pvd, матове полірування':
        ('Gold PVD, матове полірування', 'Gold PVD, матовая полировка', 'a matt Gold PVD coating'),
    'gun metal': ('Gun Metal', 'Gun Metal', 'a Gun Metal finish'),
    # fridges
    'nofrost': ('NoFrost', 'NoFrost', 'No Frost'),
    'defrost (крапельна)': ('крапельне', 'капельное', 'drip defrost'),
    'роторний': ('роторний', 'роторный', 'rotary'),
    'знизу': ('знизу', 'снизу', 'at the bottom'),
    'зверху': ('зверху', 'сверху', 'at the top'),
}
FORMS = {                        # accusative — "на 4 конфорки", "на 14 комплектів"
    'zn_uk': ('конфорку', 'конфорки', 'конфорок'),
    'zn_ru': ('конфорку', 'конфорки', 'конфорок'),
    'st_uk': ('комплект', 'комплекти', 'комплектів'),
    'st_ru': ('комплект', 'комплекта', 'комплектов'),
    'pr_uk': ('програма', 'програми', 'програм'),
    'pr_ru': ('программа', 'программы', 'программ'),
}
BOWLS = {'1': ('однією чашею', 'одной чашей', 'one bowl'),
         '2': ('двома чашами', 'двумя чашами', 'two bowls'),
         '3': ('трьома чашами', 'тремя чашами', 'three bowls')}


# The supplier's own feature list, in three languages. A feature with no
# wording here is shown only in Ukrainian: better one line short in Russian
# than a Ukrainian phrase dropped into a Russian sentence.
FEATURE_TR = {
    # hoods
    'алюмінієвий жировий фільтр': ('алюминиевый жировой фильтр', 'an aluminium grease filter'),
    '2 алюмінієві жирові фільтри': ('2 алюминиевых жировых фильтра', 'two aluminium grease filters'),
    'led освітлення': ('LED-освещение', 'LED lighting'),
    '3 швидкості': ('3 скорости', 'three speeds'),
    'зворотний клапан': ('обратный клапан', 'a backdraught flap'),
    'таймер з автовідключенням': ('таймер с автоотключением', 'a timer with auto-off'),
    'пульт дистанційного керування': ('пульт дистанционного управления', 'a remote control'),
    'периметральне всмоктування': ('периметральное всасывание', 'perimeter extraction'),
    'більш тихий та надійний безщітковий двигун':
        ('более тихий и надёжный бесщёточный двигатель', 'a quieter brushless motor'),
    'дисплей': ('дисплей', 'a display'),
    'електронне управління': ('электронное управление', 'electronic controls'),
    # hobs
    'чавунні решітки': ('чугунные решётки', 'cast-iron pan supports'),
    'газ-контроль': ('газ-контроль', 'flame failure protection'),
    'електропідпалювання': ('электроподжиг', 'electric ignition'),
    'блокування для безпеки дітей': ('блокировка для безопасности детей', 'a child lock'),
    'індикатор залишкового тепла': ('индикатор остаточного тепла', 'a residual heat indicator'),
    'автовідключення': ('автоотключение', 'automatic shut-off'),
    'подвійна система захисту від перегріву':
        ('двойная система защиты от перегрева', 'double overheating protection'),
    'індикатор активної зони нагріву':
        ('индикатор активной зоны нагрева', 'an active-zone indicator'),
    '9 рівнів регулювання потужності':
        ('9 уровней регулировки мощности', 'nine power levels'),
    'таймер': ('таймер', 'a timer'),
    # ovens and microwaves
    'охолодження дверцят духовки': ('охлаждение дверцы духовки', 'a cooled door'),
    'захист від перегріву': ('защита от перегрева', 'overheating protection'),
    'емаль легкого чищення': ('эмаль лёгкой очистки', 'easy-clean enamel'),
    'знімні дверцята і внутрішнє скло для легкого чищення':
        ('съёмная дверца и внутреннее стекло для лёгкой очистки',
         'a removable door and inner glass'),
    'відкладений старт': ('отложенный старт', 'a delayed start'),
    'led-дисплей': ('LED-дисплей', 'an LED display'),
    'автоменю': ('автоменю', 'an auto-menu'),
    'гриль': ('гриль', 'a grill'),
    'решітка для гриля': ('решётка для гриля', 'a grill rack'),
    'розморожування за вагою і за часом':
        ('размораживание по весу и по времени', 'defrosting by weight and by time'),
    'комбінований режим нагріву': ('комбинированный режим нагрева', 'a combined heating mode'),
    'експрес нагрів': ('экспресс-нагрев', 'express heating'),
    # dishwashers
    'аквастоп': ('аквастоп', 'AquaStop'),
    'індикатор наявності солі': ('индикатор наличия соли', 'a salt indicator'),
    'індикатор наявності ополіскувача':
        ('индикатор наличия ополаскивателя', 'a rinse-aid indicator'),
    'половинне завантаження': ('половинная загрузка', 'a half-load option'),
    'регулювання положення верхньої корзини "easy lift up"':
        ('регулировка положения верхней корзины «Easy Lift Up»',
         'a height-adjustable upper basket'),
    # sinks
    'сифон': ('сифон', 'a trap'),
    'прихований перелив': ('скрытый перелив', 'a concealed overflow'),
    'розсувна решітка': ('раздвижная решётка', 'a sliding rack'),
    'кріплення': ('крепление', 'fixings'),
    'монтажний шаблон': ('монтажный шаблон', 'a cutting template'),
    'коландер': ('коландер', 'a colander'),
    'обробна дошка': ('разделочная доска', 'a chopping board'),
    # taps
    'керамічний картридж': ('керамический картридж', 'a ceramic cartridge'),
    'аератор': ('аэратор', 'an aerator'),
    'цинкові ручки': ('цинковые ручки', 'zinc handles'),
    'механічне управління': ('механическое управление', 'mechanical controls'),
    'сенсорне управління': ('сенсорное управление', 'touch controls'),
    'сенсорне управління slide touch control':
        ('сенсорное управление Slide Touch Control', 'Slide Touch Control'),
    '4 швидкості': ('4 скорости', 'four speeds'),
    '5 рівнів потужності': ('5 уровней мощности', 'five power levels'),
    'функція "hand waving" (керування жестами)':
        ('функция «Hand Waving» (управление жестами)', 'gesture control'),
    'гнучкі шланги, 40 см (2 шт.)': ('гибкие шланги, 40 см (2 шт.)', 'two 40 cm hoses'),
    'загартоване скло': ('закалённое стекло', 'toughened glass'),
    'склокерамічна основа ilva (італія)':
        ('стеклокерамика ILVA (Италия)', 'an ILVA glass-ceramic top'),
    'аератор із трирівневим обмежувачем потоку':
        ('аэратор с трёхуровневым ограничителем потока', 'a three-stage flow aerator'),
    'можливість підключення до балонного газу':
        ('возможность подключения к баллонному газу', 'bottled-gas conversion'),
    'режим енергозбереження': ('режим энергосбережения', 'an eco mode'),
    'автоматичне приготування': ('автоматическое приготовление', 'automatic programmes'),
    'інформативний дисплей': ('информативный дисплей', 'an informative display'),
    'функція нагадування': ('функция напоминания', 'a reminder function'),
    'решітка': ('решётка', 'a wire shelf'),
    'деко стандартне': ('противень стандартный', 'a standard baking tray'),
    'деко глибоке': ('противень глубокий', 'a deep baking tray'),
    'кріплення для верхнього монтажу': ('крепление для верхнего монтажа', 'top-mount fixings'),
    'кріплення для нижнього монтажу': ('крепление для нижнего монтажа', 'undermount fixings'),
    'перехідник різьбовий 3/8" на 1/2"':
        ('переходник резьбовой 3/8\" на 1/2\"', 'a 3/8\" to 1/2\" adapter'),
    'лоток для яєць': ('лоток для яиц', 'an egg tray'),
    'можливість перенавішування дверцят':
        ('возможность перенавешивания дверцы', 'a reversible door'),
    'контейнер для зберігання овочів та фруктів':
        ('контейнер для овощей и фруктов', 'a crisper drawer'),
}


def feats(features, lang, limit=4):
    """The first few features, worded for this language."""
    out = []
    for f in features:
        key = f.strip().rstrip('.').lower()
        if lang == 'uk':
            # Lower-case the lead word only when it is an ordinary word. "LED
            # освітлення" and "PVD" are acronyms; lower-casing the first letter
            # alone turned them into "lED".
            head = f.split()[0]
            out.append(f if (head.isupper() and len(head) > 1) or head[:1].isdigit()
                       else f[0].lower() + f[1:])
        else:
            tr = FEATURE_TR.get(key)
            if not tr:
                continue
            out.append(tr[0] if lang == 'ru' else tr[1])
        if len(out) >= limit:
            break
    return out


def listing(items, lang):
    """a, b and c — with the conjunction the language uses.

    Ukrainian alternates і/й for euphony: "й" after a word that ends in a vowel,
    "і" after a consonant. "солі і індикатор" is the kind of thing a reader
    notices without being able to say why.
    """
    if not items:
        return ''
    if len(items) == 1:
        return items[0]
    if lang == 'uk':
        prev = items[-2].rstrip(')"\u00bb ').lower()
        tail = ' й ' if prev[-1:] in 'аеєиіїоуюя' else ' і '
    else:
        tail = {'ru': ' и ', 'en': ' and '}[lang]
    return ', '.join(items[:-1]) + tail + items[-1]


def plural(n, forms):
    n = abs(int(float(n)))
    if n % 10 == 1 and n % 100 != 11:
        return forms[0]
    if 2 <= n % 10 <= 4 and not 12 <= n % 100 <= 14:
        return forms[1]
    return forms[2]


def tr(v):
    """The three wordings of a feed value, or None when nobody has written them."""
    return TERMS.get(str(v or '').strip().lower())


def cap(s):
    return s[0].upper() + s[1:] if s else s


def size(v, lang):
    """Dimensions as the feed writes them, with the unit in the right language."""
    if not v:
        return None
    return v.replace(' мм', ' mm').replace(' см', ' cm') if lang == 'en' else v


def sentences(cat, s):
    """Three parallel lists of sentences — uk, ru, en — built from stated facts."""
    uk, ru, en = [], [], []
    g = s.get

    def add(u, r, e):
        """A language with nothing to say about this fact simply skips it."""
        if u:
            uk.append(u)
        if r:
            ru.append(r)
        if e:
            en.append(e)

    def worded(key, u_fmt, r_fmt, e_fmt):
        v = tr(g(key))
        if v:
            add(u_fmt.format(v[0]), r_fmt.format(v[1]), e_fmt.format(v[2]))

    if cat == 'duhovi-shafy':
        v, f = g('volume_l'), g('functions')
        if v and f:
            add(f'Вбудована електрична духова шафа об’ємом {v} л із {f} функціями.',
                f'Встраиваемый электрический духовой шкаф объёмом {v} л с {f} функциями.',
                f'A built-in electric oven with a {v}-litre cavity and {f} functions.')
        elif v:
            add(f'Вбудована електрична духова шафа об’ємом {v} л.',
                f'Встраиваемый электрический духовой шкаф объёмом {v} л.',
                f'A built-in electric oven with a {v}-litre cavity.')
        worded('control', 'Керування — {}.', 'Управление — {}.', 'It has {}.')
        worded('cleaning', 'Очищення — {}.', 'Очистка — {}.', 'It offers {}.')
        if g('eclass'):
            add(f'Клас енергоспоживання — {g("eclass")}.',
                f'Класс энергопотребления — {g("eclass")}.', f'Energy class {g("eclass")}.')
    elif cat == 'varylni-poverhni':
        t, b = tr(g('hob_type')), g('burners')
        n = int(b) if b else 0
        zones = f'{n} cooking {"zone" if n == 1 else "zones"}'
        if t and b:
            add(f'{cap(t[0])} варильна поверхня на {n} {plural(n, FORMS["zn_uk"])}.',
                f'{cap(t[1])} варочная поверхность на {n} {plural(n, FORMS["zn_ru"])}.',
                f'{"An" if t[2][0] in "aeiou" else "A"} {t[2]} hob with {zones}.')
        elif t:
            add(f'{cap(t[0])} варильна поверхня.', f'{cap(t[1])} варочная поверхность.',
                f'{"An" if t[2][0] in "aeiou" else "A"} {t[2]} hob.')
        elif b:
            add(f'Варильна поверхня на {n} {plural(n, FORMS["zn_uk"])}.',
                f'Варочная поверхность на {n} {plural(n, FORMS["zn_ru"])}.',
                f'A hob with {zones}.')
        worded('control', 'Керування — {}.', 'Управление — {}.', 'It has {}.')
    elif cat == 'vytyazhky':
        a = g('airflow')
        if a:
            add(f'Кухонна витяжка продуктивністю {a} м³/год.',
                f'Кухонная вытяжка производительностью {a} м³/ч.',
                f'A kitchen hood moving {a} m³/h.')
        else:
            add('Кухонна витяжка.', 'Кухонная вытяжка.', 'A kitchen hood.')
        if g('noise_db'):
            add(f'На максимумі — {g("noise_db")} дБ.', f'На максимуме — {g("noise_db")} дБ.',
                f'At full speed it runs at {g("noise_db")} dB.')
        if g('motor_w'):
            add(f'Потужність двигуна — {g("motor_w")} Вт.',
                f'Мощность двигателя — {g("motor_w")} Вт.', f'The motor draws {g("motor_w")} W.')
        if g('recirc'):
            add('Працює і на витяжку, і на рециркуляцію — з вугільним фільтром, без виводу назовні.',
                'Работает и на вытяжку, и на рециркуляцию — с угольным фильтром, без вывода наружу.',
                'It works ducted or recirculating, with a charcoal filter and no outside vent.')
    elif cat == 'myyky':
        d, bw = g('bowl_dims') or g('dims'), BOWLS.get(str(g('bowls')))
        if d and bw:
            add(f'Кухонна мийка {size(d, "uk")} з {bw[0]}.',
                f'Кухонная мойка {size(d, "ru")} с {bw[1]}.',
                f'A kitchen sink, {size(d, "en")}, with {bw[2]}.')
        elif d:
            add(f'Кухонна мийка {size(d, "uk")}.', f'Кухонная мойка {size(d, "ru")}.',
                f'A kitchen sink, {size(d, "en")}.')
        elif bw:
            add(f'Кухонна мийка з {bw[0]}.', f'Кухонная мойка с {bw[1]}.',
                f'A kitchen sink with {bw[2]}.')
        worded('material', 'Матеріал — {}.', 'Материал — {}.', 'It is made of {}.')
        worded('mount',
               'Встановлення {} — зміряйте виріз у стільниці до замовлення.',
               'Установка {} — измерьте вырез в столешнице до заказа.',
               'It is an {} sink — measure the worktop cut-out before ordering.')
        if g('flange'):
            add(f'Діаметр фланця — {g("flange")} мм.', f'Диаметр фланца — {g("flange")} мм.',
                f'The waste outlet is {g("flange")} mm.')
    elif cat == 'zmishuvachi':
        t = tr(g('tap_type'))
        if t:
            add(f'{cap(t[0])} кухонний змішувач.', f'{cap(t[1])} кухонный смеситель.',
                f'A {t[2]} kitchen mixer tap.')
        else:
            add('Кухонний змішувач.', 'Кухонный смеситель.', 'A kitchen mixer tap.')
        worded('material', 'Корпус — {}.', 'Корпус — {}.', 'The body is {}.')
        worded('finish', 'Покриття — {}.', 'Покрытие — {}.', 'It has {}.')
        worded('spout', 'Вилив {}.', 'Излив {}.', 'It has {} spout.')
    elif cat == 'dozatory':
        v = g('volume_ml')
        if v:
            add(f'Врізний дозатор для миючого засобу на {v} мл.',
                f'Врезной дозатор для моющего средства на {v} мл.',
                f'A built-in washing-up liquid dispenser holding {v} ml.')
        else:
            add('Врізний дозатор для миючого засобу.', 'Врезной дозатор для моющего средства.',
                'A built-in washing-up liquid dispenser.')
        worded('material', 'Корпус — {}.', 'Корпус — {}.', 'The body is {}.')
        if g('hole_mm'):
            h = str(g('hole_mm'))
            add(f'Монтажний отвір — {h.replace(".", ",")} мм.',
                f'Монтажное отверстие — {h.replace(".", ",")} мм.',
                f'It needs a {h} mm hole.')
    elif cat == 'mikrohvylovi-pechi':
        v, p = g('volume_l'), g('power_mw')
        if v and p:
            add(f'Вбудована мікрохвильова піч на {v} л, {p} Вт мікрохвиль.',
                f'Встраиваемая микроволновая печь на {v} л, {p} Вт микроволн.',
                f'A built-in microwave of {v} litres rated {p} W.')
        elif p:
            add(f'Вбудована мікрохвильова піч, {p} Вт мікрохвиль.',
                f'Встраиваемая микроволновая печь, {p} Вт микроволн.',
                f'A built-in microwave rated {p} W.')
        else:
            add('Вбудована мікрохвильова піч.', 'Встраиваемая микроволновая печь.',
                'A built-in microwave.')
        if g('power_grill'):
            add(f'Гриль на {g("power_grill")} Вт.', f'Гриль на {g("power_grill")} Вт.',
                f'The grill adds {g("power_grill")} W.')
        worded('control', 'Керування — {}.', 'Управление — {}.', 'It has {}.')
    elif cat == 'posudomyyni-mashyny':
        st, pr = g('sets'), g('programs')
        if st:
            n = int(st)
            add(f'Вбудована посудомийна машина на {n} {plural(n, FORMS["st_uk"])} посуду.',
                f'Встраиваемая посудомоечная машина на {n} {plural(n, FORMS["st_ru"])} посуды.',
                f'A built-in dishwasher for {n} place settings.')
        else:
            add('Вбудована посудомийна машина.', 'Встраиваемая посудомоечная машина.',
                'A built-in dishwasher.')
        if pr:
            n = int(pr)
            add(f'{n} {plural(n, FORMS["pr_uk"])} миття.',
                f'{n} {plural(n, FORMS["pr_ru"])} мойки.', f'{n} washing programmes.')
        if g('eclass'):
            add(f'Клас енергоспоживання — {g("eclass")}.',
                f'Класс энергопотребления — {g("eclass")}.', f'Energy class {g("eclass")}.')
        if g('noise_db'):
            add(f'Рівень шуму — {g("noise_db")} дБ.', f'Уровень шума — {g("noise_db")} дБ.',
                f'It runs at {g("noise_db")} dB.')
    elif cat == 'holodylnyky':
        v, fr, fz = g('volume_l'), g('vol_fridge'), g('vol_freezer')
        two = str(g('fridge_type') or '').lower().startswith('двокамер')
        if v:
            add(f'{"Двокамерний" if two else "Однокамерний"} холодильник на {v} л.',
                f'{"Двухкамерный" if two else "Однокамерный"} холодильник на {v} л.',
                f'{"A two-door" if two else "A single-door"} fridge of {v} litres.')
        if fr and fz:
            add(f'Корисний об’єм — {fr} л холодильна камера і {fz} л морозильна.',
                f'Полезный объём — {fr} л холодильная камера и {fz} л морозильная.',
                f'Usable capacity is {fr} l in the fridge and {fz} l in the freezer.')
        worded('freezer_pos', 'Морозильна камера — {}.', 'Морозильная камера — {}.',
               'The freezer sits {}.')
        worded('defrost', 'Розморожування — {}.', 'Размораживание — {}.', 'Defrosting is {}.')
        if g('eclass'):
            add(f'Клас енергоспоживання — {g("eclass")}.',
                f'Класс энергопотребления — {g("eclass")}.', f'Energy class {g("eclass")}.')

    if g('niche'):
        add(f'Розміри ніші під встановлення — {size(g("niche"), "uk")}, '
            f'габарити — {size(g("dims"), "uk")}.' if g('dims') else
            f'Розміри ніші під встановлення — {size(g("niche"), "uk")}.',
            f'Размеры ниши под установку — {size(g("niche"), "ru")}, '
            f'габариты — {size(g("dims"), "ru")}.' if g('dims') else
            f'Размеры ниши под установку — {size(g("niche"), "ru")}.',
            f'The cut-out measures {size(g("niche"), "en")}, the appliance '
            f'{size(g("dims"), "en")}.' if g('dims') else
            f'The cut-out measures {size(g("niche"), "en")}.')
    elif g('dims') and cat != 'myyky':
        add(f'Габарити — {size(g("dims"), "uk")}.', f'Габариты — {size(g("dims"), "ru")}.',
            f'It measures {size(g("dims"), "en")}.')
    if g('warranty'):
        w = str(g('warranty')).lower()
        years = re.search(r'(\d+)', w)
        add(f'Гарантія — {w}.',
            f'Гарантия — {years.group(1)} ' + plural(int(years.group(1)),
                ('год', 'года', 'лет')) + '.' if years else None,
            f'{years.group(1)}-year warranty.' if years else None)
    return uk, ru, en


FEATURE_LEAD = {
    'uk': 'З того, що варто відзначити: {}.',
    'ru': 'Из того, что стоит отметить: {}.',
    'en': 'Worth noting: {}.',
}


def describe(cat, specs, model, prefix, features=()):
    uk, ru, en = sentences(cat, specs)
    tail = ('Доставка по Сумах, оплата після отримання.',
            'Доставка по Сумам, оплата после получения.',
            'Delivery in Sumy, payment on receipt.')
    for i, (lst, key) in enumerate(((uk, 'uk'), (ru, 'ru'), (en, 'en'))):
        if not lst:                              # the feed said almost nothing
            lst.append(f'{prefix[key]} {BRAND} {model}.')
        # The supplier's feature list, in this language, before the delivery
        # line. Two or more, or it reads as an afterthought.
        picked = feats(features, key)
        if len(picked) >= 2:
            lst.append(FEATURE_LEAD[key].format(listing(picked, key)))
        lst.append(tail[i])
    return ' '.join(uk), ' '.join(ru), ' '.join(en)


def specs_with_features(it):
    s = collections.OrderedDict(it['specs'])
    if it.get('features'):
        s['features'] = it['features']
    return s


def main(feed, refresh=False):
    cats = json.load(io.open(ROOT / 'data' / 'categories.json', encoding='utf-8'))
    path = ROOT / 'data' / 'products.json'
    products = json.load(io.open(path, encoding='utf-8'), object_pairs_hook=collections.OrderedDict)
    have = {p['slug'] for p in products}
    items = gh_extract.load(feed)
    added = updated = skipped = rephoto = respec = 0
    gone = []
    for it in items:
        cat = cats.get(it['cat'])
        if not cat:
            print(f'  !! немає категорії {it["cat"]}')
            continue
        photos_dir = ROOT / 'assets' / 'img' / 'products' / it['slug']
        photos = sorted(photos_dir.glob('[0-9]*.webp'),
                        key=lambda f: int(f.stem)) if photos_dir.exists() else []
        if not photos:
            print(f'  !! {it["slug"]}: немає оброблених фото — пропускаю')
            skipped += 1
            continue
        if it['slug'] in have:                  # refresh: price and photos; the copy is ours
            old = next(p for p in products if p['slug'] == it['slug'])
            price = int(round(it['price'] * MARKUP))
            if old.get('price') != price:
                old['price'] = price
                updated += 1
            # The photo list is derived from what is on disk, so it has to be
            # re-read: reprocessing the cutouts changes how many frames a
            # product keeps, and a stale list points at files that are gone.
            shots = [f'/assets/img/products/{it["slug"]}/{f.stem}.webp' for f in photos]
            if old.get('photos') != shots:
                old['photos'] = shots
                old['thumb'] = f'/assets/img/products/{it["slug"]}/thumb.webp'
                rephoto += 1
            # Every page says "in stock", so a product the supplier has stopped
            # holding has to be taken off by hand. Say so rather than let the
            # site keep promising it.
            if not it['available']:
                gone.append(it['slug'])
            if refresh:
                # The extractor reads more than it used to, so the specs and the
                # copy derived from them are rebuilt. The price and the photo
                # list are handled above; nothing a person edited by hand lives
                # in these fields.
                old['specs'] = specs_with_features(it)
                u, r, e = describe(it['cat'], it['specs'], it['model'],
                                   cat['productPrefix'], it['features'])
                old['desc_uk'], old['desc_ru'], old['desc_en'] = u, r, e
                respec += 1
            continue
        if not it['available']:
            print(f'  !! {it["slug"]}: постачальник не має в наявності — не додаю')
            skipped += 1
            continue
        prefix = cat['productPrefix']
        uk, ru, en = describe(it['cat'], it['specs'], it['model'], prefix, it['features'])
        products.append(collections.OrderedDict([
            ('brand', BRAND), ('series', it['model']),
            ('name', f'{prefix["uk"]} {BRAND} {it["model"]}'),
            ('name_ru', f'{prefix["ru"]} {BRAND} {it["model"]}'),
            ('name_en', f'{prefix["en"]} {BRAND} {it["model"]}'),
            ('price', int(round(it['price'] * MARKUP))), ('category', it['cat']),
            ('specs', specs_with_features(it)),
            ('desc_uk', uk), ('desc_ru', ru), ('desc_en', en),
            ('slug', it['slug']),
            ('thumb', f'/assets/img/products/{it["slug"]}/thumb.webp'),
            ('photos', [f'/assets/img/products/{it["slug"]}/{f.stem}.webp' for f in photos]),
        ]))
        added += 1
    io.open(path, 'w', encoding='utf-8', newline='\n').write(
        json.dumps(products, ensure_ascii=False, indent=2) + '\n')
    print(f'додано {added}, оновлено цін {updated}, оновлено фото {rephoto}, '
          f'переписано карток {respec}, пропущено {skipped}; усього товарів {len(products)}')
    if gone:
        print('  !! зникли з наявності у постачальника, зніміть із сайту вручну:')
        for slug in gone:
            print(f'     {slug}')


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    main(args[0], refresh='--refresh' in sys.argv[1:])
