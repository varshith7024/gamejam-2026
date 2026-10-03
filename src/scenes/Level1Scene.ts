import Phaser from 'phaser';
import { BALANCE } from '../config/balance';
import { TEXT } from '../config/text';
import { Atmosphere } from '../effects/Atmosphere';
import { DEPTH, Level1Environment } from '../environment/Level1Environment';
import { LEVEL1 } from '../environment/level1Data';
import { TestPlayer } from '../player/TestPlayer';

type Keys = Record<'W' | 'A' | 'S' | 'D' | 'G', Phaser.Input.Keyboard.Key>;

/** LEVEL 1 - THE VEIL: playable visual prototype (environment + temporary player + basic collision). */
export class Level1Scene extends Phaser.Scene {
  env!: Level1Environment;
  private atmosphere!: Atmosphere;
  player!: TestPlayer; // public so ?debug tooling can read it
  private keys!: Keys;
  private debugOn = false;
  private input_ = new Phaser.Math.Vector2();

  constructor() {
    super('Level1');
  }

  preload() {
    const { width, height } = this.scale;
    this.add.text(width / 2, height / 2, 'LOADING...', { fontSize: '20px', color: '#777' }).setOrigin(0.5);
    Level1Environment.preload(this);
    Atmosphere.preload(this);
  }

  create() {
    this.children.removeAll(true); // drop the loading text
    this.env = new Level1Environment(this);
    this.player = new TestPlayer(this, LEVEL1.playerStart.x, LEVEL1.playerStart.y);
    this.atmosphere = new Atmosphere(this);
    this.atmosphere.create();

    this.keys = this.input.keyboard!.addKeys('W,A,S,D,G') as Keys;
    // ?debug in the URL: start with the collision overlay on and expose the scene as window.__level1 (for testing).
    if (new URLSearchParams(window.location.search).has('debug')) {
      this.debugOn = true;
      this.env.setDebug(true);
      (window as unknown as Record<string, unknown>).__level1 = this;
    }
    this.setupCamera();
    this.showTitleCard();
  }

  update(_time: number, deltaMs: number) {
    const dt = Math.min(deltaMs / 1000, 0.05); // clamp so a tab-switch can't teleport the player
    const k = this.keys;
    this.input_.set((k.D.isDown ? 1 : 0) - (k.A.isDown ? 1 : 0), (k.S.isDown ? 1 : 0) - (k.W.isDown ? 1 : 0));
    this.player.step(dt, this.input_, this.env.area);

    if (Phaser.Input.Keyboard.JustDown(k.G)) {
      this.debugOn = !this.debugOn;
      this.env.setDebug(this.debugOn);
    }
    this.updateCamera(dt);
  }

  // ---------- Camera ----------
  // Fixed orientation, never rotates. The arena nearly fits the screen, so the camera only drifts a little toward
  // the player (level1CameraFollow) around the arena centre, preserving the master image's composition.
  private setupCamera() {
    const cam = this.cameras.main;
    cam.setBounds(0, 0, LEVEL1.world.width, LEVEL1.world.height);
    cam.setRoundPixels(true);
    const t = this.cameraTarget();
    cam.setScroll(t.x, t.y);
  }

  private cameraTarget() {
    const cam = this.cameras.main;
    const f = BALANCE.level1CameraFollow;
    const cx = LEVEL1.floorCenter.x + (this.player.x - LEVEL1.floorCenter.x) * f;
    const cy = LEVEL1.floorCenter.y + (this.player.y - LEVEL1.floorCenter.y) * f;
    return {
      x: Phaser.Math.Clamp(cx - cam.width / 2, 0, LEVEL1.world.width - cam.width),
      y: Phaser.Math.Clamp(cy - cam.height / 2, 0, LEVEL1.world.height - cam.height),
    };
  }

  private updateCamera(dt: number) {
    const cam = this.cameras.main;
    const t = this.cameraTarget();
    const k = 1 - Math.exp(-BALANCE.level1CameraSmoothing * dt);
    cam.setScroll(cam.scrollX + (t.x - cam.scrollX) * k, cam.scrollY + (t.y - cam.scrollY) * k);
  }

  // ---------- UI ----------
  private showTitleCard() {
    const { width, height } = this.scale;
    const title = this.add
      .text(width / 2, height * 0.42, TEXT.level1Title, { fontFamily: 'Georgia, serif', fontSize: '72px', color: '#ece8f4' })
      .setOrigin(0.5)
      .setLetterSpacing(14)
      .setScrollFactor(0)
      .setDepth(DEPTH.screen + 1)
      .setAlpha(0);
    const sub = this.add
      .text(width / 2, height * 0.42 + 56, TEXT.level1Subtitle, { fontFamily: 'Georgia, serif', fontSize: '22px', color: '#9a96b0' })
      .setOrigin(0.5)
      .setLetterSpacing(6)
      .setScrollFactor(0)
      .setDepth(DEPTH.screen + 1)
      .setAlpha(0);
    this.tweens.add({ targets: [title, sub], alpha: 1, duration: 900, hold: 1800, yoyo: true, onComplete: () => [title, sub].forEach((t) => t.destroy()) });

    this.add
      .text(width / 2, height - 22, TEXT.level1Controls, { fontSize: '15px', color: '#e4e0f2', stroke: '#000000', strokeThickness: 4 })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(DEPTH.screen + 1)
      .setAlpha(0.7);
  }
}
