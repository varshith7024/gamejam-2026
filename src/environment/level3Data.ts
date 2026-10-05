import type { Pt } from './Collision';
import type { LevelData } from './levelTypes';

const S = 1.0;
const p = (x: number, y: number): { x: number; y: number } => ({
  x: Math.round(x * S),
  y: Math.round(y * S),
});
const poly = (pts: [number, number][]): Pt[] =>
  pts.map(([x, y]) => [Math.round(x * S), Math.round(y * S)] as Pt);

/**
 * Level 3 "THE ABYSS" - A clean, dark boss encounter chamber.
 * Open circular combat floor centered at (769, 511).
 */
export const LEVEL3: LevelData = {
  id: 'level3',
  title: 'THE ABYSS',
  subtitle: 'Boss Chamber',
  assetBase: 'assets/level3/',
  masterFile: 'level3_master.png',
  world: { width: 1538, height: 1023 },
  floorCenter: p(769, 511),
  playerStart: p(769, 720), // Player enters from the south

  // Large open elliptical combat ring (rx=560, ry=360)
  walkable: poly([
    [769 + 560, 511],
    [769 + 517, 511 + 138],
    [769 + 396, 511 + 255],
    [769 + 214, 511 + 333],
    [769, 511 + 360],
    [769 - 214, 511 + 333],
    [769 - 396, 511 + 255],
    [769 - 517, 511 + 138],
    [769 - 560, 511],
    [769 - 517, 511 - 138],
    [769 - 396, 511 - 255],
    [769 - 214, 511 - 333],
    [769, 511 - 360],
    [769 + 214, 511 - 333],
    [769 + 396, 511 - 255],
    [769 + 517, 511 - 138],
  ]),

  blockers: [],
  ellipseBlockers: [],
  props: [],

  atmosphere: {
    fogBanks: [
      ['fog_wide', 769, 200, 1.2, 0.15, 60, 9000],
      ['fog_cloud', 769, 850, 1.3, 0.12, -50, 11000],
      ['fog_wisp', 400, 511, 0.9, 0.1, 40, 8000],
      ['fog_puff', 1150, 511, 0.9, 0.1, -40, 8500],
    ],
    motes: [
      [769, 511, 1.0],
      [600, 450, 0.8],
      [950, 450, 0.8],
      [650, 600, 0.9],
      [900, 600, 0.9],
    ],
    spirits: [
      [769, 380, 1.0],
      [550, 500, 0.7],
      [1000, 500, 0.7],
    ],
    tints: { dust: 0x222228, motes: 0xddddff, shards: 0x9999bb },
  },

  roster: { light: 'Boss', heavy: 'Boss' },
  entries: [
    { id: 'north', x: 769, y: 320 },
    { id: 'center', x: 769, y: 460 },
  ],
};
