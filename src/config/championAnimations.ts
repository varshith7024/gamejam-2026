export interface ChampionAnimDef {
  key: string;
  file: string;
  frameWidth: number;
  frameHeight: number;
  frames: number;
  directions: number;
  fps: number;
  repeat: number;
}

export type ChampionType = 'Yi' | 'Zed' | 'Enemy3' | 'Boss';

export interface ChampionConfig {
  name: ChampionType;
  folder: string;
  visualScale: number;
  originX: number;
  originY: number;
  walkSpeed: number;
  locomotionAnim: string;
  actionAnims: string[];
  deathAnim: string;
  maxHp: number;
  animations: ChampionAnimDef[];
}

export const YI_CONFIG: ChampionConfig = {
  name: 'Yi',
  folder: 'assets/Yi',
  visualScale: 0.67,
  originX: 0.5,
  originY: 0.59,
  walkSpeed: 142, // 50% faster
  locomotionAnim: 'run',
  actionAnims: ['attack_1', 'idle', 'get_hit'],
  deathAnim: 'death',
  maxHp: 3,
  animations: [
    {
      key: 'idle',
      file: 'assets/Yi/idle.png',
      frameWidth: 247,
      frameHeight: 247,
      frames: 10,
      directions: 8,
      fps: 10,
      repeat: -1,
    },
    {
      key: 'run',
      file: 'assets/Yi/run.png',
      frameWidth: 247,
      frameHeight: 247,
      frames: 8,
      directions: 8,
      fps: 20, // Synchronized with 50% faster run speed
      repeat: -1,
    },
    {
      key: 'attack_1',
      file: 'assets/Yi/attack_1.png',
      frameWidth: 247,
      frameHeight: 247,
      frames: 12,
      directions: 8,
      fps: 16,
      repeat: 0,
    },
    {
      key: 'get_hit',
      file: 'assets/Yi/get_hit.png',
      frameWidth: 247,
      frameHeight: 247,
      frames: 6,
      directions: 8,
      fps: 12,
      repeat: 0,
    },
    {
      key: 'death',
      file: 'assets/Yi/death.png',
      frameWidth: 247,
      frameHeight: 247,
      frames: 14,
      directions: 8,
      fps: 14,
      repeat: 0,
    },
  ],
};

export const ZED_CONFIG: ChampionConfig = {
  name: 'Zed',
  folder: 'assets/Zed',
  visualScale: 1.23, // 50% bigger (0.82 * 1.5)
  originX: 0.5,
  originY: 0.59,
  walkSpeed: 42, // 50% slower (85 * 0.5)
  locomotionAnim: 'walk',
  actionAnims: ['attack', 'idle', 'get_hit'],
  deathAnim: 'die',
  maxHp: 7,
  animations: [
    {
      key: 'idle',
      file: 'assets/Zed/idle.png',
      frameWidth: 220,
      frameHeight: 220,
      frames: 6,
      directions: 8,
      fps: 8,
      repeat: -1,
    },
    {
      key: 'walk',
      file: 'assets/Zed/walk.png',
      frameWidth: 220,
      frameHeight: 220,
      frames: 9,
      directions: 8,
      fps: 7, // Synchronized with 50% slower walk speed
      repeat: -1,
    },
    {
      key: 'attack',
      file: 'assets/Zed/attack.png',
      frameWidth: 220,
      frameHeight: 220,
      frames: 10,
      directions: 8,
      fps: 10, // 10 frames at 10 fps = exactly 1s attack time
      repeat: 0,
    },
    {
      key: 'get_hit',
      file: 'assets/Zed/get_hit.png',
      frameWidth: 220,
      frameHeight: 220,
      frames: 5,
      directions: 8,
      fps: 12,
      repeat: 0,
    },
    {
      key: 'die',
      file: 'assets/Zed/die.png',
      frameWidth: 220,
      frameHeight: 220,
      frames: 35,
      directions: 8,
      fps: 16,
      repeat: 0,
    },
  ],
};

export interface OrbConfig {
  key: string;
  file: string;
  frameWidth: number;
  frameHeight: number;
  frames: number;
  directions: number;
  fps: number;
  repeat: number;
  visualScale: number;
  originX: number;
  originY: number;
}

export const ORB_CONFIG: OrbConfig = {
  key: 'orb',
  file: 'assets/out/orb/orb_strip.png',
  frameWidth: 167,
  frameHeight: 159,
  frames: 8,
  directions: 8,
  fps: 12,
  repeat: -1,
  visualScale: 0.53,
  originX: 0.5,
  originY: 0.5,
};

export const ENEMY3_CONFIG: ChampionConfig = {
  name: 'Enemy3',
  folder: 'assets/out/enemy3',
  visualScale: 0.5,
  originX: 0.49,
  originY: 0.525,
  walkSpeed: 0,
  locomotionAnim: 'idle',
  actionAnims: ['attack'],
  deathAnim: 'die',
  maxHp: 5,
  animations: [
    {
      key: 'idle',
      file: 'assets/out/enemy3/enemy3_strip.png',
      frameWidth: 141,
      frameHeight: 139,
      frames: 8,
      directions: 8,
      fps: 8,
      repeat: -1,
    },
    {
      key: 'attack',
      file: 'assets/out/enemy3_attack/enemy3_attack_strip.png',
      frameWidth: 208,
      frameHeight: 164,
      frames: 9,
      directions: 7,
      fps: 16,
      repeat: 0,
    },
    {
      key: 'disappear',
      file: 'assets/out/enemy3_disappear/enemy3_disappear_strip.png',
      frameWidth: 181,
      frameHeight: 143,
      frames: 8,
      directions: 8,
      fps: 10,
      repeat: 0,
    },
  ],
};

export const BOSS_DIRS = [
  'north',
  'ne',
  'east',
  'se',
  'south',
  'sw',
  'west',
  'nw',
] as const;

export const BOSS_FRAME_COUNTS: Record<string, Record<string, number>> = {
  north: { idle: 19, walk: 25, attack: 25 },
  ne: { idle: 25, walk: 22, attack: 25 },
  east: { idle: 25, walk: 14, attack: 25 },
  se: { idle: 25, walk: 21, attack: 25 },
  south: { idle: 22, walk: 25, attack: 25 },
  sw: { idle: 25, walk: 21, attack: 25 },
  west: { idle: 25, walk: 14, attack: 25 },
  nw: { idle: 25, walk: 22, attack: 25 },
};

export const BOSS_CONFIG: ChampionConfig = {
  name: 'Boss',
  folder: 'assets/boss_ink',
  visualScale: 1.1, // Grand, imposing executioner
  originX: 0.5,
  originY: 0.87,
  walkSpeed: 85, // Menacing, deliberate boss advance
  locomotionAnim: 'walk',
  actionAnims: ['attack'],
  deathAnim: 'idle',
  maxHp: 60,
  animations: [],
};

