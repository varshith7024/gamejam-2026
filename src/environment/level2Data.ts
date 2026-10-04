import type { Pt } from './Collision';
import type { LevelData } from './levelTypes';
import { TEXT } from '../config/text';

/**
 * Level 2 "THE CONDUIT" layout.
 *
 * The supplied master (assets/raw_ai/environments/level2_conduit/master, 1280x720) is upscaled once by
 * tools/process_level2_assets.py to 1536x864 (WORLD_SCALE) -> public/assets/level2/conduit_master.png,
 * so world pixels == master pixels, exactly like Level 1.
 *
 * Everything below is AUTHORED in the original 1280x720 master pixels (easy to trace on the source image)
 * and converted to world pixels by `S`/`p`/`poly`. Keep S in sync with WORLD_SCALE in the python tool.
 */
const S = 1.2;
const p = (x: number, y: number): { x: number; y: number } => ({ x: Math.round(x * S), y: Math.round(y * S) });
const poly = (pts: [number, number][]): Pt[] => pts.map(([x, y]) => [Math.round(x * S), Math.round(y * S)] as Pt);
const ellipse = (cx: number, cy: number, rx: number, ry: number): [number, number, number, number] => [
  Math.round(cx * S),
  Math.round(cy * S),
  Math.round(rx * S),
  Math.round(ry * S),
];
const entry = (id: string, x: number, y: number) => ({ id, ...p(x, y) });

export const LEVEL2: LevelData = {
  id: 'level2',
  title: TEXT.level2Title,
  subtitle: TEXT.level2Subtitle,
  assetBase: 'assets/level2/',
  masterFile: 'conduit_master.png',
  world: { width: Math.round(1280 * S), height: Math.round(720 * S) },
  floorCenter: p(690, 345),
  playerStart: p(640, 440), // open floor just south of the central altar

  // Large open diamond-shaped combat floor, hand-traced on the master. Player FEET must stay inside.
  walkable: poly([
    [375, 208], [520, 201], [650, 199], [728, 211], [788, 235], [848, 260], [902, 285], [960, 320],
    [1008, 341], [1056, 374], [1096, 400], [1120, 425], [1088, 446], [1028, 475], [958, 502],
    [898, 509], [840, 517], [760, 519], [700, 525], [620, 519], [560, 509], [502, 489], [456, 475],
    [402, 459], [348, 433], [304, 413], [266, 370], [266, 322], [302, 294], [322, 265], [348, 239],
  ]),

  animated: true, // flames + waterfalls play from public/assets/level2/anim.json (cut from the animated master)

  // Baked-in structures: the central altar and beacon platform footprint and the three
  // brazier towers that stand on the floor.
  blockers: [
    // Central altar and beacon platform footprint: completely covers the dais, all 4 stairs (including the 2 front stairs),
    // corner pillars, and beacon pedestal so the player cannot step onto the stairs or enter the beacon.
    poly([
      [665, 282], // North apex (keeps player clear of beacon pedestal/antlers)
      [710, 310], // NE stairs top
      [748, 335], // NE stairs bottom
      [782, 352], // East pillar outer point
      [765, 376], // East pillar base
      [740, 390], // SE stairs bottom
      [715, 402], // SE stairs base / bottom step
      [690, 412], // SE stairs ground transition
      [665, 418], // South pillar bottom tip / border
      [640, 412], // SW stairs ground transition
      [615, 402], // SW stairs base / bottom step
      [590, 390], // SW stairs bottom
      [565, 376], // West pillar base
      [548, 352], // West pillar outer point
      [582, 335], // NW stairs bottom
      [620, 310], // NW stairs top
    ]),
  ],
  ellipseBlockers: [
    ellipse(330, 286, 24, 9), // north-west brazier tower
    ellipse(298, 410, 24, 9), // west brazier tower
    ellipse(1066, 452, 26, 11), // east brazier tower
  ],

  // The master already contains every pillar, statue and brazier: nothing is added on top of it.
  props: [],

  // Navigation clearance ring around the central altar: enemies smoothly route around the beacon
  navWaypoints: [
    p(665, 252), // 0: North clearance
    p(775, 290), // 1: NE clearance
    p(825, 352), // 2: East clearance
    p(775, 425), // 3: SE clearance
    p(665, 448), // 4: South clearance
    p(555, 425), // 5: SW clearance
    p(505, 352), // 6: West clearance
    p(555, 290), // 7: NW clearance
  ].map((pt) => [pt.x, pt.y] as Pt),

  /**
   * Monster entry routes: the stairways / gateways around the arena. Enemies appear here and walk onto the floor.
   * (Shown as magenta circles in the debug overlay: press G or load with ?debug.)
   */
  entries: [
    entry('stairs_nw', 322, 168),
    entry('stairs_n', 775, 170),
    entry('stairs_e', 1085, 338),
    entry('stairs_se', 985, 548),
    entry('stairs_s', 735, 562),
    entry('stairs_sw', 432, 516),
  ],

  // Level 2 enemy roster. PLACEHOLDER: the existing Yi / Zed stand in until the Level 2 enemies are added
  // (see docs/LEVEL2_ENEMIES.md). Change these two names and the wave script spawns the new units.
  roster: { light: 'Yi', heavy: 'Zed' },

  // Same atmosphere system as Level 1 with Level 2 sprites + placements. Neutral (grey) tints = grayscale only.
  atmosphere: {
    fogBanks: [
      // key, x, y, scale, alpha, drift px, period ms   (Level 2 fog crops are smaller than Level 1's, so scales are larger)
      ['fog_wide', 260, 800, 3.2, 0.5, 110, 26000],
      ['fog_wide', 1300, 780, 3.2, 0.5, -110, 30000],
      ['fog_cloud', 150, 360, 2.6, 0.32, 60, 22000],
      ['fog_cloud', 1420, 340, 2.6, 0.3, -60, 24000],
      ['fog_puff', 700, 850, 2.6, 0.4, 50, 20000],
      ['fog_wisp', 880, 800, 3.0, 0.3, 90, 28000],
      // thin haze crossing the floor (very faint)
      ['fog_wisp', 760, 500, 3.2, 0.1, 150, 36000],
      ['fog_cloud', 1000, 420, 2.8, 0.07, -120, 40000],
    ],
    motes: [
      [620, 420, 1.5],
      [1000, 500, 1.4],
    ],
    spirits: [
      [420, 520, 1.4],
      [1180, 430, 1.4],
    ],
    tints: { dust: 0xdddddd, motes: 0xffffff, shards: 0x050505 },
  },
};
