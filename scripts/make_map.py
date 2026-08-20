#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Build the delivery-map SVG from OpenStreetMap extracts.

The first version of this map was the city outline and one pin, which told a
visitor nothing about where anything is. This adds the things people in Sumy
actually navigate by: the Psel and its two tributaries, the primary and
secondary road network, the two city districts, and the landmarks customers
name on the phone — Altanka, Manufaktura, Lavina, the central market, the
station.

Everything is real OSM data, projected once so every layer lines up, simplified
until the whole thing fits in a few kilobytes, and written as a static SVG
fragment. Nothing is fetched at runtime; attribution stays in the caption.

Inputs are the raw Overpass/Nominatim dumps in SRC (see the fetch commands in
FETCHED_WITH below). Output: templates/map.svg, injected at <!--DELIVERY_MAP-->.

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
  districts relation(4045817); relation(4045818)
"""

W, H, PAD = 560.0, 440.0, 14.0
SHOP = (34.8064328, 50.9044303)          # вул. Харківська 2/1

# name -> (lon, lat, i18n key). Coordinates straight out of the OSM dump above.
# The first three are the ones customers name on the phone and stay on every
# screen; the rest are marked minor and step aside on a narrow one, where the
# map is barely 300px wide and six labels would be a smudge.
MINOR_FROM = 3
PLACES = [
    (u"Альтанка",         34.79927, 50.90678, "dm_altanka"),
    (u"Мануфактура",      34.80499, 50.90417, "dm_manufaktura"),
    (u"Лавина",           34.81953, 50.90473, "dm_lavina"),
    (u"Центральний ринок", 34.79609, 50.91399, "dm_rynok"),
    (u"Вокзал",           34.80813, 50.92728, "dm_vokzal"),
    (u"Епіцентр",         34.83421, 50.91858, "dm_epicentr"),
]
DISTRICTS = {4045817: (u"Зарічний", "dm_zarichnyi"), 4045818: (u"Ковпаківський", "dm_kovpakivskyi")}


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


def main():
    # ---- the city outline sets the projection every other layer uses ----
    city = load("sumy.json")[0]["geojson"]
    rings = ([r for poly in city["coordinates"] for r in poly]
             if city["type"] == "MultiPolygon" else city["coordinates"])
    ring = max(rings, key=len)

    lat0 = sum(p[1] for p in ring) / len(ring)
    k = math.cos(math.radians(lat0))

    def proj(lon, lat):
        return (lon * k, -lat)

    cpts = [proj(*p) for p in ring]
    xs = [p[0] for p in cpts]
    ys = [p[1] for p in cpts]
    minx, maxx, miny, maxy = min(xs), max(xs), min(ys), max(ys)
    sc = min((W - 2 * PAD) / (maxx - minx), (H - 2 * PAD) / (maxy - miny))
    ox = (W - (maxx - minx) * sc) / 2 - minx * sc
    oy = (H - (maxy - miny) * sc) / 2 - miny * sc

    def to(lon, lat):
        x, y = proj(lon, lat)
        return (x * sc + ox, y * sc + oy)

    def path_of(coords, eps=0.35, close=False):
        pts = [to(c[0], c[1]) if isinstance(c, (list, tuple)) else to(c["lon"], c["lat"])
               for c in coords]
        pts = rdp(pts, eps)
        if len(pts) < 2:
            return None
        # whole pixels: at this scale a decimal place is invisible and costs
        # roughly a third of the file
        d = "M" + " L".join("%d %d" % (round(x), round(y)) for x, y in pts)
        return d + " Z" if close else d

    def span(coords):
        pts = [to(c[0], c[1]) if isinstance(c, (list, tuple)) else to(c["lon"], c["lat"])
               for c in coords]
        xs2 = [q[0] for q in pts]; ys2 = [q[1] for q in pts]
        return math.hypot(max(xs2) - min(xs2), max(ys2) - min(ys2))

    inside = lambda x, y: -20 <= x <= W + 20 and -20 <= y <= H + 20

    # ---- city ----
    city_d = path_of([(p[0], p[1]) for p in ring], eps=0.6, close=True)

    # ---- districts: boundary lines, drawn faint under everything ----
    dist_paths, dist_labels = [], []
    for el in load("adm_geom.json")["elements"]:
        label = DISTRICTS.get(el["id"])
        if not label:
            continue
        segs, pts_all = [], []
        for m in el.get("members", []):
            if m.get("role") != "outer" or not m.get("geometry"):
                continue
            d = path_of(m["geometry"], eps=1.6)
            if d:
                segs.append(d)
            pts_all += [to(g["lon"], g["lat"]) for g in m["geometry"]]
        if segs:
            dist_paths.append(" ".join(segs))
        if pts_all:
            vis = [p for p in pts_all if inside(*p)] or pts_all
            cx = sum(p[0] for p in vis) / len(vis)
            cy = sum(p[1] for p in vis) / len(vis)
            dist_labels.append((label[0], label[1], cx, cy))

    # ---- water: rivers as lines, the larger bodies as fills ----
    rivers, lakes = [], []
    for el in load("water.json")["elements"]:
        t = el.get("tags", {})
        g = el.get("geometry")
        if not g:
            continue
        if t.get("waterway") == "river":
            if t.get("name") not in (u"Псел", u"Сумка", u"Стрілка"):
                continue                       # the rest are ditches at this scale
            d = path_of(g, eps=1.1)
            if d:
                rivers.append(d)
        elif t.get("natural") == "water":
            pts = [to(p["lon"], p["lat"]) for p in g]
            if len(pts) < 4:
                continue
            area = abs(sum(pts[i][0] * pts[i - 1][1] - pts[i - 1][0] * pts[i][1]
                           for i in range(len(pts)))) / 2
            if area < 45:                      # px² — anything smaller is a dot
                continue
            d = path_of(g, eps=1.0, close=True)
            if d:
                lakes.append(d)

    # ---- roads ----
    major, minor = [], []
    for el in load("roads.json")["elements"]:
        g = el.get("geometry")
        if not g:
            continue
        if span(g) < 7:                        # a stub this short reads as a speck
            continue
        d = path_of(g, eps=1.6)
        if not d:
            continue
        (major if el.get("tags", {}).get("highway") in ("trunk", "primary") else minor).append(d)

    # ---- labels, placed so they do not sit on top of each other ----
    boxes = []

    def place(x, y, text, size=10.5, prefer=None):
        w = len(text) * size * 0.52 + 12
        h = size + 6
        near = [(9, 3.5, "start"), (-9, 3.5, "end"), (0, -9, "middle"), (0, 14, "middle"),
                (9, -8, "start"), (-9, -8, "end")]
        far = [(d * sx2, d * sy2, a) for d in (22, 34, 46)
               for sx2, sy2, a in ((1, -0.5, "start"), (-1, -0.5, "end"),
                                   (1, 0.7, "start"), (-1, 0.7, "end"),
                                   (0, -1, "middle"), (0, 1, "middle"))]
        for dx, dy, anchor in (prefer or near + far):
            lx, ly = x + dx, y + dy
            x0 = lx if anchor == "start" else (lx - w if anchor == "end" else lx - w / 2)
            box = (x0, ly - h + 3, x0 + w, ly + 3)
            if box[0] < 2 or box[2] > W - 2 or box[1] < 2 or box[3] > H - 2:
                continue
            if any(not (box[2] < b[0] or box[0] > b[2] or box[3] < b[1] or box[1] > b[3])
                   for b in boxes):
                continue
            boxes.append(box)
            return lx, ly, anchor
        return None

    # district names are painted under everything and must not be overwritten
    for _name, _key, cx, cy in dist_labels:
        w = len(_name) * 13 * 0.62 + 14
        boxes.append((cx - w / 2, cy - 12, cx + w / 2, cy + 6))

    shop_xy = to(*SHOP)
    # the pin, its halo and its caption; nearby labels get pushed out and
    # picked up a leader line rather than sitting on top of the marker
    boxes.append((shop_xy[0] - 36, shop_xy[1] - 10, shop_xy[0] + 36, shop_xy[1] + 22))

    pois = []
    for i, (name, lon, lat, key) in enumerate(PLACES):
        x, y = to(lon, lat)
        p = place(x, y, name)
        if p:
            pois.append((x, y, p[0], p[1], p[2], name, key, i >= MINOR_FROM))

    # ---- assemble ----
    esc = lambda s: (s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;"))
    L = []
    A = L.append
    A('<svg viewBox="0 0 %g %g" role="img" aria-labelledby="dl-map-t">' % (W, H))
    A('  <title id="dl-map-t" data-i18n="dl_map_alt">Мапа Сум: райони, головні вулиці та орієнтири</title>')
    A('  <defs><clipPath id="dm-clip"><path d="%s"/></clipPath></defs>' % city_d)
    A('  <path class="dm-city" d="%s"/>' % city_d)
    A('  <g clip-path="url(#dm-clip)">')
    for cls, group in (("dm-district", dist_paths), ("dm-water-fill", lakes),
                       ("dm-river", rivers), ("dm-road", minor), ("dm-road-major", major)):
        if group:
            A('    <path class="%s" d="%s"/>' % (cls, " ".join(group)))
    A('  </g>')
    for name, key, cx, cy in dist_labels:
        A('  <text class="dm-dist" x="%g" y="%g" data-i18n="%s">%s</text>'
          % (round(cx, 1), round(cy, 1), key, esc(name)))
    sx, sy = shop_xy
    A('  <circle class="dm-halo" cx="%g" cy="%g" r="7"/>' % (round(sx, 1), round(sy, 1)))
    for x, y, lx, ly, anchor, name, key, is_minor in pois:
        m = " dm-minor" if is_minor else ""
        if math.hypot(lx - x, ly - y) > 16:
            A('  <path class="dm-leader%s" d="M%d %d L%d %d"/>'
              % (m, round(x), round(y), round(lx), round(ly - 3)))
        A('  <circle class="dm-poi%s" cx="%g" cy="%g" r="3"/>' % (m, round(x, 1), round(y, 1)))
    for x, y, lx, ly, anchor, name, key, is_minor in pois:
        A('  <text class="dm-poi-t%s" x="%g" y="%g" text-anchor="%s" data-i18n="%s">%s</text>'
          % (" dm-minor" if is_minor else "", round(lx, 1), round(ly, 1), anchor, key, esc(name)))
    A('  <circle class="dm-pin" cx="%g" cy="%g" r="4.5"/>' % (round(sx, 1), round(sy, 1)))
    A('  <text class="dm-shop-t" x="%g" y="%g" text-anchor="middle" data-i18n="dm_shop">TexnoPlaza</text>'
      % (round(sx, 1), round(sy + 16, 1)))
    A('</svg>')
    svg = "\n".join(L) + "\n"

    io.open(OUT, "w", encoding="utf-8", newline="\n").write(svg)
    print("districts %d, rivers %d, water %d, roads %d+%d, labels %d/%d"
          % (len(dist_paths), len(rivers), len(lakes), len(major), len(minor),
             len(pois), len(PLACES)))
    print("map.svg: %.1f KB" % (len(svg.encode("utf-8")) / 1024.0))
    dropped = [n for n, _, _, _ in PLACES if n not in [q[5] for q in pois]]
    if dropped:
        print("  !! no room for label(s):", ", ".join(dropped))


if __name__ == "__main__":
    main()
