# -*- coding: utf-8 -*-
"""Spec mapping for scripts/import_supplier_list.py.

Turns a product card's characteristic table (Ukrainian labels as published)
into the spec keys data/categories.json renders for each category. Only values
the card states are written; a missing label leaves the key out.
"""
import re

LAT = str.maketrans("АВСЕНКМОРТХ", "ABCEHKMOPTX")


def num(v):
    m = re.search(r"-?\d+(?:[.,]\d+)?", str(v or ""))
    return float(m.group(0).replace(",", ".")) if m else None


def n_str(v):
    x = num(v)
    if x is None:
        return None
    return str(int(x)) if x == int(x) else ("%g" % x)


def eclass(v):
    """'E (А+)' -> 'E (нове маркування)'; 'А++' -> 'A++'; 'B' -> 'B (нове маркування)'."""
    if not v:
        return None
    first = str(v).split("(")[0].strip().translate(LAT)
    if re.fullmatch(r"[A-G]", first):
        return f"{first} (нове маркування)"
    return first or None


def warranty(v):
    if not v:
        return None
    s = str(v)
    m = re.search(r"(\d+)\s*місяц", s)
    if not m:
        return None
    mo = int(m.group(1))
    out = {12: "1 рік", 24: "2 роки", 36: "3 роки", 60: "5 років"}.get(mo, f"{mo} міс.")
    ten = re.search(r"10 рок\w* (?:гарантії )?на (?:інверторн\w+ )?(компресор|двигун)", s)
    if ten:
        out += f" ({ten.group(1)} — 10 років)"
    return out


def first_items(v, n=6):
    if not v:
        return None
    parts = [p.strip(" ;,.") for p in re.split(r"[;,]", str(v)) if p.strip(" ;,.")]
    parts = [p for p in parts if len(p) <= 60 and "Кількість компресорів" not in p]
    return ", ".join(parts[:n]) or None


def hwd(ch):
    h, w, d = num(ch.get("Висота")), num(ch.get("Ширина")), num(ch.get("Глибина"))
    g = next((v for k, v in ch.items() if k.startswith("Габарити")), None)
    if g and not (h and w and d):
        xs = re.findall(r"\d+(?:[.,]\d+)?", g.replace(",", "."))
        if len(xs) >= 3:
            h, w, d = (float(x) for x in xs[:3])
            if re.search(r"ш\s*[xх×]\s*в", g, re.I):   # some cards write the triple as Ш×В×Г
                h, w = w, h
    return h, w, d


def g(x):
    return "%g" % x


def mm(x):
    return "%g" % round(x * 10)


def niche(ch):
    """Niche size as '58.5-59.5 × 56-56.8 × 55 см (В×Ш×Г)', whatever way the card wrote it."""
    v = next((v for k, v in ch.items() if k.startswith("Розміри ніші")), None)
    if not v:
        return None
    t = str(v).replace(",", ".")
    mm_ = "мм" in t
    t = re.sub(r"\s*(?:мм|см)", "", t)
    t = re.sub(r"\s*-\s*", "-", t)
    t = re.sub(r"\s*[xх×]\s*", " × ", t, flags=re.I).strip(" .")
    if mm_:
        t = re.sub(r"\d+(?:\.\d+)?", lambda m: "%g" % (float(m.group()) / 10), t)
    t = re.sub(r"\d+\.\d+", lambda m: "%g" % float(m.group()), t)
    return t + " см (В×Ш×Г)"


