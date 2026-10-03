import Phaser from 'phaser';
import {
  ChampionConfig,
  ChampionType,
  YI_CONFIG,
  ZED_CONFIG,
} from '../config/championAnimations';
import { LEVEL1 } from '../environment/level1Data';
import type { WalkableArea } from '../environment/Collision';

export class Enemy extends Phaser.GameObjects.Sprite {
  public championType: ChampionType;
  private config: ChampionConfig;

  // Health and combat state
  public maxHp: number;
  public currentHp: number;
  public isDead = false;
  public isDying = false;
  public isStumbling = false;
  private stumbleTimer = 0;

  // AI & Movement State
  private isMoving = true;
  private isActing = false;

  // Clockwise 8 directions: 0=N, 1=NE, 2=E, 3=SE, 4=S, 5=SW, 6=W, 7=NW
  private currentDir = 4; // Starts facing South
  private currentAnimKey = '';

  // Attack stats per champion type
  public attackDamage = 1;
  public attackCooldownDuration = 1.0;
  public attackCooldown = 0;
  private walkSpeed = 80;
  private hasEnteredArena = false;

  // Crowd separation
  private separationX = 0;
  private separationY = 0;

  // Attack engagement distance (scaled with champion size)
  private attackRange = 50;

  constructor(scene: Phaser.Scene, x: number, y: number, type: ChampionType = 'Yi') {
    const config = type === 'Yi' ? YI_CONFIG : ZED_CONFIG;
    super(scene, x, y, `${type}_${config.locomotionAnim}`, 0);

    this.championType = type;
    this.config = config;
    this.maxHp = config.maxHp;
    this.currentHp = this.maxHp;
    this.attackRange = type === 'Zed' ? 68 : 50;
    this.attackDamage = type === 'Zed' ? 5 : 1;
    this.attackCooldownDuration = type === 'Zed' ? 0.75 : 1.0;
    this.attackCooldown = this.attackCooldownDuration;

    this.walkSpeed = Phaser.Math.FloatBetween(
      config.walkSpeed - 5,
      config.walkSpeed + 5,
    );
    this.setScale(config.visualScale);
    this.setOrigin(config.originX, config.originY);

    scene.add.existing(this);

    // Initial direction facing towards arena floor center
    const dx = LEVEL1.floorCenter.x - x;
    const dy = LEVEL1.floorCenter.y - y;
    this.currentDir = this.computeDirection(dx, dy);

    // Start locomotion animation with desynchronized cycle
    this.currentAnimKey = config.locomotionAnim;
    this.playChampionAnim(config.locomotionAnim, this.currentDir);
    this.anims.setProgress(Math.random());

    this.attackCooldown = Phaser.Math.FloatBetween(0.5, 2.0);

    // Animation completion handling
    this.on(Phaser.Animations.Events.ANIMATION_COMPLETE, (anim: Phaser.Animations.Animation) => {
      if (this.isDead) return;
      if (this.isStumbling) {
        // While stumbling, if get_hit finished, transition to idle stagger
        if (anim.key.includes('get_hit')) {
          this.playChampionAnim('idle', this.currentDir);
        }
        return;
      }
      if (this.isActing) {
        this.isActing = false;
        this.startChasing();
      }
    });
  }

  // Calculate repulsion vector from nearby enemies so horde naturally fans out
  public computeSeparation(otherEnemies: Enemy[]) {
    if (this.isDead) return;

    this.separationX = 0;
    this.separationY = 0;
    const minDist = this.championType === 'Zed' ? 52 : 36;

    for (const other of otherEnemies) {
      if (other === this || other.isDead) continue;
      const dx = this.x - other.x;
      const dy = this.y - other.y;
      const dist = Math.hypot(dx, dy);

      if (dist > 0 && dist < minDist) {
        const factor = (minDist - dist) / minDist;
        this.separationX += (dx / dist) * factor;
        this.separationY += (dy / dist) * factor;
      }
    }
  }

