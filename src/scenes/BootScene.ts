import Phaser from 'phaser';
import {
  KNIGHT_ANIMATIONS,
  KNIGHT_FRAME_WIDTH,
  KNIGHT_FRAME_HEIGHT,
  FRAMES_PER_DIR,
  NUM_DIRECTIONS,
} from '../config/animations';
import { YI_CONFIG, ZED_CONFIG, ORB_CONFIG } from '../config/championAnimations';
import { Level1Environment } from '../environment/Level1Environment';
import { LEVEL1 } from '../environment/level1Data';
import { LEVEL2 } from '../environment/level2Data';
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

    // Preload each level's environment & atmospheric effects (same loaders, per-level data)
    for (const level of [LEVEL1, LEVEL2]) {
      Level1Environment.preload(this, level);
      Atmosphere.preload(this, level);
    }
    this.load.setPath('');
  }

  create() {
    if (this.textures.exists('ball_only')) {
      this.textures.get('ball_only').setFilter(Phaser.Textures.FilterMode.NEAREST);
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

    this.scene.start(resolveStartScene());
  }
}
