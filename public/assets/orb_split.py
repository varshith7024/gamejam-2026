#!/usr/bin/env python3
"""
Split a spritesheet that is divided into cells by gray grid lines.

Layout assumed (same convention as the Diablo sheets):
    each ROW    = one facing direction
    each COLUMN = one animation frame

What it does
------------
1. Finds the gray separator lines and cuts the sheet into cells between them
   (so uneven / slightly wobbly grids are fine).
2. Puts every frame on ONE uniform canvas size.
3. Registers the frames: by default the bright core of the sprite is pinned to the same
   pixel in every frame, so the animation doesn't jitter even when the sprite wasn't
   drawn at exactly the same spot inside each cell. (--align cell skips this and just
   centres each cell.)
4. Saves each frame with a descriptive name.

Output
------
    <out>/<name>/dir0_f00.png ... dir7_f07.png   (dirR = row, fCC = frame column)
    <out>/<name>/<name>_strip.png                 all frames re-packed in a uniform grid
    <out>/<name>/manifest.json                    sizes, counts, anchor point

With --dir-names N,NE,E,... the files become N_f00.png, NE_f00.png, ... instead.

Usage
-----
    python split_grid_sheet.py sheet.png --name orb
    python split_grid_sheet.py sheet.png --name orb -o frames --transparent
    python split_grid_sheet.py sheet.png --name orb --dir-names N,NE,E,SE,S,SW,W,NW
    python split_grid_sheet.py sheet.png --name orb --align cell
    python split_grid_sheet.py sheet.png --name orb --debug     # writes <name>_debug.png

Requires: pillow, numpy, scipy
"""

import argparse
import json
import os
import sys

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi


# --------------------------------------------------------------------------- #
# Grid detection
# --------------------------------------------------------------------------- #
def find_runs(profile, thr):
    idx = np.flatnonzero(profile > thr)
    if idx.size == 0:
        return []
    splits = np.flatnonzero(np.diff(idx) > 1)
    starts = np.r_[idx[0], idx[splits + 1]]
    ends = np.r_[idx[splits], idx[-1]]
    return list(zip(starts.tolist(), ends.tolist()))


def cells_from_runs(runs, length, min_size):
    """Cell intervals [lo, hi) lying between consecutive line runs. The image edges
    count as boundaries if there is no line right at the edge."""
    runs = list(runs)
    if not runs or runs[0][0] > 0:
        runs.insert(0, (-1, -1))
    if runs[-1][1] < length - 1:
        runs.append((length, length))
    out = []
    for (_, e0), (s1, _) in zip(runs, runs[1:]):
        lo, hi = e0 + 1, s1
        if hi - lo >= min_size:
            out.append((lo, hi))
    return out


def detect_grid(rgb, min_cell=20, line_frac=0.5):
    """Return (x_intervals, y_intervals, bg_colour)."""
    f = rgb.astype(np.float32)
    lum = f.mean(axis=2)
    sat = f.max(axis=2) - f.min(axis=2)
    bg_lum = float(np.median(lum))
    # separator lines: neutral grey, clearly brighter than the background
    line = (sat <= 14) & (lum >= bg_lum + 16) & (lum <= 140)
    xs = cells_from_runs(
        find_runs(line.mean(axis=0), line_frac), rgb.shape[1], min_cell
    )
    ys = cells_from_runs(
        find_runs(line.mean(axis=1), line_frac), rgb.shape[0], min_cell
    )
    return xs, ys


# --------------------------------------------------------------------------- #
# Per-cell analysis
# --------------------------------------------------------------------------- #
def find_core(cell):
    """Centroid (x, y) of the brightest blob (the glowing core). None if not found."""
    lum = cell.astype(np.float32).mean(axis=2)
    top = lum.max()
    if top < 60:
        return None
    mask = lum >= 0.93 * top
    lab, n = ndi.label(mask)
    if n == 0:
        return None
    sizes = ndi.sum(mask, lab, range(1, n + 1))
    k = 1 + int(np.argmax(sizes))
    cy, cx = ndi.center_of_mass(lab == k)
    return cx, cy