def map_fridge(ch, kind, typ):
    s = {}
    if kind == "freezer":
        s["fridge_type"] = "Морозильна скриня" if "скрин" in typ.lower() else "Морозильна камера"
    else:
        t = ch.get("Тип холодильника") or "Двокамерний"
        if "Side" in typ:
            t = "Side-by-Side"
        elif "Вбудован" in typ or "Вбудован" in (ch.get("Спосіб встановлення") or ""):
            t = "Вбудований " + t.lower()
        s["fridge_type"] = t
    vol = num(ch.get("Загальний об'єм холодильника") or ch.get("Загальний об'єм"))
    if vol:
        s["volume_l"] = int(vol)
    vf, vz = num(ch.get("Корисний об'єм холодильної камери")), num(ch.get("Корисний об'єм морозильної камери"))
    if vf and kind != "freezer":
        s["vol_fridge"] = int(vf)
    if vz and kind != "freezer":
        s["vol_freezer"] = int(vz)
    pos = ch.get("Розташування морозильної камери") or ""
    pos = {"Нижнє": "Знизу", "Верхнє": "Зверху"}.get(pos, "Збоку" if ("Біч" in pos or "Бок" in pos) else None)
    if pos and kind != "freezer" and s.get("fridge_type") != "Side-by-Side":
        s["freezer_pos"] = pos
    fr = ch.get("Система розморожування холодильної камери") or ""
    fz = ch.get("Система розморожування морозильної камери") or ""
    tech = ch.get("Фірмові технології") or ""
    nofrost = False
    if "No Frost" in fz or "No Frost" in fr:
        nofrost = "No Frost" in fz
        if "Dual" in fz or "Dual" in fr:
            s["defrost"] = "Dual No Frost"
        elif "Plus" in fz:
            s["defrost"] = "No Frost Plus"
        elif "No Frost" in fr and "No Frost" in fz:
            s["defrost"] = "Total No Frost" if "Total" in tech else "No Frost"
        else:
            s["defrost"] = "No Frost (морозильна камера)"
    elif kind == "freezer":
        cool = ch.get("Система охолодження морозильної камери") or ""
        if "No Frost" in cool:
            s["defrost"], nofrost = "No Frost", True
        elif cool:
            s["defrost"] = "Ручне"
    elif fr:
        s["defrost"] = "Крапельне"
    e = eclass(ch.get("Клас енергоспоживання"))
    if e:
        s["eclass"] = e
    k = num(ch.get("Річні витрати електроенергії"))
    if k:
        s["kwh_year"] = f"{n_str(k)} кВт·год/рік"
    comp = ch.get("Тип компресора")
    if comp:
        s["compressor"] = comp
    h, w, d = hwd(ch)
    if h and w and d:
        s["dims"] = f"{g(h)} × {g(w)} × {g(d)} см"
    if h:
        s["height_cm"] = int(h) if h == int(h) else h
    if w:
        s["width_cm"] = g(w)
    nd = n_str(ch.get("Рівень шуму"))
    if nd:
        s["noise_db"] = nd
    cl = (ch.get("Кліматичний клас") or "").split("(")[0].strip()
    if cl:
        s["climate"] = cl
    fc = num(ch.get("Потужність заморожування"))
    if fc:
        s["freeze_cap"] = f"{n_str(fc)} кг/добу"
    ctl = ch.get("Тип керування")
    if ctl:
        s["control"] = ctl + (", зовнішній дисплей" if (ch.get("Дисплей") or "") == "Зовнішній" else "")
    wr = warranty(ch.get("Гарантія"))
    if wr:
        s["warranty"] = wr.replace("двигун", "компресор")  # cards say "двигун"; in a fridge that part is the compressor
    wk = num(ch.get("Вага"))
    if wk:
        s["weight_kg"] = n_str(wk)
    ft = first_items(tech) or first_items(ch.get("Особливості"), 5)
    if ft:
        s["features"] = ft
    return s, {"nofrost": nofrost, "inverter": "Інвертор" in (comp or "")}


