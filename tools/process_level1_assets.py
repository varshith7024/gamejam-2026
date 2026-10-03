#!/usr/bin/env python3
"""
Level 1 (THE VEIL) asset preprocessing.

Reads the ORIGINAL AI-generated source art from  assets/raw_ai/environments/level1_veil/
(never modified) and writes processed runtime copies to  public/assets/level1/.

Run from the project root:   npm run assets:level1
Requires: python3, pillow, numpy, scipy, opencv-python (pip install pillow numpy scipy opencv-python)

What it does (minimum processing for the visual prototype):
  1. master      -> copied as-is (it is the canonical camera/composition reference)
  2. props       -> background-keyed into individual transparent PNGs (from the flat grey prop sheet)
  3. atmosphere  -> light-on-dark crops converted to luminance-alpha PNGs (fog / dust / motes)
  4. occluders   -> polygon cut-outs of the master used as "walk behind" overlays for depth sorting
"""
import json
import shutil
from pathlib import Path

import cv2
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "assets/raw_ai/environments/level1_veil"
OUT = ROOT / "public/assets/level1"

# ---------------------------------------------------------------------------
# Prop sheet: boxes were measured on a 1344px-wide preview of the 1536px sheet.
# ---------------------------------------------------------------------------
PREVIEW_TO_NATIVE = 1536 / 1344
PROPS_PREVIEW_BOXES = {
    "pillar_tall": (15, 15, 195, 340),
    "pillar_broken": (200, 80, 365, 340),
    "statue_tree": (360, 10, 615, 350),
    "statue_small": (620, 120, 815, 350),
    "brazier_ruin": (810, 75, 1125, 340),
    "pedestal_block": (1125, 120, 1335, 340),
    "arch_ruin": (5, 345, 350, 615),
    "ruin_pile": (328, 360, 632, 602),
    "floor_slab": (588, 402, 892, 602),
    "tree_rubble_big": (843, 332, 1148, 652),
    "tree_rubble_small": (1138, 345, 1335, 625),
    "gate_wall": (15, 610, 475, 872),
    "rubble_tomb": (468, 632, 772, 852),
    "rubble_scatter": (772, 688, 1052, 872),
    "shrine_tree": (1065, 612, 1335, 882),
}

# Atmosphere crops (same 1344px preview coordinates) and edge-feather fractions (top, bottom, sides)
ATMOS_PREVIEW_BOXES = {
    "fog_wide": ((40, 25, 880, 150), (0.25, 0.40, 0.12)),
    "fog_puff": ((10, 255, 250, 500), (0.12, 0.12, 0.12)),
    "fog_wisp": ((250, 285, 830, 480), (0.12, 0.12, 0.12)),
    "fog_cloud": ((880, 300, 1320, 480), (0.12, 0.12, 0.12)),
    "dust": ((20, 500, 400, 650), (0.12, 0.12, 0.12)),
    "motes": ((780, 500, 1030, 650), (0.12, 0.12, 0.12)),
    "spirits": ((1060, 480, 1300, 650), (0.12, 0.12, 0.12)),
}

# ---------------------------------------------------------------------------
# Occluders: polygons (native master pixels) around tall objects that stand INSIDE
# the walkable floor. sortY is the object's ground-contact line: the player is drawn
# behind the cut-out while player.footY < sortY, and in front once footY > sortY.
# ---------------------------------------------------------------------------
OCCLUDERS = {
    "pillar_cluster_se": {
        "sortY": 772,
        "polygon": [
            (1136, 617), (1160, 606), (1185, 617), (1186, 710), (1195, 715), (1237, 717),
            (1232, 735), (1220, 745), (1205, 760), (1180, 770), (1170, 772), (1140, 780),
            (1115, 782), (1095, 780), (1070, 772), (1065, 760), (1085, 752), (1090, 735),
            (1115, 727), (1115, 685), (1120, 680), (1140, 677),
        ],
    },
}


def fit_background(gray: np.ndarray) -> np.ndarray:
    """Robustly fit the smooth grey gradient of the prop-sheet backdrop (poly in x,y)."""
    h, w = gray.shape
    yy, xx = np.mgrid[0:h, 0:w]
    x, y = xx / w - 0.5, yy / h - 0.5
    feats = np.stack([np.ones_like(x), x, y, x * y, x * x, y * y, x * x * y, x * y * y, y ** 3, x ** 3], -1).reshape(-1, 10)
    g = gray.reshape(-1)
    sel = np.zeros((h, w), bool)
    sel[:25] = sel[:, :20] = sel[:, -20:] = sel[-15:] = True  # sheet border is background
    sel = sel.reshape(-1)
    for _ in range(6):
        coef, *_ = np.linalg.lstsq(feats[sel], g[sel], rcond=None)
        model = feats @ coef
        sel = np.abs(g - model) < 9
    return model.reshape(h, w)


