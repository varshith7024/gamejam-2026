#!/usr/bin/env python3
"""
Turn sprites into pure-black (0,0,0) silhouettes with an edge-detected, hand-inked look.

Works on a single image or a whole folder tree (e.g. the output of split_diablo.py).

By default the images are modified IN PLACE: the original files are overwritten and no
extra files are created. This is irreversible, so keep a copy (or just re-run
split_diablo.py) if you may want the colour versions back. Pass -o to write the results
somewhere else instead and leave the originals untouched.

Styles
------
  inked    (default) solid black silhouette, with the sprite's *interior* edges cut out
           as transparent lines -> woodcut / ink-and-scratchboard look.
  lineart  transparent inside: only the outer outline + interior edges are drawn in black
           -> looks like a pencil/pen drawing.
  solid    plain pure-black silhouette, no edge detection.

Every drawn pixel is exactly RGB (0,0,0). Everything else is fully transparent
(or a flat colour if you pass --bg).

Usage
-----
    python ink_sprites.py out/                            # overwrite every frame in out/
    python ink_sprites.py out/ --style lineart --line-width 2
    python ink_sprites.py frame.png --sensitivity 0.5     # overwrite one image
    python ink_sprites.py out/ -o out_black               # keep originals, write copies
    python ink_sprites.py out/ -o preview --bg white      # copies flattened for viewing

Run it only once per set of images: an already-inked image isn't a colour sprite any more,
so a second pass won't give the same result.

Input can be transparent PNGs (split_diablo.py --transparent) or frames that still have
the flat grey background; in that case the background is detected and removed automatically.
In-place mode handles .png, .webp and .tga (formats that can hold transparency); other
formats are skipped. WebP is re-saved losslessly so the blacks stay exactly black.

Requires: pillow, numpy, scipy
"""

import argparse
import os
import sys

import numpy as np
from PIL import Image
from scipy import ndimage as ndi

EXTS = {".png", ".webp", ".bmp", ".tga", ".gif"}
INPLACE_EXTS = {".png", ".webp", ".tga"}  # formats that keep an alpha channel


# --------------------------------------------------------------------------- #
# 1. Sprite mask
# --------------------------------------------------------------------------- #
def get_mask(rgba, bg_tol, min_blob):
    """Boolean mask of sprite pixels.
    Uses the alpha channel if the image has real transparency; otherwise detects the
    flat background colour from the image border and removes it."""
    rgb = rgba[..., :3].astype(np.float32)
    alpha = rgba[..., 3]

    # Leftover pink padding from the atlas (252,176,176 plus its blurred edge pixels).
    pinkish = (
        (rgb[..., 0] >= 205)
        & (rgb[..., 0] - rgb[..., 1] >= 25)
        & (rgb[..., 1] >= 120)
        & (np.abs(rgb[..., 1] - rgb[..., 2]) <= 30)
    )

    if (alpha < 250).mean() > 0.01:  # real transparency
        mask = (alpha >= 128) & ~pinkish
    else:  # opaque -> key out background
        border = np.concatenate([rgb[0], rgb[-1], rgb[:, 0], rgb[:, -1]])
        bg = np.median(border, axis=0)
        mask = (np.abs(rgb - bg).max(axis=2) > bg_tol) & ~pinkish
        # Fix tiny specks / compression noise
        mask = ndi.binary_opening(mask, np.ones((2, 2)))

    # drop stray specks, keep every blob that's big enough (limbs can detach from the body)
    lab, n = ndi.label(mask, structure=np.ones((3, 3)))
    if n:
        sizes = ndi.sum(mask, lab, range(1, n + 1))
        keep = np.isin(lab, 1 + np.flatnonzero(sizes >= min_blob))
        mask = keep
    return mask


