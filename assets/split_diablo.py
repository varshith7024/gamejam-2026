#!/usr/bin/env python3
"""
Split the Diablo packed animation atlas into individual frames.

How the sheet is laid out
-------------------------
* The atlas is a bin-packed collection of animation blocks on a pink (252,176,176)
  background. The pink is padding and is ignored.
* Each block is a flat grey (170,170,170) rectangle with a ~6px title strip above it.
* Inside a block: 8 rows (one per facing direction) x N columns (animation frames).
  Cell sizes are fractional (the atlas was scaled), so the grid is fitted per block
  and every cut is snapped to the nearest empty gap so no sprite gets clipped.

Usage
-----
    python split_diablo.py diablo.png                    # -> ./out/<Animation>/dirD_fFF.png
    python split_diablo.py diablo.png -o frames --transparent
    python split_diablo.py diablo.png --debug            # also writes debug_overlay.png
    python split_diablo.py diablo.png --raw              # tight snapped crops, no alignment padding

Outputs (in the output dir)
---------------------------
    <Animation>/dir0_f00.png ...      individual frames (dir = row, f = column)
    <Animation>/<Animation>_strip.png the animation re-packed as a clean uniform grid
    manifest.json                     block rects, frame counts, cell sizes

Requires: pillow, numpy, scipy
"""

import argparse
import json
import math
import os

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi

BG = 170  # flat grey inside every block
BG_TOL = 8  # tolerance for "is background grey" (the png has slight noise)
SPRITE_TOL = 14  # deviation from grey that counts as sprite pixel
PINK = (252, 176, 176)

# Block titles, in detection order (top-to-bottom, then left-to-right).
# Read from the title strips of this particular sheet.
NAMES = [
    "Run",
    "Death",
    "Attack2",
    "Special1",
    "Special3",
    "Attack1",
    "Special2",
    "GetHit",
    "Special4",
    "SpecialCast",
    "Walk",
    "Neutral",
    "Block",
]

# The "Death" block has no strip of its own: its title text is drawn on the first
# 6 rows of the block, and its edges are blurred by the sheet's compression, so its
# rect is pinned by hand (x0, y0, x1, y1).
RECT_OVERRIDES = {"Death": (2447, 857, 2518, 920)}


# --------------------------------------------------------------------------- #
# Block detection
# --------------------------------------------------------------------------- #
def is_pinkish(a):
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    return (
        (r >= 225) & (g >= 150) & (g <= 205) & (b >= 150) & (b <= 205) & (r - g >= 35)
    )


def sprite_mask(a):
    """Pixels that differ from the grey background, excluding pink padding and the
    pale title strips (white / grey / yellow) that sit between blocks."""
    strip = (a[..., 0] >= 200) & (a[..., 1] >= 200)
    return (np.abs(a - BG).max(axis=2) > SPRITE_TOL) & ~is_pinkish(a) & ~strip


def detect_blocks(a):
    """Find the grey rectangles. Title strips (white/pink/yellow) and the pink
    padding aren't grey, so they naturally separate the blocks."""
    bg = np.abs(a - BG).max(axis=2) <= BG_TOL
    bg = ndi.binary_opening(bg, np.ones((3, 3)))
    lab, n = ndi.label(bg)
    sizes = ndi.sum(bg, lab, range(1, n + 1))

    boxes = []
    for i, sl in enumerate(ndi.find_objects(lab)):
        h = sl[0].stop - sl[0].start
        w = sl[1].stop - sl[1].start
        if sizes[i] > 600 and w > 40 and h > 40:
            boxes.append([sl[1].start, sl[0].start, sl[1].stop, sl[0].stop])
    boxes.sort(key=lambda b: (b[1], b[0]))

    # A sprite that touches its block's edge (e.g. the single "Death" frame) hides
    # the grey there, so the box comes out short. Grow edges while sprite pixels
    # touch them, stopping at pink padding / other blocks.
    sprite = sprite_mask(a)
    # "content" = grey background or dark sprite pixels. Title strips and pink
    # padding are neither, so growth stops at them.
    content = (np.abs(a - BG).max(axis=2) <= BG_TOL) | (a.max(axis=2) < 150)
    H, W = sprite.shape

    def overlaps_other(box, i):
        for j, o in enumerate(boxes):
            if (
                j != i
                and box[0] < o[2]
                and o[0] < box[2]
                and box[1] < o[3]
                and o[1] < box[3]
            ):
                return True
        return False

    for i, b in enumerate(boxes):
        grew = True
        while grew:
            grew = False
            x0, y0, x1, y1 = b
            # bottom
            if (
                y1 < H
                and sprite[y1 - 1, x0:x1].sum() >= 3
                and content[y1, x0:x1].mean() >= 0.4
            ):
                if not overlaps_other([x0, y0, x1, y1 + 1], i):
                    b[3] += 1
                    grew = True
            # right
            if (
                x1 < W
                and sprite[y0:y1, x1 - 1].sum() >= 3
                and content[y0:y1, x1].mean() >= 0.4
            ):
                if not overlaps_other([x0, y0, x1 + 1, y1], i):
                    b[2] += 1
                    grew = True
    return [tuple(b) for b in boxes]


# --------------------------------------------------------------------------- #
# Grid fitting
# --------------------------------------------------------------------------- #
def fit_axis(mask, axis, nmax, win=8, tol=2):
    """Largest N such that N equal divisions along `axis` can each be snapped
    (within +-win px) to a line holding <= tol sprite pixels.
    Returns (N, cut positions incl. 0 and L)."""
    L = mask.shape[axis]
    occ = mask.sum(axis=1 - axis)
    best = (1, [0, L])
    for N in range(2, nmax + 1):
        cuts, ok = [], True
        for i in range(1, N):
            e = round(i * L / N)
            lo, hi = max(1, e - win), min(L - 1, e + win + 1)
            j = lo + int(np.argmin(occ[lo:hi]))
            if occ[j] > tol:
                ok = False
                break
            cuts.append(j)
        if ok:
            best = (N, [0] + cuts + [L])
    return best


