import Phaser from 'phaser';
import {
  ChampionConfig,
  ChampionType,
  YI_CONFIG,
  ZED_CONFIG,
  ENEMY3_CONFIG,
} from '../config/championAnimations';
import { LEVEL1 } from '../environment/level1Data';
import type { WalkableArea } from '../environment/Collision';
import { DEPTH } from '../environment/Level1Environment';

function ensureShadowTexture(scene: Phaser.Scene) {
  if (scene.textures.exists('character_shadow')) return;
  const canvas = scene.textures.createCanvas('character_shadow', 64, 32);
  if (canvas) {
    const ctx = canvas.context;
    ctx.save();
    ctx.translate(32, 16);
    ctx.scale(1, 0.55);
    const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, 28);
    grad.addColorStop(0, 'rgba(0, 0, 0, 0.72)');
    grad.addColorStop(0.3, 'rgba(0, 0, 0, 0.55)');
    grad.addColorStop(0.65, 'rgba(0, 0, 0, 0.22)');
    grad.addColorStop(0.88, 'rgba(0, 0, 0, 0.06)');
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(0, 0, 28, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    canvas.refresh();
  }
}

export class Enemy extends Phaser.GameObjects.Sprite {
  // Global lock ensuring only one Enemy3 teleports at a time
  public static currentTeleporter: Enemy | null = null;

  public championType: ChampionType;
  private config: ChampionConfig;

  // Health and combat state
  public maxHp: number;
  public currentHp: number;
  public isDead = false;
  public isDying = false;
  public isStumbling = false;
  private stumbleTimer = 0;

  // Enemy3 specific state machine
  public enemy3State: 'spawning' | 'disappearing' | 'hidden' | 'appearing' | 'attacking' | 'idle_pause' = 'spawning';
  private enemy3Timer = 0;
  private enemy3DriftVx = 0;
  private enemy3DriftVy = 0;
  private shadow?: Phaser.GameObjects.Image;
  private hoverTime = Math.random() * Math.PI * 2;

  // AI & Movement State
  private isMoving = true;
  private isActing = false;

  // Clockwise 8 directions: 0=N, 1=NE, 2=E, 3=SE, 4=S, 5=SW, 6=W, 7=NW (for Yi/Zed), or stdDir 0..7 (for Enemy3)
  private currentDir = 4; // Starts facing South
  private currentAnimKey = '';

  // Attack stats per champion type
  public attackDamage = 1;
  public attackCooldownDuration = 1.0;
  public attackCooldown = 0;
  private walkSpeed = 80;
  private hasEnteredArena = false;
  private navRingDir = 0;
  private navWptIdx = -1;
  private floorCenter: { x: number; y: number };

  // Crowd separation
  private separationX = 0;
  private separationY = 0;

