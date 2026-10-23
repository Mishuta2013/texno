# -*- coding: utf-8 -*-
"""Product descriptions for scripts/import_supplier_list.py, in uk / ru / en.

Every sentence is built from one fact of the model's own spec table and is
dropped when that fact is missing. Only numbers and Latin trade names go into
the Russian and English sentences, so no Ukrainian value leaks into them.
"""
from supplier_specs import num


def _j(parts):
    return " ".join(p for p in parts if p)


def _fmt(x, en=False):
    if x is None:
        return None
    return "%g" % x if en else ("%g" % x).replace(".", ",")


def pl(n, one, few, many):
    """Slavic plural: 1 програма, 2 програми, 5 програм."""
    n = int(n)
    if n % 10 == 1 and n % 100 != 11:
        return one
    if 2 <= n % 10 <= 4 and not 12 <= n % 100 <= 14:
        return few
    return many


def _up(t):
    return t[:1].upper() + t[1:] if t else t


def fridge(b, m, s, kind):
    vol, h = s.get("volume_l"), num(s.get("height_cm"))
    vf, vz = s.get("vol_fridge"), s.get("vol_freezer")
    t = s.get("fridge_type", "")
    nf = "No Frost" in (s.get("defrost") or "")
    inv = "Інвертор" in (s.get("compressor") or "")
    noise, kwh = s.get("noise_db"), num(s.get("kwh_year"))
    feat, w = s.get("features"), s.get("warranty")
    if kind == "freezer":
        chest = "скриня" in t
        uk = [f"{b} {m} — {'морозильна скриня' if chest else 'морозильна камера'}"
              + (f" на {vol} л" if vol else "") + ": запаси м’яса, риби та заморожених овочів на кілька тижнів наперед."]
        ru = [f"{b} {m} — {'морозильный ларь' if chest else 'морозильная камера'}"
              + (f" на {vol} л" if vol else "") + ": запасы мяса, рыбы и замороженных овощей на несколько недель вперёд."]
        en = [f"The {b} {m} is {'a chest freezer' if chest else 'an upright freezer'}"
              + (f" with {vol} litres" if vol else "") + " — room for weeks of meat, fish and frozen vegetables."]
    else:
        sbs = t == "Side-by-Side"
        built = t.startswith("Вбудован")
        kind_uk = "двокамерний холодильник Side-by-Side" if sbs else ("вбудований холодильник" if built else "двокамерний холодильник")
        kind_ru = "двухкамерный холодильник Side-by-Side" if sbs else ("встраиваемый холодильник" if built else "двухкамерный холодильник")
        kind_en = "a Side-by-Side refrigerator" if sbs else ("a built-in refrigerator" if built else "a two-compartment refrigerator")
        uk = [f"{b} {m} — {kind_uk}" + (f" на {vol} л" if vol else "") + (f" заввишки {_fmt(h)} см" if h else "") + "."]
        ru = [f"{b} {m} — {kind_ru}" + (f" на {vol} л" if vol else "") + (f" высотой {_fmt(h)} см" if h else "") + "."]
        en = [f"The {b} {m} is {kind_en}" + (f" holding {vol} litres" if vol else "") + (f", {_fmt(h, True)} cm tall" if h else "") + "."]
        if vf and vz:
            uk.append(f"Холодильна камера — {vf} л, морозильна — {vz} л.")
            ru.append(f"Холодильная камера — {vf} л, морозильная — {vz} л.")
            en.append(f"{vf} litres of fridge and {vz} litres of freezer space.")
    if nf:
        uk.append("No Frost не дає наростати льоду — розморожувати вручну не доведеться.")
        ru.append("No Frost не даёт нарастать льду — размораживать вручную не придётся.")
        en.append("No Frost keeps ice from building up, so there is no manual defrosting.")
    if inv:
        uk.append("Інверторний компресор працює рівно й тихо" + (f" — близько {noise} дБ" if noise else "")
                  + (f", а за рік витрачає приблизно {_fmt(kwh)} кВт·год" if kwh else "") + ".")
        ru.append("Инверторный компрессор работает ровно и тихо" + (f" — около {noise} дБ" if noise else "")
                  + (f", а за год тратит примерно {_fmt(kwh)} кВт·ч" if kwh else "") + ".")
        en.append("The inverter compressor runs smoothly and quietly" + (f" at about {noise} dB" if noise else "")
                  + (f", using roughly {_fmt(kwh, True)} kWh a year" if kwh else "") + ".")
    elif kwh:
        uk.append(f"Споживання — близько {_fmt(kwh)} кВт·год на рік.")
        ru.append(f"Потребление — около {_fmt(kwh)} кВт·ч в год.")
        en.append(f"It uses about {_fmt(kwh, True)} kWh a year.")
    return uk, ru, en, feat, w


