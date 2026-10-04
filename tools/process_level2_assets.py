#!/usr/bin/env python3
"""
Level 2 (THE CONDUIT) asset preprocessing.

Source: assets/raw_ai/environments/level2_conduit/ (ORIGINALS, never modified).
The master is an ANIMATED AVIF (240 frames, 24 fps) with flickering flames and flowing waterfalls. This tool:
  1. builds the STATIC plate (per-pixel temporal median of all 240 frames),
  2. cuts each flame / waterfall out of the video as a looping sprite sheet (seamless cross-fade loop, 12 fps),
  3. cuts the walk-behind occluders from the plate,
  4. converts the atmosphere sheet exactly like Level 1 (reuses tools/process_level1_assets.py).
Runtime copies go to public/assets/level2/. Run from the project root:  npm run assets:level2
Requires: python3, pillow (>=11, AVIF), numpy, scipy, opencv-python
"""
import json
from pathlib import Path

import cv2
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

import process_level1_assets as l1  # same folder; reuse the Level 1 pipeline (atmosphere keying, occluder cutter)

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "assets/raw_ai/environments/level2_conduit"
OUT = ROOT / "public/assets/level2"

# World pixels == master pixels (like Level 1): the 1280x720 master is upscaled once by WORLD_SCALE.
# Keep in sync with `S` in src/environment/level2Data.ts. All coordinates below are in 1280x720 source px.
WORLD_SCALE = 1.2

# ---- looping animation --------------------------------------------------------------------------------------------
LOOP_START, LOOP_LEN, LOOP_FADE, FRAME_STEP, FPS = 20, 160, 40, 2, 12  # video frames; sheet plays at 12 fps
SHEET_COLS = 10

# Flames: (search box, sortY). sortY = ground-contact line: the flame is drawn above the player when the player is
# north of it (walking behind the brazier) - same rule as occluders. None = background flame (never near the player).
FLAMES = {
    "altar": ((638, 205, 694, 308), 348),
    "nw": ((300, 180, 360, 238), 292),
    "w": ((272, 295, 325, 358), 418),
    "e": ((1040, 368, 1092, 418), 468),
    "se": ((880, 462, 932, 515), 545),
    "s": ((620, 485, 672, 548), 560),
    "n1": ((495, 40, 535, 100), None),
    "n2": ((570, 115, 625, 165), None),
}
# Waterfalls (all in the background, drawn just above the master).
WATER = {
    "fall_w1": (10, 240, 75, 430), "fall_w2": (178, 165, 222, 300), "fall_w3": (95, 280, 145, 380),
    "fall_n1": (360, 95, 420, 180), "fall_n2": (1088, 0, 1128, 105), "fall_e1": (890, 165, 950, 265),
    "fall_e2": (955, 250, 1000, 315), "fall_e3": (1165, 390, 1215, 505), "fall_e4": (1120, 490, 1185, 630),
    "fall_s1": (200, 485, 268, 645), "fall_s2": (495, 635, 560, 720),
}

ATMOS_PREVIEW_BOXES = {  # 1344px-wide preview coordinates of the atmosphere sheet (same keys as Level 1)
    "fog_wide": ((0, 40, 210, 150), (0.25, 0.40, 0.12)),
    "fog_puff": ((210, 5, 480, 150), (0.12, 0.30, 0.12)),
    "fog_wisp": ((490, 25, 700, 150), (0.12, 0.30, 0.12)),
    "fog_cloud": ((700, 5, 915, 160), (0.12, 0.30, 0.12)),
    "dust": ((620, 725, 800, 870), (0.12, 0.12, 0.12)),
    "motes": ((10, 355, 200, 470), (0.12, 0.12, 0.12)),
    "spirits": ((500, 355, 790, 490), (0.12, 0.12, 0.12)),
}