  // Attack engagement distance (scaled with champion size)
  private attackRange = 50;
  public readonly stopDistance: number;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    type: ChampionType = 'Yi',
    floorCenter: { x: number; y: number } = LEVEL1.floorCenter,
  ) {
    const config = type === 'Enemy3' ? ENEMY3_CONFIG : type === 'Zed' ? ZED_CONFIG : YI_CONFIG;
    super(scene, x, y, `${type}_${config.locomotionAnim}`, 0);

    this.championType = type;
    this.config = config;
    this.maxHp = config.maxHp;
    this.currentHp = this.maxHp;
    this.attackRange = type === 'Enemy3' ? 44 : type === 'Zed' ? 68 : 50;
    this.stopDistance = type === 'Enemy3' ? 28 : type === 'Zed' ? 52 : 36;
    this.attackDamage = type === 'Enemy3' ? 5 : type === 'Zed' ? 5 : 1;
    this.attackCooldownDuration = type === 'Enemy3' ? 0.5 : type === 'Zed' ? 0.75 : 1.0;
    this.attackCooldown = this.attackCooldownDuration;

    this.walkSpeed = Phaser.Math.FloatBetween(
      config.walkSpeed - 5,
      config.walkSpeed + 5,
    );
    this.setScale(config.visualScale);
    this.setOrigin(config.originX, config.originY);

    scene.add.existing(this);
    this.setDepth(this.getFootY());

    this.floorCenter = floorCenter;

    // Initial direction facing towards arena floor center
    const dx = floorCenter.x - x;
    const dy = floorCenter.y - y;
    this.currentDir = this.computeDirection(dx, dy);

    if (type === 'Enemy3') {
      // Enemy3 initially spawns at edge of map, then staggers slightly before disappearing
      this.enemy3State = 'spawning';
      this.currentAnimKey = 'idle';
      this.enemy3Timer = Phaser.Math.FloatBetween(0.05, 0.45);
      this.playChampionAnim('idle', this.currentDir);
      this.anims.setProgress(Math.random());

      // Detached soft feathered ground shadow matching player/character style
      ensureShadowTexture(scene);
      this.shadow = scene.add.image(x, y + 24, 'character_shadow');
      this.shadow.setOrigin(0.5, 0.5);
      this.shadow.setScale(0.75, 0.65);
      this.shadow.setDepth(DEPTH.groundDecal + 15);
    } else {
      // Start locomotion animation with desynchronized cycle
      this.currentAnimKey = config.locomotionAnim;
      this.playChampionAnim(config.locomotionAnim, this.currentDir);
      this.anims.setProgress(Math.random());
    }

    this.attackCooldown = Phaser.Math.FloatBetween(0.5, 2.0);

    // If spawned on valid land, immediately mark as inside arena
    const area = (scene as any).env?.area;
    const rx = type === 'Zed' ? 16 : 10;
    const ry = type === 'Zed' ? 8 : 5;
    if (area && area.canStand(x, y, rx, ry)) {
      this.hasEnteredArena = true;
    }

    // Animation completion handling
    this.on(Phaser.Animations.Events.ANIMATION_COMPLETE, (anim: Phaser.Animations.Animation) => {
      if (this.isDead) return;
      if (this.championType === 'Enemy3') {
        if (anim.key.includes('_disappear_')) {
          this.setVisible(false);
          this.enemy3State = 'hidden';
          this.enemy3Timer = Phaser.Math.FloatBetween(0.25, 0.65); // Randomized teleport delay
        } else if (anim.key.includes('_appear_')) {
          this.enemy3State = 'attacking';
          this.isActing = true;
          this.playChampionAnim('attack', this.currentDir);
        } else if (anim.key.includes('_attack_')) {
          this.isActing = false;
          this.setFlipX(false);
          if (Enemy.currentTeleporter === this) {
            Enemy.currentTeleporter = null;
          }
          this.enemy3State = 'idle_pause';
          this.enemy3Timer = Phaser.Math.FloatBetween(0.4, 0.7); // Randomized ~0.5s idle
          // Pick individual random drift velocity during idle pause so they float around smoothly
          const driftAngle = Math.random() * Math.PI * 2;
          const driftSpeed = Phaser.Math.FloatBetween(25, 45);
          this.enemy3DriftVx = Math.cos(driftAngle) * driftSpeed;
          this.enemy3DriftVy = Math.sin(driftAngle) * driftSpeed * 0.85;
          this.playChampionAnim('idle', this.currentDir);
        }
        return;
      }
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
    if (this.championType === 'Enemy3' && (this.enemy3State === 'hidden' || !this.visible)) return;

    this.separationX = 0;
    this.separationY = 0;
    const minDist = this.championType === 'Zed' ? 52 : this.championType === 'Enemy3' ? 28 : 36;

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

  public getFootY(): number {
    if (this.championType === 'Enemy3') {
      return this.y + 27;
    }
    return this.y + (this.championType === 'Zed' ? -7 : -8);
  }

  public update(dt: number, playerX?: number, playerY?: number, area?: WalkableArea, playerAimDir?: number, otherEnemies?: Enemy[]) {
    if (this.isDead) return;

    // Safety: clear dead/inactive teleporter reference
    if (Enemy.currentTeleporter && (Enemy.currentTeleporter.isDead || !Enemy.currentTeleporter.active || !Enemy.currentTeleporter.scene)) {
      Enemy.currentTeleporter = null;
    }

    // Enemy3 unique state machine
    if (this.championType === 'Enemy3') {
      if (this.isStumbling) {
        this.stumbleTimer -= dt;
        this.setDepth(this.getFootY());
        if (this.stumbleTimer <= 0) {
          this.isStumbling = false;
          this.isActing = false;
          if (Enemy.currentTeleporter === null || Enemy.currentTeleporter === this || Enemy.currentTeleporter.isDead) {
            Enemy.currentTeleporter = this;
            this.enemy3State = 'disappearing';
            this.playChampionAnim('disappear', this.currentDir);
          } else {
            this.enemy3State = 'idle_pause';
            this.enemy3Timer = Phaser.Math.FloatBetween(0.2, 0.5);
            const driftAngle = Math.random() * Math.PI * 2;
            const driftSpeed = Phaser.Math.FloatBetween(30, 60);
            this.enemy3DriftVx = Math.cos(driftAngle) * driftSpeed;
            this.enemy3DriftVy = Math.sin(driftAngle) * driftSpeed * 0.85;
            this.playChampionAnim('idle', this.currentDir);
          }
        }
        return;
      }

      if (playerX === undefined || playerY === undefined) return;

      // Staggered initial spawn before disappearing
      if (this.enemy3State === 'spawning') {
        this.enemy3Timer -= dt;
        if (this.enemy3Timer <= 0) {
          if (Enemy.currentTeleporter === null || Enemy.currentTeleporter === this || Enemy.currentTeleporter.isDead) {
            Enemy.currentTeleporter = this;
            this.enemy3State = 'disappearing';
            this.playChampionAnim('disappear', this.currentDir);
          } else {
            // Another Enemy3 is currently teleporting; wait a short while
            this.enemy3Timer = 0.2;
          }
        }
        this.setDepth(this.getFootY());
        return;
      }

      if (this.enemy3State === 'hidden') {
        this.enemy3Timer -= dt;
        if (this.enemy3Timer <= 0) {
          // Teleport behind or to the sides (flanks) of player with individual random placement
          const aimDir = playerAimDir !== undefined ? playerAimDir : 2;
          const faceRad = Phaser.Math.DegToRad(aimDir * 45);
          const behindRad = faceRad + Math.PI;

          let chosenX = playerX;
          let chosenY = playerY;
          let foundSafe = false;

          // Find other active Enemy3 units to avoid overlapping
          const otherActiveEnemy3 = otherEnemies
            ? otherEnemies.filter(
                (e) => e !== this && !e.isDead && e.championType === 'Enemy3' && e.enemy3State !== 'hidden' && e.visible,
              )
            : [];

          // Try up to 18 randomized angle and distance candidates spanning both sides (flanks) and behind
          for (let attempt = 0; attempt < 18; attempt++) {
            // Uniformly sample between left flank (-90 deg), right flank (+90 deg), and behind (180 deg)
            const zone = Phaser.Utils.Array.GetRandom(['left', 'right', 'behind']);
            let ang = behindRad;
            if (zone === 'left') {
              ang = faceRad - Math.PI / 2 + Phaser.Math.FloatBetween(-0.4, 0.4);
            } else if (zone === 'right') {
              ang = faceRad + Math.PI / 2 + Phaser.Math.FloatBetween(-0.4, 0.4);
            } else {
              ang = behindRad + Phaser.Math.FloatBetween(-0.6, 0.6);
            }

            const randDist = Phaser.Math.FloatBetween(32, 52);
            const tx = playerX + Math.cos(ang) * randDist;
            const ty = playerY + Math.sin(ang) * randDist * 0.85;

            // Ensure not too close to other Enemy3 units (minimum 24px distance)
            const tooCloseToOther = otherActiveEnemy3.some(
              (o) => Math.hypot(o.x - tx, (o.y - ty) / 0.85) < 24,
            );
            if (tooCloseToOther) continue;

            if (!area || area.canStand(tx, ty, 8, 4)) {
              chosenX = tx;
              chosenY = ty;
              foundSafe = true;
              break;
            }
          }

          if (!foundSafe) {
            const zoneOffset = Phaser.Utils.Array.GetRandom([-Math.PI / 2, Math.PI / 2, Math.PI]);
            const randAngle = faceRad + zoneOffset + Phaser.Math.FloatBetween(-0.3, 0.3);
            const randDist = Phaser.Math.FloatBetween(28, 44);
            if (area) {
              const p = area.move(playerX, playerY, Math.cos(randAngle) * randDist, Math.sin(randAngle) * randDist * 0.85, 8, 4);
              chosenX = p.x;
              chosenY = p.y;
            } else {
              chosenX = playerX + Math.cos(randAngle) * randDist;
              chosenY = playerY + Math.sin(randAngle) * randDist * 0.85;
            }
          }

          this.x = chosenX;
          this.y = chosenY;
          this.setVisible(true);
          this.clearTint();
          this.setDepth(this.getFootY());

          // Face player directly upon appearing
          this.currentDir = this.computeDirection(playerX - this.x, playerY - this.y);
          this.enemy3State = 'appearing';
          this.playChampionAnim('appear', this.currentDir);
        }
      } else if (this.enemy3State === 'idle_pause') {
        this.enemy3Timer -= dt;

        // Individual random drift movement during idle pause
        let vx = this.enemy3DriftVx * dt;
        let vy = this.enemy3DriftVy * dt;

        // Apply separation force from other enemies so they never stick together
        if (this.separationX !== 0 || this.separationY !== 0) {
          vx += this.separationX * 50 * dt;
          vy += this.separationY * 50 * dt * 0.85;
        }

        if (area) {
          const p = area.move(this.x, this.y, vx, vy, 8, 4);
          this.x = p.x;
          this.y = p.y;
        } else {
          this.x += vx;
          this.y += vy;
        }

        const fDir = this.computeDirection(playerX - this.x, playerY - this.y);
        if (fDir !== this.currentDir) {
          this.currentDir = fDir;
          this.playChampionAnim('idle', this.currentDir);
        }

        if (this.enemy3Timer <= 0) {
          // Half a second passed -> disappear if teleporter lock is available!
          if (Enemy.currentTeleporter === null || Enemy.currentTeleporter === this || Enemy.currentTeleporter.isDead) {
            Enemy.currentTeleporter = this;
            this.enemy3State = 'disappearing';
            this.playChampionAnim('disappear', this.currentDir);
          } else {
            // Another Enemy3 is currently teleporting; wait a short while while continuing drift
            this.enemy3Timer = 0.2;
          }
        }
      }

      this.setDepth(this.getFootY());
      return;
    }

    // Handle stumble timer after being hit
    if (this.isStumbling) {
      this.stumbleTimer -= dt;
      this.setDepth(this.getFootY());
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

    const rx = this.championType === 'Zed' ? 16 : 10;
    const ry = this.championType === 'Zed' ? 8 : 5;

    if (!this.hasEnteredArena) {
      // -------------------------------------------------------------
      // APPROACHING ARENA DOWN STAIRS / ENTRYWAY
      // March down the solid staircase towards the arena floor center
      // -------------------------------------------------------------
      if (area && area.canStand(this.x, this.y, rx, ry)) {
        this.hasEnteredArena = true;
      } else {
        this.isMoving = true;
        this.currentAnimKey = this.config.locomotionAnim;

        // Head directly down the staircase towards arena floor center
        const tdx = this.floorCenter.x - this.x;
        const tdy = this.floorCenter.y - this.y;
        const dist = Math.hypot(tdx, tdy);

        let vx = tdx / (dist || 1);
        let vy = tdy / (dist || 1);

        // Light lateral separation so stacked enemies stay on stone steps without overlapping
        if (this.separationX !== 0 || this.separationY !== 0) {
          const sepWeight = 0.35;
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

        this.x += stepX;
        this.y += stepY;

        // Check if this step brought the enemy inside the walkable arena
        if (area && area.canStand(this.x, this.y, rx, ry)) {
          this.hasEnteredArena = true;
        }

        const moveDir = this.computeDirection(vx, vy);
        const animKey = `${this.championType}_${this.config.locomotionAnim}_${moveDir}`;
        if (moveDir !== this.currentDir || this.anims.currentAnim?.key !== animKey) {
          this.currentDir = moveDir;
          this.playChampionAnim(this.config.locomotionAnim, this.currentDir);
        }

        this.setDepth(this.getFootY());
        return;
      }
    }

    if (playerX !== undefined && playerY !== undefined) {
      const dx = playerX - this.x;
      const dy = playerY - this.y;
      const distToPlayer = Math.hypot(dx, dy);

      if (this.isActing) {
        // Stationary while executing an attack
        this.isMoving = false;
      } else if (
        distToPlayer <= this.attackRange &&
        this.attackCooldown <= 0 &&
        (!area || area.hasLineOfSight(this.x, this.y, playerX, playerY, 8))
      ) {
        // Close enough and clear line of sight: stop and execute an attack
        this.triggerAttack(playerX, playerY);
      } else if (
        distToPlayer <= this.stopDistance &&
        (!area || area.hasLineOfSight(this.x, this.y, playerX, playerY, 8))
      ) {
        // In striking range! Hold ground, face the player, wait for attack cooldown
        this.isMoving = false;
        const faceDir = this.computeDirection(dx, dy);
        if (faceDir !== this.currentDir || this.currentAnimKey !== 'idle') {
          this.currentDir = faceDir;
          this.currentAnimKey = 'idle';
          this.playChampionAnim('idle', this.currentDir);
        }
      } else {
        // Move towards player using locomotion animation
        this.isMoving = true;
        this.currentAnimKey = this.config.locomotionAnim;

        // Steer towards player: direct pursuit if line of sight is clear, or navigate around obstacles
        let targetX = playerX;
        let targetY = playerY;
        if (area) {
          const steer = area.getSteeringTarget(
            this.x,
            this.y,
            playerX,
            playerY,
            10,
            this.navRingDir,
            this.navWptIdx,
          );
          targetX = steer.x;
          targetY = steer.y;
          this.navRingDir = steer.dir;
          this.navWptIdx = steer.wptIdx;
        } else {
          this.navRingDir = 0;
          this.navWptIdx = -1;
        }

        const tdx = targetX - this.x;
        const tdy = targetY - this.y;
        const distToTarget = Math.hypot(tdx, tdy);

        // Blend target pursuit with crowd separation force
        let vx = tdx / (distToTarget || 1);
        let vy = tdy / (distToTarget || 1);

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

        if (area) {
          const p = area.move(this.x, this.y, stepX, stepY, rx, ry);
          this.x = p.x;
          this.y = p.y;
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
    this.setDepth(this.getFootY());
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

  public takeDamage(
    fromX: number,
    fromY: number,
    area?: WalkableArea,
    damage = 1,
    knockbackDist = 26,
    stunDuration?: number,
  ): boolean {
    if (this.isDead) return false;
    if (this.championType === 'Enemy3' && (this.enemy3State === 'hidden' || !this.visible)) {
      return false; // Cannot hit while hidden/teleporting
    }

    this.currentHp -= damage;

    if (this.currentHp <= 0) {
      this.die(fromX, fromY, knockbackDist);
      return true; // Monster killed
    }

    this.stumble(fromX, fromY, area, knockbackDist, stunDuration);
    return false; // Monster survived and stumbled
  }

  private stumble(
    fromX: number,
    fromY: number,
    area?: WalkableArea,
    knockbackDist = 26,
    stunDuration?: number,
  ) {
    if (this.championType === 'Enemy3' && Enemy.currentTeleporter === this) {
      Enemy.currentTeleporter = null;
    }
    this.isMoving = false;
    this.isActing = false;
    this.isStumbling = true;
    this.stumbleTimer = stunDuration !== undefined
      ? stunDuration
      : (this.championType === 'Enemy3' ? 0.35 : this.championType === 'Zed' ? 0.5 : 0.75);
    this.attackCooldown = Math.max(this.attackCooldownDuration, this.stumbleTimer + 0.2);

    // Face the attacker
    this.currentDir = this.computeDirection(fromX - this.x, fromY - this.y);
    if (this.championType === 'Enemy3') {
      this.currentAnimKey = 'idle';
      this.playChampionAnim('idle', this.currentDir);
    } else {
      this.currentAnimKey = 'get_hit';
      this.playChampionAnim('get_hit', this.currentDir);
    }

    // Knockback recoil away from player
    const rad = Math.atan2(this.y - fromY, this.x - fromX);
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

  public override preUpdate(time: number, delta: number) {
    super.preUpdate(time, delta);
    if (this.championType === 'Enemy3' && !this.isDead) {
      this.hoverTime += (delta / 1000) * 3.5;
      const bob = Math.sin(this.hoverTime) * 7;
      this.displayOriginY = this.height * this.config.originY + 20 + bob;
      this.updateShadow(bob);
    }
  }

  private updateShadow(bob = 0) {
    if (!this.shadow) return;
    this.shadow.setPosition(this.x, this.y + 24);
    const isVisible = this.visible && this.enemy3State !== 'hidden' && !this.isDead;
    this.shadow.setVisible(isVisible);
    if (isVisible) {
      const shadowPulse = 1 - (bob / 28);
      this.shadow.setScale(0.75 * shadowPulse, 0.65 * shadowPulse);
      this.shadow.setAlpha(this.alpha * 0.75 * shadowPulse);
    }
  }

  public override setVisible(value: boolean): this {
    super.setVisible(value);
    if (this.shadow) {
      this.shadow.setVisible(value && !this.isDead && this.enemy3State !== 'hidden');
    }
    return this;
  }

  public override setAlpha(alpha?: number): this {
    super.setAlpha(alpha);
    if (this.shadow && alpha !== undefined) {
      this.shadow.setAlpha(alpha * 0.75);
    }
    return this;
  }

  public override destroy(fromScene?: boolean) {
    if (this.shadow) {
      this.shadow.destroy();
      this.shadow = undefined;
    }
    if (Enemy.currentTeleporter === this) {
      Enemy.currentTeleporter = null;
    }
    super.destroy(fromScene);
  }

  public die(fromX: number, fromY: number, knockbackDist = 26) {
    if (Enemy.currentTeleporter === this) {
      Enemy.currentTeleporter = null;
    }
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
    const finalDist = Math.max(14, knockbackDist * 0.45);
    this.x += Math.cos(rad) * finalDist;
    this.y += Math.sin(rad) * finalDist * 0.85;

    // Place corpse on floor layer so all standing entities (player, alive enemies) render on top
    this.setDepth(DEPTH.groundDecal + 100 + this.y * 0.001);

    // White death flash
    this.setTintFill(0xffffff);
    this.scene.time.delayedCall(120, () => {
      this.clearTint();
    });

    if (this.championType === 'Enemy3') {
      if (this.shadow) {
        this.scene.tweens.add({
          targets: this.shadow,
          alpha: 0,
          duration: 600,
          ease: 'Quad.easeOut',
        });
      }
      // Enemy3 fades out after disappear/death animation
      this.scene.time.delayedCall(800, () => {
        this.scene.tweens.add({
          targets: this,
          alpha: 0,
          duration: 600,
          ease: 'Quad.easeOut',
          onComplete: () => {
            this.destroy();
          },
        });
      });
    } else {
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
  }

  public isPerformingAttack(): boolean {
    if (this.isDead || this.isStumbling) return false;
    if (this.championType === 'Enemy3') {
      return this.enemy3State === 'attacking';
    }
    return (
      this.isActing &&
      (this.currentAnimKey === 'attack' || this.currentAnimKey === 'attack_1')
    );
  }

  private playChampionAnim(baseKey: string, dir: number) {
    const key = `${this.championType}_${baseKey}_${dir}`;
    if (!this.scene.anims.exists(key)) return;

    if (this.championType === 'Enemy3') {
      if (baseKey === 'attack' && dir === 3) {
        this.setFlipX(true);
      } else {
        this.setFlipX(false);
      }
    }

    const isSameBase = this.currentAnimKey === baseKey;
    const progress = isSameBase && this.anims.isPlaying ? this.anims.getProgress() : 0;

    this.play(key, true);

    if (isSameBase && progress > 0) {
      this.anims.setProgress(progress);
    }
  }

  public getCollisionRadius(): number {
    if (this.championType === 'Enemy3') return 10;
    return this.championType === 'Zed' ? 24 : 14;
  }

  public pushBody(pushX: number, pushY: number, area?: WalkableArea) {
    if (this.isDead) return;
    if (this.championType === 'Enemy3' && (this.enemy3State === 'hidden' || !this.visible)) return;
    const rx = this.championType === 'Zed' ? 16 : this.championType === 'Enemy3' ? 8 : 10;
    const ry = this.championType === 'Zed' ? 8 : this.championType === 'Enemy3' ? 4 : 5;
    if (area && this.hasEnteredArena) {
      const p = area.move(this.x, this.y, pushX, pushY, rx, ry);
      this.x = p.x;
      this.y = p.y;
    } else {
      this.x += pushX;
      this.y += pushY;
    }
    this.setDepth(this.getFootY());
  }

  // -------------------------------------------------------------
  // 8-DIRECTION MAPPING FOR YI & ZED
  // Rows: 0=North, 1=NE, 2=East, 3=SE, 4=South, 5=SW, 6=West, 7=NW
  // -------------------------------------------------------------
  public computeDirection(dx: number, dy: number): number {
    const distSq = dx * dx + dy * dy;
    if (distSq < 1.0) {
      // Guard against division by zero or jitter when distance is near 0
      return this.currentDir;
    }

    const rad = Math.atan2(dy, dx);
    let deg = Phaser.Math.RadToDeg(rad);
    if (deg < 0) deg += 360;

    // Standard Math.atan2 sector: 0=East, 1=SE, 2=South, 3=SW, 4=West, 5=NW, 6=North, 7=NE
    const stdDir = Math.floor(((deg + 22.5) % 360) / 45);

    if (this.championType === 'Enemy3') {
      return stdDir;
    }

    // Map: East(0)->2, SE(1)->3, South(2)->4, SW(3)->5, West(4)->6, NW(5)->7, North(6)->0, NE(7)->1
    return (stdDir + 2) % 8;
  }
}
