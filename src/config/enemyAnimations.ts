export interface EnemyAnimationDef {
  key: string;
  name: string;
  stripFile: string;
  frameWidth: number;
  frameHeight: number;
  frames: number;
  directions: number;
  fps: number;
  repeat: number; // 0 for once, -1 for loop
}

export const ENEMY_ANIMATIONS: EnemyAnimationDef[] = [
  {
    key: 'Walk',
    name: 'Walk',
    stripFile: 'assets/enemy1/Walk/Walk_strip.png',
    frameWidth: 282,
    frameHeight: 273,
    frames: 17,
    directions: 8,
    fps: 16,
    repeat: -1,
  },
  {
    key: 'Run',
    name: 'Run',
    stripFile: 'assets/enemy1/Run/Run_strip.png',
    frameWidth: 325,
    frameHeight: 265,
    frames: 22,
    directions: 8,
    fps: 20,
    repeat: -1,
  },
  {
    key: 'Attack1',
    name: 'Attack 1',
    stripFile: 'assets/enemy1/Attack1/Attack1_strip.png',
    frameWidth: 327,
    frameHeight: 289,
    frames: 16,
    directions: 8,
    fps: 16,
    repeat: 0,
  },
  {
    key: 'Attack2',
    name: 'Attack 2',
    stripFile: 'assets/enemy1/Attack2/Attack2_strip.png',
    frameWidth: 304,
    frameHeight: 303,
    frames: 20,
    directions: 8,
    fps: 16,
    repeat: 0,
  },
  {
    key: 'SpecialCast',
    name: 'Special Cast',
    stripFile: 'assets/enemy1/SpecialCast/SpecialCast_strip.png',
    frameWidth: 323,
    frameHeight: 218,
    frames: 15,
    directions: 8,
    fps: 15,
    repeat: 0,
  },
  {
    key: 'Special2',
    name: 'Special 2',
    stripFile: 'assets/enemy1/Special2/Special2_strip.png',
    frameWidth: 326,
    frameHeight: 240,
    frames: 16,
    directions: 8,
    fps: 16,
    repeat: 0,
  },
  {
    key: 'Special3',
    name: 'Special 3',
    stripFile: 'assets/enemy1/Special3/Special3_strip.png',
    frameWidth: 293,
    frameHeight: 220,
    frames: 18,
    directions: 8,
    fps: 16,
    repeat: 0,
  },
  {
    key: 'Special4',
    name: 'Special 4',
    stripFile: 'assets/enemy1/Special4/Special4_strip.png',
    frameWidth: 325,
    frameHeight: 238,
    frames: 6,
    directions: 8,
    fps: 12,
    repeat: 0,
  },
  {
    key: 'Block',
    name: 'Block',
    stripFile: 'assets/enemy1/Block/Block_strip.png',
    frameWidth: 309,
    frameHeight: 204,
    frames: 12,
    directions: 8,
    fps: 15,
    repeat: 0,
  },
  {
    key: 'GetHit',
    name: 'Get Hit',
    stripFile: 'assets/enemy1/GetHit/GetHit_strip.png',
    frameWidth: 304,
    frameHeight: 253,
    frames: 16,
    directions: 8,
    fps: 16,
    repeat: 0,
  },
];