def washer(b, m, s, kind):
    kg, rpm, pr = s.get("load_kg"), s.get("rpm"), s.get("programs")
    d = num(s.get("depth"))
    inv = "Інвертор" in (s.get("motor") or "")
    steam = s.get("steam") == "Так"
    dt, dk = s.get("dry_tech") or "", s.get("dry_kg")
    feat, w = s.get("features"), s.get("warranty")
    if kind == "dryer":
        hp = "насос" in dt.lower()
        uk = [f"{b} {m} — сушильна машина" + (f" на {kg} кг" if kg else "") + "."]
        ru = [f"{b} {m} — сушильная машина" + (f" на {kg} кг" if kg else "") + "."]
        en = [f"The {b} {m} is a tumble dryer" + (f" for {kg} kg loads" if kg else "") + "."]
        if hp:
            uk.append("Тепловий насос сушить при нижчій температурі — бережно до тканин і з меншими рахунками за світло.")
            ru.append("Тепловой насос сушит при более низкой температуре — бережно к тканям и с меньшими счетами за свет.")
            en.append("A heat pump dries at a lower temperature — gentler on fabrics and cheaper to run.")
        if pr:
            uk.append(f"{pr} {pl(pr, 'програма', 'програми', 'програм')} сушіння під різні тканини.")
            ru.append(f"{pr} {pl(pr, 'программа', 'программы', 'программ')} сушки под разные ткани.")
            en.append(f"{pr} drying programmes for different fabrics.")
    else:
        combo = kind == "washer" and dk
        uk = [f"{b} {m} — {'прально-сушильна машина' if combo else 'пральна машина'}" + (f" на {kg} кг" if kg else "")
              + (f" глибиною {_fmt(d)} см" if d else "") + "."]
        ru = [f"{b} {m} — {'стирально-сушильная машина' if combo else 'стиральная машина'}" + (f" на {kg} кг" if kg else "")
              + (f" глубиной {_fmt(d)} см" if d else "") + "."]
        en = [f"The {b} {m} is a {'washer-dryer' if combo else 'washing machine'}" + (f" for {kg} kg" if kg else "")
              + (f", {_fmt(d, True)} cm deep" if d else "") + "."]
        if d and d < 50:
            uk.append("Вузький корпус стане навіть у тісну ванну.")
            ru.append("Узкий корпус встанет даже в тесную ванную.")
            en.append("The slim body fits even a tight bathroom.")
        if combo:
            uk.append(f"Висушує до {dk} кг білизни прямо в барабані — без сушарки на балконі.")
            ru.append(f"Высушивает до {dk} кг белья прямо в барабане — без сушилки на балконе.")
            en.append(f"It dries up to {dk} kg right in the drum — no clothes horse needed.")
        if rpm or pr:
            uk.append(_j([f"Віджим до {rpm} об/хв" if rpm else None, f"{pr} {pl(pr, 'програма', 'програми', 'програм')}" if pr else None]).replace(" об/хв ", " об/хв, ") + ".")
            ru.append(_j([f"Отжим до {rpm} об/мин" if rpm else None, f"{pr} {pl(pr, 'программа', 'программы', 'программ')}" if pr else None]).replace(" об/мин ", " об/мин, ") + ".")
            en.append(_j([f"Spin up to {rpm} rpm" if rpm else None, f"{pr} programmes" if pr else None]).replace(" rpm ", " rpm, ") + ".")
    if inv:
        uk.append("Інверторний двигун тихіший і служить довше за звичайний.")
        ru.append("Инверторный двигатель тише и служит дольше обычного.")
        en.append("The inverter motor is quieter and lasts longer than a brushed one.")
    if steam:
        uk.append("Є обробка парою — освіжає речі й прибирає алергени.")
        ru.append("Есть обработка паром — освежает вещи и убирает аллергены.")
        en.append("Steam refreshes clothes and removes allergens.")
    return uk, ru, en, feat, w