# Walk-behind cut-outs of the plate (they sit ABOVE the player while the player is north of sortY).
OCCLUDERS = {
    "altar": {
        "sortY": 348,
        "polygon": [(636, 280), (694, 280), (703, 298), (720, 300), (743, 299), (746, 322), (748, 345),
                    (720, 348), (665, 348), (610, 348),
                    (580, 345), (578, 322), (582, 304), (604, 302), (626, 298)],
    },
    "brazier_nw": {
        "sortY": 292,
        "polygon": [(304, 226), (326, 222), (350, 232), (352, 262), (350, 284), (336, 294), (318, 296), (306, 286), (303, 250)],
    },
    "brazier_w": {
        "sortY": 418,
        "polygon": [(276, 352), (300, 348), (310, 358), (326, 368), (328, 396), (325, 412), (310, 421), (286, 421),
                    (273, 410), (271, 380), (276, 362)],
    },
    "brazier_e": {
        "sortY": 468,
        "polygon": [(1044, 402), (1066, 398), (1086, 404), (1092, 425), (1092, 460), (1085, 470), (1066, 477),
                    (1047, 470), (1042, 440)],
    },
}


# -------------------------------------------------------------------------------------------------------------------
def load_frames() -> np.ndarray:
    im = Image.open(SRC / "master/conduit_master_concept.avif")
    frames = []
    for i in range(im.n_frames):
        im.seek(i)
        frames.append(np.array(im.convert("L")))  # the art is grayscale-only
    return np.stack(frames)


