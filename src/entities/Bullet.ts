import Phaser from 'phaser';

/** A blast of light. Just a small circle that flies in a straight line. */
export class Bullet extends Phaser.GameObjects.Arc {
  vx: number;
  vy: number;

  constructor(scene: Phaser.Scene, x: number, y: number, angle: number, speed: number) {
    super(scene, x, y, 5, 0, 360, false, 0xffee88);
    scene.add.existing(this);
    this.setStrokeStyle(2, 0x000000);
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;
  }

  step(dt: number) {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
  }
}