def content_bbox(cell, bg, tol):
    diff = np.abs(cell.astype(np.int16) - bg.astype(np.int16)).max(axis=2)
    m = diff > tol
    if not m.any():
        return None
    ys, xs = np.where(m)
    return xs.min(), ys.min(), xs.max(), ys.max()


def background_mask(cell, bg, tol):
    """Background = near-bg pixels connected to the cell border (so dark pixels
    inside the sprite are kept)."""
    near = np.abs(cell.astype(np.int16) - bg.astype(np.int16)).max(axis=2) <= tol
    lab, n = ndi.label(near)
    if n == 0:
        return np.zeros(near.shape, bool)
    border = np.unique(np.r_[lab[0], lab[-1], lab[:, 0], lab[:, -1]])
    border = border[border > 0]
    return np.isin(lab, border)


def paste(canvas, tile, ox, oy):
    """Paste `tile` onto `canvas` at (ox, oy), clipping whatever falls outside."""
    H, W = canvas.shape[:2]
    h, w = tile.shape[:2]
    x0, y0 = max(ox, 0), max(oy, 0)
    x1, y1 = min(ox + w, W), min(oy + h, H)
    if x1 > x0 and y1 > y0:
        canvas[y0:y1, x0:x1] = tile[y0 - oy : y1 - oy, x0 - ox : x1 - ox]


