import Phaser from 'phaser';
import { BALANCE } from '../config/balance';
import type { WalkableArea } from '../environment/Collision';

const CLOAK = 0x16141f;
const CLOAK_LIGHT = 0x2c2840;
const RIM = 0x8a82b0;
const GLOW = 0x7ff0ff;

/**
 * TEMPORARY placeholder character (procedural, no art). Only for validating camera, scale,
 * movement, depth sorting, floor contact and collision. The container origin (0,0) is the FEET / ground contact point.
 */
export class TestPlayer extends Phaser.GameObjects.Container {
  /** Smoothed facing direction (unit vector in screen space). */
  facing = new Phaser.Math.Vector2(0, 1);
  private shadow: Phaser.GameObjects.Graphics;
  private body_: Phaser.GameObjects.Graphics;
  private walkPhase = 0;
  private moveBlend = 0; // 0 idle .. 1 moving
  private time_ = 0;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y);
    this.shadow = scene.add.graphics();
    this.body_ = scene.add.graphics();
    this.add([this.shadow, this.body_]);
    scene.add.existing(this);
    this.drawShadow();
    this.drawBody();
    this.syncDepth();
  }

  /** input = raw direction (not necessarily normalised). Moves against the walkable area. */
  step(dt: number, input: Phaser.Math.Vector2, area: WalkableArea) {
    const moving = input.lengthSq() > 0;
    if (moving) {
      const dir = input.clone().normalize();
      const speed = BALANCE.level1PlayerSpeed;
      // 3/4 view: vertical screen movement covers less ground distance, so scale it slightly like the floor does.
      const p = area.move(
        this.x,
        this.y,
        dir.x * speed * dt,
        dir.y * speed * dt * 0.85,
        BALANCE.level1FootRadiusX,
        BALANCE.level1FootRadiusY,
      );
      this.setPosition(p.x, p.y);
      this.facing.lerp(dir, Math.min(1, dt * 14)).normalize();
    }
    this.moveBlend = Phaser.Math.Linear(this.moveBlend, moving ? 1 : 0, Math.min(1, dt * 12));
    this.walkPhase += dt * (moving ? 11 : 0);
    this.time_ += dt;
    this.syncDepth();
    this.drawBody();
  }

  /** Y-sorting: depth is the ground Y of the feet. */
  private syncDepth() {
    this.setDepth(this.y);
  }

  private drawShadow() {
    const g = this.shadow;
    g.clear();
    g.fillStyle(0x000000, 0.28).fillEllipse(0, 1, 40, 15);
    g.fillStyle(0x000000, 0.4).fillEllipse(0, 1, 26, 9);
  }

  private drawBody() {
    const g = this.body_;
    g.clear();
    const f = this.facing;
    const bob =
      Math.abs(Math.sin(this.walkPhase)) * 3 * this.moveBlend +
      Math.sin(this.time_ * 2.2) * 0.8 * (1 - this.moveBlend);
    const lean = f.x * 2.5 * this.moveBlend;
    const away = f.y < -0.35; // facing away from camera

    // Weapon: a glowing blade held on the facing side. Drawn behind the body when facing away.
    const drawBlade = () => {
      const hx = f.x * 12 + lean;
      const hy = -26 - bob + f.y * 5;
      const tx = hx + f.x * 20;
      const ty = hy + f.y * 10 - 9; // blade angled slightly up
      g.lineStyle(4, 0x0b0a10, 1).lineBetween(hx, hy, tx, ty);
      g.lineStyle(2, GLOW, 1).lineBetween(hx, hy, tx, ty);
      g.fillStyle(GLOW, 0.35).fillCircle(tx, ty, 6);
      g.fillStyle(0xffffff, 1).fillCircle(tx, ty, 2.2);
    };
    if (away) drawBlade();

    // Legs (alternate while walking)
    const s = Math.sin(this.walkPhase) * 4 * this.moveBlend;
    g.fillStyle(CLOAK, 1);
    g.fillRoundedRect(-8, -9 + Math.max(0, -s), 6, 9 - Math.max(0, -s), 2);
    g.fillRoundedRect(2, -9 + Math.max(0, s), 6, 9 - Math.max(0, s), 2);

    // Cloak body (trapezoid) with rim light on the left (key light comes from upper right in the master image, so rim = left)
    const top = -46 - bob;
    g.fillStyle(CLOAK, 1);
    g.fillPoints(
      [
        { x: -9 + lean, y: top },
        { x: 9 + lean, y: top },
        { x: 15, y: -8 },
        { x: -15, y: -8 },
      ],
      true,
    );
    g.fillStyle(CLOAK_LIGHT, 1);
    g.fillPoints(
      [
        { x: 2 + lean, y: top },
        { x: 9 + lean, y: top },
        { x: 15, y: -8 },
        { x: 6, y: -8 },
      ],
      true,
    );
    g.lineStyle(1.5, RIM, 0.9).lineBetween(-9 + lean, top, -15, -8);

    // Glowing sash / accent
    g.lineStyle(3, GLOW, 0.9).lineBetween(
      -11 + lean * 0.6,
      -31 - bob * 0.6,
      11 + lean * 0.6,
      -26 - bob * 0.6,
    );

    // Head / hood
    const hy = -54 - bob;
    g.fillStyle(CLOAK, 1).fillCircle(lean, hy, 9);
    g.lineStyle(1.5, RIM, 0.9)
      .beginPath()
      .arc(lean, hy, 9, Math.PI * 0.55, Math.PI * 1.15, false)
      .strokePath();
    if (!away) {
      // face void + glowing eyes shifted toward the facing direction
      const ex = lean + f.x * 4;
      g.fillStyle(0x000000, 1).fillEllipse(ex, hy + 1 + f.y * 1.5, 11, 9);
      g.fillStyle(GLOW, 1)
        .fillCircle(ex - 2.2, hy + 1 + f.y * 1.5, 1.5)
        .fillCircle(ex + 2.2, hy + 1 + f.y * 1.5, 1.5);
    }

    if (!away) drawBlade();
  }
}
