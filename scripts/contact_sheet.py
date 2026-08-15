#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Build a numbered contact sheet per product folder so the photo set can be
reviewed at a glance (which shot leads, which are junk).
Run: python scripts/contact_sheet.py <source-root> <out-dir>
"""
import os, sys, re
from PIL import Image, ImageDraw

SRC = sys.argv[1]
OUT = sys.argv[2]
COLS, TILE, PAD, LABEL = 5, 210, 8, 22

def nat(fn):
    m = re.search(r"(\d+)", fn)
    return (int(m.group(1)) if m else 9999, fn.lower())

os.makedirs(OUT, exist_ok=True)
for folder in sorted(os.listdir(SRC)):
    d = os.path.join(SRC, folder)
    if not os.path.isdir(d): continue
    files = sorted([f for f in os.listdir(d) if f.lower().endswith((".webp", ".jpg", ".jpeg", ".png"))], key=nat)
    if not files: continue
    rows = (len(files) + COLS - 1) // COLS
    W = COLS * (TILE + PAD) + PAD
    H = rows * (TILE + LABEL + PAD) + PAD
    sheet = Image.new("RGB", (W, H), (245, 247, 250))
    dr = ImageDraw.Draw(sheet)
    for i, f in enumerate(files):
        im = Image.open(os.path.join(d, f)).convert("RGB")
        im.thumbnail((TILE, TILE), Image.LANCZOS)
        c, r = i % COLS, i // COLS
        x = PAD + c * (TILE + PAD) + (TILE - im.width) // 2
        y = PAD + r * (TILE + LABEL + PAD) + (TILE - im.height) // 2
        sheet.paste(im, (x, y))
        dr.rectangle([PAD + c * (TILE + PAD) - 1, PAD + r * (TILE + LABEL + PAD) - 1,
                      PAD + c * (TILE + PAD) + TILE, PAD + r * (TILE + LABEL + PAD) + TILE],
                     outline=(210, 216, 226))
        dr.text((PAD + c * (TILE + PAD) + 4, PAD + r * (TILE + LABEL + PAD) + TILE + 4),
                f"[{i+1}] {f[:28]}", fill=(40, 50, 65))
    name = re.sub(r"[^A-Za-z0-9]+", "_", folder).strip("_")[:40]
    p = os.path.join(OUT, f"{name}.jpg")
    sheet.save(p, "JPEG", quality=82)
    print(f"{folder}: {len(files)} photos -> {p}")
