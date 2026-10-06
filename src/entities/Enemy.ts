import Phaser from 'phaser';
import {
  ChampionConfig,
  ChampionType,
  YI_CONFIG,
  ZED_CONFIG,
  ENEMY3_CONFIG,
  BOSS_CONFIG,
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

  // Boss specific state machine
  public bossIsEnraged = false;
  private bossState: 'chase' | 'sprint' | 'recovery' = 'chase';
  private bossSprintTimer = 0;
  private bossSprintCooldown = 3.0;
  private bossRecoveryTimer = 0;
  private bossTelegraphCircle?: Phaser.GameObjects.Arc;

  // AI & Movement State
  private isMoving = true;
  private isActing = false;
  public hasHitInCurrentAttack = false;
  public hasGroundStruck = false;

  // Clockwise 8 directions: 0=N, 1=NE, 2=E, 3=SE, 4=S, 5=SW, 6=W, 7=NW (for Yi/Zed), or stdDir 0..7 (for Enemy3)
  private currentDir = 4; // Starts facing South
  private currentAnimKey = '';
  private turnCooldown = 0;

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
    const config =
      type === 'Boss'
        ? BOSS_CONFIG
        : type === 'Enemy3'
          ? ENEMY3_CONFIG
          : type === 'Zed'
            ? ZED_CONFIG
            : YI_CONFIG;
    super(scene, x, y, type === 'Boss' ? 'Boss_walk_4' : `${type}_${config.locomotionAnim}`, 0);

    this.championType = type;
    this.config = config;
    this.maxHp = config.maxHp;
    this.currentHp = this.maxHp;
    this.attackRange =
      type === 'Boss' ? 85 : type === 'Enemy3' ? 44 : type === 'Zed' ? 68 : 50;
    this.stopDistance =
      type === 'Boss' ? 55 : type === 'Enemy3' ? 28 : type === 'Zed' ? 52 : 36;
    this.attackDamage =
      type === 'Boss' ? 18 : type === 'Enemy3' ? 5 : type === 'Zed' ? 5 : 1;
    this.attackCooldownDuration =
      type === 'Boss' ? 0.8 : type === 'Enemy3' ? 0.5 : type === 'Zed' ? 0.75 : 1.0;
    this.attackCooldown = type === 'Boss' ? 0.6 : this.attackCooldownDuration;

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

    if (type === 'Boss') {
      this.hasEnteredArena = true;
      ensureShadowTexture(scene);
      this.shadow = scene.add.image(x, y + 2, 'character_shadow');
      this.shadow.setOrigin(0.5, 0.5);
      this.shadow.setScale(1.6, 1.2);
      this.shadow.setDepth(DEPTH.groundDecal + 15);
      this.shadow.setAlpha(0.8);
    } else if (type === 'Enemy3') {
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

    this.attackCooldown =
      type === 'Boss' ? 0.6 : Phaser.Math.FloatBetween(0.5, 2.0);

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
      if (this.championType === 'Boss') {
        if (anim.key.startsWith('Boss_attack_')) {
          this.hasGroundStruck = false;
          if (this.bossTelegraphCircle) {
            this.bossTelegraphCircle.destroy();
            this.bossTelegraphCircle = undefined;
          }
          if (this.isActing && !this.isStumbling && !this.isDead) {
            this.isActing = false;
            this.bossState = 'recovery';
            this.bossRecoveryTimer = this.bossIsEnraged ? 0.45 : 0.75;
            this.attackCooldown = this.bossIsEnraged ? 0.5 : 0.8;
            this.turnCooldown = 0.1;
            this.currentAnimKey = 'idle';
            this.playChampionAnim('idle', this.currentDir);
          }
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
    if (this.championType === 'Boss') {
      this.separationX = 0;
      this.separationY = 0;
      return;
    }
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
    if (this.championType === 'Boss') {
      return this.y;
    }
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

    // Boss unique state machine
    if (this.championType === 'Boss') {
      this.updateBoss(dt, playerX, playerY, area);
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
      } else {
        const isHolding = this.currentAnimKey === 'idle';
        const resumeWalkThreshold = this.stopDistance + 15;
        const inHoldRange = isHolding ? distToPlayer <= resumeWalkThreshold : distToPlayer <= this.stopDistance;

        const targetFaceDir = this.computeDirection(dx, dy);
        const angleDiff = (targetFaceDir - this.currentDir + 8) % 8;
        const isFacingPlayer = angleDiff === 0 || angleDiff === 1 || angleDiff === 7;

        if (
          distToPlayer <= this.attackRange &&
          this.attackCooldown <= 0 &&
          isFacingPlayer &&
          (!area || area.hasLineOfSight(this.x, this.y, playerX, playerY, 8))
        ) {
          // Close enough, FACING the player, and clear line of sight: stop and execute an attack
          this.triggerAttack(playerX, playerY);
        } else if (
          inHoldRange &&
          (!area || area.hasLineOfSight(this.x, this.y, playerX, playerY, 8))
        ) {
          // In striking range! Hold ground, smoothly rotate to face the player
          this.isMoving = false;
          this.stepDirectionTowards(targetFaceDir, dt);
          if (this.currentAnimKey !== 'idle') {
            this.currentAnimKey = 'idle';
          }
          this.playChampionAnim('idle', this.currentDir);
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

        // Slow down forward movement during sharp turns so the enemy pivots naturally on their feet
        const turnSpeedFactor = angleDiff === 0 ? 1.0 : (angleDiff === 1 || angleDiff === 7 ? 0.85 : 0.4);
        const stepX = vx * this.walkSpeed * turnSpeedFactor * dt;
        const stepY = vy * this.walkSpeed * turnSpeedFactor * dt * 0.85;

        if (area) {
          const p = area.move(this.x, this.y, stepX, stepY, rx, ry);
          this.x = p.x;
          this.y = p.y;
        } else {
          this.x += stepX;
          this.y += stepY;
        }

        // Keep facing direction smoothly turning towards target
        const targetMoveDir = this.computeDirection(vx, vy);
        this.stepDirectionTowards(targetMoveDir, dt);
        const animKey = `${this.championType}_${this.config.locomotionAnim}_${this.currentDir}`;
        if (this.anims.currentAnim?.key !== animKey) {
          this.playChampionAnim(this.config.locomotionAnim, this.currentDir);
        }
      }
    }
  }

    // Depth sorting based on ground feet position
    this.setDepth(this.getFootY());
  }

  private updateBoss(dt: number, playerX?: number, playerY?: number, area?: WalkableArea) {
    if (this.isDead) return;

    // Check enrage threshold (<= 50% HP = 30 HP)
    if (!this.bossIsEnraged && this.currentHp <= this.maxHp * 0.5) {
      this.bossIsEnraged = true;
      this.scene.events.emit('boss-enrage', this.x, this.y);
      this.setTintFill(0xff3333);
      this.scene.time.delayedCall(220, () => {
        if (!this.isDead) this.clearTint();
      });
    }

    if (this.attackCooldown > 0) {
      this.attackCooldown -= dt;
    }
    if (this.bossSprintCooldown > 0) {
      this.bossSprintCooldown -= dt;
    }

    const rx = 24;
    const ry = 14;

    if (playerX === undefined || playerY === undefined) {
      this.setDepth(this.getFootY());
      this.updateShadow();
      return;
    }

    const dx = playerX - this.x;
    const dy = playerY - this.y;
    const distToPlayer = Math.hypot(dx, dy);
    const targetFaceDir = this.computeDirection(dx, dy);

    // If currently performing attack:
    if (this.isActing) {
      this.isMoving = false;
      if (this.anims.isPlaying) {
        const prog = this.anims.getProgress();
        if (prog < 0.50 && this.bossTelegraphCircle) {
          const alpha = 0.2 + (prog / 0.50) * 0.5;
          this.bossTelegraphCircle.setAlpha(alpha);
        } else if (prog >= 0.50 && this.bossTelegraphCircle) {
          this.bossTelegraphCircle.destroy();
          this.bossTelegraphCircle = undefined;
        }

        // Trigger ground strike impact at frame 13 / 50% progress
        if (!this.hasGroundStruck && prog >= 0.50) {
          this.hasGroundStruck = true;
          const rad = Phaser.Math.DegToRad(this.getFacingAngleDeg());
          const slamDist = 70;
          const slamX = this.x + Math.cos(rad) * slamDist;
          const slamY = this.y + Math.sin(rad) * slamDist * 0.85;
          this.scene.events.emit('boss-ground-slam', slamX, slamY, this.x, this.y, this.bossIsEnraged);
        }
      }
      this.setDepth(this.getFootY());
      this.updateShadow();
      return;
    }

    // State 1: Recovery after attack
    if (this.bossState === 'recovery') {
      this.bossRecoveryTimer -= dt;
      this.isMoving = false;
      this.stepDirectionTowards(targetFaceDir, dt);
      if (this.currentAnimKey !== 'idle') {
        this.currentAnimKey = 'idle';
      }
      this.playChampionAnim('idle', this.currentDir);

      if (this.bossRecoveryTimer <= 0) {
        this.bossState = 'chase';
      }
      this.setDepth(this.getFootY());
      this.updateShadow();
      return;
    }

    // State 2: Check if in striking range and ready to attack
    const angleDiff = (targetFaceDir - this.currentDir + 8) % 8;
    const isFacingPlayer = angleDiff === 0 || angleDiff === 1 || angleDiff === 7;

    if (
      distToPlayer <= this.attackRange &&
      this.attackCooldown <= 0 &&
      isFacingPlayer &&
      (!area || area.hasLineOfSight(this.x, this.y, playerX, playerY, 10))
    ) {
      this.triggerAttack(playerX, playerY);
      this.setDepth(this.getFootY());
      this.updateShadow();
      return;
    }

    // If close enough to strike but need to pivot to face player
    if (distToPlayer <= this.attackRange && this.attackCooldown <= 0) {
      this.isMoving = false;
      this.stepDirectionTowards(targetFaceDir, dt);
      this.playChampionAnim('walk', this.currentDir);
      this.setDepth(this.getFootY());
      this.updateShadow();
      return;
    }

    // State 3: Gap closer (Sprint) when player is keeping distance
    if (
      this.bossState === 'chase' &&
      distToPlayer > 175 &&
      this.bossSprintCooldown <= 0 &&
      (!area || area.hasLineOfSight(this.x, this.y, playerX, playerY, 12))
    ) {
      this.bossState = 'sprint';
      this.bossSprintTimer = this.bossIsEnraged ? 2.0 : 1.6;
      this.bossSprintCooldown = this.bossIsEnraged ? 2.2 : 3.5;
    }

    if (this.bossState === 'sprint') {
      this.bossSprintTimer -= dt;
      if (this.bossSprintTimer <= 0 || distToPlayer <= this.attackRange + 15) {
        this.bossState = 'chase';
      }
    }

    // State 4: Movement towards target
    this.isMoving = true;
    this.currentAnimKey = 'walk';

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
    }

    const tdx = targetX - this.x;
    const tdy = targetY - this.y;
    const distToTarget = Math.hypot(tdx, tdy);

    const vx = tdx / (distToTarget || 1);
    const vy = tdy / (distToTarget || 1);

    const baseSpeed = this.bossIsEnraged ? 105 : 85;
    const sprintSpeed = this.bossIsEnraged ? 185 : 155;
    const currentSpeed = this.bossState === 'sprint' ? sprintSpeed : baseSpeed;

    const stepX = vx * currentSpeed * dt;
    const stepY = vy * currentSpeed * dt * 0.85;

    if (area) {
      const p = area.move(this.x, this.y, stepX, stepY, rx, ry);
      this.x = p.x;
      this.y = p.y;
    } else {
      this.x += stepX;
      this.y += stepY;
    }

    // Facing direction:
    // Face player when close (<= 110px), otherwise face movement direction so walk anim matches motion!
    const desiredDir = distToPlayer <= 110 ? targetFaceDir : this.computeDirection(vx, vy);
    this.stepDirectionTowards(desiredDir, dt);

    const animKey = `Boss_walk_${this.currentDir}`;
    if (this.anims.currentAnim?.key !== animKey || !this.anims.isPlaying) {
      this.playChampionAnim('walk', this.currentDir);
    }

    if (this.bossState === 'sprint') {
      this.anims.timeScale = 1.35;
      if (Math.random() < 0.25) {
        this.spawnSprintDust();
      }
    } else {
      this.anims.timeScale = 1.0;
    }

    this.setDepth(this.getFootY());
    this.updateShadow();
  }

  private spawnSprintDust() {
    if (!this.scene) return;
    const dust = this.scene.add.circle(
      this.x + Phaser.Math.Between(-10, 10),
      this.y + Phaser.Math.Between(-4, 4),
      Phaser.Math.Between(4, 7),
      this.bossIsEnraged ? 0x882222 : 0xcccccc,
      0.4,
    );
    dust.setDepth(DEPTH.groundDecal + 20);
    this.scene.tweens.add({
      targets: dust,
      alpha: 0,
      scale: 1.8,
      duration: 350,
      ease: 'Quad.easeOut',
      onComplete: () => dust.destroy(),
    });
  }

  private startChasing() {
    this.isMoving = true;
    this.isActing = false;
    this.isStumbling = false;
    this.hasHitInCurrentAttack = false;
    this.hasGroundStruck = false;
    this.currentAnimKey = this.config.locomotionAnim;
    this.playChampionAnim(this.config.locomotionAnim, this.currentDir);
  }

  private triggerAttack(playerX: number, playerY: number) {
    this.isMoving = false;
    this.isActing = true;
    this.hasHitInCurrentAttack = false;
    this.hasGroundStruck = false;
    this.attackCooldown = this.attackCooldownDuration;

    // Direct line to player for final attack alignment (only called when already roughly facing target)
    const targetDir = this.computeDirection(playerX - this.x, playerY - this.y);
    const diff = (targetDir - this.currentDir + 8) % 8;
    if (diff === 1 || diff === 7) {
      this.currentDir = targetDir;
    }
    const action = Phaser.Utils.Array.GetRandom(this.config.actionAnims);
    this.currentAnimKey = action;

    const key = `${this.championType}_${action}_${this.currentDir}`;
    if (this.scene.anims.exists(key)) {
      this.play(key, false);
      this.anims.setProgress(0);
    }

    if (this.championType === 'Boss') {
      const rad = Phaser.Math.DegToRad(this.getFacingAngleDeg());
      const slamDist = 70;
      const slamX = this.x + Math.cos(rad) * slamDist;
      const slamY = this.y + Math.sin(rad) * slamDist * 0.85;
      if (this.bossTelegraphCircle) {
        this.bossTelegraphCircle.destroy();
      }
      this.bossTelegraphCircle = this.scene.add.circle(
        slamX,
        slamY,
        34,
        this.bossIsEnraged ? 0xff2222 : 0xffffff,
        0.25,
      );
      this.bossTelegraphCircle.setStrokeStyle(2, this.bossIsEnraged ? 0xff4444 : 0xffffff, 0.6);
      this.bossTelegraphCircle.setDepth(DEPTH.groundDecal + 40);
      try {
        this.scene.sound.play('triggerAttack', { volume: 0.6 });
      } catch {}
    }

    // Safety fallback timeout matching full animation lengths
    const attackDuration =
      this.championType === 'Boss'
        ? 1800
        : this.championType === 'Zed'
          ? 1050
          : 850;
    this.scene.time.delayedCall(attackDuration, () => {
      if (this.isActing && !this.isStumbling && !this.isDead) {
        if (this.bossTelegraphCircle) {
          this.bossTelegraphCircle.destroy();
          this.bossTelegraphCircle = undefined;
        }
        this.isActing = false;
        this.hasHitInCurrentAttack = false;
        this.hasGroundStruck = false;
        if (this.championType === 'Boss') {
          this.bossState = 'recovery';
          this.bossRecoveryTimer = this.bossIsEnraged ? 0.45 : 0.75;
          this.attackCooldown = this.bossIsEnraged ? 0.5 : 0.8;
          this.currentAnimKey = 'idle';
          this.playChampionAnim('idle', this.currentDir);
        } else {
          this.startChasing();
        }
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

    if (this.championType === 'Boss') {
      // Boss has relentless poise: taking damage does NOT stun, stagger, or interrupt him
      this.setTintFill(this.bossIsEnraged ? 0xff4444 : 0xffffff);
      this.scene.time.delayedCall(80, () => {
        if (!this.isDead) this.clearTint();
      });
      const rad = Math.atan2(this.y - fromY, this.x - fromX);
      const kx = Math.cos(rad) * (knockbackDist * 0.12);
      const ky = Math.sin(rad) * (knockbackDist * 0.12) * 0.85;
      if (area && this.hasEnteredArena) {
        const p = area.move(this.x, this.y, kx, ky, 24, 14);
        this.x = p.x;
        this.y = p.y;
      }
      return false;
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
    this.hasHitInCurrentAttack = false;
    this.hasGroundStruck = false;
    this.isStumbling = true;
    this.stumbleTimer = stunDuration !== undefined
      ? stunDuration
      : (this.championType === 'Boss' ? 0.2 : this.championType === 'Enemy3' ? 0.35 : this.championType === 'Zed' ? 0.5 : 0.75);
    this.attackCooldown = Math.max(this.attackCooldownDuration, this.stumbleTimer + 0.2);

    // Face the attacker (Boss does not snap 180 degrees instantly when struck from behind)
    if (this.championType !== 'Boss') {
      this.currentDir = this.computeDirection(fromX - this.x, fromY - this.y);
    }
    if (this.championType === 'Enemy3' || this.championType === 'Boss') {
      this.currentAnimKey = 'idle';
      this.playChampionAnim('idle', this.currentDir);
    } else {
      this.currentAnimKey = 'get_hit';
      this.playChampionAnim('get_hit', this.currentDir);
    }

    // Knockback recoil away from player (Boss has massive poise and resists heavy knockback)
    const effectiveKnockback = this.championType === 'Boss' ? knockbackDist * 0.25 : knockbackDist;
    const rad = Math.atan2(this.y - fromY, this.x - fromX);
    const kx = Math.cos(rad) * effectiveKnockback;
    const ky = Math.sin(rad) * effectiveKnockback * 0.85;
    const rx = this.championType === 'Boss' ? 24 : this.championType === 'Zed' ? 16 : 10;
    const ry = this.championType === 'Boss' ? 12 : this.championType === 'Zed' ? 8 : 5;

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
    if (this.championType === 'Boss' && !this.isDead) {
      if (this.isPerformingAttack() && !this.hasGroundStruck && this.anims.isPlaying) {
        if (this.anims.getProgress() >= 0.50) {
          this.hasGroundStruck = true;
          if (this.bossTelegraphCircle) {
            this.bossTelegraphCircle.destroy();
            this.bossTelegraphCircle = undefined;
          }
          const rad = Phaser.Math.DegToRad(this.getFacingAngleDeg());
          const slamDist = 70;
          const slamX = this.x + Math.cos(rad) * slamDist;
          const slamY = this.y + Math.sin(rad) * slamDist * 0.85;
          this.scene.events.emit('boss-ground-slam', slamX, slamY, this.x, this.y, this.bossIsEnraged);
        }
      }
    }
  }

  private updateShadow(bob = 0) {
    if (!this.shadow) return;
    if (this.championType === 'Boss') {
      this.shadow.setPosition(this.x, this.y + 2);
      const isVisible = this.visible && !this.isDead;
      this.shadow.setVisible(isVisible);
      if (isVisible) {
        const pulse = this.bossIsEnraged ? 1.05 + Math.sin(Date.now() * 0.006) * 0.08 : 1.0;
        this.shadow.setScale(1.6 * pulse, 1.2 * pulse);
        this.shadow.setAlpha(this.alpha * (this.bossIsEnraged ? 0.9 : 0.75));
      }
      return;
    }
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
    if (this.bossTelegraphCircle) {
      this.bossTelegraphCircle.destroy();
      this.bossTelegraphCircle = undefined;
    }
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
    if (this.bossTelegraphCircle) {
      this.bossTelegraphCircle.destroy();
      this.bossTelegraphCircle = undefined;
    }
    this.isDead = true;
    this.isDying = true;
    this.isMoving = false;
    this.isActing = false;
    this.hasGroundStruck = false;
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

    if (this.championType === 'Boss') {
      if (this.shadow) {
        this.scene.tweens.add({
          targets: this.shadow,
          alpha: 0,
          duration: 1200,
          ease: 'Quad.easeOut',
        });
      }
      this.currentAnimKey = 'idle';
      this.playChampionAnim('idle', this.currentDir);
      this.scene.tweens.add({
        targets: this,
        alpha: 0,
        duration: 2500,
        ease: 'Quad.easeOut',
        onComplete: () => {
          this.destroy();
        },
      });
      return;
    }

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

  public isAttackInDamageWindow(): boolean {
    if (this.isDead || this.isStumbling || this.hasHitInCurrentAttack) return false;
    if (!this.isPerformingAttack()) return false;
    if (!this.anims.isPlaying) return false;

    const progress = this.anims.getProgress();

    if (this.championType === 'Boss') {
      // 25-frame attack:
      // Frames 0-12 (0.00-0.48): Windup & backswing (raising axe behind head) -> 0 damage, player can dodge/escape
      // Frames 13-18 (0.50-0.74): Active axe slam and ground impact -> damage window
      // Frames 19-24 (0.75-1.00): Axe grounded and recovery -> 0 damage
      return progress >= 0.50 && progress <= 0.74;
    }

    if (this.championType === 'Enemy3') {
      if (this.enemy3State !== 'attacking') return false;
      return progress >= 0.35 && progress <= 0.75;
    }

    // Zed & Yi: active strike is in the middle of their attack swing
    return progress >= 0.35 && progress <= 0.75;
  }

  public getFacingAngleDeg(): number {
    const stdDir = this.championType === 'Enemy3'
      ? this.currentDir
      : (this.currentDir + 6) % 8;
    return stdDir * 45;
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

    if (this.anims.currentAnim?.key === key && this.anims.isPlaying) {
      return;
    }

    // Only continuous locomotion cycle preserves cycle progress across direction changes
    const canPreserveProgress =
      baseKey === this.config.locomotionAnim &&
      this.currentAnimKey === this.config.locomotionAnim &&
      this.anims.isPlaying;
    const progress = canPreserveProgress ? this.anims.getProgress() : 0;

    this.currentAnimKey = baseKey;
    this.play(key, true);

    if (canPreserveProgress && progress > 0) {
      this.anims.setProgress(progress);
    }
  }

  public getCollisionRadius(): number {
    if (this.championType === 'Boss') return 28;
    if (this.championType === 'Enemy3') return 10;
    return this.championType === 'Zed' ? 24 : 14;
  }

  public pushBody(pushX: number, pushY: number, area?: WalkableArea) {
    if (this.isDead || this.isActing) return;
    if (this.championType === 'Enemy3' && (this.enemy3State === 'hidden' || !this.visible)) return;
    const rx =
      this.championType === 'Boss'
        ? 24
        : this.championType === 'Zed'
          ? 16
          : this.championType === 'Enemy3'
            ? 8
            : 10;
    const ry =
      this.championType === 'Boss'
        ? 14
        : this.championType === 'Zed'
          ? 8
          : this.championType === 'Enemy3'
            ? 4
            : 5;
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

  /**
   * Smoothly steps currentDir towards targetDir at a realistic angular turn rate.
   * Returns true if already facing the target direction.
   */
  public stepDirectionTowards(targetDir: number, dt: number): boolean {
    if (this.currentDir === targetDir) {
      this.turnCooldown = 0;
      return true;
    }

    if (this.turnCooldown > 0) {
      this.turnCooldown -= dt;
      return false;
    }

    const stepDelay =
      this.championType === 'Boss'
        ? 0.05
        : this.championType === 'Zed'
          ? 0.04
          : 0.06;

    this.turnCooldown = stepDelay;

    const diff = (targetDir - this.currentDir + 8) % 8;
    if (diff <= 4) {
      this.currentDir = (this.currentDir + 1) % 8;
    } else {
      this.currentDir = (this.currentDir + 7) % 8;
    }

    return this.currentDir === targetDir;
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

    // Angular hysteresis: keep current direction unless angle deviates by > 28 degrees
    const currentStd = this.championType === 'Enemy3'
      ? this.currentDir
      : (this.currentDir + 6) % 8;
    const currentCenterDeg = currentStd * 45;
    let diff = Math.abs(deg - currentCenterDeg);
    if (diff > 180) diff = 360 - diff;
    if (diff <= 28.0) {
      return this.currentDir;
    }

    // Standard Math.atan2 sector: 0=East, 1=SE, 2=South, 3=SW, 4=West, 5=NW, 6=North, 7=NE
    const stdDir = Math.floor(((deg + 22.5) % 360) / 45);

    if (this.championType === 'Enemy3') {
      return stdDir;
    }

    // Map: East(0)->2, SE(1)->3, South(2)->4, SW(3)->5, West(4)->6, NW(5)->7, North(6)->0, NE(7)->1
    return (stdDir + 2) % 8;
  }
}