# --------------------------------------------------------------------------- #
# Main
# --------------------------------------------------------------------------- #
def main():
    ap = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    ap.add_argument("image")
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
        "--align",
        choices=["core", "cell"],
        default="core",
        help="core = pin the bright core to one pixel in every frame (default); "
        "cell = just centre each cell",
    )
    ap.add_argument(
        "--pad",
        type=int,
        default=6,
        help="extra margin around the sprites in px (core mode, default 6)",
    )
    ap.add_argument(
        "--inset",
        type=int,
        default=1,
        help="trim this many px inside each cell to drop line fringe (default 1)",
    )
    ap.add_argument(
        "--content-tol",
        type=int,
        default=24,
        help="how far a pixel must differ from the background to count as sprite (default 24)",
    )
    ap.add_argument(
        "--transparent", action="store_true", help="make the background transparent"
    )
    ap.add_argument(
        "--bg-tol",
        type=int,
        default=14,
        help="background colour tolerance for --transparent (default 14)",
    )
    ap.add_argument(
        "--debug",
        action="store_true",
        help="write <name>_debug.png showing the detected grid and cores",
    )
    args = ap.parse_args()

    img = Image.open(args.image).convert("RGB")
    rgb = np.array(img)
    xs, ys = detect_grid(rgb)
    ncols, nrows = len(xs), len(ys)
    if not ncols or not nrows:
        sys.exit("couldn't find any grid lines / cells")
    print(f"detected {nrows} rows (directions) x {ncols} columns (frames)")

    dir_names = None
    if args.dir_names:
        dir_names = [d.strip() for d in args.dir_names.split(",")]
        if len(dir_names) != nrows:
            sys.exit(
                f"--dir-names has {len(dir_names)} names but the sheet has {nrows} rows"
            )

    # background colour: median of the 2px ring around every cell
    ring = []
    for y0, y1 in ys:
        for x0, x1 in xs:
            c = rgb[
                y0 + args.inset : y1 - args.inset, x0 + args.inset : x1 - args.inset
            ]
            ring += [
                c[:2].reshape(-1, 3),
                c[-2:].reshape(-1, 3),
                c[:, :2].reshape(-1, 3),
                c[:, -2:].reshape(-1, 3),
            ]
    bg = np.median(np.concatenate(ring), axis=0).astype(np.int16)
    print("background colour:", tuple(int(v) for v in bg))

    # ---- pass 1: crop cells, find anchors, accumulate how big the canvas must be
    tiles, anchors, dbg = {}, {}, []
    L = R = U = D = 0
    for r, (y0, y1) in enumerate(ys):
        for c, (x0, x1) in enumerate(xs):
            cell = rgb[
                y0 + args.inset : y1 - args.inset, x0 + args.inset : x1 - args.inset
            ]
            h, w = cell.shape[:2]
            if args.align == "core":
                core = find_core(cell)
                box = content_bbox(cell, bg, args.content_tol)
                if core is None or box is None:
                    print(
                        f"  warning: no core found in row {r} col {c}; centring that cell"
                    )
                    ax, ay = w // 2, h // 2
                    box = (0, 0, w - 1, h - 1)
                else:
                    ax, ay = int(round(core[0])), int(round(core[1]))
                L = max(L, ax - int(box[0]))
                R = max(R, int(box[2]) - ax)
                U = max(U, ay - int(box[1]))
                D = max(D, int(box[3]) - ay)
            else:
                ax, ay = w // 2, h // 2
                L = max(L, ax)
                R = max(R, w - 1 - ax)
                U = max(U, ay)
                D = max(D, h - 1 - ay)
            tiles[(r, c)] = cell
            anchors[(r, c)] = (ax, ay)
            dbg.append((r, c, x0 + args.inset + ax, y0 + args.inset + ay))

    pad = args.pad if args.align == "core" else 0
    half_w = int(max(L, R) + pad)  # symmetric, so the anchor sits on the centre pixel
    half_h = int(max(U, D) + pad)
    CW, CH = 2 * half_w + 1, 2 * half_h + 1
    print(f"uniform frame size: {CW} x {CH}  (anchor pixel at {half_w},{half_h})")

    # ---- pass 2: render frames
    outdir = os.path.join(args.out, args.name)
    os.makedirs(outdir, exist_ok=True)
    bg8 = bg.clip(0, 255).astype(np.uint8)
    files = []
    strip = Image.new("RGBA", (CW * ncols, CH * nrows), (0, 0, 0, 0))
    for (r, c), cell in tiles.items():
        ax, ay = anchors[(r, c)]
        if args.transparent:
            canvas = np.zeros((CH, CW, 4), np.uint8)
            tile = np.dstack([cell, np.full(cell.shape[:2], 255, np.uint8)])
            tile[background_mask(cell, bg, args.bg_tol), 3] = 0
        else:
            canvas = np.empty((CH, CW, 3), np.uint8)
            canvas[:] = bg8
            tile = cell
        paste(canvas, tile, half_w - ax, half_h - ay)
        frame = Image.fromarray(canvas)

        label = dir_names[r] if dir_names else f"dir{r}"
        fname = f"{label}_f{c:02d}.png"
        frame.save(os.path.join(outdir, fname))
        strip.paste(frame.convert("RGBA"), (c * CW, r * CH))
        files.append(fname)

    strip_name = f"{args.name}_strip.png"
    (strip if args.transparent else strip.convert("RGB")).save(
        os.path.join(outdir, strip_name)
    )
    manifest = {
        "name": args.name,
        "source": os.path.basename(args.image),
        "frame_size": [CW, CH],
        "anchor": [half_w, half_h],
        "directions": nrows,
        "frames_per_direction": ncols,
        "direction_labels": dir_names or [f"dir{r}" for r in range(nrows)],
        "align": args.align,
        "transparent": args.transparent,
        "files": sorted(files),
    }
    with open(os.path.join(outdir, "manifest.json"), "w") as f:
        json.dump(manifest, f, indent=2)
    print(f"wrote {len(files)} frames + {strip_name} + manifest.json -> {outdir}")

    if args.debug:
        ov = img.copy()
        d = ImageDraw.Draw(ov)
        for y0, y1 in ys:
            for x0, x1 in xs:
                d.rectangle([x0, y0, x1 - 1, y1 - 1], outline=(0, 255, 0))
        for _, _, px, py in dbg:
            d.line([(px - 5, py), (px + 5, py)], fill=(255, 0, 0))
            d.line([(px, py - 5), (px, py + 5)], fill=(255, 0, 0))
        dp = f"{args.name}_debug.png"
        ov.save(dp)
        print("wrote", dp)


if __name__ == "__main__":
    main()
