#!/usr/bin/env python3
"""
Invert the colours of every PNG in a folder, leaving fully transparent pixels
(alpha == 0) untouched.

- Opaque and semi-transparent pixels get their colour inverted (255 - value).
- The alpha channel itself is never changed.
- Pixels with alpha == 0 are skipped entirely, so their (invisible) colour data stays as is.
- Images with no alpha channel (plain RGB / grayscale) are inverted completely.

By default the files are overwritten in place (written to a temp file first, then
swapped in, so a crash can't leave a half-written PNG). Use -o to write copies instead.

Usage
-----
    python invert_pngs.py path/to/folder                 # overwrite, includes subfolders
    python invert_pngs.py path/to/folder --no-recursive  # top level only
    python invert_pngs.py path/to/folder -o inverted     # keep originals, write copies
    python invert_pngs.py one_image.png                  # works on a single file too

Careful: inverting twice restores the original, so running the in-place version a second
time undoes it.

Requires: pillow, numpy
"""

import argparse
import os
import sys

import numpy as np
from PIL import Image, ImageOps


def invert_image(img):
    """Return an inverted copy of `img`, skipping pixels whose alpha is 0.
    Returns None if the image mode isn't supported."""
    mode = img.mode
    has_transparency = mode in ("RGBA", "LA", "PA") or "transparency" in img.info

    if has_transparency and mode not in ("RGBA", "LA"):
        # palette / RGB / L images with a transparency key -> expand to real alpha
        img = img.convert("RGBA")
        mode = "RGBA"

    if mode == "RGBA":
        arr = np.array(img)
        visible = arr[..., 3] > 0  # ignore alpha == 0
        arr[visible, :3] = 255 - arr[visible, :3]
        return Image.fromarray(arr, "RGBA")

    if mode == "LA":
        arr = np.array(img)
        visible = arr[..., 1] > 0
        arr[visible, 0] = 255 - arr[visible, 0]
        return Image.fromarray(arr, "LA")

    if mode in ("RGB", "L", "1"):
        return (
            ImageOps.invert(img)
            if mode != "1"
            else ImageOps.invert(img.convert("L")).convert("1")
        )

    if mode == "P":  # palette, no transparency
        return ImageOps.invert(img.convert("RGB"))

    if mode in ("I;16", "I;16L", "I;16B", "I"):  # 16-bit grayscale
        arr = np.array(img)
        top = 65535 if arr.dtype == np.uint16 else int(arr.max())
        return Image.fromarray((top - arr).astype(arr.dtype))

    return None


def save_png(img, dst):
    """Atomic save: write to a temp file, then replace the destination."""
    tmp = dst + ".tmp"
    try:
        img.save(tmp, format="PNG")
        os.replace(tmp, dst)
    finally:
        if os.path.exists(tmp):
            os.remove(tmp)


def collect(path, recursive):
    """Yield (full_path, relative_path) for every .png under `path`."""
    if os.path.isfile(path):
        return [(path, os.path.basename(path))]
    found = []
    if recursive:
        for root, _, names in os.walk(path):
            for n in sorted(names):
                if n.lower().endswith(".png"):
                    full = os.path.join(root, n)
                    found.append((full, os.path.relpath(full, path)))
    else:
        for n in sorted(os.listdir(path)):
            full = os.path.join(path, n)
            if os.path.isfile(full) and n.lower().endswith(".png"):
                found.append((full, n))
    return found


def main():
    ap = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    ap.add_argument("path", help="folder (or single .png file)")
    ap.add_argument(
        "-o",
        "--out",
        default=None,
        help="write inverted copies here instead of overwriting the originals",
    )
    ap.add_argument(
        "--no-recursive", action="store_true", help="don't descend into subfolders"
    )
    args = ap.parse_args()

    if not os.path.exists(args.path):
        sys.exit(f"not found: {args.path}")

    files = collect(args.path, recursive=not args.no_recursive)
    if not files:
        sys.exit("no PNG files found")
    single = os.path.isfile(args.path)

    done = skipped = 0
    for i, (src, rel) in enumerate(files, 1):
        try:
            with Image.open(src) as img:
                img.load()
                result = invert_image(img)
        except Exception as e:  # unreadable / corrupt file
            print(f"skip {rel}: {e}")
            skipped += 1
            continue
        if result is None:
            print(f"skip {rel}: unsupported mode")
            skipped += 1
            continue

        if args.out is None:
            dst = src
        else:
            dst = (
                args.out
                if single and args.out.lower().endswith(".png")
                else os.path.join(args.out, rel)
            )
            os.makedirs(os.path.dirname(os.path.abspath(dst)), exist_ok=True)
        save_png(result, dst)
        done += 1
        if i % 100 == 0:
            print(f"{i}/{len(files)}")

    print(f"inverted {done} image(s)" + (f", skipped {skipped}" if skipped else ""))


if __name__ == "__main__":
    main()
