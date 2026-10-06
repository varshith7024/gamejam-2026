import type { Pt } from './Collision';
import type { LevelData } from './levelTypes';
import { TEXT } from '../config/text';

const S = 1.0;
const p = (x: number, y: number): { x: number; y: number } => ({
  x: Math.round(x * S),
  y: Math.round(y * S),
});
const poly = (pts: [number, number][]): Pt[] =>
  pts.map(([x, y]) => [Math.round(x * S), Math.round(y * S)] as Pt);
const ellipse = (
  cx: number,
  cy: number,
  rx: number,
  ry: number,
): [number, number, number, number] => [
  Math.round(cx * S),
  Math.round(cy * S),
  Math.round(rx * S),
  Math.round(ry * S),
];
const entry = (id: string, x: number, y: number) => ({ id, ...p(x, y) });

/**
 * Level 3 "THE ABYSS" layout.
 *
 * Authored in 1536x1024 native master pixels of assets/raw_ai/environments/level3_abyss/master/abyss_master_concept.png.
 * The 4x upscaled master (6144x4096) is decreased by tools/process_level3_assets.py to 3072x2048 (2x supersampled)
 * -> public/assets/level3/level3_master.png for crystal clear visuals without exceeding WebGL texture limits.
 */
export const LEVEL3: LevelData = {
  id: 'level3',
  title: TEXT.level3Title,
  subtitle: TEXT.level3Subtitle,
  assetBase: 'assets/level3/',
  masterFile: 'level3_master.png',
  initialLightLevel: 0.20, // Level 3 starts at 20%
  world: { width: 1536, height: 1024 },
  floorCenter: p(790, 475),
  playerStart: p(790, 680), // South of the central seal, facing north towards the boss dais

  // Spacious combat arena floor derived from arena_playable.png (50 vertices)
  // walkable: poly([
  //   [790, 940], [735, 940], [620, 930], [640, 885], [590, 815],
  //   [530, 805], [465, 845], [330, 820], [210, 855], [185, 810],
  //   [230, 720], [255, 650], [260, 595], [170, 540], [90, 485],
  //   [25, 425], [100, 390], [180, 365], [185, 305], [100, 245],
  //   [145, 205], [230, 210], [285, 160], [405, 165], [570, 130],
  //   [640, 135], [705, 140], [780, 165], [860, 180], [940, 175],
  //   [1030, 185], [1120, 185], [1180, 180], [1235, 140], [1295, 175],
  //   [1335, 255], [1445, 270], [1390, 395], [1485, 495], [1440, 660],
  //   [1390, 680], [1435, 760], [1410, 800], [1360, 790], [1270, 850],
  //   [1210, 795], [1135, 785], [1060, 815], [1010, 895], [885, 915],
  // ]),
  //
  // // Baked-in structures: interior balustrades, monoliths, and altar pillars on the floor
  // blockers: [
  //   // NE interior balustrade (3 stone posts and connecting rail)
  //   poly([
  //     [980, 325],
  //     [1145, 295],
  //     [1150, 315],
  //     [985, 345],
  //   ]),
  //   // SE interior balustrade (corner post and long stone railing)
  //   poly([
  //     [1030, 675],
  //     [1125, 715],
  //     [1120, 735],
  //     [1025, 695],
  //   ]),
  //   // NW ruined monoliths (standing stone slabs)
  //   poly([
  //     [755, 230],
  //     [820, 220],
  //     [825, 270],
  //     [760, 280],
  //   ]),
  //   // North ruined altar pedestal and post
  //   poly([
  //     [540, 215],
  //     [585, 205],
  //     [590, 245],
  //     [545, 255],
  //   ]),
  // ],
  // Walkable floor perimeter (50 vertices)
  walkable: poly([
    [863, 885], [810, 897], [742, 864], [694, 830],
    [615, 750], [523, 772], [441, 770], [337, 808],
    [268, 789], [241, 762], [230, 720], [255, 650],
    [260, 595], [183, 541], [195, 509], [174, 464],
    [157, 439], [176, 425], [330, 367], [258, 263],
    [178, 218], [230, 210], [299, 198], [407, 201],
    [581, 165], [634, 153], [705, 140], [779, 133],
    [860, 180], [940, 175], [1030, 185], [1097, 201],
    [1169, 208], [1234, 213], [1299, 206], [1335, 255],
    [1422, 309], [1390, 395], [1393, 504], [1355, 644],
    [1390, 680], [1435, 760], [1410, 800], [1360, 790],
    [1287, 818], [1210, 795], [1135, 785], [1060, 815],
    [988, 835], [921, 876],
  ]),

  // All structures in Level 3 are placed as visible props: zero invisible baked-in blockers
  blockers: [],
  ellipseBlockers: [],

  props: [
    // North gateway & throne approach: curved stone stairs and grand runic arch
    { key: 'stairs_curved_grand', x: 1070, y: 195, scale: 0.5 },
    { key: 'portal_arch_grand', x: 1070, y: 155, scale: 0.5 },

    // Flanking the central floor: glowing pedestal braziers with climbing root vines
    { key: 'brazier_pedestal_large', x: 600, y: 475, scale: 0.65, footprint: [16, 9] },
    { key: 'brazier_pedestal_large', x: 980, y: 475, scale: 0.65, footprint: [16, 9] },

    // South entrance: smaller carved braziers flanking the walkway
    { key: 'brazier_pedestal_small', x: 740, y: 850, scale: 0.6, footprint: [14, 8] },
    { key: 'brazier_pedestal_small', x: 840, y: 850, scale: 0.6, footprint: [14, 8] },

    // Right of throne approach: pillar & banner
    { key: 'pillar_rooted_slant', x: 880, y: 220, scale: 0.65, footprint: [18, 10] },
    { key: 'banner_pole', x: 910, y: 230, scale: 0.55, footprint: [10, 6] },

    // West terrace: giant crystal cluster
    { key: 'crystal_cluster_giant', x: 370, y: 580, scale: 0.6, footprint: [16, 9] },

    // East terrace: rooted crystal spire & crystal pillar altar
    { key: 'crystal_spire_rooted', x: 1220, y: 580, scale: 0.65, footprint: [18, 10] },
    { key: 'altar_crystal_pillar', x: 1180, y: 360, scale: 0.6, footprint: [16, 9] },

    // Floor rubble / stone slabs (flat decals, player walks over them)
    { key: 'rubble_stone_pile', x: 520, y: 640, scale: 0.5, flat: true },
    { key: 'rubble_slabs_stack', x: 1050, y: 620, scale: 0.5, flat: true },
    { key: 'floor_slab_cracked_sw', x: 330, y: 760, scale: 0.45, flat: true },
  ],

  // Navigation clearance waypoints around interior props (central braziers & terraces)
  navWaypoints: [
    p(790, 380),  // North clearance
    p(980, 390),  // NE clearance around East brazier
    p(1140, 520), // East terrace clearance
    p(980, 550),  // SE clearance around East brazier
    p(790, 580),  // South clearance
    p(600, 550),  // SW clearance around West brazier
    p(440, 520),  // West terrace clearance
    p(600, 390),  // NW clearance around West brazier
  ].map((pt) => [pt.x, pt.y] as Pt),

  // Spawn locations at the gateways and stairs around the abyss arena
  entries: [
    entry('altar_north', 1070, 185), // Base of throne stairs
    entry('arch_n', 610, 150),       // North doorway arch
    entry('arch_nw', 140, 230),      // High NW doorway
    entry('arch_w', 60, 425),        // West doorway arch
    entry('stairs_sw', 210, 830),    // Lower SW terrace
    entry('bridge_s', 760, 930),     // South bridge entrance
    entry('stairs_se', 1230, 810),   // Lower SE stairs
    entry('arch_e_low', 1420, 660),  // Lower East doorway arch
    entry('arch_e_high', 1390, 290), // Upper East doorway arch
    entry('center', 790, 475),       // Central arena
  ],

  roster: { light: 'Boss', heavy: 'Boss' },

  atmosphere: {
    disabled: true,
    fogBanks: [],
    motes: [],
    spirits: [],
    tints: { dust: 0x181820, motes: 0xaaccff, shards: 0x0a0810 },
  },
};

