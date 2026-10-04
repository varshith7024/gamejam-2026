import Phaser from 'phaser';
import { Enemy } from '../entities/Enemy';
import { Level1Environment, DEPTH } from '../environment/Level1Environment';
import { Atmosphere } from '../effects/Atmosphere';
import { LEVEL1 } from '../environment/level1Data';
import type { LevelData } from '../environment/levelTypes';
import { BALANCE } from '../config/balance';
import { ChampionType, ORB_CONFIG } from '../config/championAnimations';

type ActionState =
  | 'idle'
  | 'moving'
  | 'attack'
  | 'roll'
  | 'flip'
  | 'slide'
  | 'kick'
  | 'pummel'
  | 'spell'
  | 'special1'
  | 'block'
  | 'turn'
  | 'die'
  | 'unsheath';

export interface AttackProfile {
  name: string;
  reach: number;
  halfAngleDeg: number;
  is360: boolean;
  damageYi: number;
  damageZed: number;
  knockbackDist: number;
  stunDuration?: number;
}

interface LightOrb {
  sprite: Phaser.GameObjects.Sprite;
  shadow: Phaser.GameObjects.Ellipse;
  vx: number;
  vy: number;
  distTraveled: number;
  active: boolean;
}

interface ShockwaveRing {
  centerX: number;
  centerY: number;
  radius: number;
  speed: number;
  maxRadius: number;
  hitEnemies: Set<Enemy>;
  gfx: Phaser.GameObjects.Graphics;
  active: boolean;
}

const BASIC_ATTACK_PROFILE: AttackProfile = {
  name: 'Strike',
  reach: 95,
  halfAngleDeg: 45, // 90° forward cone
  is360: false,
  damageYi: 1,
  damageZed: 1,
  knockbackDist: 26,
};

const SPRINT_ATTACK_PROFILE: AttackProfile = {
  name: 'Sprint Strike',
  reach: 95,
  halfAngleDeg: 180, // 360° range
  is360: true,
  damageYi: 2, // Double damage
  damageZed: 4,
  knockbackDist: 26,
};

const WHIRLWIND_PROFILE: AttackProfile = {
  name: 'Whirlwind',
  reach: 95,
  halfAngleDeg: 180, // 360° range
  is360: true,
  damageYi: 2, // 2 damage to all enemies
  damageZed: 2, // 2 damage to all enemies
  knockbackDist: 26,
  stunDuration: 1.0, // Stun enemies for 1s
};

const KICK_PROFILE: AttackProfile = {
  name: 'Kick',
  reach: 140, // Further reach
  halfAngleDeg: 25, // Narrower cone (50° total)
  is360: false,
  damageYi: 1,
  damageZed: 1,
  knockbackDist: 90, // Heavy knockback
};

const PUMMEL_PROFILE: AttackProfile = {
  name: 'Pummel',
  reach: 95,
  halfAngleDeg: 25, // Narrower cone (50° total)
  is360: false,
  damageYi: 2, // Double damage (same as sprint attack)
  damageZed: 4,
  knockbackDist: 26,
};

const OVERHEAD_PROFILE: AttackProfile = {
  name: 'Overhead',
  reach: 105,
  halfAngleDeg: 25, // Narrower cone (50° total)
  is360: false,
  damageYi: 3, // 1.5x of pummel
  damageZed: 6,
  knockbackDist: 40,
};

export class GameScene extends Phaser.Scene {
  public env!: Level1Environment;
  private atmosphere!: Atmosphere;
  private player!: Phaser.GameObjects.Sprite;
  private enemies: Enemy[] = [];
  private debugOn = false;

  // Player Health Bar (Clean black bar with red inner bar, bottom-left)
  public readonly maxHealth = 75;
  public health = 75;
  public timeSinceLastDamage = 7.0; // Seconds since player last took damage
  public readonly REGEN_DELAY = 7.0; // 7 seconds delay without taking damage before regen starts
  public readonly REGEN_RATE = 3.0; // 3 HP per second
  private healthContainer!: Phaser.GameObjects.Container;
  private hpBgGfx!: Phaser.GameObjects.Graphics;
  private hpFillGfx!: Phaser.GameObjects.Graphics;

  // Brightening & Black Point / White Point Mechanic
  public blackPoint = 0.0; // -0.50 to +0.35 (-50% to +35%)
  private blackPointOverlay!: Phaser.GameObjects.Rectangle;
  private whitePointDarkOverlay!: Phaser.GameObjects.Rectangle;

  // Wave System & UI
  public currentWave = 1;
  private wavePhase = 0;
  private waveGroupEnemies: Enemy[] = [];
  private wavePendingSpawns = 0;
  private waveTimerEvents: Phaser.Time.TimerEvent[] = [];
  private cornerWaveText!: Phaser.GameObjects.Text;
  private lightLevelText!: Phaser.GameObjects.Text;
  public score = 0;
  private scoreText!: Phaser.GameObjects.Text;
  private killPopups: {
    text: Phaser.GameObjects.Text;
    timerEvent?: Phaser.Time.TimerEvent;
    slideTween?: Phaser.Tweens.Tween;
  }[] = [];
  private waveAnnounceTitle: Phaser.GameObjects.Text | null = null;
  private waveAnnounceSub: Phaser.GameObjects.Text | null = null;

  // Top-Right Cooldown HUD
  private cooldownContainer!: Phaser.GameObjects.Container;
  private cooldownBarsGfx!: Phaser.GameObjects.Graphics;
  private cooldownKeyTexts: Phaser.GameObjects.Text[] = [];
  private cooldownNameTexts: Phaser.GameObjects.Text[] = [];

  // Ability Cooldowns & Sprint Running Timer
  public sprintTimer = 0;
  public readonly SPRINT_REQ = 0.75;
  public cooldownQ = 0;
  public readonly maxCooldownQ = 2.0;
  public cooldownE = 0;
  public readonly maxCooldownE = 1.5;
  public cooldownV = 0;
  public readonly maxCooldownV = 1.5;
  public cooldownR = 0;
  public readonly maxCooldownR = 3.0;

  // Ability X (Light Orb): unlocked every 1500 points, 5s cooldown
  public readonly REQ_POINTS_X = 1500;
  public readonly maxCooldownX = 5.0;
  public cooldownX = 0;
  public pointsTowardsX = 0;
  private activeOrbs: LightOrb[] = [];

  // Ability U (Concentric Shockwaves): unlocked every 10000 points, 10s cooldown
  public readonly REQ_POINTS_U = 10000;
  public readonly maxCooldownU = 10.0;
  public cooldownU = 0;
  public pointsTowardsU = 0;
  private isCastingShockwave = false;
  private activeShockwaves: ShockwaveRing[] = [];

  // Playable floor grid for clipping effects to playable area & cutting out props/occlusions
  private floorGrid!: Uint8Array;
  private floorGridW = 0;
  private floorGridH = 0;
  private readonly FLOOR_GRID_SCALE = 3;

  // Directions: 0=E, 1=SE, 2=S, 3=SW, 4=W, 5=NW, 6=N, 7=NE
  private currentAimDir = 0;
  private currentBaseAnim = 'Idle';
  private currentAction: ActionState = 'idle';
  private actionDir = 0;
  private actionVelocity = new Phaser.Math.Vector2(0, 0);

  // Combat combo
  private attackComboStep = 0;
  private comboResetTimer: Phaser.Time.TimerEvent | null = null;
  private isDead = false;
  private enemyHitCooldown = 0;

  // Speeds (pixels per second)
  private readonly WALK_SPEED = 180;
  private readonly RUN_SPEED = 320;
  private readonly CROUCH_SPEED = 100;
  private readonly BLOCK_SPEED = 90;
  private readonly ROLL_SPEED = 420;
  private readonly FLIP_SPEED = 280;
  private readonly SLIDE_SPEED = 360;

  // Input keys
  private keyW!: Phaser.Input.Keyboard.Key;
  private keyA!: Phaser.Input.Keyboard.Key;
  private keyS!: Phaser.Input.Keyboard.Key;
  private keyD!: Phaser.Input.Keyboard.Key;
  private keyShift!: Phaser.Input.Keyboard.Key;
  private keySpace!: Phaser.Input.Keyboard.Key;
  private keyC!: Phaser.Input.Keyboard.Key;
  private keyQ!: Phaser.Input.Keyboard.Key;
  private keyE!: Phaser.Input.Keyboard.Key;
  private keyR!: Phaser.Input.Keyboard.Key;
  private keyF!: Phaser.Input.Keyboard.Key;
  private keyZ!: Phaser.Input.Keyboard.Key;
  private keyX!: Phaser.Input.Keyboard.Key;
  private keyV!: Phaser.Input.Keyboard.Key;
  private keyB!: Phaser.Input.Keyboard.Key;
  private keyU!: Phaser.Input.Keyboard.Key;
  private keyH!: Phaser.Input.Keyboard.Key;
  private keyK!: Phaser.Input.Keyboard.Key;
  private keyG!: Phaser.Input.Keyboard.Key;

  /** `level` = which level's data (world, floor, props, atmosphere, roster) this scene plays. Level 1 by default. */
  constructor(
    key: string = 'Game',
    protected level: LevelData = LEVEL1,
  ) {
    super(key);
  }

  create() {
    this.cameras.main.setBackgroundColor('#000000');
    this.input.mouse?.disableContextMenu();

    // Reset combat and wave state
    this.enemies = [];
    this.waveGroupEnemies = [];
    this.waveTimerEvents = [];
    this.health = this.maxHealth;
    this.timeSinceLastDamage = this.REGEN_DELAY;
    this.blackPoint = 0.0;
    this.isDead = false;
    this.enemyHitCooldown = 0;
    this.sprintTimer = 0;
    this.cooldownQ = 0;
    this.cooldownE = 0;
    this.cooldownV = 0;
    this.cooldownR = 0;
    this.cooldownX = 0;
    this.cooldownU = 0;
    this.pointsTowardsX = 0;
    this.pointsTowardsU = 0;
    this.isCastingShockwave = false;
    this.activeOrbs = [];
    this.activeShockwaves = [];
    this.currentAction = 'idle';
    this.actionVelocity.set(0, 0);

    // Build environment and atmosphere
    this.env = new Level1Environment(this, this.level);
    this.atmosphere = new Atmosphere(this, this.level);
    this.atmosphere.create();
    this.initFloorGrid();

    // Setup Black Point overlay (modifies background only, depth = DEPTH.base + 0.1)
    this.createBlackPointOverlay();

    // Create player sprite (origin at ground feet contact point)
    this.currentAimDir = 0; // Starts facing right (East)
    this.player = this.add.sprite(this.level.playerStart.x, this.level.playerStart.y, 'Idle', 0);
    this.player.setOrigin(0.5, 0.78);
    this.player.setScale(1.1);
    this.player.setDepth(this.player.y + 7);
    this.playDirectional('Idle', 0, false);

    this.setupInput();
    this.setupAnimationCallbacks();
    this.setupCamera();
    this.setupHealthBar();
    this.setupWaveUI();
    this.setupCooldownHUD();
    this.showTitleCard();

    // Start Wave Progression
    this.startWave(1);

    // Debug mode (?debug in URL)
    if (new URLSearchParams(window.location.search).has('debug')) {
      this.debugOn = true;
      this.env.setDebug(true);
      (window as unknown as Record<string, unknown>).__level1 = this;
    }
  }

