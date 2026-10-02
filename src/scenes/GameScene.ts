import Phaser from 'phaser';
import { BALANCE } from '../config/balance';
import { TEXT } from '../config/text';
import { LightSystem } from '../systems/LightSystem';
import { ComboSystem } from '../systems/ComboSystem';
import { Enemy } from '../entities/Enemy';
import { Bullet } from '../entities/Bullet';

type Keys = Record<'W' | 'A' | 'S' | 'D' | 'SPACE' | 'R', Phaser.Input.Keyboard.Key>;

export class GameScene extends Phaser.Scene {
  private light!: LightSystem;
  private combo!: ComboSystem;
  private overlay!: Phaser.GameObjects.Rectangle; // white layer; its alpha = light level
  private girl!: Phaser.GameObjects.Arc;
  private player!: Phaser.GameObjects.Arc;
  private hud!: Phaser.GameObjects.Text;
  private keys!: Keys;

  private enemies: Enemy[] = [];
  private bullets: Bullet[] = [];
  private shootCooldown = 0;
  private dashTime = 0;
  private dashCooldown = 0;
  private dashDir = new Phaser.Math.Vector2(1, 0);
  private spawnTimer = 0;
  private elapsed = 0;
  private dead = false;

  constructor() {
    super('Game');
  }

  create() {
    const { width, height } = this.scale;

    // reset state (this scene is reused when restarting)
    this.enemies = [];
    this.bullets = [];
    this.shootCooldown = this.dashTime = this.dashCooldown = this.spawnTimer = this.elapsed = 0;
    this.dead = false;

    this.light = new LightSystem();
    this.combo = new ComboSystem();

    this.overlay = this.add.rectangle(0, 0, width, height, 0xffffff).setOrigin(0).setDepth(-10);

    // The girl: a white shape. Grey outline so she is still visible on a white screen.
    this.girl = this.add.circle(width / 2, height / 2, BALANCE.girlRadius, 0xffffff).setStrokeStyle(3, 0x777777);

    // The player: the only coloured thing (neon outline).
    this.player = this.add.circle(width / 2 + 90, height / 2, BALANCE.playerRadius, 0x000000).setStrokeStyle(4, 0x00ffcc);

    this.hud = this.add.text(16, 12, '', { fontSize: '20px', color: '#ff00ff', fontStyle: 'bold' }).setDepth(10);
    this.add.text(width / 2, height - 18, TEXT.controls, { fontSize: '16px', color: '#ff00ff' }).setOrigin(0.5).setDepth(10);

    this.keys = this.input.keyboard!.addKeys('W,A,S,D,SPACE,R') as Keys;

    this.light.on('dead', () => {
      this.dead = true;
      this.add.text(width / 2, height / 2 - 20, TEXT.gameOver, { fontSize: '56px', color: '#ffffff' }).setOrigin(0.5).setDepth(20);
      this.add.text(width / 2, height / 2 + 40, 'SCORE ' + this.combo.score + '   ' + TEXT.restart, { fontSize: '24px', color: '#aaaaaa' }).setOrigin(0.5).setDepth(20);
    });
  }

  update(_time: number, deltaMs: number) {
    if (this.dead) {
      if (Phaser.Input.Keyboard.JustDown(this.keys.R)) this.scene.restart();
      return;
    }
    const dt = deltaMs / 1000;
    this.elapsed += dt;

    this.light.update(deltaMs);
    this.overlay.setAlpha(this.light.value);

    this.movePlayer(dt);
    this.handleShooting(dt);
    this.handleSpawning(dt);
    this.updateBullets(dt);
    this.updateEnemies(dt);
    this.updateHud();
  }

  // ---------- Player ----------
  private movePlayer(dt: number) {
    const k = this.keys;
    const dir = new Phaser.Math.Vector2(
      (k.D.isDown ? 1 : 0) - (k.A.isDown ? 1 : 0),
      (k.S.isDown ? 1 : 0) - (k.W.isDown ? 1 : 0),
    );
    if (dir.lengthSq() > 0) dir.normalize();

    this.dashCooldown -= dt;
    if (Phaser.Input.Keyboard.JustDown(k.SPACE) && this.dashCooldown <= 0) {
      this.dashDir = dir.lengthSq() > 0 ? dir.clone() : this.dashDir;
      this.dashTime = BALANCE.dashDuration;
      this.dashCooldown = BALANCE.dashCooldown;
    }

    const dashing = this.dashTime > 0;
    if (dashing) {
      this.dashTime -= dt;
      this.player.x += this.dashDir.x * BALANCE.dashSpeed * dt;
      this.player.y += this.dashDir.y * BALANCE.dashSpeed * dt;
      // Dash-through kills
      for (const e of [...this.enemies]) {
        if (Phaser.Math.Distance.Between(e.x, e.y, this.player.x, this.player.y) < e.radius + this.player.radius + 6) {
          this.killEnemy(e);
        }
      }
    } else {
      this.player.x += dir.x * BALANCE.playerSpeed * dt;
      this.player.y += dir.y * BALANCE.playerSpeed * dt;
    }

    this.player.x = Phaser.Math.Clamp(this.player.x, 0, this.scale.width);
    this.player.y = Phaser.Math.Clamp(this.player.y, 0, this.scale.height);
    this.player.setAlpha(dashing ? 0.5 : 1);
  }

