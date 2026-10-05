#!/usr/bin/env python3
"""
tools/reprocess_boss_assets.py
------------------------------
Extracts, normalizes, mirrors, and inks all 24 Boss animation sheets
from pristine originals in assets/boss/ into assets/boss_ink/ and public/assets/boss_ink/.

Per-sheet calibration guarantees:
1. Every direction (N, NE, E, SE, S, SW, W, NW) has identical character height (~180px)
   and identical ground feet contact baseline (y=222-224), preventing all size popping.
2. Mirrored directions (W, SW, NW) are mirrored individual frame-by-frame,
   eliminating all reversed rows and empty blank frames.
3. Clean 256x256 integer cell multiples (5 columns wide) for seamless Phaser playback.
4. Pure black & white comic ink style with Bayer dithering.
"""

import os
import sys
import numpy as np
from PIL import Image

sys.path.insert(0, os.path.abspath('public/assets'))
import ink_better

# Per-sheet calibrated parameters: (relative_path, cols, rows, count, scale, ox, oy)
CALIBRATED_SHEETS = {
    'north': {
        'idle':   ('north/north_idle.webp', 5, 4, 19, 180.0 / 150.7, -0.6, 14.8),
        'walk':   ('north/north_walk.webp', 5, 5, 25, 180.0 / 130.5, -13.5, 0.0),
        'attack': ('north/north_attack.webp', 5, 5, 25, 1.15, 6.6, 13.8),
    },
    'south': {
        'idle':   ('south/south_idle.png', 5, 5, 22, 180.0 / 182.0, 2.3, 10.4),
        'walk':   ('south/south_walk.png', 5, 5, 25, 180.0 / 212.6, 20.1, 25.0),
        'attack': ('south/south_attack.png', 5, 5, 25, 0.92, 7.8, -4.0),
    },
    'east': {
        'idle':   ('east/east_idle.webp', 5, 5, 25, 180.0 / 168.5, 25.2, 23.2),
        'walk':   ('east/east_walk.webp', 5, 3, 14, 180.0 / 187.0, 0.5, 14.0),
        'attack': ('east/east_attack.webp', 5, 5, 25, 1.05, 14.8, 22.4),
    },
    'se': {
        'idle':   ('se/se_idle.webp', 5, 5, 25, 180.0 / 163.4, 20.0, 21.4),
        'walk':   ('se/se_walk.webp', 5, 5, 21, 180.0 / 172.8, 18.0, 36.0),
        'attack': ('se/se_attack.webp', 5, 5, 25, 1.04, 10.6, 16.0),
    },
    'ne': {
        'idle':   ('ne/ne_idle.png', 5, 5, 25, 180.0 / 152.3, -29.0, -14.7),
        'walk':   ('ne/ne_walk.png', 5, 5, 22, 180.0 / 156.2, -32.1, -5.0),
        'attack': ('ne/ne_attack.png', 5, 5, 25, 0.90, 0.8, 8.0),
    },
}

MIRRORS = {
    'east': 'west',
    'se':   'sw',
    'ne':   'nw',
}

class Opts:
    no_outline = False
    thick = 1
    shade = 0.8
    contrast = 1.2
    dither = 4
    equalize = 0.5

def ink_pil_image(pil_img):
    arr = np.array(pil_img.convert("RGBA"))
    rgb = arr[..., :3].astype(np.float64)
    alpha = arr[..., 3]
    mask = alpha >= 128
    if mask.sum() == 0:
        return pil_img

    stats = ink_better.folder_stats([(rgb, mask, True)], 0.65)
    opts = Opts()
    
    black = ink_better.neighbour_edges(rgb, mask, stats['line_t'])
    if not opts.no_outline:
        outline = ink_better.silhouette_outline(mask)
        black = black | outline
    if opts.shade > 0:
        tone = ink_better.tone_layer(
            rgb, mask, stats, opts.contrast, opts.shade, opts.dither, opts.equalize, radius=4
        )
        black = black | tone
    black = black & mask
    return ink_better.render(black, mask, False, 'transparent')

def main():
    out_dirs = ['assets/boss_ink', 'public/assets/boss_ink']
    for d in out_dirs:
        for subd in ['north', 'ne', 'east', 'se', 'south', 'sw', 'west', 'nw']:
            os.makedirs(os.path.join(d, subd), exist_ok=True)

    for base_dir, anims in CALIBRATED_SHEETS.items():
        mirror_dir = MIRRORS.get(base_dir)

        for anim, (rel_path, cols, rows, count, scale, ox, oy) in anims.items():
            full_path = os.path.join('assets/boss', rel_path)
            orig_img = Image.open(full_path).convert('RGBA')
            cw = orig_img.width / cols
            ch = orig_img.height / rows

            base_frames = []
            mirror_frames = []

            for i in range(count):
                c = i % cols
                r = i // cols
                x0 = int(c * cw)
                y0 = int(r * ch)
                x1 = int((c + 1) * cw)
                y1 = int((r + 1) * ch)
                cell = orig_img.crop((x0, y0, x1, y1))

                # Scale cell to match target body proportions exactly
                new_w = int(round(cell.width * scale))
                new_h = int(round(cell.height * scale))
                resized = cell.resize((new_w, new_h), Image.Resampling.LANCZOS)

                # Paste onto standardized 256x256 cell canvas with calibrated offsets
                canvas = Image.new('RGBA', (256, 256), (0, 0, 0, 0))
                canvas.paste(resized, (int(round(ox)), int(round(oy))), resized)
                base_frames.append(canvas)

                if mirror_dir:
                    # Individually mirror each frame horizontally
                    mirrored = canvas.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
                    mirror_frames.append(mirrored)

            # Assemble base sheet
            num_rows = (count + 4) // 5
            sheet_w = 1280
            sheet_h = num_rows * 256
            base_sheet = Image.new('RGBA', (sheet_w, sheet_h), (0, 0, 0, 0))
            for i, frame in enumerate(base_frames):
                bx = (i % 5) * 256
                by = (i // 5) * 256
                base_sheet.paste(frame, (bx, by), frame)

            inked_base = ink_pil_image(base_sheet)

            for target_base in out_dirs:
                dest = os.path.join(target_base, base_dir, f'{base_dir}_{anim}.png')
                inked_base.save(dest, 'PNG')
            print(f'Processed {base_dir}_{anim}: {count} frames ({sheet_w}x{sheet_h})')

            # Assemble mirrored sheet if applicable
            if mirror_dir and mirror_frames:
                mirror_sheet = Image.new('RGBA', (sheet_w, sheet_h), (0, 0, 0, 0))
                for i, frame in enumerate(mirror_frames):
                    bx = (i % 5) * 256
                    by = (i // 5) * 256
                    mirror_sheet.paste(frame, (bx, by), frame)

                inked_mirror = ink_pil_image(mirror_sheet)

                for target_base in out_dirs:
                    dest = os.path.join(target_base, mirror_dir, f'{mirror_dir}_{anim}.png')
                    inked_mirror.save(dest, 'PNG')
                print(f'Processed {mirror_dir}_{anim}: {count} frames ({sheet_w}x{sheet_h})')

    print('All 24 boss animation sheets successfully normalized and inked!')

if __name__ == '__main__':
    main()
