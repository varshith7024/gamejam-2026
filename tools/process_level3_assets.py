#!/usr/bin/env python3
"""
Level 3 (THE ABYSS) asset preprocessing pipeline.

Processes:
  1. master     -> 2x supersampled master (3072x2048) from 4x upscaled master (avoiding WebGL limits).
  2. props      -> Keys out individual transparent PNGs from props/abyss_prop_sheet.png.
  3. atmosphere -> Converts abyss_atmosphere_sheet.png to smooth luminance-alpha PNGs (fog, wisps, motes, spirits).
  4. occluders  -> Cuts walk-behind polygon overlays from master with premultiplied alpha for depth sorting.

Run from project root:  npm run assets:level3
"""
import json
import shutil
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "assets/raw_ai/environments/level3_abyss"
OUT = ROOT / "public/assets/level3"

BASE_WIDTH = 1536
BASE_HEIGHT = 1024

# ---------------------------------------------------------------------------
# Prop sheet definitions: seed points on 1536x1024 transparent sheet
# ---------------------------------------------------------------------------
PROP_SEEDS = {
    # ROW 1: PORTALS & STAIRS
    "portal_arch_grand": (132, 100),
    "portal_arch_runic": (366, 100),
    "portal_arch_spire": (586, 100),
    "obelisk_draped": (766, 100),
    "portal_arch_open": (850, 140),
    "balustrade_straight_long": (1120, 100),
    "stairs_curved_upper": (1420, 90),
    "stairs_curved_grand": (1250, 220),
    "stairs_straight": (1450, 260),

    # ROW 2: BALUSTRADES & RAILINGS
    "balustrade_corner_sw": (110, 360),
    "balustrade_curved_cloth": (500, 360),
    "balustrade_roots_short": (670, 370),
    "balustrade_broken_corner": (800, 330),
    "balustrade_broken_slab": (830, 410),
    "balustrade_straight_medium": (950, 370),
    "pillar_post_roots": (1050, 330),
    "balustrade_roots_tall": (1140, 410),
    "balustrade_broken_wall": (1280, 390),
    "balustrade_corner_post": (1460, 420),

    # ROW 3: PILLARS, MONOLITHS, BRAZIERS, CRYSTALS
    "pillar_jagged_tall": (50, 550),
    "pillar_jagged_mid": (140, 600),
    "pillar_stump_small": (220, 600),
    "monolith_massive_square": (350, 600),
    "monolith_twin_peaks": (440, 550),
    "monolith_rooted_spire": (570, 560),
    "pillar_spire_slender": (650, 560),
    "brazier_pedestal_large": (750, 580),
    "brazier_pedestal_small": (835, 600),
    "altar_crystal_pillar": (920, 580),
    "crystal_spire_rooted": (1040, 600),
    "crystal_pedestal": (1180, 630),
    "crystal_spire_sharp": (1230, 550),
    "pillar_rooted_slant": (1330, 620),
    "crystal_cluster_giant": (1460, 620),

    # ROW 4: FLOOR SEALS & SLABS
    "floor_slab_corner_nw": (70, 770),
    "floor_slab_large_w": (240, 800),
    "floor_seal_central": (510, 840),
    "floor_slab_arc_ne": (760, 780),
    "floor_slab_corner_ne": (920, 790),
    "floor_slab_cracked_sw": (110, 900),
    "floor_slab_triangle_sw": (300, 930),

    # ROW 4: RUBBLE, CRYSTALS, ROOT ARCHES, BANNERS
    "pillar_stump_carved": (1050, 780),
    "wall_ruin_rubble": (1190, 790),
    "banner_pole": (1340, 800),
    "banner_hanging_ragged": (1425, 850),
    "banner_hanging_short": (1490, 810),
    "crystal_cluster_ground": (690, 930),
    "rubble_stone_pile": (790, 970),
    "rubble_slabs_stack": (870, 955),
    "root_arch_large": (1035, 840),
    "root_arch_wide": (1280, 880),
    "crystal_shard_small": (1480, 950),
}