  // -----------------------------------------------------------------
  // BRIGHTENING & DARKENING MECHANIC (BLACK POINT & WHITE POINT)
  // -----------------------------------------------------------------
  private createBlackPointOverlay() {
    // White screen overlay placed directly above veil_master image (DEPTH.base is -10000)
    // Screen blend formula: Output = blackPoint + (1 - blackPoint) * Background
    // Lifts the black point of the background when blackPoint > 0 (scene gets brighter)
    this.blackPointOverlay = this.add
      .rectangle(0, 0, this.level.world.width, this.level.world.height, 0xffffff)
      .setOrigin(0, 0)
      .setDepth(DEPTH.base + 0.1)
      .setBlendMode(Phaser.BlendModes.SCREEN)
      .setAlpha(0);

    // Black normal overlay to lower the white point when blackPoint < 0 (scene gets darker)
    // Formula: Output = (1 - darkness) * Background
    this.whitePointDarkOverlay = this.add
      .rectangle(0, 0, this.level.world.width, this.level.world.height, 0x000000)
      .setOrigin(0, 0)
      .setDepth(DEPTH.base + 0.2)
      .setAlpha(0);
  }

  private isAnyEnemyOnScreen(): boolean {
    const cam = this.cameras.main;
    const wv = cam.worldView;
    const margin = 40;
    for (const enemy of this.enemies) {
      if (!enemy.isDead) {
        if (
          enemy.x >= wv.x - margin &&
          enemy.x <= wv.right + margin &&
          enemy.y >= wv.y - margin &&
          enemy.y <= wv.bottom + margin
        ) {
          return true;
        }
      }
    }
    return false;
  }

  private applyBlackPoint() {
    if (this.blackPoint >= 0) {
      this.blackPointOverlay.setAlpha(this.blackPoint);
      this.whitePointDarkOverlay.setAlpha(0);
    } else {
      this.blackPointOverlay.setAlpha(0);
      this.whitePointDarkOverlay.setAlpha(Math.abs(this.blackPoint));
    }
    if (this.env) {
      this.env.setBlackPoint(this.blackPoint);
    }
    if (this.lightLevelText) {
      const pct = Math.round(this.blackPoint * 100);
      const sign = pct > 0 ? '+' : '';
      this.lightLevelText.setText(`LIGHT ${sign}${pct}%`);
    }
  }

  private updateBlackPoint(dt: number) {
    // Decrease light level by 1% (0.01) per second when enemies are present
    const hasAliveEnemies = this.enemies.some((e) => !e.isDead);
    if (hasAliveEnemies) {
      this.blackPoint = Math.max(-0.50, this.blackPoint - 0.01 * dt);
    }
    this.blackPoint = Math.min(0.35, this.blackPoint);
    this.applyBlackPoint();
  }

  public getBlackPoint(): number {
    return this.blackPoint;
  }

  // -----------------------------------------------------------------
  // -----------------------------------------------------------------
  // PLAYER HEALTH BAR (BLACK BAR WITH RED INNER BAR, BOTTOM-LEFT)
  // -----------------------------------------------------------------
  private setupHealthBar() {
    const { width, height } = this.scale;
    const z = BALANCE.level1CameraZoom;
    const toCamX = (x: number) => width / 2 + (x - width / 2) / z;
    const toCamY = (y: number) => height / 2 + (y - height / 2) / z;

    // Anchor at bottom-left
    this.healthContainer = this.add.container(toCamX(30), toCamY(height - 36));
    this.healthContainer.setScale(1 / z).setScrollFactor(0).setDepth(DEPTH.screen + 10);

    // Outer black bar
    this.hpBgGfx = this.add.graphics();

    // Red inner bar
    this.hpFillGfx = this.add.graphics();

    this.healthContainer.add([this.hpBgGfx, this.hpFillGfx]);

    this.drawHealthBar();
  }

  private drawHealthBar() {
    const barW = 200;
    const barH = 16;
    const pad = 2;
    const frac = Phaser.Math.Clamp(this.health / this.maxHealth, 0, 1);

    // 1. Black outer bar
    this.hpBgGfx.clear();
    this.hpBgGfx.fillStyle(0x000000, 1);
    this.hpBgGfx.fillRect(0, 0, barW, barH);
    this.hpBgGfx.lineStyle(1, 0x1f1f1f, 1);
    this.hpBgGfx.strokeRect(0, 0, barW, barH);

    // 2. Red inner bar sized based on length
    this.hpFillGfx.clear();
    const maxInnerW = barW - pad * 2;
    const innerW = Math.round(maxInnerW * frac);
    const innerH = barH - pad * 2;
    if (innerW > 0) {
      this.hpFillGfx.fillStyle(0xd63031, 1);
      this.hpFillGfx.fillRect(pad, pad, innerW, innerH);
    }
  }

  public damagePlayer(amount: number) {
    if (this.isDead) return;

    this.health = Math.max(0, this.health - amount);
    this.timeSinceLastDamage = 0;
    this.drawHealthBar();

    if (this.health <= 0) {
      this.die();
    }
  }

  // -----------------------------------------------------------------
  // -----------------------------------------------------------------
  // UI, TITLE CARD & WAVE PROGRESSION (STYLE OF "THE VEIL")
  // -----------------------------------------------------------------
  private showTitleCard() {
    const { width, height } = this.scale;
    const z = BALANCE.level1CameraZoom;
    const toCamY = (screenY: number) => height / 2 + (screenY - height / 2) / z;

    const title = this.add
      .text(width / 2, toCamY(height * 0.42), this.level.title, {
        fontFamily: 'Georgia, serif',
        fontSize: '72px',
        color: '#ece8f4',
      })
      .setOrigin(0.5)
      .setScale(1 / z)
      .setLetterSpacing(14)
      .setScrollFactor(0)
      .setDepth(DEPTH.screen + 1)
      .setAlpha(0);

    const sub = this.add
      .text(width / 2, toCamY(height * 0.42 + 56), this.level.subtitle, {
        fontFamily: 'Georgia, serif',
        fontSize: '22px',
        color: '#9a96b0',
      })
      .setOrigin(0.5)
      .setScale(1 / z)
      .setLetterSpacing(6)
      .setScrollFactor(0)
      .setDepth(DEPTH.screen + 1)
      .setAlpha(0);

    this.tweens.add({
      targets: [title, sub],
      alpha: 1,
      duration: 900,
      hold: 1800,
      yoyo: true,
      onComplete: () => {
        title.destroy();
        sub.destroy();
      },
    });
  }

  private setupWaveUI() {
    const { width, height } = this.scale;
    const z = BALANCE.level1CameraZoom;
    const toCamX = (x: number) => width / 2 + (x - width / 2) / z;
    const toCamY = (y: number) => height / 2 + (y - height / 2) / z;

    // Corner wave indicator (top-left) - wide cinematic typography matching The Veil
    this.cornerWaveText = this.add
      .text(toCamX(32), toCamY(28), 'WAVE I', {
        fontFamily: 'Georgia, serif',
        fontSize: '18px',
        color: '#ece8f4',
      })
      .setOrigin(0, 0)
      .setScale(1 / z)
      .setLetterSpacing(6)
      .setScrollFactor(0)
      .setDepth(DEPTH.screen + 10)
      .setAlpha(0.85);

    // Small light level indicator (bottom-right)
    const pct = Math.round(this.blackPoint * 100);
    const sign = pct > 0 ? '+' : '';
    this.lightLevelText = this.add
      .text(toCamX(width - 32), toCamY(height - 28), `LIGHT ${sign}${pct}%`, {
        fontFamily: 'Georgia, serif',
        fontSize: '16px',
        color: '#ece8f4',
      })
      .setOrigin(1, 1)
      .setScale(1 / z)
      .setLetterSpacing(4)
      .setScrollFactor(0)
      .setDepth(DEPTH.screen + 10)
      .setAlpha(0.85);

    // Total points indicator (above light level at bottom-right)
    this.scoreText = this.add
      .text(toCamX(width - 32), toCamY(height - 52), `POINTS ${this.score}`, {
        fontFamily: 'Georgia, serif',
        fontSize: '16px',
        color: '#ece8f4',
      })
      .setOrigin(1, 1)
      .setScale(1 / z)
      .setLetterSpacing(4)
      .setScrollFactor(0)
      .setDepth(DEPTH.screen + 10)
      .setAlpha(0.95);
  }

  // -----------------------------------------------------------------
  // COOLDOWN HUD (TOP-RIGHT)
  // -----------------------------------------------------------------
  private setupCooldownHUD() {
    const { width, height } = this.scale;
    const z = BALANCE.level1CameraZoom;
    const toCamX = (x: number) => width / 2 + (x - width / 2) / z;
    const toCamY = (y: number) => height / 2 + (y - height / 2) / z;

    // Anchor at top-right
    const panelW = 216;
    const panelH = 204;
    this.cooldownContainer = this.add.container(toCamX(width - panelW - 20), toCamY(20));
    this.cooldownContainer.setScale(1 / z).setScrollFactor(0).setDepth(DEPTH.screen + 10);

    // Subtle dark translucent background panel with rounded border
    const bgGfx = this.add.graphics();
    bgGfx.fillStyle(0x06050b, 0.72);
    bgGfx.fillRoundedRect(0, 0, panelW, panelH, 4);
    bgGfx.lineStyle(1, 0x2e293f, 0.85);
    bgGfx.strokeRoundedRect(0, 0, panelW, panelH, 4);

    // Graphics for the 8 cooldown bars
    this.cooldownBarsGfx = this.add.graphics();

    this.cooldownContainer.add([bgGfx, this.cooldownBarsGfx]);

    const skills = [
      { key: '[LMB]', name: 'Strike' },
      { key: '[SHIFT+LMB]', name: 'Sprint' },
      { key: '[Q]', name: 'Kick' },
      { key: '[E]', name: 'Whirlwind' },
      { key: '[V]', name: 'Pummel' },
      { key: '[R]', name: 'Overhead' },
      { key: '[X]', name: 'Light Orb' },
      { key: '[U]', name: 'Shockwave' },
    ];

    this.cooldownKeyTexts = [];
    this.cooldownNameTexts = [];

    skills.forEach((skill, i) => {
      const rowY = 11 + i * 23;

      const keyTxt = this.add
        .text(10, rowY, skill.key, {
          fontFamily: 'Georgia, serif',
          fontSize: '11px',
          fontStyle: 'bold',
          color: '#ffffff',
        })
        .setOrigin(0, 0);

      const nameTxt = this.add
        .text(86, rowY, skill.name, {
          fontFamily: 'Georgia, serif',
          fontSize: '11px',
          color: '#ece8f4',
        })
        .setOrigin(0, 0);

      this.cooldownKeyTexts.push(keyTxt);
      this.cooldownNameTexts.push(nameTxt);
      this.cooldownContainer.add([keyTxt, nameTxt]);
    });

    this.updateCooldownHUD();
  }

