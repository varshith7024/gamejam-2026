#!/usr/bin/env python3
"""
Make every black / near-black pixel in every image of a folder transparent.

- A pixel is made transparent if R, G and B are ALL <= --threshold (default 16), i.e. its
  brightest channel is at or below the threshold. So the default catches colours like
  #0b0b0d (11,11,13) and #0c0c0d (12,12,13), plus anything darker.
  Use --threshold 0 for pure black only, or raise it to be more aggressive.
- Matching pixels get alpha = 0. Everything else keeps its colour and existing alpha.
- Images without an alpha channel (RGB, grayscale, palette) get one added.

By default files are overwritten in place (written to a temp file first, then swapped in,
so a crash can't leave a half-written image). Use -o to write copies instead.

Usage
-----
    python black_to_transparent.py path/to/folder                  # in place, incl. subfolders
    python black_to_transparent.py path/to/folder --threshold 24   # more aggressive
    python black_to_transparent.py path/to/folder --threshold 0    # pure black only
    python black_to_transparent.py path/to/folder --no-recursive
    python black_to_transparent.py path/to/folder -o clean         # keep originals
    python black_to_transparent.py image.png                       # single file

Formats
-------
In place:   .png  .webp  .tga       (formats that can store transparency; WebP is saved lossless)
With -o:    also .bmp .jpg .jpeg .tif .tiff -> written out as PNG
(JPEG/BMP can't hold transparency, so they're skipped in in-place mode.)

Requires: pillow, numpy
"""

import argparse
import os
import sys

import numpy as np
from PIL import Image

ALPHA_EXTS = {".png", ".webp", ".tga"}
OTHER_EXTS = {".bmp", ".jpg", ".jpeg", ".tif", ".tiff"}


def make_black_transparent(img, threshold):
    """Return an RGBA copy of img with dark pixels given alpha 0, plus how many were changed."""
    arr = np.array(img.convert("RGBA"))
    black = arr[..., :3].max(axis=2) <= threshold
    changed = int((black & (arr[..., 3] > 0)).sum())
    arr[black, 3] = 0
    return Image.fromarray(arr, "RGBA"), changed


def save_image(img, dst):
    """Atomic save, keeping the destination's format."""
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


def collect(path, recursive, allowed):
    if os.path.isfile(path):
        return [(path, os.path.basename(path))]
    found = []
    if recursive:
        for root, _, names in os.walk(path):
            for n in sorted(names):
                if os.path.splitext(n)[1].lower() in allowed:
                    full = os.path.join(root, n)
                    found.append((full, os.path.relpath(full, path)))
    else:
        for n in sorted(os.listdir(path)):
            full = os.path.join(path, n)
            if os.path.isfile(full) and os.path.splitext(n)[1].lower() in allowed:
                found.append((full, n))
    return found


def main():
    ap = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    ap.add_argument("path", help="folder (or single image file)")
    ap.add_argument(
        "-o",
        "--out",
        default=None,
        help="write results here instead of overwriting the originals",
    )
    ap.add_argument(
        "-t",
        "--threshold",
        "--tolerance",
        dest="threshold",
        type=int,
        default=16,
        help="make pixels transparent when R, G and B are all <= this value "
        "(default 16; 0 = pure black only)",
    )
    ap.add_argument(
        "--no-recursive", action="store_true", help="don't descend into subfolders"
    )
    args = ap.parse_args()

    if not os.path.exists(args.path):
        sys.exit(f"not found: {args.path}")
    if not 0 <= args.threshold <= 255:
        sys.exit("--threshold must be between 0 and 255")

    inplace = args.out is None
    allowed = ALPHA_EXTS if inplace else ALPHA_EXTS | OTHER_EXTS
    files = collect(args.path, not args.no_recursive, allowed)
    if not files:
        hint = (
            ""
            if not inplace
            else " (JPEG/BMP are only processed with -o, since they can't store transparency)"
        )
        sys.exit("no images found" + hint)
    single = os.path.isfile(args.path)
    if inplace and single and os.path.splitext(args.path)[1].lower() not in ALPHA_EXTS:
        sys.exit("this format can't store transparency; use -o to write a PNG copy")

    total_px = done = skipped = 0
    for i, (src, rel) in enumerate(files, 1):
        try:
            with Image.open(src) as im:
                im.load()
                result, changed = make_black_transparent(im, args.threshold)
        except Exception as e:
            print(f"skip {rel}: {e}")
            skipped += 1
            continue

        if inplace:
            dst = src
        else:
            if single and args.out.lower().endswith(".png"):
                dst = args.out
            else:
                dst = os.path.join(args.out, os.path.splitext(rel)[0] + ".png")
            os.makedirs(os.path.dirname(os.path.abspath(dst)), exist_ok=True)
        # when writing copies, non-alpha formats are always converted to PNG
        if not inplace and os.path.splitext(dst)[1].lower() not in ALPHA_EXTS:
            dst = os.path.splitext(dst)[0] + ".png"
        save_image(result, dst)
        total_px += changed
        done += 1
        if i % 100 == 0:
            print(f"{i}/{len(files)}")

    print(
        f"processed {done} image(s), made {total_px:,} pixel(s) transparent"
        + (f", skipped {skipped}" if skipped else "")
    )


if __name__ == "__main__":
    main()
