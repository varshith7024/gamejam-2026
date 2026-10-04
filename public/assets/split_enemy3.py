#!/usr/bin/env python3
"""
Split a sprite sheet into individual, uniformly-sized, registered frames -- WITHOUT needing
any grid lines in the image.

Sheet format assumed:
    each ROW    = one facing direction
    each COLUMN = one animation frame
    sprites sit on a plain background (or transparent), with empty space between cells.

How cells are found (content only, no lines)
--------------------------------------------
Everything that differs from the background counts as "sprite". Looking at where sprites are
(projected onto the x and y axes) reveals the empty gaps that separate the rows and columns.
Each cut is placed in the middle of the gap nearest to where an even split would put it, so
sheets whose rows/columns are unevenly spaced still split correctly. If you don't know the
row/column counts, pass `--rows auto --cols auto`.

Then every frame is placed on ONE uniform canvas and registered to a common anchor so the
animation doesn't jitter (see --align).

Usage
-----
    python split_sprite_sheet.py sheet.png --name knight                  # 8 rows x 8 cols
    python split_sprite_sheet.py sheet.png --name knight --rows 8 --cols 12
    python split_sprite_sheet.py sheet.png --name knight --rows auto --cols auto
    python split_sprite_sheet.py sheet.png --name knight --transparent
    python split_sprite_sheet.py sheet.png --name knight --dir-names S,SW,W,NW,N,NE,E,SE
    python split_sprite_sheet.py sheet.png --name orb --align core        # glowing orbs/effects
    python split_sprite_sheet.py sheet.png --name knight --debug          # <name>_debug.png

Alignment (--align)
-------------------
    centroid  (default) anchor = centre of mass of the sprite. Works for most things.
    feet      horizontal centre of mass, vertical = bottom of the sprite (planted feet).
    core      anchor = the brightest blob (glowing orbs, projectiles).
    cell      no registration; each cell is simply centred. Faithful to the sheet but any
              wobble in how the sheet was drawn stays in the frames.

Output
------
    <out>/<name>/dir0_f00.png ... dirR_fCC.png    (dir = row, f = frame column)
    <out>/<name>/<name>_strip.png                 all frames re-packed in a uniform grid
    <out>/<name>/manifest.json                    frame size, anchor pixel, cut positions, files
With --dir-names the files are named e.g. N_f00.png instead of dir0_f00.png.

If the sheet has an alpha channel with real transparency it is used as-is (background =
transparent). Otherwise the background colour is taken from the image (override with --bg-color).
Sheets that still contain drawn grid lines should have those lines removed first.

Requires: pillow, numpy, scipy
"""

import argparse
import json
import os
import sys

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi

NOISE_LEVELS = (
    0,
    1,
    2,
    4,
    8,
    16,
)  # how many stray pixels a column/row may hold and still count as "empty"


# --------------------------------------------------------------------------- #
# Finding the cuts between rows / columns
# --------------------------------------------------------------------------- #
def runs_where(mask):
    idx = np.flatnonzero(mask)
    if idx.size == 0:
        return []
    sp = np.flatnonzero(np.diff(idx) > 1)
    starts = np.r_[idx[0], idx[sp + 1]]
    ends = np.r_[idx[sp], idx[-1]]
    return list(zip(starts.tolist(), ends.tolist()))


def find_cuts_fixed(occ, n):
    """n cells along an axis -> n-1 cut positions, each in the middle of the empty gap
    nearest to an even split. `occ` = number of sprite pixels per row/column."""
    L = len(occ)
    pitch = L / n
    min_w = max(3, int(0.02 * pitch))
    gap_cache = {}
    cuts, prev = [], 0
    for i in range(1, n):
        ideal = i * pitch
        lo, hi = ideal - 0.4 * pitch, ideal + 0.4 * pitch
        choice = None
        for nz in NOISE_LEVELS:
            if nz not in gap_cache:
                gap_cache[nz] = runs_where(occ <= nz)
            cand = [
                (s, e)
                for s, e in gap_cache[nz]
                if e - s + 1 >= min_w
                and lo <= (s + e) / 2 <= hi
                and (s + e) // 2 > prev
            ]
            if cand:
                s, e = max(
                    cand, key=lambda r: ((r[1] - r[0]), -abs((r[0] + r[1]) / 2 - ideal))
                )
                choice = (s + e) // 2
                break
        if choice is None:  # touching sprites: take the emptiest spot
            a, b = max(prev + 1, int(lo)), min(L - 1, int(hi))
            seg = occ[a : b + 1] if b >= a else occ[prev + 1 : prev + 2]
            best = max(runs_where(seg == seg.min()), key=lambda r: r[1] - r[0])
            choice = a + (best[0] + best[1]) // 2
            print(
                f"  warning: no clean gap near {int(ideal)}; cutting through {int(occ[choice])} sprite pixels at {choice}"
            )
        cuts.append(int(choice))
        prev = choice
    return cuts


