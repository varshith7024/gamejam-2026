import Phaser from 'phaser';
import { resolveStartScene } from '../config/dev';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }
  preload() {
    // Load assets from public/assets/, e.g.:
    // this.load.image('player', 'assets/player.png');
  }
  create() {
    this.scene.start(resolveStartScene());
  }
}