def micro(b, m, s, kind):
    v, p, gr = s.get("volume_l"), s.get("power_mw"), s.get("power_grill")
    uk = [f"{b} {m} — вбудована мікрохвильова піч" + (f" на {v} л" if v else "") + (f" потужністю {p} Вт" if p else "")
          + (f", з грилем на {gr} Вт" if gr else "") + "."]
    ru = [f"{b} {m} — встраиваемая микроволновая печь" + (f" на {v} л" if v else "") + (f" мощностью {p} Вт" if p else "")
          + (f", с грилем на {gr} Вт" if gr else "") + "."]
    en = [f"The {b} {m} is a built-in microwave" + (f" with {v} litres" if v else "") + (f" and {p} W" if p else "")
          + (f", plus a {gr} W grill" if gr else "") + "."]
    uk.append("Ставиться в кухонну шафу врівень із фасадами — стільниця лишається вільною.")
    ru.append("Ставится в кухонный шкаф вровень с фасадами — столешница остаётся свободной.")
    en.append("It sits flush in a kitchen cabinet and leaves the worktop clear.")
    return uk, ru, en, s.get("features"), s.get("warranty")


def oven(b, m, s, kind):
    v, f, tr, cl = s.get("volume_l"), s.get("functions"), s.get("temp_range"), s.get("cleaning") or ""
    uk = [f"{b} {m} — електрична духова шафа" + (f" на {v} л" if v else "") + (f" з {f} режимами" if f else "") + "."]
    ru = [f"{b} {m} — электрический духовой шкаф" + (f" на {v} л" if v else "") + (f" с {f} режимами" if f else "") + "."]
    en = [f"The {b} {m} is an electric built-in oven" + (f" with {v} litres" if v else "") + (f" and {f} modes" if f else "") + "."]
    if "мікрохвиль" in (s.get("features") or ""):
        uk.append("Має й функцію мікрохвиль — окрема мікрохвильовка на кухні вже не потрібна.")
        ru.append("Есть и функция микроволн — отдельная микроволновка на кухне уже не нужна.")
        en.append("It doubles as a microwave, so you don't need a separate one.")
    if tr:
        uk.append(f"Температура регулюється в межах {tr}.")
        ru.append(f"Температура регулируется в пределах {tr}.")
        en.append(f"Temperature ranges over {tr}.")
    cmap = {"Піролітичне": ("Піролітичне очищення спалює жир у камері — після циклу досить протерти золу.",
                            "Пиролитическая очистка сжигает жир в камере — после цикла достаточно протереть золу.",
                            "Pyrolytic cleaning burns grease off — afterwards you just wipe out the ash."),
            "Гідролітичне": ("Гідролітичне очищення розм’якшує бруд парою — камеру легко протерти.",
                             "Гидролитическая очистка размягчает грязь паром — камеру легко протереть.",
                             "Hydrolytic cleaning softens dirt with steam so the cavity wipes clean."),
            "Каталітичне": ("Каталітичні панелі поглинають жир під час готування.",
                            "Каталитические панели поглощают жир во время готовки.",
                            "Catalytic liners absorb grease while you cook."),
            "Парове": ("Парове очищення розм’якшує нагар — камеру легко протерти.",
                       "Паровая очистка размягчает нагар — камеру легко протереть.",
                       "Steam cleaning softens burnt-on residue so the cavity wipes clean.")}
    if cl in cmap:
        a, r, e = cmap[cl]
        uk.append(a); ru.append(r); en.append(e)
    return uk, ru, en, s.get("features"), s.get("warranty")