def find_cuts_auto(occ, min_gap):
    """Unknown cell count: every band of sprite pixels separated by an empty gap is one cell."""
    bands = runs_where(occ > 0)
    merged = []
    for s, e in bands:  # bridge tiny gaps (detached specks, thin lines of sprite)
        if merged and s - merged[-1][1] - 1 < min_gap:
            merged[-1] = (merged[-1][0], e)
        else:
            merged.append((s, e))
    mass = [occ[s : e + 1].sum() for s, e in merged]
    if not mass:
        return []
    keep = [
        m >= 0.03 * np.median(mass) for m in mass
    ]  # drop bands that are only stray specks
    merged = [b for b, k in zip(merged, keep) if k]
    return [(merged[i][1] + merged[i + 1][0]) // 2 for i in range(len(merged) - 1)]


def get_cuts(occ, count, min_gap):
    if str(count).lower() == "auto":
        return find_cuts_auto(occ, min_gap)
    return find_cuts_fixed(occ, int(count))


# --------------------------------------------------------------------------- #
# Per-frame helpers
# --------------------------------------------------------------------------- #
def find_core(lum):
    top = lum.max()
    if top < 60:
        return None
    mask = lum >= 0.93 * top
    lab, n = ndi.label(mask)
    sizes = ndi.sum(mask, lab, range(1, n + 1))
    cy, cx = ndi.center_of_mass(lab == 1 + int(np.argmax(sizes)))
    return cx, cy


def anchor_for(mode, content, lum):
    """(x, y) anchor inside the cell, plus the content bbox (x0, y0, x1, y1) or None."""
    h, w = content.shape
    if not content.any():
        return (w // 2, h // 2), None
    ys, xs = np.where(content)
    box = (int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max()))
    if mode == "cell":
        return (w // 2, h // 2), box
    if mode == "core":
        core = find_core(lum)
        if core is not None:
            return (int(round(core[0])), int(round(core[1]))), box
    cy, cx = ndi.center_of_mass(content)
    if mode == "feet":
        return (int(round(cx)), box[3]), box
    return (int(round(cx)), int(round(cy))), box  # centroid (also core fallback)


def background_mask(diff, tol):
    """Background = near-bg pixels connected to the cell border (dark pixels inside the
    sprite are kept)."""
    near = diff <= tol
    lab, n = ndi.label(near)
    if n == 0:
        return np.zeros(near.shape, bool)
    border = np.unique(np.r_[lab[0], lab[-1], lab[:, 0], lab[:, -1]])
    return np.isin(lab, border[border > 0])


def paste(canvas, tile, ox, oy):
    H, W = canvas.shape[:2]
    h, w = tile.shape[:2]
    x0, y0, x1, y1 = max(ox, 0), max(oy, 0), min(ox + w, W), min(oy + h, H)
    if x1 > x0 and y1 > y0:
        canvas[y0:y1, x0:x1] = tile[y0 - oy : y1 - oy, x0 - ox : x1 - ox]


def parse_color(s):
    s = s.strip().lstrip("#")
    if "," in s:
        return np.array([int(v) for v in s.split(",")], np.int16)
    return np.array([int(s[i : i + 2], 16) for i in (0, 2, 4)], np.int16)


# --------------------------------------------------------------------------- #
# Main
# --------------------------------------------------------------------------- #
def main():
    ap = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    ap.add_argument("image")
    ap.add_argument(
        "--rows", default="8", help="number of rows / directions, or 'auto' (default 8)"
    )
    ap.add_argument(
        "--cols", default="8", help="number of columns / frames, or 'auto' (default 8)"
    )
    ap.add_argument(
        "--name",
        default="sprite",
        help="animation name; used for the output folder (default: sprite)",
    )
    ap.add_argument(
        "-o", "--out", default="out", help="output root folder (default: out)"
    )
    ap.add_argument(
        "--dir-names",
        default=None,
        help="comma-separated names for the rows, e.g. N,NE,E,SE,S,SW,W,NW (default: dir0, dir1, ...)",
    )
    ap.add_argument(
        "--align", choices=["centroid", "feet", "core", "cell"], default="centroid"
    )
    ap.add_argument(
        "--pad", type=int, default=4, help="margin around the sprites in px (default 4)"
    )
    ap.add_argument(
        "--symmetric",
        action="store_true",
        help="make the canvas symmetric around the anchor (anchor = centre pixel)",
    )
    ap.add_argument(
        "--content-tol",
        type=int,
        default=24,
        help="how far a pixel must differ from the background to count as sprite (default 24)",
    )
    ap.add_argument(
        "--bg-color",
        default=None,
        help="background colour, '#rrggbb' or 'r,g,b' (default: auto-detect)",
    )
    ap.add_argument(
        "--min-gap",
        type=int,
        default=6,
        help="with 'auto' counts: smallest empty gap that separates cells",
    )
    ap.add_argument(
        "--transparent", action="store_true", help="make the background transparent"
    )
    ap.add_argument(
        "--bg-tol",
        type=int,
        default=14,
        help="background tolerance for --transparent (default 14)",
    )
    ap.add_argument(
        "--debug",
        action="store_true",
        help="write <name>_debug.png with the detected cuts and anchors",
    )
    args = ap.parse_args()

    src = Image.open(args.image)
    has_alpha = False
    if src.mode in ("RGBA", "LA", "PA") or "transparency" in src.info:
        rgba = np.array(src.convert("RGBA"))
        has_alpha = bool((rgba[..., 3] < 8).mean() > 0.01)
    rgb = np.array(src.convert("RGB"))
    H, W = rgb.shape[:2]

    if has_alpha:
        content = rgba[..., 3] >= 8
        diff = None
        bg = np.zeros(3, np.int16)
        print("using the image's transparency as the background")
    else:
        bg = (
            parse_color(args.bg_color)
            if args.bg_color
            else np.median(rgb.reshape(-1, 3), axis=0).astype(np.int16)
        )
        diff = np.abs(rgb.astype(np.int16) - bg).max(axis=2)
        content = diff > args.content_tol
        print("background colour:", tuple(int(v) for v in bg))
    if not content.any():
        sys.exit("found no sprites (everything matches the background)")

    xcuts = get_cuts(content.sum(axis=0), args.cols, args.min_gap)
    ycuts = get_cuts(content.sum(axis=1), args.rows, args.min_gap)
    xb, yb = [0] + xcuts + [W], [0] + ycuts + [H]
    ncols, nrows = len(xb) - 1, len(yb) - 1
    print(f"detected {nrows} rows (directions) x {ncols} columns (frames)")
    print("  column cuts at x =", xcuts)
    print("  row cuts at y    =", ycuts)

    dir_names = None
    if args.dir_names:
        dir_names = [d.strip() for d in args.dir_names.split(",")]
        if len(dir_names) != nrows:
            sys.exit(
                f"--dir-names has {len(dir_names)} names but the sheet has {nrows} rows"
            )

    lum_full = rgb.astype(np.float32).mean(axis=2)
    if has_alpha:
        lum_full = lum_full * (rgba[..., 3] / 255.0)

    # ---- pass 1: anchors + how big the canvas has to be
    info = {}
    L = R = U = D = 0
    for r in range(nrows):
        for c in range(ncols):
            x0, x1, y0, y1 = xb[c], xb[c + 1], yb[r], yb[r + 1]
            (ax, ay), box = anchor_for(
                args.align, content[y0:y1, x0:x1], lum_full[y0:y1, x0:x1]
            )
            if box is None:
                print(f"  warning: row {r} col {c} is empty")
                box = (ax, ay, ax, ay)
            info[(r, c)] = (ax, ay)
            L = max(L, ax - box[0])
            R = max(R, box[2] - ax)
            U = max(U, ay - box[1])
            D = max(D, box[3] - ay)
    if args.symmetric:
        L = R = max(L, R)
        U = D = max(U, D)
    L, R, U, D = (
        int(L + args.pad),
        int(R + args.pad),
        int(U + args.pad),
        int(D + args.pad),
    )
    CW, CH = L + R + 1, U + D + 1
    print(f"uniform frame size: {CW} x {CH}  (anchor pixel at x={L}, y={U})")

    # ---- pass 2: render
    outdir = os.path.join(args.out, args.name)
    os.makedirs(outdir, exist_ok=True)
    alpha_out = args.transparent or has_alpha
    bg8 = bg.clip(0, 255).astype(np.uint8)
    strip = Image.new("RGBA", (CW * ncols, CH * nrows), (0, 0, 0, 0))
    files = []
    for r in range(nrows):
        for c in range(ncols):
            x0, x1, y0, y1 = xb[c], xb[c + 1], yb[r], yb[r + 1]
            ax, ay = info[(r, c)]
            if alpha_out:
                canvas = np.zeros((CH, CW, 4), np.uint8)
                if has_alpha:
                    tile = rgba[y0:y1, x0:x1].copy()
                else:
                    tile = np.dstack(
                        [rgb[y0:y1, x0:x1], np.full((y1 - y0, x1 - x0), 255, np.uint8)]
                    )
                    tile[background_mask(diff[y0:y1, x0:x1], args.bg_tol), 3] = 0
            else:
                canvas = np.empty((CH, CW, 3), np.uint8)
                canvas[:] = bg8
                tile = rgb[y0:y1, x0:x1]
            paste(canvas, tile, L - ax, U - ay)
            frame = Image.fromarray(canvas)
            fname = f"{dir_names[r] if dir_names else f'dir{r}'}_f{c:02d}.png"
            frame.save(os.path.join(outdir, fname))
            strip.paste(frame.convert("RGBA"), (c * CW, r * CH))
            files.append(fname)

    strip_name = f"{args.name}_strip.png"
    (strip if alpha_out else strip.convert("RGB")).save(
        os.path.join(outdir, strip_name)
    )
    manifest = {
        "name": args.name,
        "source": os.path.basename(args.image),
        "frame_size": [CW, CH],
        "anchor": [L, U],
        "align": args.align,
        "directions": nrows,
        "frames_per_direction": ncols,
        "direction_labels": dir_names or [f"dir{r}" for r in range(nrows)],
        "column_cuts": xcuts,
        "row_cuts": ycuts,
        "transparent": bool(alpha_out),
        "files": sorted(files),
    }
    with open(os.path.join(outdir, "manifest.json"), "w") as f:
        json.dump(manifest, f, indent=2)
    print(f"wrote {len(files)} frames + {strip_name} + manifest.json -> {outdir}")

    if args.debug:
        ov = src.convert("RGBA")
        bgl = Image.new("RGBA", ov.size, tuple(int(v) for v in bg8) + (255,))
        bgl.alpha_composite(ov)
        ov = bgl.convert("RGB")
        d = ImageDraw.Draw(ov)
        for x in xcuts:
            d.line([(x, 0), (x, H)], fill=(0, 255, 0))
        for y in ycuts:
            d.line([(0, y), (W, y)], fill=(0, 255, 0))
        for (r, c), (ax, ay) in info.items():
            px, py = xb[c] + ax, yb[r] + ay
            d.line([(px - 5, py), (px + 5, py)], fill=(255, 0, 0))
            d.line([(px, py - 5), (px, py + 5)], fill=(255, 0, 0))
        dp = f"{args.name}_debug.png"
        ov.save(dp)
        print("wrote", dp)


if __name__ == "__main__":
    main()