PROP_ALIASES = {
    "prop_brazier_flame.png": "prop_brazier_pedestal_large.png",
    "prop_statue_hooded.png": "prop_obelisk_draped.png",
    "prop_pillar_draped.png": "prop_pillar_rooted_slant.png",
    "prop_crystal_cluster.png": "prop_crystal_cluster_giant.png",
    "prop_pillar_stump.png": "prop_pillar_stump_carved.png",
    "prop_crystal_spire.png": "prop_crystal_spire_rooted.png",
    "prop_altar_crystal_round.png": "prop_altar_crystal_pillar.png",
    "prop_floor_tiles.png": "prop_floor_seal_central.png",
    "prop_rubble_slab.png": "prop_floor_slab_cracked_sw.png",
    "prop_rubble_blocks.png": "prop_rubble_slabs_stack.png",
}

# ---------------------------------------------------------------------------
# Atmosphere sheet definitions: light-on-dark regions with top/bot/side feathering
# ---------------------------------------------------------------------------
ATMOS_BOXES = {
    # row 0: wide billowy abyss fog banks
    "fog_wide": ((0, 5, 750, 130), (0.22, 0.35, 0.12)),
    "fog_cloud": ((750, 5, 1536, 130), (0.22, 0.35, 0.12)),
    # row 2: flowing ethereal mist ribbons
    "fog_wisp": ((0, 288, 750, 422), (0.15, 0.18, 0.12)),
    "fog_puff": ((750, 288, 1300, 422), (0.15, 0.18, 0.12)),
    # row 1: astral crystals and glowing motes
    "motes": ((0, 142, 750, 276), (0.12, 0.12, 0.12)),
    # row 3: spectral abyss aura circles & beams
    "spirits": ((300, 434, 800, 569), (0.12, 0.12, 0.12)),
    # row 4: void dust and floating cosmic particles
    "dust": ((0, 581, 600, 716), (0.12, 0.12, 0.12)),
}

# ---------------------------------------------------------------------------
# Occluders: walk-behind overlays cut out of master (none for Level 3 open arena)
# ---------------------------------------------------------------------------
OCCLUDERS = {}


def _smooth(t: np.ndarray) -> np.ndarray:
    return t * t * (3 - 2 * t)


