import type { Pt } from './Collision';
import type { LevelData } from './levelTypes';
import { TEXT } from '../config/text';

/**
 * Level 1 "THE VEIL" layout. All coordinates are in WORLD pixels == pixels of the master image
 * (public/assets/level1/veil_master.png, 1538x1023). The master image defines the camera.
 */
export const LEVEL1: LevelData = {
  id: 'level1',
  title: TEXT.level1Title,
  subtitle: TEXT.level1Subtitle,
  assetBase: 'assets/level1/',
  masterFile: 'veil_master.png',
  roster: { light: 'Yi', heavy: 'Zed' },
  nextScene: 'Level2', // after the last wave: The Veil -> The Conduit
  world: { width: 1538, height: 1023 },
  floorCenter: { x: 817, y: 511 },
  playerStart: { x: 830, y: 545 },

  /** Walkable floor (hand-traced on the master image). Player FEET must stay inside. */
  walkable: [
    [250, 530],
    [340, 495],
    [395, 440],
    [430, 375],
    [480, 335],
    [540, 300],
    [620, 275],
    [700, 255],
    [790, 232],
    [900, 232],
    [1000, 240],
    [1075, 225],
    [1110, 285],
    [1190, 308],
    [1280, 308],
    [1340, 320],
    [1385, 372],
    [1300, 425],
    [1290, 500],
    [1330, 555],
    [1370, 640],
    [1300, 690],
    [1240, 722],
    [1170, 770],
    [1060, 782],
    [1030, 745],
    [970, 742],
    [950, 770],
    [880, 760],
    [800, 765],
    [760, 740],
    [700, 705],
    [650, 670],
    [590, 640],
    [500, 625],
    [400, 600],
    [330, 565],
  ] as Pt[],

  /** Ground footprints of objects that are baked into the master image. */
  blockers: [
    // south-east pillar + brazier cluster
    [
      [1068, 762],
      [1100, 738],
      [1190, 722],
      [1238, 722],
      [1235, 745],
      [1190, 775],
      [1120, 785],
      [1075, 775],
    ] as Pt[],
  ],
  /** Ellipse blockers [cx, cy, rx, ry] for baked-in objects. */
  ellipseBlockers: [
    [448, 598, 18, 8], // dead tree trunk, south-west edge
  ] as [number, number, number, number][],

  /**
   * Props cut from the prop sheet and placed on the floor. (x, y) is the GROUND-CONTACT point.
   * footprint = [rx, ry] collision ellipse centred on the ground point (omit for none).
   * flat = ground decal that is always drawn under the player.
   */
  props: [
    { key: 'pillar_tall', x: 480, y: 505, scale: 0.5, footprint: [24, 12] },
    { key: 'pillar_broken', x: 1250, y: 365, scale: 0.5, footprint: [22, 11] },
    { key: 'statue_small', x: 1030, y: 312, scale: 0.5, footprint: [24, 12] },
    { key: 'ruin_pile', x: 625, y: 345, scale: 0.45, footprint: [52, 20] },
    { key: 'brazier_ruin', x: 905, y: 700, scale: 0.4, footprint: [42, 16] },
    { key: 'pedestal_block', x: 1000, y: 585, scale: 0.4, footprint: [24, 12] },
    { key: 'rubble_scatter', x: 600, y: 588, scale: 0.5, flat: true },
  ] as {
    key: string;
    x: number;
    y: number;
    scale: number;
    footprint?: [number, number];
    flat?: boolean;
  }[],

  atmosphere: {
    fogBanks: [
      // key, x, y, scale, alpha, drift px, period ms
      ['fog_wide', 330, 840, 1.9, 0.55, 110, 26000],
      ['fog_wide', 1250, 850, 1.9, 0.5, -110, 30000],
      ['fog_cloud', 230, 230, 1.5, 0.4, 70, 22000],
      ['fog_cloud', 1380, 250, 1.5, 0.35, -70, 24000],
      ['fog_puff', 215, 640, 1.5, 0.4, 40, 20000],
      ['fog_wisp', 760, 850, 1.6, 0.35, 90, 28000],
      // thin ground haze that crosses the playable floor (kept very faint)
      ['fog_wisp', 650, 560, 1.7, 0.12, 160, 36000],
      ['fog_cloud', 1000, 430, 1.3, 0.09, -140, 40000],
    ],
    motes: [
      [520, 430, 1.1],
      [1120, 560, 1.0],
    ],
    spirits: [
      [330, 620, 1.2],
      [1260, 480, 1.2],
    ],
    tints: { dust: 0xdedbe8, motes: 0x9ff4ff, shards: 0x050408 },
  },
};