def map_washer(ch, kind, typ):
    s = {}
    if kind != "dryer" and ch.get("Тип завантаження"):
        lt = ch["Тип завантаження"]
        s["load_type"] = "Фронтальне" if "фронтал" in lt.lower() else ("Вертикальне" if "вертикал" in lt.lower() else lt)
    kg = num(ch.get("Максимальне завантаження білизни"))
    if kg:
        s["load_kg"] = int(kg) if kg == int(kg) else kg
    dk = num(ch.get("Кількість білизни під час сушіння"))
    if dk:
        s["dry_kg"] = n_str(dk)
    rpm = num(ch.get("Максимальна швидкість віджимання"))
    if rpm:
        s["rpm"] = int(rpm)
    e = eclass(ch.get("Клас енергоспоживання"))
    if e:
        s["eclass"] = e
    mot = ch.get("Тип двигуна")
    if mot:
        s["motor"] = mot
    pr = num(ch.get("Кількість програм") or ch.get("Кількість програм сушіння"))
    if pr:
        s["programs"] = int(pr)
    blob = " ".join(str(ch.get(k) or "") for k in ("Особливості", "Технічні особливості", "Фірмові технології",
                                                   "Функції", "Smart функції", "Програми прання")).lower()
    if " пар" in blob or "парою" in blob or "steam" in blob:
        s["steam"] = "Так"
    if "дисплей" in (blob + " " + str(ch.get("Функції та можливості") or "").lower()):
        s["display"] = "Так"
    h, w, d = hwd(ch)
    if h and w and d:
        s["dims"] = f"{g(w)} × {g(d)} × {g(h)} см"
    if d:
        s["depth"] = g(d)
    nw, ns = n_str(ch.get("Рівень шуму прання")), n_str(ch.get("Рівень шуму віджиму"))
    if nw and ns:
        s["noise_wm"] = f"{nw} / {ns} дБ"
    elif n_str(ch.get("Рівень шуму")):
        s["noise_wm"] = f"{n_str(ch.get('Рівень шуму'))} дБ"
    if ch.get("Технологія сушіння"):
        s["dry_tech"] = ch["Технологія сушіння"]
    wk = num(ch.get("Вага"))
    if wk:
        s["weight"] = f"{n_str(wk)} кг"
    wr = warranty(ch.get("Гарантія"))
    if wr:
        s["warranty"] = wr
    ft = first_items(ch.get("Фірмові технології")) or first_items(ch.get("Smart функції"), 4)
    if ft:
        s["features"] = ft
    return s, {"inverter": "Інвертор" in (mot or "")}


def map_micro(ch, kind, typ):
    s = {}
    v = num(ch.get("Об'єм"))
    if v:
        s["volume_l"] = n_str(v)
    p = num(ch.get("Потужність"))
    if p:
        s["power_mw"] = n_str(p)
    gr = num(ch.get("Потужність гриля"))
    if gr:
        s["power_grill"] = n_str(gr)
    for src, k in (("Тип керування", "control"), ("Колір", "color"), ("Тип внутрішнього покриття", "cavity")):
        if ch.get(src):
            s[k] = ch[src]
    h, w, d = hwd(ch)
    if h and w and d:
        s["dims"] = f"{mm(w)} × {mm(h)} × {mm(d)} мм"
        s["width_cm"] = "%g" % round(w)
    ni = niche(ch)
    if ni:
        s["niche"] = ni
    ft = first_items(ch.get("Додатково")) or first_items(ch.get("Функції та спеціальні програми"), 5)
    if ft:
        s["features"] = ft
    return s, {}


def map_oven(ch, kind, typ):
    s = {}
    v = num(ch.get("Об'єм"))
    if v:
        s["volume_l"] = n_str(v)
    f = num(ch.get("Кількість програм") or ch.get("Кількість функцій"))
    if f:
        s["functions"] = n_str(f)
    ctl = ch.get("Керування духовкою") or ch.get("Тип керування")
    if ctl:
        s["control"] = ctl
    blob = " ".join(str(ch.get(k) or "") for k in ("Додаткові характеристики", "Тип очищення", "Очищення",
                                                   "Додаткові функції")).lower()
    for word, val in (("піроліт", "Піролітичне"), ("гідроліт", "Гідролітичне"), ("каталіт", "Каталітичне"),
                      ("steam", "Парове"), ("парою", "Парове")):
        if word in blob:
            s["cleaning"] = val
            break
    e = eclass(ch.get("Клас енергоспоживання"))
    if e:
        s["eclass"] = e
    if ch.get("Колір"):
        s["color"] = ch["Колір"]
    h, w, d = hwd(ch)
    if h and w and d:
        s["dims"] = f"{mm(w)} × {mm(h)} × {mm(d)} мм"
        s["width_cm"] = "%g" % round(w)
    ni = niche(ch)
    if ni:
        s["niche"] = ni
    lo, hi = num(ch.get("Мінімальна температура приготування")), num(ch.get("Максимальна температура приготування"))
    if lo and hi:
        s["temp_range"] = f"{n_str(lo)}–{n_str(hi)} °C"
    if ch.get("Напрямні для деко"):
        s["rails"] = ch["Напрямні для деко"]
    ft = first_items(ch.get("Оснащення"), 5) or first_items(ch.get("Додаткові функції"), 5)
    if ft:
        s["features"] = ft
    return s, {}