# --------------------------------------------------------------------------- #
# 2. Edge detection (Canny-style: Gaussian -> Sobel -> NMS -> hysteresis)
# --------------------------------------------------------------------------- #
def detect_edges(rgb, mask, sigma, sensitivity):
    """Edge map of the sprite's interior detail, as a thin boolean image."""
    if mask.sum() < 10:
        return np.zeros_like(mask)

    # The sprites are very dark, so lift the shadows (gamma) after stretching contrast
    # inside the sprite. Each colour channel is processed so red-vs-black detail counts too.
    chans = []
    for k in range(3):
        ch = rgb[..., k]
        lo, hi = np.percentile(ch[mask], [1, 99])
        ch = np.clip((ch - lo) / max(hi - lo, 1e-3), 0, 1) ** 0.5
        chans.append(ch)
    chans = np.stack(chans, axis=-1)

    # Replace the background with the nearest sprite pixel so the silhouette border
    # doesn't produce a giant fake edge (we add the real outline separately).
    idx = ndi.distance_transform_edt(~mask, return_distances=False, return_indices=True)
    chans = chans[idx[0], idx[1]]

    chans = ndi.gaussian_filter(chans, (sigma, sigma, 0))
    gx_c = ndi.sobel(chans, axis=1)
    gy_c = ndi.sobel(chans, axis=0)
    gx, gy = gx_c.sum(axis=2), gy_c.sum(axis=2)  # direction
    mag = np.sqrt((gx_c**2 + gy_c**2).sum(axis=2))  # strength (all channels)

    # Non-maximum suppression: keep only the ridge of each edge -> thin lines
    ang = (np.rad2deg(np.arctan2(gy, gx)) + 180) % 180
    p = np.pad(mag, 1)
    c = p[1:-1, 1:-1]
    e, w = p[1:-1, 2:], p[1:-1, :-2]
    n, s = p[:-2, 1:-1], p[2:, 1:-1]
    ne, sw = p[:-2, 2:], p[2:, :-2]
    nw, se = p[:-2, :-2], p[2:, 2:]
    a0 = (ang < 22.5) | (ang >= 157.5)
    a45 = (ang >= 22.5) & (ang < 67.5)
    a90 = (ang >= 67.5) & (ang < 112.5)
    keep = np.where(
        a0,
        (c >= e) & (c >= w),
        np.where(
            a45,
            (c >= ne) & (c >= sw),
            np.where(a90, (c >= n) & (c >= s), (c >= nw) & (c >= se)),
        ),
    )
    thin = np.where(keep, mag, 0)

    # Hysteresis threshold, relative to this sprite's own edge strength.
    # sensitivity: 0 = only the strongest edges, 1 = lots of detail.
    ref = np.percentile(mag[mask], 95) + 1e-6
    high = ref * (1.05 - 0.9 * sensitivity)
    low = high * 0.45
    strong = thin >= high
    weak = thin >= low
    lab, n_lab = ndi.label(weak, structure=np.ones((3, 3)))
    if n_lab == 0:
        return np.zeros_like(mask)
    ok = np.zeros(n_lab + 1, bool)
    ok[np.unique(lab[strong])] = True
    ok[0] = False
    return ok[lab]


# --------------------------------------------------------------------------- #
# 3. Compose the final image
# --------------------------------------------------------------------------- #
def disk(r):
    y, x = np.ogrid[-r : r + 1, -r : r + 1]
    return x * x + y * y <= r * r + 0.25