  public update(dt: number, playerX?: number, playerY?: number, area?: WalkableArea) {
    if (this.isDead) return;

    // Handle stumble timer after being hit
    if (this.isStumbling) {
      this.stumbleTimer -= dt;
      this.setDepth(this.y);
      if (this.stumbleTimer <= 0) {
        this.isStumbling = false;
        this.isActing = false;
        this.startChasing();
      }
      return;
    }

    if (this.attackCooldown > 0) {
      this.attackCooldown -= dt;
    }

    if (playerX !== undefined && playerY !== undefined) {
      const dx = playerX - this.x;
      const dy = playerY - this.y;
      const distToPlayer = Math.hypot(dx, dy);

      if (this.isActing) {
        // Stationary while executing an attack
        this.isMoving = false;
      } else if (distToPlayer <= this.attackRange && this.attackCooldown <= 0) {
        // Close enough: stop and execute an attack
        this.triggerAttack(playerX, playerY);
      } else {
        // Move towards player using locomotion animation
        this.isMoving = true;
        this.currentAnimKey = this.config.locomotionAnim;

        // Blend direct player pursuit with crowd separation force
        let vx = dx / (distToPlayer || 1);
        let vy = dy / (distToPlayer || 1);

        if (this.separationX !== 0 || this.separationY !== 0) {
          const sepWeight = 0.85;
          vx += this.separationX * sepWeight;
          vy += this.separationY * sepWeight;

          const len = Math.hypot(vx, vy);
          if (len > 0.001) {
            vx /= len;
            vy /= len;
          }
        }

        const stepX = vx * this.walkSpeed * dt;
        const stepY = vy * this.walkSpeed * dt * 0.85;
        const rx = this.championType === 'Zed' ? 16 : 10;
        const ry = this.championType === 'Zed' ? 8 : 5;

        if (area) {
          if (!this.hasEnteredArena) {
            if (area.canStand(this.x, this.y, rx, ry)) {
              this.hasEnteredArena = true;
            }
          }

          if (this.hasEnteredArena) {
            const p = area.move(this.x, this.y, stepX, stepY, rx, ry);
            this.x = p.x;
            this.y = p.y;
          } else {
            this.x += stepX;
            this.y += stepY;
          }
        } else {
          this.x += stepX;
          this.y += stepY;
        }

        // Keep facing direction aligned with movement velocity
        const moveDir = this.computeDirection(vx, vy);
        const animKey = `${this.championType}_${this.config.locomotionAnim}_${moveDir}`;
        if (moveDir !== this.currentDir || this.anims.currentAnim?.key !== animKey) {
          this.currentDir = moveDir;
          this.playChampionAnim(this.config.locomotionAnim, this.currentDir);
        }
      }
    }

    // Depth sorting based on ground feet position
    this.setDepth(this.y);
  }

  private startChasing() {
    this.isMoving = true;
    this.isActing = false;
    this.isStumbling = false;
    this.currentAnimKey = this.config.locomotionAnim;
    this.playChampionAnim(this.config.locomotionAnim, this.currentDir);
  }

  private triggerAttack(playerX: number, playerY: number) {
    this.isMoving = false;
    this.isActing = true;
    this.attackCooldown = this.attackCooldownDuration;

    // Randomly pick one of their action animations
    const action = Phaser.Utils.Array.GetRandom(this.config.actionAnims);
    this.currentAnimKey = action;

    // Face the player directly when executing the attack
    this.currentDir = this.computeDirection(playerX - this.x, playerY - this.y);
    this.playChampionAnim(action, this.currentDir);

    // Attack execution timeout matching 1s attack time for Zed
    this.scene.time.delayedCall(this.championType === 'Zed' ? 1050 : 850, () => {
      if (this.isActing && !this.isStumbling && !this.isDead) {
        this.isActing = false;
        this.startChasing();
      }
    });
  }

  public resetAttackCooldown() {
    this.attackCooldown = this.attackCooldownDuration;
  }

  public takeDamage(fromX: number, fromY: number, area?: WalkableArea, damage = 1): boolean {
    if (this.isDead) return false;

    this.currentHp -= damage;

    if (this.currentHp <= 0) {
      this.die(fromX, fromY);
      return true; // Monster killed
    }

    this.stumble(fromX, fromY, area);
    return false; // Monster survived and stumbled
  }

