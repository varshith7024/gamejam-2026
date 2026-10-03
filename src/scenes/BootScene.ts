import Phaser from 'phaser';
import {
  KNIGHT_ANIMATIONS,
  KNIGHT_FRAME_WIDTH,
  KNIGHT_FRAME_HEIGHT,
  FRAMES_PER_DIR,
  NUM_DIRECTIONS,
} from '../config/animations';
import { YI_CONFIG, ZED_CONFIG } from '../config/championAnimations';
import { Level1Environment } from '../environment/Level1Environment';
import { Atmosphere } from '../effects/Atmosphere';
import { resolveStartScene } from '../config/dev';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload() {
    this.cameras.main.setBackgroundColor('#000000');

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

    // Preload Level 1 environment & atmospheric effects
    Level1Environment.preload(this);
    Atmosphere.preload(this);
    this.load.setPath('');
  }

  create() {
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

    this.scene.start(resolveStartScene());
  }
}
