export interface KnightAnimation {
  key: string;
  name: string;
  fileName: string;
  fps: number;
  repeat: number; // -1 for loop, 0 for once
}

export const KNIGHT_FRAME_WIDTH = 128;
export const KNIGHT_FRAME_HEIGHT = 128;
export const FRAMES_PER_DIR = 15;
export const NUM_DIRECTIONS = 8;

export const DIRECTIONS = [
  'E', // 0: Right (0°)
  'SE', // 1: Down-Right (45°)
  'S', // 2: Down (90°)
  'SW', // 3: Down-Left (135°)
  'W', // 4: Left (180°)
  'NW', // 5: Up-Left (225°)
  'N', // 6: Up (270°)
  'NE', // 7: Up-Right (315°)
] as const;

export const KNIGHT_ANIMATIONS: KnightAnimation[] = [
  // Locomotion
  { key: 'Walk', name: 'Walk', fileName: 'Walk.png', fps: 18, repeat: -1 },
  { key: 'Run', name: 'Run', fileName: 'Run.png', fps: 24, repeat: -1 },
  { key: 'RunBackwards', name: 'Run Backwards', fileName: 'RunBackwards.png', fps: 20, repeat: -1 },
  { key: 'StrafeLeft', name: 'Strafe Left', fileName: 'StrafeLeft.png', fps: 18, repeat: -1 },
  { key: 'StrafeRight', name: 'Strafe Right', fileName: 'StrafeRight.png', fps: 18, repeat: -1 },
  { key: '180Turn', name: '180 Turn', fileName: '180Turn.png', fps: 26, repeat: 0 },
  { key: 'CrouchRun', name: 'Crouch Run', fileName: 'CrouchRun.png', fps: 18, repeat: -1 },

  // Idle & Stances
  { key: 'Idle', name: 'Idle', fileName: 'Idle.png', fps: 14, repeat: -1 },
  { key: 'CrouchIdle', name: 'Crouch Idle', fileName: 'CrouchIdle.png', fps: 14, repeat: -1 },
  {
    key: 'UnSheathSword',
    name: 'Unsheath Sword',
    fileName: 'UnSheathSword.png',
    fps: 18,
    repeat: 0,
  },

  // Combat
  { key: 'Melee', name: 'Melee', fileName: 'Melee.png', fps: 25, repeat: 0 },
  { key: 'Melee2', name: 'Melee 2', fileName: 'Melee2.png', fps: 25, repeat: 0 },
  { key: 'MeleeRun', name: 'Melee Run', fileName: 'MeleeRun.png', fps: 26, repeat: 0 },
  { key: 'MeleeSpin', name: 'Melee Spin', fileName: 'MeleeSpin.png', fps: 13, repeat: 0 },
  { key: 'Pummel', name: 'Pummel', fileName: 'Pummel.png', fps: 25, repeat: 0 },
  { key: 'Kick', name: 'Kick', fileName: 'Kick.png', fps: 22, repeat: 0 },
  { key: 'CastSpell', name: 'Cast Spell', fileName: 'CastSpell.png', fps: 20, repeat: 0 },
  { key: 'Special1', name: 'Special 1', fileName: 'Special1.png', fps: 25, repeat: 0 },
  { key: 'Special2', name: 'Special 2', fileName: 'Special2.png', fps: 25, repeat: 0 },

  // Defense
  {
    key: 'ShieldBlockStart',
    name: 'Shield Block Start',
    fileName: 'ShieldBlockStart.png',
    fps: 26,
    repeat: 0,
  },
  {
    key: 'ShieldBlockMid',
    name: 'Shield Block Mid',
    fileName: 'ShieldBlockMid.png',
    fps: 15,
    repeat: -1,
  },
  { key: 'TakeDamage', name: 'Take Damage', fileName: 'TakeDamage.png', fps: 24, repeat: 0 },
  { key: 'Die', name: 'Die', fileName: 'Die.png', fps: 18, repeat: 0 },

  // Agility
  { key: 'FrontFlip', name: 'Front Flip', fileName: 'FrontFlip.png', fps: 24, repeat: 0 },
  { key: 'Rolling', name: 'Rolling', fileName: 'Rolling.png', fps: 28, repeat: 0 },
  { key: 'SlideStart', name: 'Slide Start', fileName: 'SlideStart.png', fps: 24, repeat: 0 },
  { key: 'Slide', name: 'Slide', fileName: 'Slide.png', fps: 20, repeat: -1 },
  { key: 'SlideEnd', name: 'Slide End', fileName: 'SlideEnd.png', fps: 24, repeat: 0 },
];