  private updateCooldownHUD() {
    if (!this.cooldownBarsGfx) return;

    this.cooldownBarsGfx.clear();

    // 8 Skills: LMB, SHIFT+LMB, Q, E, V, R, X, U
    const fracLMB = 1.0;
    const fracSprint = Phaser.Math.Clamp(this.sprintTimer / this.SPRINT_REQ, 0, 1);
    const fracQ = Phaser.Math.Clamp(1 - this.cooldownQ / this.maxCooldownQ, 0, 1);
    const fracE = Phaser.Math.Clamp(1 - this.cooldownE / this.maxCooldownE, 0, 1);
    const fracV = Phaser.Math.Clamp(1 - this.cooldownV / this.maxCooldownV, 0, 1);
    const fracR = Phaser.Math.Clamp(1 - this.cooldownR / this.maxCooldownR, 0, 1);
    const fracX = Math.min(
      Phaser.Math.Clamp(this.pointsTowardsX / this.REQ_POINTS_X, 0, 1),
      Phaser.Math.Clamp(1 - this.cooldownX / this.maxCooldownX, 0, 1),
    );
    const fracU = Math.min(
      Phaser.Math.Clamp(this.pointsTowardsU / this.REQ_POINTS_U, 0, 1),
      Phaser.Math.Clamp(1 - this.cooldownU / this.maxCooldownU, 0, 1),
    );

    const fractions = [fracLMB, fracSprint, fracQ, fracE, fracV, fracR, fracX, fracU];

    const barX = 144;
    const barW = 62;
    const barH = 7;

    fractions.forEach((frac, i) => {
      const rowY = 11 + i * 23;
      const barY = rowY + 3;

      // Outer bar frame
      this.cooldownBarsGfx.fillStyle(0x0c0b12, 1.0);
      this.cooldownBarsGfx.fillRect(barX, barY, barW, barH);
      this.cooldownBarsGfx.lineStyle(1, 0x2a2638, 1.0);
      this.cooldownBarsGfx.strokeRect(barX, barY, barW, barH);

      // Inner fill based on progress
      const maxInnerW = barW - 2;
      const fillW = Math.round(maxInnerW * frac);

      const isReady = frac >= 0.999;
      if (fillW > 0) {
        // Silver-white when ready, warm amber when recharging
        this.cooldownBarsGfx.fillStyle(isReady ? 0xece8f4 : 0xca8228, 1.0);
        this.cooldownBarsGfx.fillRect(barX + 1, barY + 1, fillW, barH - 2);
      }

      // Visual feedback: dim text while recharging, bright while ready
      if (this.cooldownKeyTexts[i] && this.cooldownNameTexts[i]) {
        this.cooldownKeyTexts[i].setAlpha(isReady ? 1.0 : 0.45);
        this.cooldownNameTexts[i].setAlpha(isReady ? 0.9 : 0.45);
      }
    });
  }

  private announceWave(titleText: string, subText: string = '', permanent = false) {
    const { width, height } = this.scale;
    const z = BALANCE.level1CameraZoom;
    const toCamY = (screenY: number) => height / 2 + (screenY - height / 2) / z;

    if (this.waveAnnounceTitle) {
      this.waveAnnounceTitle.destroy();
      this.waveAnnounceTitle = null;
    }
    if (this.waveAnnounceSub) {
      this.waveAnnounceSub.destroy();
      this.waveAnnounceSub = null;
    }

    this.waveAnnounceTitle = this.add
      .text(width / 2, toCamY(height * 0.42), titleText, {
        fontFamily: 'Georgia, serif',
        fontSize: '72px',
        color: '#ece8f4',
      })
      .setOrigin(0.5)
      .setScale(1 / z)
      .setLetterSpacing(14)
      .setScrollFactor(0)
      .setDepth(DEPTH.screen + 2)
      .setAlpha(0);

    const targets: Phaser.GameObjects.Text[] = [this.waveAnnounceTitle];

    if (subText) {
      this.waveAnnounceSub = this.add
        .text(width / 2, toCamY(height * 0.42 + 56), subText, {
          fontFamily: 'Georgia, serif',
          fontSize: '22px',
          color: '#9a96b0',
        })
        .setOrigin(0.5)
        .setScale(1 / z)
        .setLetterSpacing(6)
        .setScrollFactor(0)
        .setDepth(DEPTH.screen + 2)
        .setAlpha(0);
      targets.push(this.waveAnnounceSub);
    }

    if (permanent) {
      this.tweens.add({
        targets,
        alpha: 1,
        duration: 1200,
        ease: 'Power2',
      });
    } else {
      this.tweens.add({
        targets,
        alpha: 1,
        duration: 900,
        hold: 1800,
        yoyo: true,
        onComplete: () => {
          if (this.waveAnnounceTitle) {
            this.waveAnnounceTitle.destroy();
            this.waveAnnounceTitle = null;
          }
          if (this.waveAnnounceSub) {
            this.waveAnnounceSub.destroy();
            this.waveAnnounceSub = null;
          }
        },
      });
    }
  }

  private spawnEnemyAtAngle(type: ChampionType, angleRad: number, offsetDist = 0): Enemy {
    const fc = this.level.floorCenter;
    let x: number;
    let y: number;

    const entries = this.level.entries;
    const perpAngle = angleRad + Math.PI / 2;

    if (entries && entries.length > 0) {
      // Levels with entry markers: use the entry whose bearing (seen from the floor centre) is closest to the wave's angle.
      let best = entries[0];
      let bestDiff = Infinity;
      for (const e of entries) {
        const diff = Math.abs(Phaser.Math.Angle.Wrap(Math.atan2(e.y - fc.y, e.x - fc.x) - angleRad));
        if (diff < bestDiff) {
          bestDiff = diff;
          best = e;
        }
      }
      x = best.x + Math.cos(perpAngle) * offsetDist + Phaser.Math.Between(-14, 14);
      y = best.y + Math.sin(perpAngle) * (offsetDist * 0.7) + Phaser.Math.Between(-10, 10);
    } else {
      // Default (Level 1): a ring around the floor centre
      const dist = 850;
      x = fc.x + Math.cos(angleRad) * dist + Math.cos(perpAngle) * offsetDist;
      y = fc.y + Math.sin(angleRad) * (dist * 0.7) + Math.sin(perpAngle) * (offsetDist * 0.7);
    }

    const enemy = new Enemy(this, x, y, type, fc);
    this.enemies.push(enemy);
    this.waveGroupEnemies.push(enemy);
    return enemy;
  }

  private startWave(waveNum: number) {
    this.currentWave = waveNum;
    this.wavePhase = 0;
    this.waveGroupEnemies = [];
    this.waveTimerEvents.forEach((t) => t.remove());
    this.waveTimerEvents = [];

    const romanNums = ['', 'I', 'II', 'III'];
    const waveRoman = romanNums[waveNum] || `${waveNum}`;

    if (this.cornerWaveText) {
      this.cornerWaveText.setText(`WAVE ${waveRoman}`);
    }

    if (waveNum === 1) {
      // Delay wave 1 announcement slightly so "The Veil" title card displays first
      this.time.delayedCall(3000, () => {
        this.announceWave(`WAVE ${waveRoman}`);
      });
      this.startWave1();
    } else {
      this.announceWave(`WAVE ${waveRoman}`);
      if (waveNum === 2) {
        this.startWave2();
      } else if (waveNum === 3) {
        this.startWave3();
      }
    }
  }

  // Wave 1: 3 Yis per interval (3 intervals = 9 Yis total) spaced out, then 2 Zeds after defeating all of them
  private startWave1() {
    this.wavePendingSpawns = 9;
    const baseAngles = [0, (Math.PI * 2) / 3, (Math.PI * 4) / 3];
    const offsets = [-50, 0, 50];
    const angleDeltas = [-0.18, 0, 0.18];

    baseAngles.forEach((baseAngle, i) => {
      const t = this.time.delayedCall(i * 2000, () => {
        for (let j = 0; j < 3; j++) {
          this.wavePendingSpawns--;
          this.spawnEnemyAtAngle(this.level.roster.light, baseAngle + angleDeltas[j], offsets[j]);
        }
      });
      this.waveTimerEvents.push(t);
    });
  }

  // Wave 2: 6 Yis at a time twice separated by 6s (12 Yis total), then 4 Zeds after defeating all of them
  private startWave2() {
    this.wavePendingSpawns = 12;
    const offsets = [-50, 0, 50];
    const angleDeltas = [-0.18, 0, 0.18];

    // Spawn 6 Yis at 0s (spaced across two main entry angles)
    this.wavePendingSpawns -= 6;
    for (let k = 0; k < 3; k++) {
      this.spawnEnemyAtAngle(this.level.roster.light, Math.PI * 0.25 + angleDeltas[k], offsets[k]);
      this.spawnEnemyAtAngle(this.level.roster.light, Math.PI * 1.25 + angleDeltas[k], offsets[k]);
    }

    // Spawn 6 Yis at 6s (spaced across two other main entry angles)
    const t = this.time.delayedCall(6000, () => {
      this.wavePendingSpawns -= 6;
      for (let k = 0; k < 3; k++) {
        this.spawnEnemyAtAngle(this.level.roster.light, Math.PI * 0.75 + angleDeltas[k], offsets[k]);
        this.spawnEnemyAtAngle(this.level.roster.light, Math.PI * 1.75 + angleDeltas[k], offsets[k]);
      }
    });
    this.waveTimerEvents.push(t);
  }

  // Wave 3: 3 Yis every second for 5 seconds (15 Yis total), then 6 Zeds at 5s (21 enemies total), all spaced out
  private startWave3() {
    this.wavePendingSpawns = 21;
    const offsets = [-50, 0, 50];
    const angleDeltas = [-0.18, 0, 0.18];

    // Spawn 3 Yis every second (t = 0, 1, 2, 3, 4s) across distinct angles
    for (let i = 0; i < 5; i++) {
      const baseAngle = (i * (Math.PI * 2)) / 5 + 0.15;
      const t = this.time.delayedCall(i * 1000, () => {
        for (let k = 0; k < 3; k++) {
          this.wavePendingSpawns--;
          this.spawnEnemyAtAngle(this.level.roster.light, baseAngle + angleDeltas[k], offsets[k]);
        }
      });
      this.waveTimerEvents.push(t);
    }

    // Spawn 6 Zeds at 5s in 6 different spaced locations
    const tBoss = this.time.delayedCall(5000, () => {
      const zedOffsets = [-35, 35, -35, 35, -35, 35];
      for (let j = 0; j < 6; j++) {
        this.wavePendingSpawns--;
        const zedAngle = (j * (Math.PI * 2)) / 6 + 0.35;
        this.spawnEnemyAtAngle(this.level.roster.heavy, zedAngle, zedOffsets[j]);
      }
    });
    this.waveTimerEvents.push(tBoss);
  }