def fit_block(sprite, box):
    x0, y0, x1, y1 = box
    m = sprite[y0:y1, x0:x1]
    ncols, xcuts = fit_axis(m, 1, 60)
    nrows, ycuts = fit_axis(m, 0, 12)
    return ncols, nrows, xcuts, ycuts


# --------------------------------------------------------------------------- #
# Export
# --------------------------------------------------------------------------- #
def key_out_background(img, tol):
    arr = np.array(img.convert("RGBA"))
    bg = np.abs(arr[..., :3].astype(int) - BG).max(axis=2) <= tol
    arr[bg, 3] = 0
    return Image.fromarray(arr)


def export_block(
    img, name, box, ncols, nrows, xcuts, ycuts, outdir, raw, transparent, tol
):
    x0, y0, x1, y1 = box
    bw, bh = x1 - x0, y1 - y0
    pw, ph = bw / ncols, bh / nrows  # ideal (fractional) cell size

    # How far snapped cuts drift from the ideal grid -> padding so frames stay
    # registered to a common origin (no jitter when animated).
    pad_x = pad_y = 0
    if not raw:
        for i in range(ncols):
            pad_x = max(
                pad_x,
                abs(xcuts[i] - round(i * pw)),
                abs(xcuts[i + 1] - round((i + 1) * pw)),
            )
        for j in range(nrows):
            pad_y = max(
                pad_y,
                abs(ycuts[j] - round(j * ph)),
                abs(ycuts[j + 1] - round((j + 1) * ph)),
            )
    cw, ch = math.ceil(pw) + 2 * pad_x, math.ceil(ph) + 2 * pad_y

    adir = os.path.join(outdir, name)
    os.makedirs(adir, exist_ok=True)
    grid = Image.new("RGBA", (cw * ncols, ch * nrows), (0, 0, 0, 0))

    for r in range(nrows):
        for c in range(ncols):
            l, rr = xcuts[c], xcuts[c + 1]
            t, bt = ycuts[r], ycuts[r + 1]
            crop = img.crop((x0 + l, y0 + t, x0 + rr, y0 + bt)).convert("RGBA")
            if transparent:
                crop = key_out_background(crop, tol)
            if raw:
                frame = crop
            else:
                frame = Image.new(
                    "RGBA", (cw, ch), (0, 0, 0, 0) if transparent else (BG, BG, BG, 255)
                )
                frame.paste(
                    crop, (l - round(c * pw) + pad_x, t - round(r * ph) + pad_y)
                )
            frame.save(os.path.join(adir, f"dir{r}_f{c:02d}.png"))
            if not raw:
                grid.paste(frame, (c * cw, r * ch))
    if not raw:
        grid.save(os.path.join(adir, f"{name}_strip.png"))
    return {
        "name": name,
        "rect": [x0, y0, x1, y1],
        "frames": ncols,
        "directions": nrows,
        "cell_size": [cw, ch],
    }


def main():
    ap = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    ap.add_argument("image")
    ap.add_argument("-o", "--out", default="out")
    ap.add_argument(
        "--transparent",
        action="store_true",
        help="make the grey background transparent",
    )
    ap.add_argument(
        "--tol",
        type=int,
        default=14,
        help="grey tolerance for --transparent (default 14)",
    )
    ap.add_argument(
        "--raw",
        action="store_true",
        help="tight crops only, no padding to a common cell size",
    )
    ap.add_argument(
        "--debug",
        action="store_true",
        help="write debug_overlay.png showing blocks + grid",
    )
    args = ap.parse_args()

    img = Image.open(args.image).convert("RGB")
    a = np.array(img).astype(int)
    sprite = sprite_mask(a)

    boxes = detect_blocks(a)
    if len(boxes) != len(NAMES):
        print(
            f"warning: found {len(boxes)} blocks but have {len(NAMES)} names; "
            "extra blocks are named block_NN"
        )
    os.makedirs(args.out, exist_ok=True)

    manifest, overlay = [], img.copy()
    d = ImageDraw.Draw(overlay)
    for i, box in enumerate(boxes):
        name = NAMES[i] if i < len(NAMES) else f"block_{i:02d}"
        box = RECT_OVERRIDES.get(name, box)
        ncols, nrows, xcuts, ycuts = fit_block(sprite, box)
        info = export_block(
            img,
            name,
            box,
            ncols,
            nrows,
            xcuts,
            ycuts,
            args.out,
            args.raw,
            args.transparent,
            args.tol,
        )
        manifest.append(info)
        print(
            f"{name:12s} rect={box}  {ncols} frames x {nrows} dirs  cell={info['cell_size']}"
        )
        if args.debug:
            d.rectangle(box, outline=(0, 255, 0), width=4)
            for x in xcuts:
                d.line(
                    [(box[0] + x, box[1]), (box[0] + x, box[3])],
                    fill=(0, 120, 255),
                    width=1,
                )
            for y in ycuts:
                d.line(
                    [(box[0], box[1] + y), (box[2], box[1] + y)],
                    fill=(255, 255, 0),
                    width=1,
                )

    with open(os.path.join(args.out, "manifest.json"), "w") as f:
        json.dump(manifest, f, indent=2)
    if args.debug:
        overlay.save("debug_overlay.png")
        print("wrote debug_overlay.png")


if __name__ == "__main__":
    main()
