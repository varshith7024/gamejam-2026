#!/usr/bin/env python3
"""
ink.py -- turn pixel-art sprites into detailed black & white ink drawings.

Pure black (0,0,0) and pure white (255,255,255) only: no greys, no anti-aliasing.

Built for pixelated sprites, so it never blurs. Two layers are combined:

  1. LINES  Every pixel is compared with its 8 neighbours; wherever two touching pixels differ
            strongly in colour (the strongest ~quarter of all differences), the DARKER pixel of
            the pair is inked. That
            gives crisp 1-pixel lines that sit exactly on the sprite's real pixel boundaries
            (a blur-based detector like Canny would smear single-pixel highlights away).
            The silhouette outline is always inked too.

  2. TONE   The sprite's brightness is contrast-boosted (so dark, low-contrast detail like
            black armour survives) and turned into black/white with an ordered (Bayer) dither,
            so mid-tones become pixel-friendly dot patterns instead of flat blobs.

Transparent pixels (alpha < 128) are ignored and stay transparent. Sprites on a flat opaque
background are handled too: the background is detected from the image border and left out.

By default the images are overwritten IN PLACE (written to a temp file first, then swapped in).
Pass -o to write the results elsewhere and keep the originals.

Usage
-----
    python ink.py folder/                    # ink every PNG in the folder (and subfolders), in place
    python ink.py sprite.png                 # one image, in place
    python ink.py folder/ -o inked/          # keep originals, write copies
    python ink.py folder/ --detail 0.8       # more line detail
    python ink.py folder/ --shade 0          # lines only, no tone
    python ink.py folder/ --shade 1 --dither 2   # heavy, high-contrast tone
    python ink.py folder/ --invert           # white ink on black paper

Tuning
------
    --detail 0..1    how many lines (default 0.65 = strongest ~25% of edges). Higher = more lines.
    --shade 0..1     how much tone/shading to add (default 0.8). 0 = lines only.
    --dither 2|4|8   dither pattern size (default 4). 2 = coarse/high contrast, 8 = finest gradient.
    --contrast N     boost for dark local detail (default 1.2).
    --equalize 0..1  spread tones over the full black..white range (default 0.5). Raise it for
                     very dark sprites that come out as a black blob; 0 = plain brightness.
    --thick N        line thickness in px (default 1; keep at 1 for small pixel art).
    --no-outline     don't force a silhouette outline.
    --bg MODE        what's outside the sprite: transparent | white | black | auto (default auto =
                     transparent if the input had transparency, otherwise white).

Tone and line thresholds are pooled across ALL images in a folder (the frames of an animation),
so the look doesn't flicker from frame to frame. Use --per-image to treat each image separately.

Requires: pillow, numpy, scipy
"""

import argparse
import fnmatch
import os
import sys

import numpy as np
from PIL import Image
from scipy import ndimage as ndi

LUMA = np.array([0.299, 0.587, 0.114])


# --------------------------------------------------------------------------- #
# Loading: sprite colours + mask of "sprite" pixels
# --------------------------------------------------------------------------- #
def load_sprite(path, alpha_cutoff, bg_tol):
    """Returns (rgb float HxWx3, mask bool HxW, had_transparency bool)."""
    with Image.open(path) as im:
        a = np.array(im.convert("RGBA"))
    rgb = a[..., :3].astype(np.float64)
    alpha = a[..., 3]

    if (alpha < 250).mean() > 0.005:  # real transparency
        return rgb, alpha >= alpha_cutoff, True

    # opaque image: if it sits on a flat background, drop the background
    border = np.concatenate([rgb[0], rgb[-1], rgb[:, 0], rgb[:, -1]])
    bg = np.median(border, axis=0)
    near = np.abs(rgb - bg).max(axis=2) <= bg_tol
    edge_near = np.concatenate([near[0], near[-1], near[:, 0], near[:, -1]]).mean()
    if edge_near > 0.6:
        lab, n = ndi.label(near)
        edge_labels = np.unique(
            np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]])
        )
        return rgb, ~np.isin(lab, edge_labels[edge_labels > 0]), False
    return rgb, np.ones(near.shape, bool), False


