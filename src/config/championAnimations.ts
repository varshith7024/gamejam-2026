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

export type ChampionType = 'Yi' | 'Zed';

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
  maxHp: 2,
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
  maxHp: 4,
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