def map_dish(ch, kind, typ):
    s = {}
    for src, k in (("Місткість комплектів", "sets"), ("Кількість програм", "programs")):
        x = num(ch.get(src))
        if x:
            s[k] = n_str(x)
    e = eclass(ch.get("Клас енергоспоживання"))
    if e:
        s["eclass"] = e
    nd = n_str(ch.get("Рівень шуму"))
    if nd:
        s["noise_db"] = nd
    vid = ch.get("Вид") or ""
    w = num(ch.get("Ширина"))
    if w:
        s["width_cm"] = "%g" % round(w)
    elif "Вузьк" in vid:
        s["width_cm"] = "45"
    elif "Повногабарит" in vid:
        s["width_cm"] = "60"
    col = ch.get("Колір корпусу") or ch.get("Колір")
    if col:
        s["color"] = col
    ni = niche(ch)
    if ni:
        s["niche"] = ni
    for src, k in (("Клас мийки", "wash_class"), ("Клас сушіння", "dry_class")):
        if ch.get(src):
            s[k] = str(ch[src]).translate(LAT)
    kw = num(ch.get("Споживання електроенергії за цикл"))
    if kw:
        s["kwh_cycle"] = n_str(kw)
    wl = ch.get("Витрата води") or ""
    per = re.search(r"(\d+(?:[.,]\d+)?)\s*л/цикл", wl)   # "2660/ 9.5 л/цикл" is a year and a cycle
    if per:
        s["water_l"] = n_str(per.group(1))
    elif wl and "рік" not in wl and num(wl):
        s["water_l"] = n_str(wl)
    ft = first_items(ch.get("Фірмові технології")) or first_items(ch.get("Особливості"), 5)
    if ft:
        s["features"] = ft
    return s, {}


def map_vacuum(ch, kind, typ):
    s = {}
    t = ch.get("Тип") or ""
    s["vac_type"] = "Вертикальний акумуляторний" + (" 3 в 1" if "3 в 1" in t else "")
    # numbers, so build.mjs adds the unit in the page's language (fmt watt / mins / litres / db / kg)
    for src, k in (("Потужність всмоктування", "suction_w"), ("Час роботи на одному заряді", "runtime"),
                   ("Ємність пилозбірника", "dust_l"), ("Рівень шуму", "noise_db"), ("Вага", "weight_kg")):
        v = num(ch.get(src))
        if v:
            s[k] = int(v) if v == int(v) else v
    v = num(ch.get("Час повного заряджання"))
    if v:
        s["charge_h"] = f"{n_str(v)} год"
    if ch.get("Тип прибирання"):
        s["clean_type"] = ch["Тип прибирання"].replace(", Повноцінне миття", "")
    if ch.get("Тип пилозбірника"):
        s["dust_type"] = ch["Тип пилозбірника"]
    if ch.get("Тип акумулятора"):
        s["battery"] = ch["Тип акумулятора"]
    if ch.get("Насадки"):
        s["nozzles"] = ch["Насадки"]
    elif ch.get("Кількість насадок"):
        s["nozzles"] = ch["Кількість насадок"] + " шт."
    g = ch.get("Габарити (ВхШхГ)")
    if g:
        xs = re.findall(r"\d+(?:[.,]\d+)?", g.replace(",", "."))
        if len(xs) >= 3:
            s["dims"] = " × ".join("%g" % float(x) for x in xs[:3]) + " см"
    col = ch.get("Колір виробу") or ch.get("Колір")
    if col:
        s["color"] = col
    wr = warranty((ch.get("Гарантія") or "").replace("мотор", "двигун"))
    if wr:
        s["warranty"] = wr
    ft = first_items(ch.get("Фірмові технології"))
    if ft:
        s["features"] = ft
    return s, {}


MAPPERS = {"fridge": map_fridge, "freezer": map_fridge, "washer": map_washer, "dryer": map_washer,
           "micro": map_micro, "oven": map_oven, "dish": map_dish,
           "vacuum": map_vacuum}