# --------------------------------------------------------------------------- #
# Layer 1: lines
# --------------------------------------------------------------------------- #
def lift(rgb):
    """Brighten shadows (sqrt) so lines can be found inside dark areas too."""
    return (rgb / 255.0) ** 0.5 * 255.0


def pair_diffs(rgb, mask):
    """Colour differences between horizontally and vertically touching sprite pixels."""
    v = lift(rgb)
    dh = np.sqrt(((v[:, 1:] - v[:, :-1]) ** 2).sum(axis=2))[mask[:, 1:] & mask[:, :-1]]
    dv = np.sqrt(((v[1:] - v[:-1]) ** 2).sum(axis=2))[mask[1:] & mask[:-1]]
    return np.concatenate([dh, dv])


def neighbour_edges(rgb, mask, t):
    """Ink the darker pixel of every neighbouring pair (8-neighbourhood) whose colours differ
    by more than t."""
    v = lift(rgb)
    lum = v @ LUMA
    H, W = mask.shape
    edge = np.zeros((H, W), bool)
    for dy, dx in ((0, 1), (1, 0), (1, 1), (1, -1)):
        yp, yq = slice(0, H - dy), slice(dy, H)
        if dx >= 0:
            xp, xq = slice(0, W - dx), slice(dx, W)
        else:
            xp, xq = slice(-dx, W), slice(0, W + dx)
        d = np.sqrt(((v[yp, xp] - v[yq, xq]) ** 2).sum(axis=2))
        if dy and dx:
            d = d / 1.4142  # diagonal neighbours are further apart
        hit = (d > t) & mask[yp, xp] & mask[yq, xq]
        p_darker = lum[yp, xp] <= lum[yq, xq]
        edge[yp, xp] |= hit & p_darker
        edge[yq, xq] |= hit & ~p_darker
    return edge


def silhouette_outline(mask):
    return mask & ~ndi.binary_erosion(mask, border_value=1)


# --------------------------------------------------------------------------- #
# Layer 2: tone (contrast-boosted ordered dither)
# --------------------------------------------------------------------------- #
def bayer_matrix(n):
    m = np.array([[0]])
    while m.shape[0] < n:
        m = np.block([[4 * m, 4 * m + 2], [4 * m + 3, 4 * m + 1]])
    return (m + 0.5) / (n * n)


def masked_mean(x, mask, radius):
    k = 2 * radius + 1
    num = ndi.uniform_filter(np.where(mask, x, 0.0), k, mode="constant")
    den = ndi.uniform_filter(mask.astype(float), k, mode="constant")
    return num / np.maximum(den, 1e-6)