  private handleShooting(dt: number) {
    this.shootCooldown -= dt;
    const p = this.input.activePointer;
    if (p.isDown && this.shootCooldown <= 0) {
      const angle = Math.atan2(p.worldY - this.player.y, p.worldX - this.player.x);
      this.bullets.push(new Bullet(this, this.player.x, this.player.y, angle, BALANCE.bulletSpeed));
      this.shootCooldown = BALANCE.shootCooldown;
    }
  }

  // ---------- Enemies ----------
  private handleSpawning(dt: number) {
    this.spawnTimer -= dt;
    if (this.spawnTimer > 0) return;
    const interval = Math.max(BALANCE.spawnMinInterval, BALANCE.spawnStartInterval - this.elapsed * BALANCE.spawnRamp);
    this.spawnTimer = interval;

    const { width, height } = this.scale;
    const side = Phaser.Math.Between(0, 3); // 0 top, 1 right, 2 bottom, 3 left
    const x = side === 1 ? width + 20 : side === 3 ? -20 : Phaser.Math.Between(0, width);
    const y = side === 0 ? -20 : side === 2 ? height + 20 : Phaser.Math.Between(0, height);
    this.enemies.push(new Enemy(this, x, y));
  }

  private updateBullets(dt: number) {
    const { width, height } = this.scale;
    for (const b of [...this.bullets]) {
      b.step(dt);
      if (b.x < -20 || b.x > width + 20 || b.y < -20 || b.y > height + 20) {
        this.removeBullet(b);
        continue;
      }
      for (const e of this.enemies) {
        if (Phaser.Math.Distance.Between(b.x, b.y, e.x, e.y) < e.radius + b.radius) {
          e.hp -= 1;
          this.removeBullet(b);
          if (e.hp <= 0) this.killEnemy(e);
          break;
        }
      }
    }
  }

  private updateEnemies(dt: number) {
    const speed = Math.min(BALANCE.enemyMaxSpeed, BALANCE.enemyBaseSpeed + this.elapsed * BALANCE.enemySpeedGrowth);
    for (const e of [...this.enemies]) {
      e.crawlToward(this.girl.x, this.girl.y, speed, dt);

      if (Phaser.Math.Distance.Between(e.x, e.y, this.player.x, this.player.y) < e.radius + this.player.radius) {
        this.light.add(-BALANCE.playerHitPenalty);
        this.combo.resetStreak();
        this.removeEnemy(e);
      } else if (Phaser.Math.Distance.Between(e.x, e.y, this.girl.x, this.girl.y) < e.radius + this.girl.radius) {
        this.light.add(-BALANCE.girlHitPenalty);
        this.removeEnemy(e);
      }
    }
  }

  private killEnemy(e: Enemy) {
    this.combo.registerKill(this.light.value); // multiplier uses light BEFORE the bonus
    this.light.add(BALANCE.killLightGain);
    this.burst(e.x, e.y);
    this.removeEnemy(e);
  }

  // ---------- Helpers ----------
  private burst(x: number, y: number) {
    const ring = this.add.circle(x, y, 10, 0xffffff).setStrokeStyle(2, 0x000000);
    this.tweens.add({ targets: ring, scale: 5, alpha: 0, duration: 300, onComplete: () => ring.destroy() });
  }

  private removeEnemy(e: Enemy) {
    this.enemies = this.enemies.filter((x) => x !== e);
    e.destroy();
  }

  private removeBullet(b: Bullet) {
    this.bullets = this.bullets.filter((x) => x !== b);
    b.destroy();
  }

  private updateHud() {
    this.hud.setText(
      'LIGHT ' + Math.round(this.light.value * 100) + '%\n' +
      'SCORE ' + this.combo.score + '\n' +
      'MULTIPLIER x' + (1 + (1 - this.light.value) * (BALANCE.maxRiskMultiplier - 1)).toFixed(1),
    );
  }
}