  private stumble(fromX: number, fromY: number, area?: WalkableArea) {
    this.isMoving = false;
    // Zed stumble duration reset to 0.5s, Yi stumble duration is 0.75s
    this.stumbleTimer = this.championType === 'Zed' ? 0.5 : 0.75;
    this.attackCooldown = this.attackCooldownDuration;

    // Face the attacker
    this.currentDir = this.computeDirection(fromX - this.x, fromY - this.y);
    this.currentAnimKey = 'get_hit';
    this.playChampionAnim('get_hit', this.currentDir);

    // Knockback recoil away from player
    const rad = Math.atan2(this.y - fromY, this.x - fromX);
    const knockbackDist = 26;
    const kx = Math.cos(rad) * knockbackDist;
    const ky = Math.sin(rad) * knockbackDist * 0.85;
    const rx = this.championType === 'Zed' ? 16 : 10;
    const ry = this.championType === 'Zed' ? 8 : 5;

    if (area && this.hasEnteredArena) {
      const p = area.move(this.x, this.y, kx, ky, rx, ry);
      this.x = p.x;
      this.y = p.y;
    } else {
      this.x += kx;
      this.y += ky;
    }

    // White hit flash
    this.setTintFill(0xffffff);
    this.scene.time.delayedCall(90, () => {
      if (!this.isDead) this.clearTint();
    });
  }

  public die(fromX: number, fromY: number) {
    this.isDead = true;
    this.isDying = true;
    this.isMoving = false;
    this.isActing = false;
    this.isStumbling = false;

    // Face the attacker on final blow
    this.currentDir = this.computeDirection(fromX - this.x, fromY - this.y);
    this.currentAnimKey = this.config.deathAnim;
    this.playChampionAnim(this.config.deathAnim, this.currentDir);

    // Subtle final knockback
    const rad = Math.atan2(this.y - fromY, this.x - fromX);
    this.x += Math.cos(rad) * 14;
    this.y += Math.sin(rad) * 14 * 0.85;

    // White death flash
    this.setTintFill(0xffffff);
    this.scene.time.delayedCall(120, () => {
      this.clearTint();
    });

    // When dying, play death animation, then slowly fade them out after 2 seconds
    this.scene.time.delayedCall(2000, () => {
      this.scene.tweens.add({
        targets: this,
        alpha: 0,
        duration: 1500,
        ease: 'Quad.easeOut',
        onComplete: () => {
          this.destroy();
        },
      });
    });
  }

  public isPerformingAttack(): boolean {
    return (
      !this.isDead &&
      !this.isStumbling &&
      this.isActing &&
      (this.currentAnimKey === 'attack' || this.currentAnimKey === 'attack_1')
    );
  }

  private playChampionAnim(baseKey: string, dir: number) {
    const key = `${this.championType}_${baseKey}_${dir}`;
    if (!this.scene.anims.exists(key)) return;

    const isSameBase = this.currentAnimKey === baseKey;
    const progress = isSameBase && this.anims.isPlaying ? this.anims.getProgress() : 0;

    this.play(key, true);

    if (isSameBase && progress > 0) {
      this.anims.setProgress(progress);
    }
  }

  // -------------------------------------------------------------
  // 8-DIRECTION MAPPING FOR YI & ZED
  // Rows: 0=North, 1=NE, 2=East, 3=SE, 4=South, 5=SW, 6=West, 7=NW
  // -------------------------------------------------------------
  public computeDirection(dx: number, dy: number): number {
    const rad = Math.atan2(dy, dx);
    let deg = Phaser.Math.RadToDeg(rad);
    if (deg < 0) deg += 360;

    // Standard Math.atan2 sector: 0=East, 1=SE, 2=South, 3=SW, 4=West, 5=NW, 6=North, 7=NE
    const stdDir = Math.floor(((deg + 22.5) % 360) / 45);

    // Map: East(0)->2, SE(1)->3, South(2)->4, SW(3)->5, West(4)->6, NW(5)->7, North(6)->0, NE(7)->1
    return (stdDir + 2) % 8;
  }
}