def key_props() -> int:
    src = np.array(Image.open(SRC / "props/veil_prop_sheet.png").convert("RGB")).astype(np.float32)
    gray = src.mean(2)
    fit_bg = fit_background(gray)
    diff = np.abs(gray - fit_bg)

    strong = (diff > 26).astype(np.uint8)
    strong = cv2.morphologyEx(strong, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
    # fill only SMALL holes so arch openings stay transparent
    holes, n = ndi.label(1 - strong)
    sizes = ndi.sum(1 - strong, holes, range(1, n + 1))
    for i, s in enumerate(sizes):
        if s < 1200:
            strong[holes == i + 1] = 1
    near = cv2.dilate(strong, np.ones((7, 7), np.uint8)) > 0
    mask = ((strong > 0) | (near & (diff > 11))).astype(np.uint8)
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))

    # Remove baked ground shadows: flat (low local variance), darker than the backdrop, and touching the background.
    # (Stone faces are enclosed by dark outlines, so they are not adjacent to the background and are kept.)
    mean = cv2.blur(gray, (5, 5))
    std = np.sqrt(np.maximum(cv2.blur(gray * gray, (5, 5)) - mean * mean, 0))
    cand = ((gray < fit_bg - 7) & (diff < 60) & (std < 5.5)).astype(np.uint8)
    comp, n = ndi.label(cand, structure=np.ones((3, 3)))
    outside = (mask == 0).astype(np.uint8)
    touches = ndi.maximum(cv2.dilate(outside, np.ones((5, 5), np.uint8)), comp, range(1, n + 1))
    areas = ndi.sum(cand, comp, range(1, n + 1))
    for i in range(n):
        if touches[i] and areas[i] > 40:
            mask[comp == i + 1] = 0
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))

    out_dir = OUT / "props"
    out_dir.mkdir(parents=True, exist_ok=True)
    for name, box in PROPS_PREVIEW_BOXES.items():
        x0, y0, x1, y1 = [int(round(v * PREVIEW_TO_NATIVE)) for v in box]
        m = np.zeros_like(mask)
        m[y0:y1, x0:x1] = mask[y0:y1, x0:x1]
        lab, n = ndi.label(m)
        sizes = ndi.sum(m, lab, range(1, n + 1))
        keep = [i + 1 for i, s in enumerate(sizes) if s >= max(150, 0.02 * sizes.max())]
        mm = np.isin(lab, keep)
        ys, xs = np.where(mm)
        bx0, bx1, by0, by1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
        alpha = cv2.GaussianBlur(mm.astype(np.float32), (3, 3), 0.7)
        rgba = np.dstack([src, alpha * 255]).astype(np.uint8)[by0:by1, bx0:bx1]
        Image.fromarray(rgba, "RGBA").save(out_dir / f"prop_{name}.png", optimize=True)
    return len(PROPS_PREVIEW_BOXES)


def _smooth(t: np.ndarray) -> np.ndarray:
    return t * t * (3 - 2 * t)


def key_atmosphere() -> int:
    gray = np.array(Image.open(SRC / "atmosphere/veil_atmosphere_sheet.png").convert("L")).astype(np.float32)
    out_dir = OUT / "atmos"
    out_dir.mkdir(parents=True, exist_ok=True)
    for name, (box, (f_top, f_bot, f_side)) in ATMOS_PREVIEW_BOXES.items():
        x0, y0, x1, y1 = [int(round(v * PREVIEW_TO_NATIVE)) for v in box]
        lum = gray[y0:y1, x0:x1]
        h, w = lum.shape
        floor, hi = np.percentile(lum, 4), np.percentile(lum, 99.7)
        alpha = np.clip((lum - floor) / (hi - floor), 0, 1) ** 1.1
        iy = np.arange(h)
        fy = np.where(iy < h / 2, np.clip(iy / (h * f_top), 0, 1), np.clip((h - 1 - iy) / (h * f_bot), 0, 1))
        fx = np.clip(np.minimum(np.arange(w), np.arange(w)[::-1]) / (w * f_side), 0, 1)
        alpha *= _smooth(fy)[:, None] * _smooth(fx)[None, :]
        rgb = np.clip(lum * 1.1, 0, 255)
        rgba = np.dstack([np.repeat(rgb[..., None], 3, 2), alpha * 255]).astype(np.uint8)
        Image.fromarray(rgba, "RGBA").save(out_dir / f"atmos_{name}.png", optimize=True)
    return len(ATMOS_PREVIEW_BOXES)


def cut_occluders() -> list:
    master = Image.open(SRC / "master/veil_master_concept.png").convert("RGB")
    out_dir = OUT / "occluders"
    out_dir.mkdir(parents=True, exist_ok=True)
    manifest = []
    SS = 4  # supersample the mask for antialiased polygon edges
    for name, spec in OCCLUDERS.items():
        poly = spec["polygon"]
        xs, ys = [p[0] for p in poly], [p[1] for p in poly]
        x0, y0, x1, y1 = min(xs) - 2, min(ys) - 2, max(xs) + 2, max(ys) + 2
        w, h = x1 - x0, y1 - y0
        big = Image.new("L", (w * SS, h * SS), 0)
        from PIL import ImageDraw
        ImageDraw.Draw(big).polygon([((px - x0) * SS, (py - y0) * SS) for px, py in poly], fill=255)
        alpha = big.resize((w, h), Image.LANCZOS)
        crop = master.crop((x0, y0, x1, y1)).convert("RGBA")
        crop.putalpha(alpha)
        fname = f"occ_{name}.png"
        crop.save(out_dir / fname, optimize=True)
        manifest.append({"key": f"occ_{name}", "file": f"occluders/{fname}", "x": x0, "y": y0, "sortY": spec["sortY"]})
    (OUT / "occluders.json").write_text(json.dumps(manifest, indent=2))
    return manifest


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(SRC / "master/veil_master_concept.png", OUT / "veil_master.png")  # processed COPY; original untouched
    print("master    : copied")
    print(f"props     : {key_props()} keyed")
    print(f"atmosphere: {key_atmosphere()} converted")
    print(f"occluders : {len(cut_occluders())} cut")
    print(f"-> {OUT}")


if __name__ == "__main__":
    main()