def dish(b, m, s, kind):
    sets, w, pr, n = s.get("sets"), s.get("width_cm"), s.get("programs"), s.get("noise_db")
    uk = [f"{b} {m} — вбудована посудомийна машина" + (f" на {sets} {pl(sets, 'комплект', 'комплекти', 'комплектів')}" if sets else "") + (f", ширина {w} см" if w else "") + "."]
    ru = [f"{b} {m} — встраиваемая посудомоечная машина" + (f" на {sets} {pl(sets, 'комплект', 'комплекта', 'комплектов')}" if sets else "") + (f", ширина {w} см" if w else "") + "."]
    en = [f"The {b} {m} is a built-in dishwasher" + (f" for {sets} place settings" if sets else "") + (f", {w} cm wide" if w else "") + "."]
    if pr or n:
        uk.append(_up(_j([f"{pr} {pl(pr, 'програма', 'програми', 'програм')}" + ("," if n else ".") if pr else None, f"рівень шуму {n} дБ." if n else None])))
        ru.append(_up(_j([f"{pr} {pl(pr, 'программа', 'программы', 'программ')}" + ("," if n else ".") if pr else None, f"уровень шума {n} дБ." if n else None])))
        en.append(_up(_j([f"{pr} programmes" + ("," if n else ".") if pr else None, f"noise level {n} dB." if n else None])))
    return uk, ru, en, s.get("features"), s.get("warranty")


def vacuum(b, m, s, kind):
    sw, rt, dl = num(s.get("suction_w")), num(s.get("runtime")), num(s.get("dust_l"))
    wet = "Вологе" in (s.get("clean_type") or "")
    uk = [f"{b} {m} — бездротовий вертикальний пилосос" + (f" з потужністю всмоктування {_fmt(sw)} Вт" if sw else "") + "."]
    ru = [f"{b} {m} — беспроводной вертикальный пылесос" + (f" с мощностью всасывания {_fmt(sw)} Вт" if sw else "") + "."]
    en = [f"The {b} {m} is a cordless stick vacuum" + (f" with {_fmt(sw, True)} W of suction" if sw else "") + "."]
    if rt:
        uk.append(f"Працює до {_fmt(rt)} хв від одного заряду — вистачає на всю квартиру, без шнура й розеток.")
        ru.append(f"Работает до {_fmt(rt)} мин от одного заряда — хватает на всю квартиру, без шнура и розеток.")
        en.append(f"It runs for up to {_fmt(rt, True)} minutes on a charge — enough for a whole flat, with no cord to drag.")
    if wet:
        uk.append("Вміє й вологе прибирання — підлогу можна помити тим самим пилососом.")
        ru.append("Умеет и влажную уборку — пол можно помыть тем же пылесосом.")
        en.append("It also mops, so the same machine washes the floor.")
    if dl:
        uk.append(f"Контейнер для пилу на {_fmt(dl)} л витрушується одним рухом, мішки купувати не треба.")
        ru.append(f"Контейнер для пыли на {_fmt(dl)} л вытряхивается одним движением, мешки покупать не нужно.")
        en.append(f"The {_fmt(dl, True)} l dust bin empties in one go — no bags to buy.")
    return uk, ru, en, s.get("features"), s.get("warranty")


WRITERS = {"fridge": fridge, "freezer": fridge, "washer": washer, "dryer": washer,
           "micro": micro, "oven": oven, "dish": dish, "vacuum": vacuum}


def describe(kind, brand, model, specs):
    uk, ru, en, feat, w = WRITERS[kind](brand, model, specs, kind)
    if feat and any(c.isascii() and c.isalpha() for c in feat) and all(not ("а" <= c.lower() <= "я") for c in feat):
        uk.append(f"Фірмові технології: {feat}.")
        ru.append(f"Фирменные технологии: {feat}.")
        en.append(f"Brand technologies: {feat}.")
    yrs = None
    if w:
        yrs = w.split(" (")[0]
    if yrs:
        tr = {"1 рік": ("1 год", "1-year"), "2 роки": ("2 года", "2-year"), "3 роки": ("3 года", "3-year"),
              "5 років": ("5 лет", "5-year")}.get(yrs)
        extra = " і 10 років на " + ("компресор" if "компрес" in w else "двигун") if "10 років" in w else ""
        uk.append(f"Офіційна гарантія {yrs}{extra}.")
        if tr:
            extra_ru = " и 10 лет на " + ("компрессор" if "компрес" in w else "двигатель") if "10 років" in w else ""
            extra_en = " plus 10 years on the " + ("compressor" if "компрес" in w else "motor") if "10 років" in w else ""
            ru.append(f"Официальная гарантия {tr[0]}{extra_ru}.")
            en.append(f"Official {tr[1]} warranty{extra_en}.")
    return " ".join(uk), " ".join(ru), " ".join(en)