def key_props() -> int:
    """Extracts transparent props from abyss_prop_sheet.png into public/assets/level3/props/."""
    sheet_path = SRC / "props/abyss_prop_sheet.png"
    if not sheet_path.exists():
        print("props     : sheet not found, skipping")
        return 0

    sheet = Image.open(sheet_path).convert("RGBA")
    arr = np.array(sheet)
    alpha = arr[:, :, 3].copy()

    # Apply surgical separating cuts between packed adjacent items
    cut_mask = Image.new("L", (sheet.width, sheet.height), 255)
    d = ImageDraw.Draw(cut_mask)
    d.line((1375, 150, 1375, 340), fill=0, width=5)
    d.line((218, 455, 226, 485), fill=0, width=5)
    d.line((417, 260, 417, 485), fill=0, width=5)
    d.line((345, 735, 365, 755), fill=0, width=5)

    cut_alpha = np.minimum(alpha, np.array(cut_mask))
    bin_map = (cut_alpha > 15).astype(np.uint8)
    h, w = bin_map.shape

    props_dir = OUT / "props"
    props_dir.mkdir(parents=True, exist_ok=True)

    visited = np.zeros((h, w), dtype=bool)

    def extract_at(sx: int, sy: int):
        if not (0 <= sx < w and 0 <= sy < h):
            return None
        if bin_map[sy, sx] == 0:
            sub = cut_alpha[max(0, sy - 15) : min(h, sy + 16), max(0, sx - 15) : min(w, sx + 16)]
            if sub.max() <= 15:
                return None
            my, mx = np.unravel_index(np.argmax(sub), sub.shape)
            sy = max(0, sy - 15) + my
            sx = max(0, sx - 15) + mx
        if visited[sy, sx]:
            return None

        q = [(sy, sx)]
        visited[sy, sx] = True
        min_y, max_y = sy, sy
        min_x, max_x = sx, sx
        head = 0
        while head < len(q):
            cy, cx = q[head]
            head += 1
            if cy < min_y: min_y = cy
            if cy > max_y: max_y = cy
            if cx < min_x: min_x = cx
            if cx > max_x: max_x = cx
            for ny, nx in ((cy - 1, cx), (cy + 1, cx), (cy, cx - 1), (cy, cx + 1)):
                if 0 <= ny < h and 0 <= nx < w and bin_map[ny, nx] and not visited[ny, nx]:
                    visited[ny, nx] = True
                    q.append((ny, nx))

        c_arr = np.zeros((max_y - min_y + 1, max_x - min_x + 1, 4), dtype=np.uint8)
        v_slice = visited[min_y : max_y + 1, min_x : max_x + 1]
        sy_idx, sx_idx = np.where(v_slice)
        c_arr[sy_idx, sx_idx] = arr[min_y + sy_idx, min_x + sx_idx]
        return Image.fromarray(c_arr)

    count = 0
    for name, (sx, sy) in PROP_SEEDS.items():
        img = extract_at(sx, sy)
        if img is not None:
            # Special cleanup for central floor seal to ensure zero neighbor bleeds
            if name == "floor_seal_central":
                arr_s = np.array(img)
                cy_s, cx_s = arr_s.shape[0] // 2, arr_s.shape[1] // 2
                vis_s = np.zeros(arr_s.shape[:2], dtype=bool)
                q_s = [(cy_s, cx_s)]
                vis_s[cy_s, cx_s] = True
                h_s = 0
                my0, my1 = cy_s, cy_s
                mx0, mx1 = cx_s, cx_s
                while h_s < len(q_s):
                    y, x = q_s[h_s]
                    h_s += 1
                    if y < my0: my0 = y
                    if y > my1: my1 = y
                    if x < mx0: mx0 = x
                    if x > mx1: mx1 = x
                    for ny, nx in ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)):
                        if 0 <= ny < arr_s.shape[0] and 0 <= nx < arr_s.shape[1] and arr_s[ny, nx, 3] > 15 and not vis_s[ny, nx]:
                            vis_s[ny, nx] = True
                            q_s.append((ny, nx))
                clean_s = np.zeros_like(arr_s)
                clean_s[vis_s] = arr_s[vis_s]
                img = Image.fromarray(clean_s[my0 : my1 + 1, mx0 : mx1 + 1])

            elif name == "stairs_straight":
                # Trim neighbor column on the left
                arr_st = np.array(img)
                if arr_st.shape[1] > 25:
                    arr_st = arr_st[:, 25:]
                    al_st = arr_st[:, :, 3]
                    nz_y = np.where(al_st.max(axis=1) > 15)[0]
                    nz_x = np.where(al_st.max(axis=0) > 15)[0]
                    if len(nz_y) > 0 and len(nz_x) > 0:
                        img = Image.fromarray(arr_st[nz_y[0] : nz_y[-1] + 1, nz_x[0] : nz_x[-1] + 1])

            elif name == "monolith_massive_square":
                # Erase bottom right corner slab piece
                arr_m = np.array(img)
                arr_m[240:, 65:, 3] = 0
                al_m = arr_m[:, :, 3]
                nz_y = np.where(al_m.max(axis=1) > 15)[0]
                nz_x = np.where(al_m.max(axis=0) > 15)[0]
                if len(nz_y) > 0 and len(nz_x) > 0:
                    img = Image.fromarray(arr_m[nz_y[0] : nz_y[-1] + 1, nz_x[0] : nz_x[-1] + 1])

            out_file = props_dir / f"prop_{name}.png"
            img.save(out_file, optimize=True)
            count += 1

    # Copy aliases for backward compatibility with level3Data.ts
    for dst, src in PROP_ALIASES.items():
        src_path = props_dir / src
        dst_path = props_dir / dst
        if src_path.exists():
            shutil.copyfile(src_path, dst_path)

    return count


def key_atmosphere() -> int:
    """Converts light-on-dark abyss atmosphere crops to luminance-alpha PNGs."""
    sheet_path = SRC / "atmosphere/abyss_atmosphere_sheet.png"
    if not sheet_path.exists():
        print("atmosphere: sheet not found, skipping")
        return 0

    sheet = Image.open(sheet_path).convert("L")
    gray = np.array(sheet, dtype=np.float32)

    atmos_dir = OUT / "atmos"
    atmos_dir.mkdir(parents=True, exist_ok=True)

    count = 0
    for name, (box, (f_top, f_bot, f_side)) in ATMOS_BOXES.items():
        x0, y0, x1, y1 = box
        lum = gray[y0:y1, x0:x1]
        h, w = lum.shape
        floor, hi = np.percentile(lum, 5), np.percentile(lum, 99.5)
        alpha = np.clip((lum - floor) / max(1.0, hi - floor), 0, 1) ** 1.15
        iy = np.arange(h)
        fy = np.where(iy < h / 2, np.clip(iy / (h * f_top), 0, 1), np.clip((h - 1 - iy) / (h * f_bot), 0, 1))
        fx = np.clip(np.minimum(np.arange(w), np.arange(w)[::-1]) / (w * f_side), 0, 1)
        alpha *= _smooth(fy)[:, None] * _smooth(fx)[None, :]
        rgb = np.clip(lum * 1.15, 0, 255)
        rgba = np.dstack([np.repeat(rgb[..., None], 3, 2), alpha * 255]).astype(np.uint8)

        # Premultiply alpha
        rgba_f = rgba.astype(np.float32)
        rgba_f[..., :3] *= rgba_f[..., 3:4] / 255.0
        final_img = Image.fromarray(np.round(rgba_f).astype(np.uint8))
        final_img.save(atmos_dir / f"atmos_{name}.png", optimize=True)
        count += 1

    return count