def tone_layer(rgb, mask, stats, gain, shade, bayer_n, equalize, radius=4, gamma=0.7):
    lo, hi, sample = stats["lo"], stats["hi"], stats["sample"]
    lum = (rgb @ LUMA) / 255.0
    g = np.clip((lum - lo) / max(hi - lo, 1e-6), 0, 1) ** gamma
    if equalize > 0:
        # histogram equalisation over the whole animation: spreads dark sprites over the full
        # tonal range so their detail doesn't all fall below the dither threshold
        ge = np.interp(lum, sample, np.linspace(0, 1, len(sample)))
        g = (1 - equalize) * g + equalize * ge
    local = masked_mean(g, mask, radius)
    tone = np.clip(g + gain * (g - local), 0, 1)  # pull dark local detail apart
    H, W = mask.shape
    b = bayer_matrix(bayer_n)
    thresh = np.tile(b, (H // bayer_n + 1, W // bayer_n + 1))[:H, :W]
    return mask & (tone < thresh * shade)


# --------------------------------------------------------------------------- #
# Putting it together
# --------------------------------------------------------------------------- #
def disk(r):
    y, x = np.ogrid[-r : r + 1, -r : r + 1]
    return x * x + y * y <= r * r + 0.25


def ink(rgb, mask, args, stats):
    """Returns boolean image: True where ink (black) goes."""
    lines = neighbour_edges(rgb, mask, stats["line_t"])
    if args.thick > 1:
        lines = ndi.binary_dilation(lines, structure=disk(args.thick // 2)) & mask
    black = lines
    if not args.no_outline:
        black = black | silhouette_outline(mask)
    if args.shade > 0:
        black = black | tone_layer(
            rgb, mask, stats, args.contrast, args.shade, args.dither, args.equalize
        )
    return black & mask


def render(black, mask, invert, bg):
    """bg: 'transparent' | 'white' | 'black'."""
    paper, inkc = (
        ((255, 255, 255), (0, 0, 0)) if not invert else ((0, 0, 0), (255, 255, 255))
    )
    H, W = mask.shape
    out = np.zeros((H, W, 4), np.uint8)
    if bg == "white":
        out[...] = (255, 255, 255, 255)
    elif bg == "black":
        out[...] = (0, 0, 0, 255)
    out[mask] = paper + (255,)
    out[black] = inkc + (255,)
    return Image.fromarray(out, "RGBA")


def save_png(img, dst):
    tmp = dst + ".tmp"
    try:
        img.save(tmp, format="PNG")
        os.replace(tmp, dst)
    finally:
        if os.path.exists(tmp):
            os.remove(tmp)


def collect(path, exclude):
    if os.path.isfile(path):
        return [(path, os.path.basename(path))]
    files = []
    for root, _, names in os.walk(path):
        for n in sorted(names):
            if n.lower().endswith(".png") and not any(
                fnmatch.fnmatch(n, p) for p in exclude
            ):
                full = os.path.join(root, n)
                files.append((full, os.path.relpath(full, path)))
    return files


def folder_stats(sprites, detail):
    """Statistics pooled over a set of images (the frames of an animation) so every frame gets
    the same treatment: brightness range / histogram for the tone layer, and the line threshold.

    The line threshold is a PERCENTILE of the neighbour colour differences, not a fixed colour
    distance: 'ink the strongest X% of edges'. That gives similar line density on bright and
    dark sprites alike (a fixed distance floods dark, noisy sprites with ink)."""
    rng = np.random.default_rng(0)
    lums, diffs = [], []
    for rgb, mask, _ in sprites:
        v = (rgb[mask] @ LUMA) / 255.0
        if v.size:
            lums.append(v if v.size <= 50000 else rng.choice(v, 50000, replace=False))
        d = pair_diffs(rgb, mask)
        if d.size:
            diffs.append(
                d if d.size <= 100000 else rng.choice(d, 100000, replace=False)
            )
    if not lums:
        return {"lo": 0.0, "hi": 1.0, "sample": np.array([0.0, 1.0]), "line_t": 1e9}
    allv = np.concatenate(lums)
    if allv.size > 200000:
        allv = rng.choice(allv, 200000, replace=False)
    allv = np.sort(allv)
    lo, hi = np.percentile(allv, [1, 99])
    pct = 97.0 - 20.0 * detail  # detail 0.65 -> 84th percentile (~1/4 of pixels inked)
    line_t = float(np.percentile(np.concatenate(diffs), pct)) if diffs else 1e9
    return {
        "lo": float(lo),
        "hi": float(max(hi, lo + 1e-3)),
        "sample": allv,
        "line_t": line_t,
    }


def main():
    ap = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    ap.add_argument("path", help="PNG file or folder (searched recursively)")
    ap.add_argument(
        "-o",
        "--out",
        default=None,
        help="write results here instead of overwriting the originals",
    )
    ap.add_argument(
        "--detail",
        type=float,
        default=0.65,
        help="line sensitivity 0..1 (default 0.65)",
    )
    ap.add_argument(
        "--shade",
        type=float,
        default=0.8,
        help="tone strength 0..1; 0 = lines only (default 0.8)",
    )
    ap.add_argument(
        "--dither",
        type=int,
        choices=[2, 4, 8],
        default=4,
        help="dither pattern size (default 4)",
    )
    ap.add_argument(
        "--contrast",
        type=float,
        default=1.2,
        help="local contrast boost for the tone layer (default 1.2)",
    )
    ap.add_argument(
        "--equalize",
        type=float,
        default=0.5,
        help="0..1: spread the tone over the full range so dark sprites keep detail (default 0.5)",
    )
    ap.add_argument(
        "--thick", type=int, default=1, help="line thickness in px (default 1)"
    )
    ap.add_argument(
        "--no-outline", action="store_true", help="don't force a silhouette outline"
    )
    ap.add_argument("--invert", action="store_true", help="white ink on black paper")
    ap.add_argument(
        "--bg", choices=["auto", "transparent", "white", "black"], default="auto"
    )
    ap.add_argument(
        "--alpha-cutoff",
        type=int,
        default=128,
        help="alpha >= this counts as sprite (default 128)",
    )
    ap.add_argument(
        "--bg-tol",
        type=int,
        default=12,
        help="flat-background tolerance for opaque images (default 12)",
    )
    ap.add_argument(
        "--per-image",
        action="store_true",
        help="normalise tone per image instead of per folder",
    )
    ap.add_argument(
        "--exclude",
        action="append",
        default=[],
        metavar="PATTERN",
        help="skip files matching this name pattern, e.g. '*_strip.png' (repeatable)",
    )
    args = ap.parse_args()

    if not os.path.exists(args.path):
        sys.exit(f"not found: {args.path}")
    args.detail = min(max(args.detail, 0.0), 1.0)
    args.shade = min(max(args.shade, 0.0), 1.0)
    args.equalize = min(max(args.equalize, 0.0), 1.0)

    files = collect(args.path, args.exclude)
    if not files:
        sys.exit("no PNG files found")
    single = os.path.isfile(args.path)
    inplace = args.out is None
    print(
        f"{'modifying in place' if inplace else 'writing to ' + args.out}: {len(files)} image(s)"
    )

    # group by folder so each animation gets one shared tone range
    groups = {}
    for src, rel in files:
        groups.setdefault(os.path.dirname(src), []).append((src, rel))

    done = skipped = 0
    for folder, items in groups.items():
        loaded = []
        for src, rel in items:
            try:
                loaded.append(
                    (src, rel, load_sprite(src, args.alpha_cutoff, args.bg_tol))
                )
            except Exception as e:
                print(f"skip {rel}: {e}")
                skipped += 1
        shared = (
            None
            if args.per_image
            else folder_stats([s for _, _, s in loaded], args.detail)
        )

        for src, rel, (rgb, mask, had_alpha) in loaded:
            if not mask.any():
                print(f"skip {rel}: no sprite pixels")
                skipped += 1
                continue
            stats = (
                shared
                if shared is not None
                else folder_stats([(rgb, mask, had_alpha)], args.detail)
            )
            black = ink(rgb, mask, args, stats)
            bg = (
                args.bg
                if args.bg != "auto"
                else ("transparent" if had_alpha else "white")
            )
            result = render(black, mask, args.invert, bg)
            if inplace:
                dst = src
            elif single:
                dst = args.out
            else:
                dst = os.path.join(args.out, rel)
            os.makedirs(os.path.dirname(os.path.abspath(dst)), exist_ok=True)
            save_png(result, dst)
            done += 1
            if done % 100 == 0:
                print(f"{done}/{len(files)}")

    print(f"inked {done} image(s)" + (f", skipped {skipped}" if skipped else ""))


if __name__ == "__main__":
    main()
