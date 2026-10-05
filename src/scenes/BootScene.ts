import Phaser from 'phaser';
import {
  KNIGHT_ANIMATIONS,
  KNIGHT_FRAME_WIDTH,
  KNIGHT_FRAME_HEIGHT,
  FRAMES_PER_DIR,
  NUM_DIRECTIONS,
} from '../config/animations';
import {
  YI_CONFIG,
  ZED_CONFIG,
  ORB_CONFIG,
  ENEMY3_CONFIG,
  BOSS_DIRS,
  BOSS_FRAME_COUNTS,
} from '../config/championAnimations';
import { Level1Environment } from '../environment/Level1Environment';
import { LEVEL1 } from '../environment/level1Data';
import { LEVEL2 } from '../environment/level2Data';
import { LEVEL3 } from '../environment/level3Data';
import { Atmosphere } from '../effects/Atmosphere';
import { resolveStartScene } from '../config/dev';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload() {
    this.cameras.main.setBackgroundColor('#000000');
    this.load.setPath('');
    this.load.image('ball_only', 'assets/ball_only.png');

    // Preload Orb spritesheet
    this.load.spritesheet(ORB_CONFIG.key, ORB_CONFIG.file, {
      frameWidth: ORB_CONFIG.frameWidth,
      frameHeight: ORB_CONFIG.frameHeight,
      endFrame: ORB_CONFIG.frames * ORB_CONFIG.directions - 1,
    });

    // Preload Knight animations (1920x1024, 15 cols x 8 rows)
    for (const anim of KNIGHT_ANIMATIONS) {
      this.load.spritesheet(anim.key, `assets/knight/${anim.fileName}`, {
        frameWidth: KNIGHT_FRAME_WIDTH,
        frameHeight: KNIGHT_FRAME_HEIGHT,
        endFrame: FRAMES_PER_DIR * NUM_DIRECTIONS - 1,
      });
    }

    // Preload Yi animations
    for (const anim of YI_CONFIG.animations) {
      this.load.spritesheet(`Yi_${anim.key}`, anim.file, {
        frameWidth: anim.frameWidth,
        frameHeight: anim.frameHeight,
        endFrame: anim.frames * anim.directions - 1,
      });
    }

    // Preload Zed animations
    for (const anim of ZED_CONFIG.animations) {
      this.load.spritesheet(`Zed_${anim.key}`, anim.file, {
        frameWidth: anim.frameWidth,
        frameHeight: anim.frameHeight,
        endFrame: anim.frames * anim.directions - 1,
      });
    }

    // Preload Enemy3 animations
    for (const anim of ENEMY3_CONFIG.animations) {
      this.load.spritesheet(`Enemy3_${anim.key}`, anim.file, {
        frameWidth: anim.frameWidth,
        frameHeight: anim.frameHeight,
        endFrame: anim.frames * anim.directions - 1,
      });
    }

    // Preload Boss animations (8 directions: idle, walk, attack)
    for (let dir = 0; dir < 8; dir++) {
      const dName = BOSS_DIRS[dir];
      for (const anim of ['idle', 'walk', 'attack']) {
        this.load.spritesheet(
          `Boss_${anim}_${dir}`,
          `assets/boss_ink/${dName}/${dName}_${anim}.png`,
          {
            frameWidth: 256,
            frameHeight: 256,
          },
        );
      }
    }

    // Preload each level's environment & atmospheric effects (same loaders, per-level data)
    for (const level of [LEVEL1, LEVEL2, LEVEL3]) {
      Level1Environment.preload(this, level);
      Atmosphere.preload(this, level);
    }
    this.load.setPath('');
  }

  create() {
    if (this.textures.exists('ball_only')) {
      this.textures.get('ball_only').setFilter(Phaser.Textures.FilterMode.NEAREST);
    }

    // Generate soft feathered ground shadow texture (matches the player's soft contact shadow)
    if (!this.textures.exists('character_shadow')) {
      const canvas = this.textures.createCanvas('character_shadow', 64, 32);
      if (canvas) {
        const ctx = canvas.context;
        ctx.save();
        ctx.translate(32, 16);
        ctx.scale(1, 0.55);
        const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, 28);
        grad.addColorStop(0, 'rgba(0, 0, 0, 0.72)');
        grad.addColorStop(0.3, 'rgba(0, 0, 0, 0.55)');
        grad.addColorStop(0.65, 'rgba(0, 0, 0, 0.22)');
        grad.addColorStop(0.88, 'rgba(0, 0, 0, 0.06)');
        grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(0, 0, 28, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        canvas.refresh();
      }
    }

    // Register 8-directional Knight animations
    for (const anim of KNIGHT_ANIMATIONS) {
      for (let dir = 0; dir < NUM_DIRECTIONS; dir++) {
        const key = `${anim.key}_${dir}`;
        if (!this.anims.exists(key)) {
          this.anims.create({
            key,
            frames: this.anims.generateFrameNumbers(anim.key, {
              start: dir * FRAMES_PER_DIR,
              end: dir * FRAMES_PER_DIR + FRAMES_PER_DIR - 1,
            }),
            frameRate: anim.fps,
            repeat: anim.repeat,
          });
        }
      }
    }

    // Register 8-directional Yi animations
    for (const anim of YI_CONFIG.animations) {
      for (let dir = 0; dir < anim.directions; dir++) {
        const key = `Yi_${anim.key}_${dir}`;
        if (!this.anims.exists(key)) {
          this.anims.create({
            key,
            frames: this.anims.generateFrameNumbers(`Yi_${anim.key}`, {
              start: dir * anim.frames,
              end: dir * anim.frames + anim.frames - 1,
            }),
            frameRate: anim.fps,
            repeat: anim.repeat,
          });
        }
      }
    }

    // Register 8-directional Zed animations
    for (const anim of ZED_CONFIG.animations) {
      for (let dir = 0; dir < anim.directions; dir++) {
        const key = `Zed_${anim.key}_${dir}`;
        if (!this.anims.exists(key)) {
          this.anims.create({
            key,
            frames: this.anims.generateFrameNumbers(`Zed_${anim.key}`, {
              start: dir * anim.frames,
              end: dir * anim.frames + anim.frames - 1,
            }),
            frameRate: anim.fps,
            repeat: anim.repeat,
          });
        }
      }
    }

    // Register 8-directional Orb animations (orb_fly_0 ... orb_fly_7)
    if (this.textures.exists(ORB_CONFIG.key)) {
      this.textures.get(ORB_CONFIG.key).setFilter(Phaser.Textures.FilterMode.NEAREST);
    }
    for (let dir = 0; dir < ORB_CONFIG.directions; dir++) {
      const key = `${ORB_CONFIG.key}_fly_${dir}`;
      if (!this.anims.exists(key)) {
        this.anims.create({
          key,
          frames: this.anims.generateFrameNumbers(ORB_CONFIG.key, {
            start: dir * ORB_CONFIG.frames,
            end: dir * ORB_CONFIG.frames + ORB_CONFIG.frames - 1,
          }),
          frameRate: ORB_CONFIG.fps,
          repeat: ORB_CONFIG.repeat,
        });
      }
    }

    // Filter nearest on Enemy3 textures
    for (const key of ['Enemy3_idle', 'Enemy3_attack', 'Enemy3_disappear']) {
      if (this.textures.exists(key)) {
        this.textures.get(key).setFilter(Phaser.Textures.FilterMode.NEAREST);
      }
    }

    // Register directional Enemy3 animations
    // User direction specifications:
    // for idle: rows are South(0), South-East(1), North-East(2), North-West(3), North(4), West(5), East(6), South-West(7)
    // for attack: rows are South(0), South-East(1), North-East(2), North-West(3), North(4), West(5), East(6) (no SW row in sheet)
    // for disappear: rows are South(0), East(1), North-East(2), North-West(3), North(4), West(5), South-East(6), South-West(7)
    // Standard game engine directions: 0=E, 1=SE, 2=S, 3=SW, 4=W, 5=NW, 6=N, 7=NE
    const ENEMY3_IDLE_ROWS = [6, 1, 0, 7, 5, 3, 4, 2];
    const ENEMY3_ATTACK_ROWS = [6, 1, 0, 1, 5, 3, 4, 2]; // SW (3) maps to row 1 (SE) with flipX
    const ENEMY3_DISAPPEAR_ROWS = [1, 6, 0, 7, 5, 3, 4, 2];

    for (let stdDir = 0; stdDir < 8; stdDir++) {
      // 1. Idle (8 frames per row)
      const idleRow = ENEMY3_IDLE_ROWS[stdDir];
      const idleKey = `Enemy3_idle_${stdDir}`;
      if (!this.anims.exists(idleKey)) {
        this.anims.create({
          key: idleKey,
          frames: this.anims.generateFrameNumbers('Enemy3_idle', {
            start: idleRow * 8,
            end: idleRow * 8 + 7,
          }),
          frameRate: 8,
          repeat: -1,
        });
      }

      // 2. Attack (9 frames per row)
      const attackRow = ENEMY3_ATTACK_ROWS[stdDir];
      const attackKey = `Enemy3_attack_${stdDir}`;
      if (!this.anims.exists(attackKey)) {
        this.anims.create({
          key: attackKey,
          frames: this.anims.generateFrameNumbers('Enemy3_attack', {
            start: attackRow * 9,
            end: attackRow * 9 + 8,
          }),
          frameRate: 16,
          repeat: 0,
        });
      }

      // 3. Disappear (frames 0 to 4 of disappear row)
      const disRow = ENEMY3_DISAPPEAR_ROWS[stdDir];
      const disKey = `Enemy3_disappear_${stdDir}`;
      if (!this.anims.exists(disKey)) {
        this.anims.create({
          key: disKey,
          frames: this.anims.generateFrameNumbers('Enemy3_disappear', {
            start: disRow * 8,
            end: disRow * 8 + 4,
          }),
          frameRate: 10,
          repeat: 0,
        });
      }

      // 4. Appear (frames 4 to 7 of disappear row)
      const appKey = `Enemy3_appear_${stdDir}`;
      if (!this.anims.exists(appKey)) {
        this.anims.create({
          key: appKey,
          frames: this.anims.generateFrameNumbers('Enemy3_disappear', {
            start: disRow * 8 + 4,
            end: disRow * 8 + 7,
          }),
          frameRate: 10,
          repeat: 0,
        });
      }

      // 5. Die (full disappear row frames 0 to 7)
      const dieKey = `Enemy3_die_${stdDir}`;
      if (!this.anims.exists(dieKey)) {
        this.anims.create({
          key: dieKey,
          frames: this.anims.generateFrameNumbers('Enemy3_disappear', {
            start: disRow * 8,
            end: disRow * 8 + 7,
          }),
          frameRate: 10,
          repeat: 0,
        });
      }
    }

    // Register 8-directional Boss animations
    for (let dir = 0; dir < 8; dir++) {
      const dName = BOSS_DIRS[dir];
      const counts = BOSS_FRAME_COUNTS[dName];

      const idleKey = `Boss_idle_${dir}`;
      if (!this.anims.exists(idleKey)) {
        this.anims.create({
          key: idleKey,
          frames: this.anims.generateFrameNumbers(idleKey, {
            start: 0,
            end: counts.idle - 1,
          }),
          frameRate: 10,
          repeat: -1,
        });
      }

      const walkKey = `Boss_walk_${dir}`;
      if (!this.anims.exists(walkKey)) {
        this.anims.create({
          key: walkKey,
          frames: this.anims.generateFrameNumbers(walkKey, {
            start: 0,
            end: counts.walk - 1,
          }),
          frameRate: 12,
          repeat: -1,
        });
      }

      const attackKey = `Boss_attack_${dir}`;
      if (!this.anims.exists(attackKey)) {
        this.anims.create({
          key: attackKey,
          frames: this.anims.generateFrameNumbers(attackKey, {
            start: 0,
            end: counts.attack - 1,
          }),
          frameRate: 15,
          repeat: 0,
        });
      }
    }

    this.scene.start(resolveStartScene());
  }
}
