import Phaser from 'phaser';
import {
  KNIGHT_ANIMATIONS,
  KNIGHT_FRAME_WIDTH,
  KNIGHT_FRAME_HEIGHT,
  FRAMES_PER_DIR,
  NUM_DIRECTIONS,
} from '../config/animations';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload() {
    this.cameras.main.setBackgroundColor('#ffffff');

    // Preload all 29 Knight animation sprite sheets (1920x1024, 15 cols x 8 rows)
    for (const anim of KNIGHT_ANIMATIONS) {
      this.load.spritesheet(anim.key, `assets/knight/${anim.fileName}`, {
        frameWidth: KNIGHT_FRAME_WIDTH,
        frameHeight: KNIGHT_FRAME_HEIGHT,
        endFrame: FRAMES_PER_DIR * NUM_DIRECTIONS - 1,
      });
    }
  }

  create() {
    // Register 8-directional animations for each animation key
    // Row 0 = Right (0°), Row 1 = Down-Right (45°), ..., Row 7 = Up-Right (315°) clockwise
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

    this.scene.start('Game');
  }
}
