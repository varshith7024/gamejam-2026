import type { Pt } from './Collision';

/**
 * Level 1 "THE VEIL" layout. All coordinates are in WORLD pixels == pixels of the master image
 * (public/assets/level1/veil_master.png, 1538x1023). The master image defines the camera.
 */
export const LEVEL1 = {
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
};