  private onEnemyDefeated(enemy: Enemy, source: 'normal' | 'X' | 'U' = 'normal') {
    // Points calculation: enemy's health * 100 * (1 + current light level as decimal percentage)
    const pointsEarned = Math.round(enemy.maxHp * 100 * (1 + this.blackPoint));
    this.score += pointsEarned;
    this.updateScoreUI();
    this.showKillPointPopup(pointsEarned);

    // Points isolation: kills by X don't count for X, kills by U don't count for U
    if (source !== 'X') {
      this.pointsTowardsX += pointsEarned;
    }
    if (source !== 'U') {
      this.pointsTowardsU += pointsEarned;
    }

    // Spawn kill effect: motes for Yi, spirits for Zed
    this.spawnEnemyDefeatEffect(enemy);

    // Brighten the background and level props: increase black point by 5% (0.05) per enemy defeated, capped at 35% (0.35)
    this.blackPoint = Math.min(0.35, this.blackPoint + 0.05);
    this.applyBlackPoint();

    this.checkWaveProgress();
  }

  private spawnEnemyDefeatEffect(enemy: Enemy) {
    const x = enemy.x;
    const y = enemy.y;
    const isYi = enemy.championType === 'Yi';

    if (isYi) {
      // Yi defeat effect: subtle luminous motes dissipating upward
      const motesKey = Atmosphere.key(this.level, 'motes');
      if (!this.textures.exists(motesKey)) return;

      // 1. Primary mote rising from chest
      const mainMote = this.add
        .image(x, y - 22, motesKey)
        .setScale(0.18)
        .setAlpha(0.65)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setDepth(y + 20);

      this.tweens.add({
        targets: mainMote,
        y: y - 52,
        scaleX: 0.36,
        scaleY: 0.36,
        alpha: 0,
        duration: 950,
        ease: 'Cubic.easeOut',
        onComplete: () => mainMote.destroy(),
      });

      // 2. Secondary drifting mote flake
      const sideMote = this.add
        .image(x + Phaser.Math.Between(-12, 12), y - 16, motesKey)
        .setScale(0.12)
        .setAlpha(0.45)
        .setAngle(Phaser.Math.Between(-15, 15))
        .setBlendMode(Phaser.BlendModes.ADD)
        .setDepth(y + 19);

      this.tweens.add({
        targets: sideMote,
        x: sideMote.x + Phaser.Math.Between(-16, 16),
        y: y - 44,
        scaleX: 0.22,
        scaleY: 0.22,
        alpha: 0,
        duration: 1100,
        delay: 80,
        ease: 'Sine.easeOut',
        onComplete: () => sideMote.destroy(),
      });
    } else {
      // Zed defeat effect: dark ethereal spirit wisps swirling and rising
      const spiritsKey = Atmosphere.key(this.level, 'spirits');
      if (!this.textures.exists(spiritsKey)) return;

      // 1. Primary spirit wisp drifting upward and curving
      const mainSpirit = this.add
        .image(x, y - 28, spiritsKey)
        .setScale(0.22)
        .setAlpha(0.6)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setDepth(y + 25);

      this.tweens.add({
        targets: mainSpirit,
        x: x + Phaser.Math.Between(-16, -6),
        y: y - 76,
        angle: Phaser.Math.Between(-12, -4),
        scaleX: 0.44,
        scaleY: 0.44,
        alpha: 0,
        duration: 1250,
        ease: 'Cubic.easeOut',
        onComplete: () => mainSpirit.destroy(),
      });

      // 2. Secondary spirit wisp trailing slightly after
      const trailSpirit = this.add
        .image(x + 10, y - 20, spiritsKey)
        .setScale(0.16)
        .setAlpha(0.45)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setDepth(y + 24);

      this.tweens.add({
        targets: trailSpirit,
        x: x + Phaser.Math.Between(10, 22),
        y: y - 68,
        angle: Phaser.Math.Between(6, 16),
        scaleX: 0.32,
        scaleY: 0.32,
        alpha: 0,
        duration: 1400,
        delay: 100,
        ease: 'Sine.easeOut',
        onComplete: () => trailSpirit.destroy(),
      });
    }
  }

  private updateScoreUI() {
    if (this.scoreText) {
      this.scoreText.setText(`POINTS ${this.score}`);
    }
  }

  private showKillPointPopup(points: number) {
    const { width, height } = this.scale;
    const z = BALANCE.level1CameraZoom;
    const toCamX = (x: number) => width / 2 + (x - width / 2) / z;
    const toCamY = (y: number) => height / 2 + (y - height / 2) / z;

    // Slot 0 is base Y above POINTS text (height - 76); higher slots stack upward
    const slotIndex = this.killPopups.length;
    const screenY = (height - 76) - slotIndex * 22;

    const popupText = this.add
      .text(toCamX(width - 32), toCamY(screenY), `+${points}`, {
        fontFamily: 'Georgia, serif',
        fontSize: '15px',
        fontStyle: 'bold',
        color: '#ffd700',
      })
      .setOrigin(1, 1)
      .setScale(1 / z)
      .setLetterSpacing(3)
      .setScrollFactor(0)
      .setDepth(DEPTH.screen + 10)
      .setAlpha(0);

    // Quick smooth fade in
    this.tweens.add({
      targets: popupText,
      alpha: 1,
      duration: 150,
      ease: 'Quad.easeOut',
    });

    const entry: {
      text: Phaser.GameObjects.Text;
      timerEvent?: Phaser.Time.TimerEvent;
      slideTween?: Phaser.Tweens.Tween;
    } = { text: popupText };

    this.killPopups.push(entry);

    // Stays for 1 second before slowly fading away
    entry.timerEvent = this.time.delayedCall(1150, () => {
      this.tweens.add({
        targets: popupText,
        alpha: 0,
        duration: 500,
        ease: 'Quad.easeOut',
        onComplete: () => {
          popupText.destroy();
          const idx = this.killPopups.indexOf(entry);
          if (idx !== -1) {
            this.killPopups.splice(idx, 1);
            // As the oldest fades away at the bottom, the remaining stack slides down
            this.restackKillPopups();
          }
        },
      });
    });
  }

  private restackKillPopups() {
    const { height } = this.scale;
    const z = BALANCE.level1CameraZoom;
    const toCamY = (y: number) => height / 2 + (y - height / 2) / z;

    for (let i = 0; i < this.killPopups.length; i++) {
      const p = this.killPopups[i];
      const targetScreenY = (height - 76) - i * 22;
      const targetWorldY = toCamY(targetScreenY);

      if (p.slideTween) {
        p.slideTween.stop();
      }
      p.slideTween = this.tweens.add({
        targets: p.text,
        y: targetWorldY,
        duration: 250,
        ease: 'Cubic.easeOut',
      });
    }
  }

  private checkWaveProgress() {
    const activeInGroup = this.waveGroupEnemies.filter((e) => !e.isDead);

    // Wave 1 Progression
    if (this.currentWave === 1) {
      if (this.wavePhase === 0 && this.wavePendingSpawns === 0 && activeInGroup.length === 0) {
        // All 9 Yis defeated -> spawn 2 Zeds (spaced out)
        this.wavePhase = 1;
        this.time.delayedCall(1200, () => {
          this.waveGroupEnemies = [];
          this.spawnEnemyAtAngle(this.level.roster.heavy, Math.PI * 0.4, -45);
          this.spawnEnemyAtAngle(this.level.roster.heavy, Math.PI * 1.4, 45);
        });
      } else if (this.wavePhase === 1 && this.waveGroupEnemies.every((e) => e.isDead)) {
        // Zed defeated -> Wave 1 Complete!
        this.wavePhase = 2;
        this.time.delayedCall(2500, () => {
          this.startWave(2);
        });
      }
      return;
    }

    // Wave 2 Progression
    if (this.currentWave === 2) {
      if (this.wavePhase === 0 && this.wavePendingSpawns === 0 && activeInGroup.length === 0) {
        // All 12 Yis defeated -> spawn 4 Zeds at spaced locations
        this.wavePhase = 1;
        this.time.delayedCall(1200, () => {
          this.waveGroupEnemies = [];
          this.spawnEnemyAtAngle(this.level.roster.heavy, Math.PI * 0.25, -40);
          this.spawnEnemyAtAngle(this.level.roster.heavy, Math.PI * 0.75, 40);
          this.spawnEnemyAtAngle(this.level.roster.heavy, Math.PI * 1.25, -40);
          this.spawnEnemyAtAngle(this.level.roster.heavy, Math.PI * 1.75, 40);
        });
      } else if (this.wavePhase === 1 && this.waveGroupEnemies.every((e) => e.isDead)) {
        // Both Zeds defeated -> Wave 2 Complete!
        this.wavePhase = 2;
        this.time.delayedCall(2500, () => {
          this.startWave(3);
        });
      }
      return;
    }

    // Wave 3 Progression
    if (this.currentWave === 3) {
      if (this.wavePhase === 0 && this.wavePendingSpawns === 0 && activeInGroup.length === 0 && this.waveGroupEnemies.every((e) => e.isDead)) {
        this.wavePhase = 1;
        if (this.cornerWaveText) {
          this.cornerWaveText.setText('VICTORY');
        }
        this.announceWave('VICTORY');
        if (this.level.nextScene) {
          const next = this.level.nextScene;
          this.time.delayedCall(4500, () => this.scene.start(next));
        }
      }
      return;
    }
  }

  private setupInput() {
    const kb = this.input.keyboard!;
    this.keyW = kb.addKey(Phaser.Input.Keyboard.KeyCodes.W);
    this.keyA = kb.addKey(Phaser.Input.Keyboard.KeyCodes.A);
    this.keyS = kb.addKey(Phaser.Input.Keyboard.KeyCodes.S);
    this.keyD = kb.addKey(Phaser.Input.Keyboard.KeyCodes.D);
    this.keyShift = kb.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT);
    this.keySpace = kb.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.keyC = kb.addKey(Phaser.Input.Keyboard.KeyCodes.C);
    this.keyQ = kb.addKey(Phaser.Input.Keyboard.KeyCodes.Q);
    this.keyE = kb.addKey(Phaser.Input.Keyboard.KeyCodes.E);
    this.keyR = kb.addKey(Phaser.Input.Keyboard.KeyCodes.R);
    this.keyF = kb.addKey(Phaser.Input.Keyboard.KeyCodes.F);
    this.keyZ = kb.addKey(Phaser.Input.Keyboard.KeyCodes.Z);
    this.keyX = kb.addKey(Phaser.Input.Keyboard.KeyCodes.X);
    this.keyV = kb.addKey(Phaser.Input.Keyboard.KeyCodes.V);
    this.keyB = kb.addKey(Phaser.Input.Keyboard.KeyCodes.B);
    this.keyU = kb.addKey(Phaser.Input.Keyboard.KeyCodes.U);
    this.keyH = kb.addKey(Phaser.Input.Keyboard.KeyCodes.H);
    this.keyK = kb.addKey(Phaser.Input.Keyboard.KeyCodes.K);
    this.keyG = kb.addKey(Phaser.Input.Keyboard.KeyCodes.G);

