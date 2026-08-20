#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Build the delivery-map SVG from OpenStreetMap extracts.

The first attempt drew the whole administrative boundary. Everything a customer
navigates by sits in a strip about 5 km across, so nine tenths of the frame was
empty outskirts and the landmarks were a pile in the middle — labels had to be
flung outwards on leader lines, which made Manufaktura look as if it were a
kilometre east of the shop when it is next door.

So the map is framed on the built-up centre instead. The window is computed
from the landmarks themselves plus a margin, then squared off to the viewBox
aspect; the city boundary simply runs off the edges, the way it does on any
real map. Labels sit tight against their dots and one that cannot fit is
dropped rather than dragged across the map.

The shop and TRC Manufaktura are one marker: Kharkivska 2/1 and 2/2 are
neighbouring buildings, so at any honest scale they are the same point, and
"we are at Manufaktura" is more use to a customer than two dots on top of each
other.

Everything is real OSM data, projected once so the layers line up, and written
as a static fragment. Nothing is fetched at runtime; attribution is in the
caption. Output: templates/map.svg, injected at <!--DELIVERY_MAP-->.

Run: python scripts/make_map.py
"""
import json
import math
import os
import io

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = (u"C:/Users/Dima/AppData/Local/Temp/claude/C--Claude-Code/"
       u"6d3a4449-c5b0-4259-9c6f-39f88b64f134/scratchpad")
OUT = os.path.join(ROOT, "templates", "map.svg")

FETCHED_WITH = """
  city      nominatim.openstreetmap.org/search?city=Sumy&polygon_geojson=1
  roads     way[highway~"^(trunk|primary|secondary)$"](bbox)
  water     way[waterway=river] + way[natural=water](bbox)
  poi       nwr[shop=mall|department_store] + [amenity=marketplace] + [tourism=attraction]
  districts relation(4045817) Zarichnyi; relation(4045818) Kovpakivskyi
