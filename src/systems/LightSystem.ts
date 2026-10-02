import Phaser from 'phaser';
import { BALANCE } from '../config/balance';

/** One brightness value (0..1) drives survival, score and visibility. */
export class LightSystem extends Phaser.Events.EventEmitter {
  value = BALANCE.startLight;

  update(deltaMs: number) {
    this.setValue(this.value - BALANCE.dimPerSecond * (deltaMs / 1000));
  }

  add(amount: number) {
    this.setValue(this.value + amount);
  }

  private setValue(v: number) {
    this.value = Phaser.Math.Clamp(v, 0, 1);
    this.emit('changed', this.value);
    if (this.value <= 0) this.emit('dead');
  }
}
