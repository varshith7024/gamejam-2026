import Phaser from 'phaser';
import { BALANCE } from '../config/balance';

/** An ink monster: black blob with a white outline, crawls toward a target. */
export class Enemy extends Phaser.GameObjects.Arc {
  hp = BALANCE.enemyHp;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, BALANCE.enemyRadius, 0, 360, false, 0x000000);
    scene.add.existing(this);
    this.setStrokeStyle(3, 0xffffff);
  }

  crawlToward(tx: number, ty: number, speed: number, dt: number) {
    const angle = Math.atan2(ty - this.y, tx - this.x);
    this.x += Math.cos(angle) * speed * dt;
    this.y += Math.sin(angle) * speed * dt;
  }
}
