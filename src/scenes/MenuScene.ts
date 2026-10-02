import Phaser from 'phaser';
import { TEXT } from '../config/text';

export class MenuScene extends Phaser.Scene {
  constructor() { super('Menu'); }
  create() {
    const { width, height } = this.scale;
    this.add.text(width / 2, height / 2 - 40, TEXT.title, { fontSize: '64px', color: '#fff' }).setOrigin(0.5);
    this.add.text(width / 2, height / 2 + 40, TEXT.start, { fontSize: '24px', color: '#aaa' }).setOrigin(0.5);
    this.input.once('pointerdown', () => this.scene.start('Game'));
  }
}