def cut_occluders(master: Image.Image, out_dir: Path, occluders: dict, feather: float = 1.0) -> list:
    occ_dir = out_dir / "occluders"
    occ_dir.mkdir(parents=True, exist_ok=True)
    manifest = []
    SS = 4
    scale = master.width / float(BASE_WIDTH)

    for name, spec in occluders.items():
        poly = spec["polygon"]
        xs = [p[0] for p in poly]
        ys = [p[1] for p in poly]
        x0, y0, x1, y1 = min(xs) - 2, min(ys) - 2, max(xs) + 2, max(ys) + 2
        w, h = x1 - x0, y1 - y0

        big = Image.new("L", (w * SS, h * SS), 0)
        ImageDraw.Draw(big).polygon([((px - x0) * SS, (py - y0) * SS) for px, py in poly], fill=255)
        alpha = big.resize((w, h), Image.Resampling.LANCZOS)
        if feather > 0:
            alpha = alpha.filter(ImageFilter.GaussianBlur(feather))

        crop_box = (
            int(round(x0 * scale)),
            int(round(y0 * scale)),
            int(round(x1 * scale)),
            int(round(y1 * scale)),
        )
        crop = master.crop(crop_box).convert("RGBA")
        if crop.size != (w, h):
            crop = crop.resize((w, h), Image.Resampling.LANCZOS)
        crop.putalpha(alpha)

        fname = f"occ_{name}.png"
        crop.save(occ_dir / fname, optimize=True)
        manifest.append({
            "key": f"occ_{name}",
            "file": f"occluders/{fname}",
            "x": x0,
            "y": y0,
            "sortY": spec["sortY"],
        })

    (out_dir / "occluders.json").write_text(json.dumps(manifest, indent=2))
    return manifest


def premultiply_occluders(manifest: list, out_dir: Path) -> None:
    for o in manifest:
        f = out_dir / o["file"]
        im = np.array(Image.open(f).convert("RGBA")).astype(np.float32)
        im[..., :3] *= im[..., 3:4] / 255.0
        Image.fromarray(np.round(im).astype(np.uint8)).save(f, optimize=True)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)

    upscaled = SRC / "master/abyss_master_concept_upscayl_4x_digital-art-4x.png"
    concept = SRC / "master/abyss_master_concept.png"

    if upscaled.exists():
        im = Image.open(upscaled).convert("RGB")
        # 2x supersampled master (3072x2048) from 4x upscaled master (decreased from 6144x4096)
        im_2x = im.resize((BASE_WIDTH * 2, BASE_HEIGHT * 2), Image.Resampling.LANCZOS)
        im_2x.save(OUT / "level3_master.png", optimize=True)
        print("master    : 2x supersampled (3072x2048) generated from 4x upscaled master")
        master_plate = im_2x
    elif concept.exists():
        im = Image.open(concept).convert("RGB")
        im.save(OUT / "level3_master.png", optimize=True)
        print("master    : 1536x1024 base concept copied")
        master_plate = im
    else:
        raise FileNotFoundError(f"No master found in {SRC / 'master'}")

    # Props
    props_count = key_props()
    print(f"props     : {props_count} keyed into {OUT / 'props'}")

    # Atmosphere
    atmos_count = key_atmosphere()
    print(f"atmosphere: {atmos_count} converted into {OUT / 'atmos'}")

    # Occluders
    manifest = cut_occluders(master_plate, OUT, OCCLUDERS, feather=1.0)
    premultiply_occluders(manifest, OUT)
    print(f"occluders : {len(manifest)} cut and premultiplied")

    print(f"-> Done: all Level 3 assets processed into {OUT}")


if __name__ == "__main__":
    main()