def motion_range(A: np.ndarray) -> np.ndarray:
    B = A[: len(A) // 4 * 4].reshape(-1, 4, *A.shape[1:]).astype(np.float32).mean(1)  # 4-frame average kills shimmer
    return cv2.GaussianBlur(B.max(0) - B.min(0), (0, 0), 1.5)


def _largest(mask: np.ndarray, frac: float) -> np.ndarray:
    lab, n = ndi.label(mask)
    if n == 0:
        return mask
    sizes = ndi.sum(mask, lab, range(1, n + 1))
    return np.isin(lab, [i + 1 for i, s in enumerate(sizes) if s >= frac * sizes.max()])


def flame_envelope(rng, box):
    x0, y0, x1, y1 = box
    m = np.zeros(rng.shape, bool)
    m[y0:y1, x0:x1] = rng[y0:y1, x0:x1] > 38
    m = _largest(m, 0.15)
    hull = np.zeros(rng.shape, np.uint8)
    pts = cv2.findNonZero(m.astype(np.uint8))
    if pts is not None:
        cv2.fillConvexPoly(hull, cv2.convexHull(pts), 1)  # flames are solid blobs: fill the bright, saturated core
    return ndi.binary_dilation(hull > 0, iterations=2)


def water_envelope(mean, rng, box):
    x0, y0, x1, y1 = box
    m = np.zeros(mean.shape, bool)
    m[y0:y1, x0:x1] = (mean[y0:y1, x0:x1] > 165) | (rng[y0:y1, x0:x1] > 34)
    m = ndi.binary_fill_holes(ndi.binary_closing(m, iterations=3))
    return ndi.binary_dilation(_largest(m, 0.2), iterations=5)


def loop_frames(A: np.ndarray, y0, y1, x0, x1):
    """Seamless loop: the last LOOP_FADE frames cross-fade into the frames that follow the loop window."""
    out = []
    s, L, K = LOOP_START, LOOP_LEN, LOOP_FADE
    for i in range(0, L, FRAME_STEP):
        a = A[s + i, y0:y1, x0:x1].astype(np.float32)
        if i < K:
            w = i / K
            a = w * a + (1 - w) * A[s + i + L, y0:y1, x0:x1].astype(np.float32)
        out.append(a)
    return out


def build_sprite(name, env, kind, sortY, A):
    S = WORLD_SCALE
    alpha = cv2.GaussianBlur(env.astype(np.float32), (0, 0), 4.0 if kind == "flame" else 2.5)
    ys, xs = np.where(alpha > 0.01)
    if len(ys) == 0:
        return None
    pad = 6
    y0, y1 = max(ys.min() - pad, 0), min(ys.max() + pad + 1, A.shape[1])
    x0, x1 = max(xs.min() - pad, 0), min(xs.max() + pad + 1, A.shape[2])
    fw, fh = round((x1 - x0) * S), round((y1 - y0) * S)
    a_s = np.clip(cv2.resize(alpha[y0:y1, x0:x1], (fw, fh), interpolation=cv2.INTER_LINEAR), 0, 1)
    frames = loop_frames(A, y0, y1, x0, x1)
    n = len(frames)
    rows = -(-n // SHEET_COLS)
    sheet = np.zeros((rows * fh, SHEET_COLS * fw, 4), np.uint8)
    for k, f in enumerate(frames):
        g = np.clip(cv2.resize(f, (fw, fh), interpolation=cv2.INTER_LANCZOS4), 0, 255).astype(np.uint8)
        r, c = divmod(k, SHEET_COLS)
        tile = sheet[r * fh:(r + 1) * fh, c * fw:(c + 1) * fw]
        tile[..., :3] = g[..., None]
        tile[..., 3] = (a_s * 255).astype(np.uint8)
    (OUT / "anim").mkdir(parents=True, exist_ok=True)
    Image.fromarray(sheet, "RGBA").save(OUT / "anim" / f"{name}.png", optimize=True)
    return {
        "key": f"level2_anim_{name}", "file": f"anim/{name}.png", "x": round(x0 * S), "y": round(y0 * S),
        "w": fw, "h": fh, "frames": n, "fps": FPS, "kind": kind,
        "sortY": None if sortY is None else round(sortY * S),
    }


def premultiply_occluders(manifest) -> None:
    """Phaser composites these with a premultiplied-alpha blend: store RGB*alpha so soft edges don't glow."""
    for o in manifest:
        f = OUT / o["file"]
        im = np.array(Image.open(f).convert("RGBA")).astype(np.float32)
        im[..., :3] *= im[..., 3:4] / 255.0
        Image.fromarray(np.round(im).astype(np.uint8), "RGBA").save(f, optimize=True)


def main() -> None:
    S = WORLD_SCALE
    OUT.mkdir(parents=True, exist_ok=True)
    A = load_frames()
    rng = motion_range(A)
    mean = cv2.GaussianBlur(A.astype(np.float32).mean(0), (0, 0), 1.5)

    manifest = []
    for name, (box, sortY) in FLAMES.items():
        e = build_sprite(name, flame_envelope(rng, box), "flame", sortY, A)
        if e: manifest.append(e)
    for name, box in WATER.items():
        e = build_sprite(name, water_envelope(mean, rng, box), "water", None, A)
        if e: manifest.append(e)
    (OUT / "anim.json").write_text(json.dumps(manifest, indent=2))

    plate = np.median(A, axis=0)
    h, w = plate.shape
    master = Image.fromarray(np.clip(plate, 0, 255).astype(np.uint8), "L").convert("RGB")
    master = master.resize((round(w * S), round(h * S)), Image.LANCZOS)
    master.save(OUT / "conduit_master.png", optimize=True)  # processed COPY; originals untouched
    print(f"master    : {master.size[0]}x{master.size[1]} static plate written")
    print(f"animations: {len(manifest)} looping sprites ({sum(1 for m in manifest if m['kind']=='flame')} flames, "
          f"{sum(1 for m in manifest if m['kind']=='water')} waterfalls)")
    print(f"atmosphere: {l1.key_atmosphere(SRC / 'atmosphere/conduit_atmosphere_sheet.png', OUT, ATMOS_PREVIEW_BOXES)} converted")
    scaled = {
        n: {"sortY": round(o["sortY"] * S), "polygon": [(round(x * S), round(y * S)) for x, y in o["polygon"]]}
        for n, o in OCCLUDERS.items()
    }
    occ = l1.cut_occluders(master, OUT, scaled, feather=1.5)
    premultiply_occluders(occ)
    print(f"occluders : {len(occ)} cut")
    print(f"-> {OUT}")


if __name__ == "__main__":
    main()