def process(
    img,
    style,
    line_width,
    sensitivity,
    sigma,
    outline_width,
    min_edge,
    bg_tol,
    min_blob,
):
    rgba = np.array(img.convert("RGBA"))
    mask = get_mask(rgba, bg_tol, min_blob)
    rgb = rgba[..., :3].astype(np.float32)

    if style == "solid":
        return mask

    # outer contour, `outline_width` px thick, drawn inside the silhouette
    contour = mask & ~ndi.binary_erosion(
        mask, structure=disk(1), iterations=outline_width, border_value=1
    )

    # interior edges (kept away from the rim so they don't merge with the contour)
    edges = detect_edges(rgb, mask, sigma, sensitivity)
    interior = ndi.binary_erosion(
        mask, structure=disk(1), iterations=outline_width + 1, border_value=1
    )
    edges &= interior

    # remove tiny edge fragments -> cleaner "drawn" look
    if min_edge > 1 and edges.any():
        lab, n = ndi.label(edges, structure=np.ones((3, 3)))
        sizes = ndi.sum(edges, lab, range(1, n + 1))
        edges = np.isin(lab, 1 + np.flatnonzero(sizes >= min_edge))

    if line_width > 1:
        edges = ndi.binary_dilation(edges, structure=disk(line_width // 2)) & mask

    if style == "lineart":
        return contour | edges
    # inked: black fill, interior lines punched out
    return mask & ~(edges & ~contour)


def render(drawn, bg):
    """drawn: boolean mask of black pixels -> RGBA image (pure black ink)."""
    h, w = drawn.shape
    if bg is None:
        out = np.zeros((h, w, 4), np.uint8)  # RGB 0,0,0, alpha 0
        out[drawn, 3] = 255
        return Image.fromarray(out, "RGBA")
    colour = Image.new("RGB", (w, h), bg).convert("RGBA")
    arr = np.array(colour)
    arr[drawn] = (0, 0, 0, 255)
    return Image.fromarray(arr, "RGBA")


def save_image(img, dst):
    """Save to `dst`, keeping its format. Written to a temp file then swapped in, so an
    interrupted run can never leave a half-written image behind."""
    ext = os.path.splitext(dst)[1].lower()
    fmt = Image.registered_extensions()[ext]
    kwargs = {"lossless": True} if fmt == "WEBP" else {}
    tmp = dst + ".tmp"
    try:
        img.save(tmp, format=fmt, **kwargs)
        os.replace(tmp, dst)
    finally:
        if os.path.exists(tmp):
            os.remove(tmp)


# --------------------------------------------------------------------------- #
# CLI
# --------------------------------------------------------------------------- #
def collect(path, include_strips=True):
    if os.path.isfile(path):
        return [(path, os.path.basename(path))]
    files = []
    for root, _, names in os.walk(path):
        for n in sorted(names):
            if os.path.splitext(n)[1].lower() in EXTS:
                # split_diablo.py's *_strip.png are whole-animation sheets; the per-frame
                # files are what you want inked (contrast is tuned per sprite).
                full = os.path.join(root, n)
                files.append((full, os.path.relpath(full, path)))
    return files


def main():
    ap = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    ap.add_argument("input", help="image file or folder (searched recursively)")
    ap.add_argument(
        "-o",
        "--out",
        default=None,
        help="write results here (file or folder) instead of overwriting the originals",
    )
    ap.add_argument("--style", choices=["inked", "lineart", "solid"], default="inked")
    ap.add_argument(
        "--sensitivity",
        type=float,
        default=0.6,
        help="0..1, how much interior detail to draw (default 0.6)",
    )
    ap.add_argument(
        "--sigma",
        type=float,
        default=0.8,
        help="pre-blur before edge detection (default 0.8)",
    )
    ap.add_argument(
        "--line-width",
        type=int,
        default=1,
        help="interior line thickness in px (default 1)",
    )
    ap.add_argument(
        "--outline-width",
        type=int,
        default=1,
        help="outer contour thickness in px (default 1)",
    )
    ap.add_argument(
        "--min-edge",
        type=int,
        default=5,
        help="drop edge fragments shorter than this many px (default 5)",
    )
    ap.add_argument(
        "--bg",
        default=None,
        help="flatten onto this colour (e.g. white, '#ffffff'); default = transparent",
    )
    ap.add_argument(
        "--bg-tol",
        type=int,
        default=14,
        help="colour tolerance when removing a flat background (default 14)",
    )
    ap.add_argument(
        "--include-strips",
        action="store_true",
        help="also process *_strip.png sheets (skipped by default)",
    )
    ap.add_argument(
        "--min-blob",
        type=int,
        default=12,
        help="ignore sprite specks smaller than this (default 12)",
    )
    args = ap.parse_args()

    files = collect(args.input, args.include_strips)
    if not files:
        sys.exit("no images found")
    single = os.path.isfile(args.input)
    inplace = args.out is None

    if inplace:
        kept = [
            (src, rel)
            for src, rel in files
            if os.path.splitext(src)[1].lower() in INPLACE_EXTS
        ]
        if skipped := len(files) - len(kept):
            print(
                f"skipping {skipped} file(s) in formats without transparency "
                f"(use -o to convert them to PNG)"
            )
        files = kept
        if not files:
            sys.exit("nothing to process")
        print(f"modifying {len(files)} image(s) in place")

    for i, (src, rel) in enumerate(files, 1):
        with Image.open(src) as img:
            img.load()
            drawn = process(
                img,
                args.style,
                args.line_width,
                args.sensitivity,
                args.sigma,
                args.outline_width,
                args.min_edge,
                args.bg_tol,
                args.min_blob,
            )
        out = render(drawn, args.bg)
        if inplace:
            dst = src
        else:
            dst = (
                args.out
                if single
                else os.path.join(args.out, os.path.splitext(rel)[0] + ".png")
            )
            os.makedirs(os.path.dirname(os.path.abspath(dst)), exist_ok=True)
        save_image(out, dst)
        if i % 100 == 0 or i == len(files):
            print(f"{i}/{len(files)}")
    print("done" if inplace else f"done -> {args.out}")


if __name__ == "__main__":
    main()