"""

W, H, PAD = 560.0, 440.0, 10.0
# How much of Sumy to show, measured across. The administrative boundary is
# 16 km wide and mostly empty fields; the landmarks live in the middle 5 km.
# This is the compromise: wide enough that the city keeps its silhouette,
# tight enough that the centre stays legible. Set it in kilometres and the
# height follows the viewBox aspect.
FRAME_KM = 11.0

# The shop: Kharkivska 2/1, the building beside TRC Manufaktura at 2/2, so the
# two share one marker.
SHOP = (34.8064328, 50.9044303)

# (name, lon, lat, i18n key, minor). Coordinates and addresses read out of the
# OSM dump: Lavina = Lushpy 4/1, Epicentr = Heroiv Krut 1/3, Manufaktura =
# Kharkivska 2/2. "minor" ones stand down on a phone.
PLACES = [
    (u"Альтанка",           34.79927, 50.90678, "dm_altanka",  False),
    (u"Лавина",             34.81953, 50.90473, "dm_lavina",   False),
    (u"Центральний ринок",  34.79609, 50.91399, "dm_rynok",    False),
    (u"Вокзал",             34.80813, 50.92728, "dm_vokzal",   True),
    (u"Епіцентр",           34.83421, 50.91858, "dm_epicentr", True),
]
DISTRICTS = {4045817: (u"Зарічний", "dm_zarichnyi"),
             4045818: (u"Ковпаківський", "dm_kovpakivskyi")}

# Streets worth naming, with how far from the shop the label may sit.
# Kharkivska runs the whole width of Sumy and out towards Kharkiv: naming its
# far end while the shop sits on it in the centre is the sort of thing that
# makes a reader mistrust the map, so it is only labelled close to home.
STREETS = [
    (u"Харківська вулиця", u"Харківська", "dm_st_kharkiv", 150),
    (u"проспект Михайла Лушпи", u"пр. Лушпи", "dm_st_lushpy", None),
    (u"Петропавлівська вулиця", u"Петропавлівська", "dm_st_petropavl", None),
    (u"Роменська вулиця", u"Роменська", "dm_st_romenska", None),
]


def load(name):
    return json.load(io.open(os.path.join(SRC, name), encoding="utf-8"))


def rdp(points, eps):
    """Ramer-Douglas-Peucker, iterative so a long road cannot blow the stack."""
    if len(points) < 3:
        return points
    keep = [False] * len(points)
    keep[0] = keep[-1] = True
    stack = [(0, len(points) - 1)]
    while stack:
        a, b = stack.pop()
        if b - a < 2:
            continue
        x1, y1 = points[a]
        x2, y2 = points[b]
        dx, dy = x2 - x1, y2 - y1
        n = math.hypot(dx, dy)
        idx, dmax = -1, -1.0
        for i in range(a + 1, b):
            x, y = points[i]
            d = (abs(dy * x - dx * y + x2 * y1 - y2 * x1) / n) if n else math.hypot(x - x1, y - y1)
            if d > dmax:
                idx, dmax = i, d
        if dmax > eps:
            keep[idx] = True
            stack.append((a, idx))
            stack.append((idx, b))
    return [p for p, k in zip(points, keep) if k]


def stitch(ways):
    """Join relation member ways into closed rings by matching endpoints.

    Overpass hands back the outer ways in no particular order and pointing
    either way round, so a district is a bag of fragments until they are sewn
    together. Anything that will not close is returned as-is; it is only used
    for drawing, where an open run is harmless.
    """
    rings, pool = [], [list(w) for w in ways if len(w) > 1]
    while pool:
        ring = pool.pop(0)
        joined = True
        while joined and ring[0] != ring[-1]:
            joined = False
            for i, w in enumerate(pool):
                if w[0] == ring[-1]:
                    ring += w[1:]
                elif w[-1] == ring[-1]:
                    ring += w[::-1][1:]
                elif w[-1] == ring[0]:
                    ring = w[:-1] + ring
                elif w[0] == ring[0]:
                    ring = w[::-1][:-1] + ring
                else:
                    continue
                pool.pop(i)
                joined = True
                break
        rings.append(ring)
    return rings


def inside(poly, x, y):
    """Even-odd point in polygon."""
    hit = False
    n = len(poly)
    for i in range(n):
        x1, y1 = poly[i]
        x2, y2 = poly[(i + 1) % n]
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1 + 1e-12) + x1:
            hit = not hit
    return hit


def label_spot(poly, box, step=14):
    """The point inside `poly` and inside `box` that is furthest from any edge.

    A centroid is useless for a district shaped like a crescent — Zarichnyi's
    landed next to the shop, on the far side of the river from itself. This
    walks a grid and keeps the roomiest interior point instead.
    """
    x0, y0, x1, y1 = box
    best, bestd = None, -1.0
    gy = y0
    while gy <= y1:
        gx = x0
        while gx <= x1:
            if inside(poly, gx, gy):
                d = min(math.hypot(gx - px, gy - py) for px, py in poly)
                edge = min(gx - x0, x1 - gx, gy - y0, y1 - gy)
                d = min(d, edge)
                if d > bestd:
                    best, bestd = (gx, gy), d
            gx += step
        gy += step
    return best


def main():
    city = load("sumy.json")[0]["geojson"]
    rings = ([r for poly in city["coordinates"] for r in poly]
             if city["type"] == "MultiPolygon" else city["coordinates"])
    ring = max(rings, key=len)

    kx = math.cos(math.radians(SHOP[1]))

    def proj(lon, lat):
        return (lon * kx, -lat)

    # ---- frame: centred between the shop and the landmarks it has to show ----
    anchors = [proj(SHOP[0], SHOP[1])] + [proj(p[1], p[2]) for p in PLACES]
    axs = [p[0] for p in anchors]
    ays = [p[1] for p in anchors]
    cx0 = (min(axs) + max(axs)) / 2
    cy0 = (min(ays) + max(ays)) / 2
    # x is lon*cos(lat), so one unit is 111.32 km in both axes
    half_w = FRAME_KM / 2 / 111.32
    half_h = half_w / ((W - 2 * PAD) / (H - 2 * PAD))
    sc = (W - 2 * PAD) / (2 * half_w)

    def to(lon, lat):
        x, y = proj(lon, lat)
        return ((x - cx0) * sc + W / 2, (y - cy0) * sc + H / 2)

    def xy(c):
        return to(c[0], c[1]) if isinstance(c, (list, tuple)) else to(c["lon"], c["lat"])

    def path_of(coords, eps=1.1, close=False):
        pts = rdp([xy(c) for c in coords], eps)
        if len(pts) < 2:
            return None
        d = "M" + " L".join("%d %d" % (round(x), round(y)) for x, y in pts)
        return d + " Z" if close else d

    # geometry well outside the window never reaches the file
    def touches(coords):
        for c in coords:
            x, y = xy(c)
            if -70 <= x <= W + 70 and -70 <= y <= H + 70:
                return True
        return False

    # ---- layers ----
    city_d = path_of([(p[0], p[1]) for p in ring], eps=0.8, close=True)

    dist_paths, dist_rings = [], {}
    for el in load("adm_geom.json")["elements"]:
        label = DISTRICTS.get(el["id"])
        if not label:
            continue
        ways = []
        for m in el.get("members", []):
            if m.get("role") != "outer" or not m.get("geometry"):
                continue
            if touches(m["geometry"]):
                d = path_of(m["geometry"], eps=1.1)
                if d:
                    dist_paths.append(d)
            ways.append([(round(g["lon"], 7), round(g["lat"], 7)) for g in m["geometry"]])
        rings = [[to(*pt) for pt in r] for r in stitch(ways) if len(r) > 3]
        if rings:
            dist_rings[label] = max(rings, key=len)

    rivers, lakes = [], []
    for el in load("water.json")["elements"]:
        t = el.get("tags", {})
        g = el.get("geometry")
        if not g or not touches(g):
            continue
        if t.get("waterway") == "river":
            if t.get("name") not in (u"Псел", u"Сумка", u"Стрілка"):
                continue
            d = path_of(g, eps=0.8)
            if d:
                rivers.append(d)
        elif t.get("natural") == "water":
            pts = [xy(p) for p in g]
            if len(pts) < 4:
                continue
            area = abs(sum(pts[i][0] * pts[i - 1][1] - pts[i - 1][0] * pts[i][1]
                           for i in range(len(pts)))) / 2
            if area < 60:
                continue
            d = path_of(g, eps=0.8, close=True)
            if d:
                lakes.append(d)

    major, minor_r, street_runs = [], [], {}
    for el in load("roads.json")["elements"]:
        g = el.get("geometry")
        if not g or not touches(g):
            continue
        d = path_of(g, eps=1.0)
        if not d:
            continue
        name = el.get("tags", {}).get("name")
        if name and any(name == full for full, _s, _k, _r in STREETS):
            street_runs.setdefault(name, []).append([xy(p) for p in g])
        (major if el.get("tags", {}).get("highway") in ("trunk", "primary")
         else minor_r).append(d)

    # ---- labels: tight to their dot, dropped if there is no room ----
    boxes = []

    def inframe(b):
        return b[0] >= 3 and b[2] <= W - 3 and b[1] >= 3 and b[3] <= H - 3

    def free(b):
        return not any(not (b[2] < o[0] or b[0] > o[2] or b[3] < o[1] or b[1] > o[3])
                       for o in boxes)

    def place(x, y, text, size=11.5):
        w = len(text) * size * 0.53 + 10
        h = size + 5
        for dx, dy, anchor in [(8, 4, "start"), (-8, 4, "end"),
                               (0, -8, "middle"), (0, 15, "middle"),
                               (8, -6, "start"), (-8, -6, "end"),
                               (8, 14, "start"), (-8, 14, "end")]:
            lx, ly = x + dx, y + dy
            x0 = lx if anchor == "start" else (lx - w if anchor == "end" else lx - w / 2)
            box = (x0, ly - h + 3, x0 + w, ly + 3)
            if inframe(box) and free(box):
                boxes.append(box)
                return lx, ly, anchor
        return None

    # the pin and its two-line caption claim their space before anything else
    sx, sy = to(*SHOP)
    boxes.append((sx - 46, sy + 2, sx + 46, sy + 34))

    dist_labels = []
    for (name, key), ring in dist_rings.items():
        w = len(name) * 13 * 0.62 + 14
        spot = label_spot(ring, (w / 2 + 6, 20, W - w / 2 - 6, H - 20))
        if not spot:
            continue
        dx, dy = spot
        for ox, oy in ((0, 0), (0, -24), (0, 24), (-34, 0), (34, 0), (0, -48), (0, 48)):
            b = (dx + ox - w / 2, dy + oy - 12, dx + ox + w / 2, dy + oy + 6)
            if inframe(b) and free(b) and inside(ring, dx + ox, dy + oy):
                boxes.append(b)
                dist_labels.append((name, key, dx + ox, dy + oy))
                break

    pois, dropped = [], []
    for name, lon, lat, key, is_minor in PLACES:
        x, y = to(lon, lat)
        if not (0 <= x <= W and 0 <= y <= H):
            dropped.append(name + " (outside the frame)")
            continue
        p = place(x, y, name)
        if p:
            pois.append((x, y, p[0], p[1], p[2], name, key, is_minor))
        else:
            dropped.append(name + " (no room)")

    # ---- street names, set along the straightest visible run ----
    street_labels = []
    for full, short, key, max_from_shop in STREETS:
        runs = []
        for pts in street_runs.get(full, []):
            vis = [p for p in pts if 24 <= p[0] <= W - 24 and 24 <= p[1] <= H - 24]
            if len(vis) < 2:
                continue
            span = math.hypot(vis[-1][0] - vis[0][0], vis[-1][1] - vis[0][1])
            if span < 42:
                continue
            mid = vis[len(vis) // 2]
            gap = math.hypot(mid[0] - sx, mid[1] - sy)
            if max_from_shop is not None and gap > max_from_shop:
                continue
            runs.append((gap, vis))
        if not runs:
            continue
        runs.sort(key=lambda r: r[0])          # nearest the shop wins
        w = len(short) * 9.5 * 0.53 + 8
        placed = False
        for _dist, vis in runs:
            ang = math.degrees(math.atan2(vis[-1][1] - vis[0][1], vis[-1][0] - vis[0][0]))
            ang = ang - 180 if ang > 90 else (ang + 180 if ang < -90 else ang)
            # walk the run rather than insisting on its midpoint: near the shop
            # the middle is always taken, but a stretch further along is free
            n = len(vis)
            for frac in (0.5, 0.35, 0.65, 0.2, 0.8):
                mx, my = vis[min(n - 1, int(n * frac))]
                b = (mx - w / 2, my - 12, mx + w / 2, my + 3)
                if inframe(b) and free(b):
                    boxes.append(b)
                    street_labels.append((short, key, mx, my, round(ang, 1)))
                    placed = True
                    break
            if placed:
                break

    # ---- assemble ----
    def esc(s):
        return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")

    L = []
    A = L.append
    A('<svg viewBox="0 0 %g %g" role="img" aria-labelledby="dl-map-t">' % (W, H))
    A('  <title id="dl-map-t" data-i18n="dl_map_alt">Мапа центру Сум: райони, вулиці та орієнтири</title>')
    A('  <defs><clipPath id="dm-clip"><path d="%s"/></clipPath></defs>' % city_d)
    A('  <path class="dm-city" d="%s"/>' % city_d)
    A('  <g clip-path="url(#dm-clip)">')
    for cls, group in (("dm-district", dist_paths), ("dm-water-fill", lakes),
                       ("dm-river", rivers), ("dm-road", minor_r),
                       ("dm-road-major", major)):
        if group:
            A('    <path class="%s" d="%s"/>' % (cls, " ".join(group)))
    A('  </g>')
    for name, key, dx, dy in dist_labels:
        A('  <text class="dm-dist" x="%g" y="%g" data-i18n="%s">%s</text>'
          % (round(dx, 1), round(dy, 1), key, esc(name)))
    for short, key, mx, my, ang in street_labels:
        A('  <text class="dm-street" x="%g" y="%g" transform="rotate(%g %g %g)" data-i18n="%s">%s</text>'
          % (round(mx, 1), round(my, 1), ang, round(mx, 1), round(my, 1), key, esc(short)))
    A('  <circle class="dm-halo" cx="%g" cy="%g" r="8"/>' % (round(sx, 1), round(sy, 1)))
    for x, y, _lx, _ly, _a, _n, _k, is_minor in pois:
        A('  <circle class="dm-poi%s" cx="%g" cy="%g" r="3.2"/>'
          % (" dm-minor" if is_minor else "", round(x, 1), round(y, 1)))
    for _x, _y, lx, ly, anchor, name, key, is_minor in pois:
        A('  <text class="dm-poi-t%s" x="%g" y="%g" text-anchor="%s" data-i18n="%s">%s</text>'
          % (" dm-minor" if is_minor else "", round(lx, 1), round(ly, 1), anchor, key, esc(name)))
    A('  <circle class="dm-pin" cx="%g" cy="%g" r="5"/>' % (round(sx, 1), round(sy, 1)))
    A('  <text class="dm-shop-t" x="%g" y="%g" text-anchor="middle" data-i18n="dm_shop">TexnoPlaza</text>'
      % (round(sx, 1), round(sy + 18, 1)))
    A('  <text class="dm-shop-s" x="%g" y="%g" text-anchor="middle" data-i18n="dm_shop_at">ТРЦ Мануфактура</text>'
      % (round(sx, 1), round(sy + 30, 1)))
    A('</svg>')
    svg = "\n".join(L) + "\n"
    io.open(OUT, "w", encoding="utf-8", newline="\n").write(svg)

    print("frame %.1f x %.1f km" % (2 * half_w * 111.32, 2 * half_h * 111.32))
    print("districts %d, rivers %d, water %d, roads %d+%d"
          % (len(dist_paths), len(rivers), len(lakes), len(major), len(minor_r)))
    print("labels: %d/%d places, %d/%d districts, %d/%d streets"
          % (len(pois), len(PLACES), len(dist_labels), len(DISTRICTS),
             len(street_labels), len(STREETS)))
    print("map.svg: %.1f KB" % (len(svg.encode("utf-8")) / 1024.0))
    if dropped:
        print("  !! not drawn:", ", ".join(dropped))


if __name__ == "__main__":
    main()