    // Left Click Attack
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (this.isDead) return;
      if (pointer.leftButtonDown()) {
        this.triggerAttack();
      }
    });
  }

  private setupAnimationCallbacks() {
    this.player.on(
      Phaser.Animations.Events.ANIMATION_COMPLETE,
      (anim: Phaser.Animations.Animation) => {
        if (this.isDead) return;

        // Slide chain: SlideStart -> Slide -> SlideEnd
        if (anim.key.startsWith('SlideStart_')) {
          this.playDirectional('Slide', this.actionDir, true);
          this.time.delayedCall(380, () => {
            if (this.currentAction === 'slide') {
              this.playDirectional('SlideEnd', this.actionDir, false);
            }
          });
          return;
        }

        // Shield block loop
        if (anim.key.startsWith('ShieldBlockStart_')) {
          if (this.currentAction === 'block') {
            this.playDirectional('ShieldBlockMid', this.currentAimDir, true);
          }
          return;
        }

        // One-shot action completed: return to idle/locomotion
        if (
          this.currentAction !== 'block' &&
          this.currentAction !== 'idle' &&
          this.currentAction !== 'moving'
        ) {
          if (this.isCastingShockwave) return;
          this.currentAction = 'idle';
          this.actionVelocity.set(0, 0);
        }
      },
    );
  }

  // ---------- Camera ----------
  private setupCamera() {
    const cam = this.cameras.main;
    cam.setBounds(0, 0, this.level.world.width, this.level.world.height);
    cam.setRoundPixels(true);
    cam.setZoom(BALANCE.level1CameraZoom);
    const t = this.cameraTarget();
    cam.setScroll(t.x, t.y);
  }

  private cameraTarget() {
    const cam = this.cameras.main;
    const f = BALANCE.level1CameraFollow;
    const fc = this.level.floorCenter;
    const cx = fc.x + (this.player.x - fc.x) * f;
    const cy = fc.y + (this.player.y - fc.y) * f;
    return {
      x: cam.clampX(cx - cam.width / 2),
      y: cam.clampY(cy - cam.height / 2),
    };
  }

  private updateCamera(dt: number) {
    const cam = this.cameras.main;
    const t = this.cameraTarget();
    const k = 1 - Math.exp(-BALANCE.level1CameraSmoothing * dt);
    cam.setScroll(cam.scrollX + (t.x - cam.scrollX) * k, cam.scrollY + (t.y - cam.scrollY) * k);
  }

  // -----------------------------------------------------------------
  // 8-DIRECTION CALCULATION (0=E, 1=SE, 2=S, 3=SW, 4=W, 5=NW, 6=N, 7=NE)
  // -----------------------------------------------------------------
  private computeMoveDirection(moveX: number, moveY: number): number {
    const rad = Math.atan2(moveY, moveX);
    let deg = Phaser.Math.RadToDeg(rad);
    if (deg < 0) deg += 360;
    return Math.floor(((deg + 22.5) % 360) / 45);
  }

  private playDirectional(baseKey: string, dir: number, ignoreIfPlaying = true) {
    const animKey = `${baseKey}_${dir}`;
    if (ignoreIfPlaying && this.player.anims.currentAnim?.key === animKey) {
      return;
    }

    const isSameBase = this.currentBaseAnim === baseKey;
    const currentProgress = isSameBase ? this.player.anims.getProgress() : 0;

    this.currentBaseAnim = baseKey;
    this.player.play(animKey, true);

    if (isSameBase && currentProgress > 0) {
      this.player.anims.setProgress(currentProgress);
    }
  }

  // -----------------------------------------------------------------
  // UPDATE LOOP
  // -----------------------------------------------------------------
  update(_time: number, deltaMs: number) {
    const dt = Math.min(deltaMs / 1000, 0.05);

    if (Phaser.Input.Keyboard.JustDown(this.keyG)) {
      this.debugOn = !this.debugOn;
      this.env.setDebug(this.debugOn);
    }

    if (this.isDead) {
      this.updateCamera(dt);
      return;
    }

    // Aim direction follows movement (WASD: all 8 directions)
    let moveX = 0;
    let moveY = 0;
    if (this.keyW.isDown) moveY -= 1;
    if (this.keyS.isDown) moveY += 1;
    if (this.keyA.isDown) moveX -= 1;
    if (this.keyD.isDown) moveX += 1;

    if (
      this.currentAction !== 'attack' &&
      this.currentAction !== 'kick' &&
      this.currentAction !== 'pummel' &&
      this.currentAction !== 'special1' &&
      this.currentAction !== 'spell' &&
      (moveX !== 0 || moveY !== 0)
    ) {
      this.currentAimDir = this.computeMoveDirection(moveX, moveY);
    }

    this.handleActionInputs();
    this.handleLocomotion(dt);

    // Decrement ability cooldowns
    if (this.cooldownQ > 0) this.cooldownQ = Math.max(0, this.cooldownQ - dt);
    if (this.cooldownE > 0) this.cooldownE = Math.max(0, this.cooldownE - dt);
    if (this.cooldownV > 0) this.cooldownV = Math.max(0, this.cooldownV - dt);
    if (this.cooldownR > 0) this.cooldownR = Math.max(0, this.cooldownR - dt);
    if (this.cooldownX > 0) this.cooldownX = Math.max(0, this.cooldownX - dt);
    if (this.cooldownU > 0) this.cooldownU = Math.max(0, this.cooldownU - dt);

    // Track continuous sprinting time (Shift + WASD while moving)
    const moveInput = this.getMovementInput();
    const isSprinting =
      moveInput.lengthSq() > 0 &&
      this.keyShift.isDown &&
      !this.keyC.isDown &&
      (this.currentAction === 'moving' || this.currentAction === 'idle');

    if (isSprinting) {
      this.sprintTimer = Math.min(this.SPRINT_REQ, this.sprintTimer + dt);
    } else if (this.currentAction !== 'attack') {
      this.sprintTimer = 0;
    }

    // Update Top-Right Cooldown HUD
    this.updateCooldownHUD();

    // Health regeneration: 3 hp/sec after 7 seconds without taking damage
    this.timeSinceLastDamage += dt;
    if (this.timeSinceLastDamage >= this.REGEN_DELAY && this.health < this.maxHealth) {
      this.health = Math.min(this.maxHealth, this.health + this.REGEN_RATE * dt);
      this.drawHealthBar();
    }

    // Update active light orbs (Ability X)
    this.updateLightOrbs(dt);

    // Update active shockwaves (Ability U)
    this.updateShockwaves(dt);

    // 1. Compute crowd separation vectors for all alive enemies
    for (const enemy of this.enemies) {
      enemy.computeSeparation(this.enemies);
    }

    // 2. Update all enemies pursuing the player in the arena
    for (const enemy of this.enemies) {
      enemy.update(dt, this.player.x, this.player.y, this.env.area);
    }

    // 3. Resolve physical collisions between enemies and with player (small overlap allowed)
    this.resolveEnemyCollisions();

    // 2.5D depth sorting based on ground feet contact position
    this.player.setDepth(this.player.y + 7);

    // Check enemy attacks hitting player
    this.checkEnemyAttackHit(dt);

    // Update background black point decay (only when enemies are on screen)
    this.updateBlackPoint(dt);

    // Update smooth camera follow
    this.updateCamera(dt);
  }

  // -----------------------------------------------------------------
  // ACTION INPUTS
  // -----------------------------------------------------------------
  private handleActionInputs() {
    if (Phaser.Input.Keyboard.JustDown(this.keyK)) {
      this.die();
      return;
    }

    if (Phaser.Input.Keyboard.JustDown(this.keyH)) {
      this.damagePlayer(5);
      this.flashPlayerHurt();
      return;
    }

    if (Phaser.Input.Keyboard.JustDown(this.keySpace)) {
      this.triggerRoll();
      return;
    }

    if (Phaser.Input.Keyboard.JustDown(this.keyF)) {
      this.triggerFlip();
      return;
    }

    if (Phaser.Input.Keyboard.JustDown(this.keyZ)) {
      this.triggerSlide();
      return;
    }

    // Q - Kick (further reach, narrow cone, heavy knockback, 1 dmg, 2s cooldown)
    if (Phaser.Input.Keyboard.JustDown(this.keyQ)) {
      if (this.canTriggerSpecialAction() && this.cooldownQ <= 0) {
        this.triggerKick();
      }
      return;
    }

    // E - Whirlwind Spin (360° range, 2 dmg, 1.5s cooldown, 1s stun, 50% slower animation)
    if (Phaser.Input.Keyboard.JustDown(this.keyE)) {
      if (this.canTriggerSpecialAction() && this.cooldownE <= 0) {
        this.triggerWhirlwind();
      }
      return;
    }

    // R - Overhead Strike (narrow cone, 1.5x pummel dmg: 3 Yi / 6 Zed, 3s cooldown)
    if (Phaser.Input.Keyboard.JustDown(this.keyR)) {
      if (this.canTriggerSpecialAction() && this.cooldownR <= 0) {
        this.triggerOverhead();
      }
      return;
    }

    // V - Pummel (narrow cone, double dmg: 2 Yi / 4 Zed, 1.5s cooldown)
    if (Phaser.Input.Keyboard.JustDown(this.keyV)) {
      if (this.canTriggerSpecialAction() && this.cooldownV <= 0) {
        this.triggerPummel();
      }
      return;
    }

    // X - Light Orb (thrown projectile, unlocked every 1500 pts, 5s cd)
    if (Phaser.Input.Keyboard.JustDown(this.keyX)) {
      if (this.canTriggerSpecialAction() && this.pointsTowardsX >= this.REQ_POINTS_X && this.cooldownX <= 0) {
        this.triggerLightOrb();
      }
      return;
    }

    if (Phaser.Input.Keyboard.JustDown(this.keyB)) {
      this.actionDir = (this.currentAimDir + 4) % 8;
      this.currentAction = 'turn';
      this.playDirectional('180Turn', this.currentAimDir, false);
      return;
    }

    // U - Concentric Shockwaves (unlocked every 10000 pts, 10s cd)
    if (Phaser.Input.Keyboard.JustDown(this.keyU)) {
      if (this.canTriggerSpecialAction() && this.pointsTowardsU >= this.REQ_POINTS_U && this.cooldownU <= 0) {
        this.triggerShockwave();
      }
      return;
    }

    this.handleShieldBlock();
  }

  private canTriggerSpecialAction(): boolean {
    return (
      !this.isDead &&
      this.currentAction !== 'roll' &&
      this.currentAction !== 'flip' &&
      this.currentAction !== 'slide' &&
      this.currentAction !== 'die' &&
      this.currentAction !== 'attack' &&
      this.currentAction !== 'kick' &&
      this.currentAction !== 'pummel' &&
      this.currentAction !== 'special1' &&
      this.currentAction !== 'spell'
    );
  }

  private triggerKick() {
    this.attackComboStep = 0;
    this.cooldownQ = this.maxCooldownQ;
    this.actionDir = this.currentAimDir;
    this.currentAction = 'kick';
    this.playDirectional('Kick', this.currentAimDir, false);
    this.scheduleAttackHitCheck(140, KICK_PROFILE);
  }

  private triggerWhirlwind() {
    this.attackComboStep = 0;
    this.cooldownE = this.maxCooldownE;
    this.actionDir = this.currentAimDir;
    this.currentAction = 'attack';
    this.playDirectional('MeleeSpin', this.currentAimDir, false);
    this.scheduleAttackHitCheck(280, WHIRLWIND_PROFILE);
  }

  private triggerPummel() {
    this.attackComboStep = 0;
    this.cooldownV = this.maxCooldownV;
    this.actionDir = this.currentAimDir;
    this.currentAction = 'pummel';
    this.playDirectional('Pummel', this.currentAimDir, false);
    this.scheduleAttackHitCheck(160, PUMMEL_PROFILE);
  }

  private triggerOverhead() {
    this.attackComboStep = 0;
    this.cooldownR = this.maxCooldownR;
    this.actionDir = this.currentAimDir;
    this.currentAction = 'special1';
    this.playDirectional('Special1', this.currentAimDir, false);
    this.scheduleAttackHitCheck(190, OVERHEAD_PROFILE);
  }

  // -----------------------------------------------------------------
  // ABILITY X: LIGHT ORB (THROWN PROJECTILE)
  // -----------------------------------------------------------------
  private triggerLightOrb() {
    this.pointsTowardsX = 0;
    this.cooldownX = this.maxCooldownX;
    this.attackComboStep = 0;
    this.actionDir = this.currentAimDir;
    this.currentAction = 'spell';
    this.playDirectional('CastSpell', this.currentAimDir, false);

    // Ball travel parameters in 2.5D perspective
    const dirRad = Phaser.Math.DegToRad(this.actionDir * 45);
    const speed = 190; // Slower mystical projectile speed so it is clearly visible
    const vx = Math.cos(dirRad) * speed;
    const vy = Math.sin(dirRad) * speed * 0.85; // 2.5D vertical perspective compression

    // 8-direction mapping for orb spritesheet (0=N, 1=NE, 2=E, 3=SE, 4=S, 5=SW, 6=W, 7=NW)
    // actionDir: 0=E, 1=SE, 2=S, 3=SW, 4=W, 5=NW, 6=N, 7=NE
    // Flipped 180 degrees so the head leads and the tail trails behind
    const orbDir = (this.actionDir + 6) % 8;

    // Spawn ball from knight's forward hand position
    const startX = this.player.x + Math.cos(dirRad) * 28;
    const startY = this.player.y + Math.sin(dirRad) * 28 * 0.85 - 14;

    const orbSprite = this.add.sprite(startX, startY, ORB_CONFIG.key, orbDir * ORB_CONFIG.frames);
    orbSprite.setScale(ORB_CONFIG.visualScale);
    orbSprite.setOrigin(ORB_CONFIG.originX, ORB_CONFIG.originY);
    orbSprite.play(`${ORB_CONFIG.key}_fly_${orbDir}`);
    orbSprite.setDepth(startY + 15);

    // 2.5D ground shadow underneath the floating orb (scaled to match orb size)
    const shadow = this.add.ellipse(startX, startY + 13, 32, 16, 0x000000, 0.4);
    shadow.setDepth(DEPTH.groundDecal + 15);

    this.activeOrbs.push({
      sprite: orbSprite,
      shadow,
      vx,
      vy,
      distTraveled: 0,
      active: true,
    });
  }

  private updateLightOrbs(dt: number) {
    if (this.activeOrbs.length === 0) return;

    const toRemove: LightOrb[] = [];

    for (const orb of this.activeOrbs) {
      if (!orb.active) {
        toRemove.push(orb);
        continue;
      }

      // Step position
      const moveX = orb.vx * dt;
      const moveY = orb.vy * dt;
      orb.sprite.x += moveX;
      orb.sprite.y += moveY;
      orb.distTraveled += Math.hypot(moveX, moveY);

      // Follow shadow and depth
      orb.shadow.x = orb.sprite.x;
      orb.shadow.y = orb.sprite.y + 13;
      orb.sprite.setDepth(orb.sprite.y + 15);

      // Check collision with monsters (tight hitbox: requires orb to get much closer)
      const orbGroundY = orb.sprite.y + 12;
      const hitEnemies: Enemy[] = [];
      const orbRadius = 10;

      for (const enemy of this.enemies) {
        if (enemy.isDead) continue;
        const dx = enemy.x - orb.sprite.x;
        const dy = (enemy.y - orbGroundY) / 0.85;
        const enemyHitbox = enemy.championType === 'Zed' ? 14 : 10;
        if (Math.hypot(dx, dy) <= orbRadius + enemyHitbox) {
          hitEnemies.push(enemy);
        }
      }

      if (hitEnemies.length > 0) {
        // Also damage any monsters clustered directly in the splash area on impact
        const splashRadius = 32;
        const damageTargets = new Set<Enemy>(hitEnemies);
        for (const enemy of this.enemies) {
          if (enemy.isDead || damageTargets.has(enemy)) continue;
          const dx = enemy.x - orb.sprite.x;
          const dy = (enemy.y - orbGroundY) / 0.85;
          const enemyHitbox = enemy.championType === 'Zed' ? 14 : 10;
          if (Math.hypot(dx, dy) <= splashRadius + enemyHitbox) {
            damageTargets.add(enemy);
          }
        }

        let hasKills = false;
        for (const enemy of damageTargets) {
          const killed = enemy.takeDamage(
            orb.sprite.x,
            orb.sprite.y,
            this.env.area,
            10,
            50,
            0.8,
          );
          if (killed) {
            hasKills = true;
            this.onEnemyDefeated(enemy, 'X');
          }
        }
        if (hasKills) {
          this.enemies = this.enemies.filter((e) => !e.isDead);
        }
        this.detonateOrb(orb);
        toRemove.push(orb);
        continue;
      }

      // Check bound collision after minimum flight distance (to clear initial cast footprint)
      if (orb.distTraveled >= 35) {
        const isOutOfWalkable = this.env?.area ? !this.env.area.contains(orb.sprite.x, orb.sprite.y) : false;
        const isOutOfBounds =
          orb.sprite.x < 15 ||
          orb.sprite.x > this.level.world.width - 15 ||
          orb.sprite.y < 15 ||
          orb.sprite.y > this.level.world.height - 15;

        if (isOutOfWalkable || isOutOfBounds) {
          this.detonateOrb(orb);
          toRemove.push(orb);
          continue;
        }
      }
    }

    if (toRemove.length > 0) {
      this.activeOrbs = this.activeOrbs.filter((o) => !toRemove.includes(o));
    }
  }

  private detonateOrb(orb: LightOrb) {
    orb.active = false;
    if (orb.shadow) {
      orb.shadow.destroy();
    }

    const x = orb.sprite.x;
    const y = orb.sprite.y;

    // Flash white and disappear
    orb.sprite.setTintFill(0xffffff);

    this.tweens.add({
      targets: orb.sprite,
      scaleX: orb.sprite.scaleX * 1.35,
      scaleY: orb.sprite.scaleY * 1.35,
      alpha: 0,
      duration: 120,
      ease: 'Cubic.easeOut',
      onComplete: () => {
        orb.sprite.destroy();
      },
    });

    // 2.5D white burst ring on the floor (scaled to match orb size)
    const burstGfx = this.add.graphics();
    burstGfx.setDepth(y + 16);
    burstGfx.lineStyle(3, 0xffffff, 0.95);
    burstGfx.strokeEllipse(x, y + 6, 52, 52 * 0.75);

    this.tweens.add({
      targets: burstGfx,
      scaleX: 1.3,
      scaleY: 1.3,
      alpha: 0,
      duration: 160,
      ease: 'Quad.easeOut',
      onComplete: () => burstGfx.destroy(),
    });
  }

  // -----------------------------------------------------------------
  // ABILITY U: CONCENTRIC SHOCKWAVES (PIXELATED & 2:1 PERSPECTIVE)
  // -----------------------------------------------------------------
  private triggerShockwave() {
    this.pointsTowardsU = 0;
    this.cooldownU = this.maxCooldownU;
    this.attackComboStep = 0;

    // The player cannot move during this ability
    this.actionDir = this.currentAimDir;
    this.currentAction = 'spell';
    this.actionVelocity.set(0, 0);
    this.isCastingShockwave = true;
    this.playDirectional('Special2', this.currentAimDir, false);

    // Shockwave center at player's ground contact
    const originX = this.player.x;
    const originY = this.player.y + 6;

    // Calculate maximum radius to spread until hitting the edge of the map (2:1 ground perspective)
    const corners = [
      { x: 0, y: 0 },
      { x: this.level.world.width, y: 0 },
      { x: 0, y: this.level.world.height },
      { x: this.level.world.width, y: this.level.world.height },
    ];
    let maxDistToMapEdge = 0;
    for (const c of corners) {
      const d = Math.hypot(c.x - originX, (c.y - originY) / 0.5);
      if (d > maxDistToMapEdge) maxDistToMapEdge = d;
    }
    const maxRadius = Math.ceil(maxDistToMapEdge) + 120;

    // Spawn three circles 0.35 seconds after each (t=0s, 0.35s, 0.70s)
    // Slower speed (210 px/s) * 0.35s spawn interval = ~74px between ring centers
    // With 26px ring thickness, this maintains a prominent ~48px gap between concentric circles
    for (let i = 0; i < 3; i++) {
      this.time.delayedCall(i * 350, () => {
        if (this.isDead) return;
        this.spawnShockwaveRing(originX, originY, maxRadius);
      });
    }

    // Immobilize player until casting sequence completes (1000ms)
    this.time.delayedCall(1000, () => {
      this.isCastingShockwave = false;
      if (!this.isDead && this.currentAction === 'spell') {
        this.currentAction = 'idle';
      }
    });
  }

  private spawnShockwaveRing(cx: number, cy: number, maxRadius: number) {
    const gfx = this.add.graphics();
    gfx.setDepth(DEPTH.groundDecal + 25);
    gfx.setBlendMode(Phaser.BlendModes.ADD);

    this.activeShockwaves.push({
      centerX: cx,
      centerY: cy,
      radius: 14,
      speed: 210, // Slower expansion speed matching pixel art RPG style
      maxRadius,
      hitEnemies: new Set<Enemy>(),
      gfx,
      active: true,
    });
  }

  /**
   * Initializes a static byte grid of the level world at 3px resolution.
   * Marks playable floor areas as 1, and walls / obstacles / props / occlusions as 0.
   */
  private initFloorGrid() {
    const scale = this.FLOOR_GRID_SCALE;
    const gw = Math.ceil(this.level.world.width / scale);
    const gh = Math.ceil(this.level.world.height / scale);
    this.floorGridW = gw;
    this.floorGridH = gh;
    this.floorGrid = new Uint8Array(gw * gh);

    const canvas = document.createElement('canvas');
    canvas.width = gw;
    canvas.height = gh;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 1. Fill entire screen / map area (shockwave spreads across entire screen)
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, gw, gh);

    // 2. Cut out all blockers, props, and occlusions
    ctx.globalCompositeOperation = 'destination-out';
    if (this.env && this.env.area) {
      for (const blocker of this.env.area.blockers) {
        if (blocker.length < 3) continue;
        ctx.beginPath();
        ctx.moveTo(blocker[0][0] / scale, blocker[0][1] / scale);
        for (let i = 1; i < blocker.length; i++) {
          ctx.lineTo(blocker[i][0] / scale, blocker[i][1] / scale);
        }
        ctx.closePath();
        ctx.fill();
      }
    }

    // Read pixel data into fast lookup array
    const imgData = ctx.getImageData(0, 0, gw, gh);
    const data = imgData.data;
    for (let i = 0; i < gw * gh; i++) {
      this.floorGrid[i] = data[i * 4 + 3] > 128 ? 1 : 0;
    }
  }

  private isFloorPlayable(worldX: number, worldY: number): boolean {
    if (!this.floorGrid) return true;
    const gx = Math.floor(worldX / this.FLOOR_GRID_SCALE);
    const gy = Math.floor(worldY / this.FLOOR_GRID_SCALE);
    if (gx < 0 || gx >= this.floorGridW || gy < 0 || gy >= this.floorGridH) {
      return false;
    }
    return this.floorGrid[gy * this.floorGridW + gx] === 1;
  }

  /**
   * Rasterize a thick, pixelated ellipse snapped to a discrete pixel grid (pSize)
   * in 2:1 isometric ground perspective (ry = rx * 0.5) matching the sprites,
   * clipped so it disappears at the edges of the playable area and does not go over props/occlusions.
   */
  private drawPixelEllipse(
    gfx: Phaser.GameObjects.Graphics,
    cx: number,
    cy: number,
    rMid: number,
    thickness: number,
    pSize: number,
    color: number,
    alpha: number,
  ) {
    const rIn = Math.max(0, rMid - thickness / 2);
    const rOut = rMid + thickness / 2;
    const ryOut = rOut * 0.5;
    const ryIn = rIn * 0.5;

    const qMaxY = Math.ceil(ryOut / pSize);
    gfx.fillStyle(color, alpha);

    for (let qy = -qMaxY; qy <= qMaxY; qy++) {
      const yWorld = cy + qy * pSize;
      const yRel = Math.abs(qy * pSize);

      if (yRel > ryOut) continue;

      const xOut = rOut * Math.sqrt(Math.max(0, 1.0 - (yRel / ryOut) ** 2));
      const xIn = yRel < ryIn && ryIn > 0 ? rIn * Math.sqrt(Math.max(0, 1.0 - (yRel / ryIn) ** 2)) : 0;

      const qxOut = Math.round(xOut / pSize) * pSize;
      const qxIn = Math.round(xIn / pSize) * pSize;

      if (qxOut <= qxIn) continue;

      const steps = Math.round((qxOut - qxIn) / pSize);

      // Render right side (+x) and left side (-x) clipped to playable floor & props
      for (const side of [1, -1]) {
        let spanStartX: number | null = null;
        let spanLen = 0;

        for (let s = 0; s < steps; s++) {
          const curDist = qxIn + s * pSize;
          const px = side === 1 ? cx + curDist : cx - curDist - pSize;

          if (this.isFloorPlayable(px + pSize * 0.5, yWorld + pSize * 0.5)) {
            if (spanStartX === null) {
              spanStartX = px;
              spanLen = pSize;
            } else {
              if (side === 1) {
                spanLen += pSize;
              } else {
                spanStartX = px;
                spanLen += pSize;
              }
            }
          } else {
            if (spanStartX !== null) {
              gfx.fillRect(spanStartX, yWorld, spanLen, pSize);
              spanStartX = null;
              spanLen = 0;
            }
          }
        }

        if (spanStartX !== null) {
          gfx.fillRect(spanStartX, yWorld, spanLen, pSize);
        }
      }
    }
  }

  private updateShockwaves(dt: number) {
    if (this.activeShockwaves.length === 0) return;

    const toRemove: ShockwaveRing[] = [];
    let hasKills = false;

    for (const ring of this.activeShockwaves) {
      if (!ring.active) {
        toRemove.push(ring);
        continue;
      }

      // Expand ring radius at slower speed
      ring.radius += ring.speed * dt;

      // When the circle reaches the edge of the map, destroy it
      if (ring.radius >= ring.maxRadius) {
        ring.gfx.destroy();
        ring.active = false;
        toRemove.push(ring);
        continue;
      }

      // Draw concentric, thick, pixelated ellipse in 2:1 ground perspective
      ring.gfx.clear();

      // Dynamic alpha that fades slightly as it reaches maximum map distance
      const lifeFrac = ring.radius / ring.maxRadius;
      const alpha = lifeFrac > 0.85 ? (1 - lifeFrac) / 0.15 : 1.0;

      // 1. Outer radiant blue aura border (26px thick, 3px pixel block grid)
      this.drawPixelEllipse(ring.gfx, ring.centerX, ring.centerY, ring.radius, 26, 3, 0x3b82f6, 0.72 * alpha);

      // 2. Inner brilliant white energy core (14px thick, 3px pixel block grid)
      this.drawPixelEllipse(ring.gfx, ring.centerX, ring.centerY, ring.radius, 14, 3, 0xffffff, 0.98 * alpha);

      // Check collision with alive enemies (2:1 isometric ground perspective)
      // Every circle deals 5 damage to monsters as the shockwave reaches them
      for (const enemy of this.enemies) {
        if (enemy.isDead || ring.hitEnemies.has(enemy)) continue;

        const dx = enemy.x - ring.centerX;
        const dy = (enemy.y - ring.centerY) / 0.5; // 2:1 ground perspective
        const dist = Math.hypot(dx, dy);

        // Enemy is hit when the expanding thick ring sweeps over them
        if (dist <= ring.radius + 15 && dist >= ring.radius - 28) {
          ring.hitEnemies.add(enemy);
          const killed = enemy.takeDamage(
            ring.centerX,
            ring.centerY,
            this.env.area,
            5,
            34,
            0.5,
          );
          if (killed) {
            hasKills = true;
            this.onEnemyDefeated(enemy, 'U');
          }
        }
      }
    }

    if (hasKills) {
      this.enemies = this.enemies.filter((e) => !e.isDead);
    }

    if (toRemove.length > 0) {
      this.activeShockwaves = this.activeShockwaves.filter((r) => !toRemove.includes(r));
    }
  }

  private handleShieldBlock() {
    const pointer = this.input.activePointer;

    if (pointer.rightButtonDown()) {
      if (this.currentAction !== 'block') {
        this.currentAction = 'block';
        this.playDirectional('ShieldBlockStart', this.currentAimDir, false);
      } else {
        this.playDirectional('ShieldBlockMid', this.currentAimDir, true);
      }
    } else if (this.currentAction === 'block') {
      this.currentAction = 'idle';
    }
  }

  // -----------------------------------------------------------------
  // ATTACKS & COMBOS (LEFT CLICK)
  // -----------------------------------------------------------------
  private triggerAttack() {
    if (
      this.isDead ||
      this.currentAction === 'roll' ||
      this.currentAction === 'flip' ||
      this.currentAction === 'slide' ||
      this.currentAction === 'die' ||
      this.currentAction === 'kick' ||
      this.currentAction === 'pummel' ||
      this.currentAction === 'special1'
    ) {
      return;
    }

    const moveVector = this.getMovementInput();
    const isRunning = moveVector.lengthSq() > 0 && this.keyShift.isDown && !this.keyC.isDown;

    if (isRunning && this.sprintTimer >= this.SPRINT_REQ) {
      // Sprint Attack (Shift + WASD + LMB): 360° range, 2 damage Yi / 4 damage Zed
      this.sprintTimer = 0;
      this.attackComboStep = 0;
      this.actionDir = this.currentAimDir;
      this.currentAction = 'attack';
      this.playDirectional('MeleeRun', this.currentAimDir, false);
      this.scheduleAttackHitCheck(120, SPRINT_ATTACK_PROFILE);
      return;
    }

    // Left Click Combo Attack (Melee -> Melee2 -> MeleeSpin): 90° cone, 1 damage
    this.sprintTimer = 0;
    if (this.comboResetTimer) {
      this.comboResetTimer.remove();
    }

    let nextAnim = 'Melee';
    let hitDelay = 130;
    if (this.attackComboStep === 1) {
      nextAnim = 'Melee2';
      hitDelay = 130;
      this.attackComboStep = 2;
    } else if (this.attackComboStep === 2) {
      nextAnim = 'MeleeSpin';
      hitDelay = 280; // Slower MeleeSpin (13 FPS)
      this.attackComboStep = 0;
    } else {
      nextAnim = 'Melee';
      hitDelay = 130;
      this.attackComboStep = 1;
    }

    this.actionDir = this.currentAimDir;
    this.currentAction = 'attack';
    this.playDirectional(nextAnim, this.currentAimDir, false);
    this.scheduleAttackHitCheck(hitDelay, BASIC_ATTACK_PROFILE);

    this.comboResetTimer = this.time.delayedCall(1200, () => {
      this.attackComboStep = 0;
    });
  }

  private triggerRoll() {
    if (this.currentAction === 'roll') return;

    const moveVector = this.getMovementInput();
    if (moveVector.lengthSq() > 0) {
      this.actionDir = this.computeMoveDirection(moveVector.x, moveVector.y);
      this.actionVelocity.copy(moveVector).scale(this.ROLL_SPEED);
    } else {
      this.actionDir = this.currentAimDir;
      const rad = Phaser.Math.DegToRad(this.actionDir * 45);
      this.actionVelocity.set(Math.cos(rad) * this.ROLL_SPEED, Math.sin(rad) * this.ROLL_SPEED);
    }

    this.currentAction = 'roll';
    this.playDirectional('Rolling', this.actionDir, false);
  }

  private triggerFlip() {
    if (this.currentAction === 'flip') return;

    this.actionDir = this.currentAimDir;
    const rad = Phaser.Math.DegToRad(this.actionDir * 45);
    this.actionVelocity.set(Math.cos(rad) * this.FLIP_SPEED, Math.sin(rad) * this.FLIP_SPEED);

    this.currentAction = 'flip';
    this.playDirectional('FrontFlip', this.actionDir, false);
  }

  private triggerSlide() {
    if (this.currentAction === 'slide') return;

    const moveVector = this.getMovementInput();
    if (moveVector.lengthSq() > 0) {
      this.actionDir = this.computeMoveDirection(moveVector.x, moveVector.y);
      this.actionVelocity.copy(moveVector).scale(this.SLIDE_SPEED);
    } else {
      this.actionDir = this.currentAimDir;
      const rad = Phaser.Math.DegToRad(this.actionDir * 45);
      this.actionVelocity.set(Math.cos(rad) * this.SLIDE_SPEED, Math.sin(rad) * this.SLIDE_SPEED);
    }

    this.currentAction = 'slide';
    this.playDirectional('SlideStart', this.actionDir, false);
  }

  private flashPlayerHurt() {
    this.player.setTintFill(0xff4d4d);
    this.time.delayedCall(110, () => {
      if (!this.isDead) {
        this.player.clearTint();
      }
    });
  }

  private die() {
    this.isDead = true;
    this.currentAction = 'die';
    this.actionVelocity.set(0, 0);
    this.sprintTimer = 0;
    this.isCastingShockwave = false;

    for (const orb of this.activeOrbs) {
      if (orb.shadow) orb.shadow.destroy();
      if (orb.sprite) orb.sprite.destroy();
    }
    this.activeOrbs = [];
    for (const ring of this.activeShockwaves) {
      if (ring.gfx) ring.gfx.destroy();
    }
    this.activeShockwaves = [];

    this.playDirectional('Die', this.currentAimDir, false);
    this.player.setDepth(DEPTH.groundDecal + 100 + this.player.y * 0.001);

    // Fade out combat UI
    const hudTargets: Phaser.GameObjects.GameObject[] = [];
    if (this.healthContainer) hudTargets.push(this.healthContainer);
    if (this.cooldownContainer) hudTargets.push(this.cooldownContainer);
    if (this.lightLevelText) hudTargets.push(this.lightLevelText);
    if (this.cornerWaveText) hudTargets.push(this.cornerWaveText);
    if (this.scoreText) hudTargets.push(this.scoreText);
    for (const p of this.killPopups) {
      if (p.text) hudTargets.push(p.text);
    }

    if (hudTargets.length > 0) {
      this.tweens.add({
        targets: hudTargets,
        alpha: 0,
        duration: 800,
      });
    }

    // Fade background to all black
    const { width, height } = this.scale;
    const fadeOverlay = this.add
      .rectangle(width / 2, height / 2, width * 4, height * 4, 0x000000)
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(DEPTH.screen + 1)
      .setAlpha(0);

    this.tweens.add({
      targets: fadeOverlay,
      alpha: 1,
      duration: 1200,
      ease: 'Power2',
    });

    // Darken environment
    this.blackPoint = -0.50;
    this.applyBlackPoint();

    this.time.delayedCall(400, () => {
      this.announceWave('FALLEN', 'The shadows consume you', true);
    });
  }

  private playOneShotAction(animBase: string, actionState: ActionState) {
    this.actionDir = this.currentAimDir;
    this.currentAction = actionState;
    this.playDirectional(animBase, this.currentAimDir, false);
  }

  private scheduleAttackHitCheck(delayMs: number, profile: AttackProfile) {
    this.time.delayedCall(delayMs, () => {
      if (this.isDead || this.currentAction === 'die') return;
      this.checkPlayerAttackHit(profile);
    });
  }

  private checkPlayerAttackHit(profile: AttackProfile) {
    if (this.enemies.length === 0 || this.isDead) return;

    let hasKills = false;

    for (const enemy of this.enemies) {
      if (enemy.isDead) continue;

      const dx = enemy.x - this.player.x;
      const dy = enemy.y - this.player.y;
      const dist = Math.hypot(dx, dy);

      // Player melee attack range
      if (dist > profile.reach) continue;

      // Cannot hit enemies through solid walls/blockers (e.g. through the central altar)
      if (this.env.area && !this.env.area.hasLineOfSight(this.player.x, this.player.y, enemy.x, enemy.y, 8)) {
        continue;
      }

      let isHit = false;
      if (profile.is360) {
        // 360-degree hit radius around the player
        isHit = true;
      } else {
        // Check angle relative to player facing direction
        const angleToEnemy = Math.atan2(dy, dx);
        let degToEnemy = Phaser.Math.RadToDeg(angleToEnemy);
        if (degToEnemy < 0) degToEnemy += 360;

        const playerFacingDeg = this.currentAimDir * 45;
        let diff = Math.abs(degToEnemy - playerFacingDeg);
        if (diff > 180) diff = 360 - diff;

        if (diff <= profile.halfAngleDeg) {
          isHit = true;
        }
      }

      if (isHit) {
        const dmg = enemy.championType === 'Zed' ? profile.damageZed : profile.damageYi;
        const killed = enemy.takeDamage(
          this.player.x,
          this.player.y,
          this.env.area,
          dmg,
          profile.knockbackDist,
          profile.stunDuration,
        );
        if (killed) {
          hasKills = true;
          this.onEnemyDefeated(enemy, 'normal');
        }
      }
    }

    if (hasKills) {
      this.enemies = this.enemies.filter((e) => !e.isDead);
    }
  }

  private resolveEnemyCollisions() {
    const aliveEnemies: Enemy[] = [];
    for (let i = 0; i < this.enemies.length; i++) {
      const e = this.enemies[i];
      if (!e.isDead) {
        aliveEnemies.push(e);
      }
    }
    const count = aliveEnemies.length;

    // 1. Enemy-to-enemy soft-rigid separation (allow a small overlap factor of 0.82)
    // 2 passes for smooth, stable settling
    for (let p = 0; p < 2; p++) {
      for (let i = 0; i < count; i++) {
        const e1 = aliveEnemies[i];
        const r1 = e1.getCollisionRadius();

        for (let j = i + 1; j < count; j++) {
          const e2 = aliveEnemies[j];
          const r2 = e2.getCollisionRadius();

          let dx = e2.x - e1.x;
          let dy = (e2.y - e1.y) / 0.8; // Isometric Y squashing
          let dist = Math.hypot(dx, dy);

          // Allow a small overlap (0.82 factor)
          const targetMinDist = (r1 + r2) * 0.82;

          if (dist < targetMinDist) {
            if (dist < 0.001) {
              const angle = Math.random() * Math.PI * 2;
              dx = Math.cos(angle);
              dy = Math.sin(angle);
              dist = 1;
            }

            const overlap = targetMinDist - dist;
            const nx = dx / dist;
            const ny = dy / dist;

            const pushMag = (overlap * 0.5) / 2;
            const px = nx * pushMag;
            const py = ny * pushMag * 0.8;

            e1.pushBody(-px, -py, this.env.area);
            e2.pushBody(px, py, this.env.area);
          }
        }
      }
    }

    // 2. Enemy-to-player standoff (enemies maintain small distance from player, close enough to attack)
    for (let i = 0; i < count; i++) {
      const e = aliveEnemies[i];
      let dx = e.x - this.player.x;
      let dy = (e.y - this.player.y) / 0.8;
      let dist = Math.hypot(dx, dy);

      const minPlayerDist = e.stopDistance * 0.85;

      if (dist < minPlayerDist) {
        if (dist < 0.001) {
          const angle = Math.random() * Math.PI * 2;
          dx = Math.cos(angle);
          dy = Math.sin(angle);
          dist = 1;
        }

        const overlap = minPlayerDist - dist;
        const nx = dx / dist;
        const ny = dy / dist;
        const px = nx * overlap;
        const py = ny * overlap * 0.8;

        e.pushBody(px, py, this.env.area);
      }
    }
  }

  private checkEnemyAttackHit(dt: number) {
    if (this.enemyHitCooldown > 0) {
      this.enemyHitCooldown -= dt;
      return;
    }

    if (this.enemies.length === 0 || this.isDead) return;

    for (const enemy of this.enemies) {
      if (enemy.isDead || enemy.isStumbling || !enemy.isPerformingAttack()) continue;

      const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, enemy.x, enemy.y);
      if (dist > 75) continue;

      // Invulnerable during rolls or flips
      if (this.currentAction === 'roll' || this.currentAction === 'flip') {
        return;
      }

      // Shield block active: absorb impact, reset enemy cooldown, no damage taken
      if (this.currentAction === 'block') {
        const rad = Math.atan2(this.player.y - enemy.y, this.player.x - enemy.x);
        this.movePlayer(Math.cos(rad) * 16, Math.sin(rad) * 16);
        enemy.resetAttackCooldown();
        this.enemyHitCooldown = 0.5;
        return;
      }

      // Player takes damage without stun: Yi deals 1 (1s cd), Zed deals 5 (0.75s cd)
      this.damagePlayer(enemy.attackDamage);
      enemy.resetAttackCooldown();
      this.flashPlayerHurt();
      this.enemyHitCooldown = enemy.championType === 'Zed' ? 0.35 : 0.6;
      return;
    }
  }

  // -----------------------------------------------------------------
  // LOCOMOTION & WASD MOVEMENT IN ANY DIRECTION
  // -----------------------------------------------------------------
  private getMovementInput(): Phaser.Math.Vector2 {
    let mx = 0;
    let my = 0;

    if (this.keyW.isDown) my -= 1;
    if (this.keyS.isDown) my += 1;
    if (this.keyA.isDown) mx -= 1;
    if (this.keyD.isDown) mx += 1;

    const v = new Phaser.Math.Vector2(mx, my);
    if (v.lengthSq() > 0) {
      v.normalize();
    }
    return v;
  }

  private movePlayer(dx: number, dy: number) {
    if (!this.env || !this.env.area) {
      this.player.x += dx;
      this.player.y += dy;
      return;
    }
    const pos = this.env.area.move(
      this.player.x,
      this.player.y,
      dx,
      dy,
      BALANCE.level1FootRadiusX,
      BALANCE.level1FootRadiusY,
    );
    this.player.x = pos.x;
    this.player.y = pos.y;
  }

  private handleLocomotion(dt: number) {
    const moveInput = this.getMovementInput();
    const hasMoveInput = moveInput.lengthSq() > 0;

    // Fixed momentum actions (roll, flip, slide)
    if (
      this.currentAction === 'roll' ||
      this.currentAction === 'flip' ||
      this.currentAction === 'slide'
    ) {
      this.movePlayer(this.actionVelocity.x * dt, this.actionVelocity.y * dt);

      if (this.currentAction === 'slide') {
        this.actionVelocity.scale(0.975);
      }
      return;
    }

    // Attacks allow running momentum
    if (this.currentAction === 'attack') {
      if (this.player.anims.currentAnim?.key.startsWith('MeleeRun_') && hasMoveInput) {
        this.movePlayer(
          moveInput.x * (this.RUN_SPEED * 0.75) * dt,
          moveInput.y * (this.RUN_SPEED * 0.75) * dt * 0.85,
        );
      }
      return;
    }

    // Block movement
    if (this.currentAction === 'block') {
      if (hasMoveInput) {
        this.movePlayer(
          moveInput.x * this.BLOCK_SPEED * dt,
          moveInput.y * this.BLOCK_SPEED * dt * 0.85,
        );
      }
      return;
    }

    // Other non-interruptible actions
    if (
      this.currentAction === 'kick' ||
      this.currentAction === 'pummel' ||
      this.currentAction === 'spell' ||
      this.currentAction === 'special1' ||
      this.currentAction === 'turn' ||
      this.currentAction === 'unsheath'
    ) {
      return;
    }

    // Free Movement in any direction
    if (hasMoveInput) {
      this.currentAction = 'moving';

      const isCrouching = this.keyC.isDown;
      const isSprinting = this.keyShift.isDown && !isCrouching;

      const speed = isCrouching
        ? this.CROUCH_SPEED
        : isSprinting
          ? this.RUN_SPEED
          : this.WALK_SPEED;

      this.movePlayer(
        moveInput.x * speed * dt,
        moveInput.y * speed * dt * 0.85,
      );

      // Sprite aims whichever way it moves (8 directions)
      this.currentAimDir = this.computeMoveDirection(moveInput.x, moveInput.y);

      const targetAnim = isCrouching
        ? 'CrouchRun'
        : isSprinting
          ? 'Run'
          : 'Walk';

      this.playDirectional(targetAnim, this.currentAimDir, true);
    } else {
      this.currentAction = 'idle';

      const isCrouching = this.keyC.isDown;
      const idleAnim = isCrouching ? 'CrouchIdle' : 'Idle';

      this.playDirectional(idleAnim, this.currentAimDir, true);
    }
  }
}
