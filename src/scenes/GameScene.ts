import Phaser from 'phaser';
import { Enemy } from '../entities/Enemy';
import { Level1Environment, DEPTH } from '../environment/Level1Environment';
import { Atmosphere } from '../effects/Atmosphere';
import { LEVEL1 } from '../environment/level1Data';
import type { LevelData } from '../environment/levelTypes';
import { BALANCE } from '../config/balance';
import { ChampionType, ORB_CONFIG } from '../config/championAnimations';
import { ColorCurvePipeline } from '../shaders/ColorCurvePipeline';

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

interface CooldownRowItem {
  key: string;
  name: string;
  maxCd: number;
  icon?: Phaser.GameObjects.Image | Phaser.GameObjects.Sprite;
  keyText: Phaser.GameObjects.Text;
  statusText: Phaser.GameObjects.Text;
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
  private hpText!: Phaser.GameObjects.Text;

  // Brightening & Black Point / White Point Mechanic
  public blackPoint = -0.50; // -0.50 to +0.35 (-50% to +35%)
  public targetBlackPoint = -0.50;
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
  private scoreContainer!: Phaser.GameObjects.Container;
  private scoreBannerGfx!: Phaser.GameObjects.Graphics;
  private scoreText!: Phaser.GameObjects.Text;
  private scoreDetailsText!: Phaser.GameObjects.Text;
  private killPopups: {
    text: Phaser.GameObjects.Text;
    timerEvent?: Phaser.Time.TimerEvent;
    slideTween?: Phaser.Tweens.Tween;
  }[] = [];
  private waveAnnounceTitle: Phaser.GameObjects.Text | null = null;
  private waveAnnounceSub: Phaser.GameObjects.Text | null = null;

  // Ability Cooldown Bars (Bottom-Right)
  private cooldownContainer?: Phaser.GameObjects.Container;
  private cooldownBarsGfx?: Phaser.GameObjects.Graphics;
  private cooldownRows: CooldownRowItem[] = [];

  // Ability U separate HUD bar (Bottom-Center)
  private uContainer?: Phaser.GameObjects.Container;
  private uFrameImage?: Phaser.GameObjects.Image;
  private uBarGfx?: Phaser.GameObjects.Graphics;
  private uText?: Phaser.GameObjects.Text;
  private uBadgeText?: Phaser.GameObjects.Text;

  // Boss Health Bar (Level 3 - Executioner)
  private bossEnemy?: Enemy;
  private bossHealthContainer?: Phaser.GameObjects.Container;
  private bossHpBgGfx?: Phaser.GameObjects.Graphics;
  private bossHpFillGfx?: Phaser.GameObjects.Graphics;
  private bossHpText?: Phaser.GameObjects.Text;
  private bossTitleText?: Phaser.GameObjects.Text;

  // Controls Tutorial Popup (Level 1)
  private controlsPopupContainer?: Phaser.GameObjects.Container;
  private isControlsPopupOpen = false;

  // Ability Cooldowns & Sprint Running Timer
  public cooldownDash = 0;
  public readonly maxCooldownDash = 1.0;
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

  // Ability U (Concentric Shockwaves): unlocked every 7500 points (75% of original), 10s cooldown
  public readonly REQ_POINTS_U = 7500;
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

  // Audio state
  private battleMusic?: Phaser.Sound.BaseSound;
  private heartbeatSound?: Phaser.Sound.BaseSound;
  private lastShockwaveHitTime = 0;

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

  init() {
    this.resetSceneState();
  }

  private resetSceneState() {
    this.lightLevelText = undefined as unknown as Phaser.GameObjects.Text;
    this.scoreText = undefined as unknown as Phaser.GameObjects.Text;
    this.scoreDetailsText = undefined as unknown as Phaser.GameObjects.Text;
    this.scoreContainer = undefined as unknown as Phaser.GameObjects.Container;
    this.healthContainer = undefined as unknown as Phaser.GameObjects.Container;
    this.uContainer = undefined;
    this.uFrameImage = undefined;
    this.cooldownContainer = undefined;
    this.cornerWaveText = undefined as unknown as Phaser.GameObjects.Text;
    this.hpBgGfx = undefined as unknown as Phaser.GameObjects.Graphics;
    this.hpFillGfx = undefined as unknown as Phaser.GameObjects.Graphics;
    this.hpText = undefined as unknown as Phaser.GameObjects.Text;
    this.uBarGfx = undefined;
    this.uText = undefined;
    this.uBadgeText = undefined;
    if (this.bossHealthContainer) {
      this.bossHealthContainer.destroy();
      this.bossHealthContainer = undefined;
    }
    this.bossEnemy = undefined;
    this.bossHpBgGfx = undefined;
    this.bossHpFillGfx = undefined;
    this.bossHpText = undefined;
    this.bossTitleText = undefined;
    this.controlsPopupContainer = undefined;
    this.isControlsPopupOpen = false;
    this.cooldownBarsGfx = undefined;
    this.blackPointOverlay = undefined as unknown as Phaser.GameObjects.Rectangle;
    this.whitePointDarkOverlay = undefined as unknown as Phaser.GameObjects.Rectangle;
    this.killPopups = [];
    this.enemies = [];
    this.waveGroupEnemies = [];
    this.waveTimerEvents = [];
    this.activeOrbs = [];
    this.activeShockwaves = [];
    this.cooldownRows = [];
    this.score = 0;
    this.health = this.maxHealth;
    this.timeSinceLastDamage = this.REGEN_DELAY;
    this.isDead = false;
    this.isCastingShockwave = false;
    this.attackComboStep = 0;
    this.enemyHitCooldown = 0;
    this.sprintTimer = 0;
    this.cooldownDash = 0;
    this.cooldownQ = 0;
    this.cooldownE = 0;
    this.cooldownV = 0;
    this.cooldownR = 0;
    this.cooldownX = 0;
    this.cooldownU = 0;
    this.pointsTowardsX = 0;
    this.pointsTowardsU = 0;
    this.currentAction = 'idle';
    this.actionVelocity.set(0, 0);
    Enemy.currentTeleporter = null;
    if (this.heartbeatSound) {
      this.heartbeatSound.stop();
      this.heartbeatSound.destroy();
      this.heartbeatSound = undefined;
    }
    this.lastShockwaveHitTime = 0;
  }

  create() {
    this.resetSceneState();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.stopAllCombatAudio();
      this.resetSceneState();
    });

    this.startBattleMusic();

    this.cameras.main.setBackgroundColor('#000000');
    this.input.mouse?.disableContextMenu();

    const initialLight = this.level.initialLightLevel ?? (this.level.id === 'level3' ? 0.20 : this.level.id === 'level2' ? -0.10 : -0.50);
    this.blackPoint = initialLight;
    this.targetBlackPoint = initialLight;

    // Build environment and atmosphere
    this.env = new Level1Environment(this, this.level);
    this.atmosphere = new Atmosphere(this, this.level);
    this.atmosphere.create();
    this.initFloorGrid();

    // Setup Black Point overlay (modifies background only, depth = DEPTH.base + 0.1)
    this.createBlackPointOverlay();
    this.applyBlackPoint();

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
    this.setupUBar();
    this.setupWaveUI();
    this.setupCooldownHUD();
    if (this.level.id === 'level1') {
      this.showControlsPopup();
    } else {
      this.showTitleCard();
      // Start Wave Progression
      this.startWave(1);
    }

    // Debug mode (?debug in URL)
    if (new URLSearchParams(window.location.search).has('debug')) {
      this.debugOn = true;
      this.env.setDebug(true);
      (window as unknown as Record<string, unknown>).__level1 = this;
    }
  }

  // -----------------------------------------------------------------
  // COMBAT AUDIO MANAGEMENT
  // -----------------------------------------------------------------
  private startBattleMusic() {
    const playMusic = () => {
      if (this.isDead) return;
      this.sound.stopByKey('menumusic');
      this.sound.stopByKey('victory');

      const existing = this.sound.getAll('battleMusic');
      for (const b of existing) {
        if (b.isPlaying) {
          this.battleMusic = b;
          return;
        }
      }

      this.battleMusic = this.sound.add('battleMusic', { loop: true, volume: 0.40 });
      this.battleMusic.play();
    };

    if (this.sound.locked) {
      this.sound.once(Phaser.Sound.Events.UNLOCKED, playMusic);
    } else {
      playMusic();
    }
  }

  private stopAllCombatAudio() {
    if (this.heartbeatSound) {
      this.heartbeatSound.stop();
      this.heartbeatSound.destroy();
      this.heartbeatSound = undefined;
    }
    if (this.battleMusic) {
      this.battleMusic.stop();
      this.battleMusic.destroy();
      this.battleMusic = undefined;
    }
    this.sound.stopByKey('battleMusic');
    this.sound.stopByKey('heartbeat');
    this.sound.stopByKey('victory');
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
    const isWebGL = this.renderer instanceof Phaser.Renderer.WebGL.WebGLRenderer;
    if (isWebGL) {
      this.blackPointOverlay?.setAlpha(0);
      this.whitePointDarkOverlay?.setAlpha(0);
    } else {
      if (this.blackPoint >= 0) {
        this.blackPointOverlay?.setAlpha(this.blackPoint);
        this.whitePointDarkOverlay?.setAlpha(0);
      } else {
        this.blackPointOverlay?.setAlpha(0);
        this.whitePointDarkOverlay?.setAlpha(Math.abs(this.blackPoint));
      }
    }

    if (this.env) {
      this.env.setBlackPoint(this.blackPoint);
    } else {
      ColorCurvePipeline.setLightLevel(this.blackPoint);
    }

    if (this.lightLevelText && this.lightLevelText.scene && this.lightLevelText.active) {
      const pct = Math.round(this.blackPoint * 100);
      const sign = pct > 0 ? '+' : '';
      this.lightLevelText.setText(`LIGHT ${sign}${pct}%`);
    }
    this.updateScoreUI();
  }

  private updateBlackPoint(dt: number) {
    const baseLight = this.level.initialLightLevel ?? -0.50;
    const hasAliveEnemies = this.enemies.some((e) => !e.isDead);
    if (hasAliveEnemies) {
      // Decrease light level by 1% (0.01) per second when enemies are present
      this.targetBlackPoint = Math.max(baseLight, this.targetBlackPoint - 0.01 * dt);
    }
    this.targetBlackPoint = Phaser.Math.Clamp(this.targetBlackPoint, -0.50, 0.35);

    // Smoothly interpolate towards targetBlackPoint (frame-rate independent smooth transition)
    const prevBlackPoint = this.blackPoint;
    const lerpFactor = 1 - Math.exp(-3.5 * dt);
    this.blackPoint = Phaser.Math.Linear(this.blackPoint, this.targetBlackPoint, lerpFactor);

    if (Math.abs(this.blackPoint - this.targetBlackPoint) < 0.0005) {
      this.blackPoint = this.targetBlackPoint;
    }

    if (Math.abs(this.blackPoint - prevBlackPoint) > 0.00005) {
      this.applyBlackPoint();
    }
  }

  public getBlackPoint(): number {
    return this.blackPoint;
  }

  public getTargetBlackPoint(): number {
    return this.targetBlackPoint;
  }

  /**
   * Set custom control points (x0, y0), (x1, y1) and exponent directly on the grayscale color-curve filter.
   */
  public setColorCurveFilter(x0: number, y0: number, x1: number, y1: number, exponent = 1.0): void {
    ColorCurvePipeline.setControlPoints(x0, y0, x1, y1, exponent);
  }

  public getColorCurveFilter(): { x0: number; y0: number; x1: number; y1: number; exponent: number } {
    return {
      x0: ColorCurvePipeline.x0,
      y0: ColorCurvePipeline.y0,
      x1: ColorCurvePipeline.x1,
      y1: ColorCurvePipeline.y1,
      exponent: ColorCurvePipeline.exponent,
    };
  }

  // -----------------------------------------------------------------
  // -----------------------------------------------------------------
  // -----------------------------------------------------------------
  // -----------------------------------------------------------------
  // PIXELATED & SHADED HEALTH BAR (BOTTOM-LEFT)
  // -----------------------------------------------------------------
  private setupHealthBar() {
    const { width, height } = this.scale;
    const z = BALANCE.level1CameraZoom;
    const toCamX = (x: number) => width / 2 + (x - width / 2) / z;
    const toCamY = (y: number) => height / 2 + (y - height / 2) / z;

    // Anchor at bottom-left
    this.healthContainer = this.add.container(toCamX(28), toCamY(height - 40));
    this.healthContainer.setScale(1 / z).setScrollFactor(0).setDepth(DEPTH.screen + 10);

    this.hpBgGfx = this.add.graphics();
    this.hpFillGfx = this.add.graphics();

    // Keybind/badge [ HP ] on left
    const badgeGfx = this.add.graphics();
    badgeGfx.fillStyle(0x000000, 1.0);
    badgeGfx.fillRect(0, 0, 32, 18);
    badgeGfx.lineStyle(1.5, 0xffffff, 1.0);
    badgeGfx.strokeRect(0, 0, 32, 18);

    const badgeText = this.add.text(16, 9, 'HP', {
      fontFamily: '"Cinzel", "Georgia", serif',
      fontSize: '11px',
      fontStyle: 'bold',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 2,
    }).setOrigin(0.5, 0.5);

    // Centered health numbers
    this.hpText = this.add.text(38 + 100, 9, `100 / 100`, {
      fontFamily: '"Cinzel", "Georgia", serif',
      fontSize: '11px',
      fontStyle: 'bold',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 3,
      letterSpacing: 1,
    }).setOrigin(0.5, 0.5);

    this.healthContainer.add([this.hpBgGfx, this.hpFillGfx, badgeGfx, badgeText, this.hpText]);

    this.drawHealthBar();
  }

  private drawHealthBar() {
    if (!this.hpBgGfx || !this.hpFillGfx) return;

    const barX = 38;
    const barY = 0;
    const barW = 200;
    const barH = 18;
    const frac = Phaser.Math.Clamp(this.health / this.maxHealth, 0, 1);

    this.hpBgGfx.clear();

    // 1. Pixelated Stepped Black & White Frame
    this.hpBgGfx.fillStyle(0x000000, 1.0);
    this.hpBgGfx.fillRect(barX, barY, barW, barH);
    this.hpBgGfx.lineStyle(2, 0xffffff, 1.0);
    this.hpBgGfx.strokeRect(barX, barY, barW, barH);
    this.hpBgGfx.lineStyle(1, 0xffffff, 0.4);
    this.hpBgGfx.strokeRect(barX - 1, barY - 1, barW + 2, barH + 2);

    // Inner empty slot (pure black)
    this.hpBgGfx.fillStyle(0x000000, 1.0);
    this.hpBgGfx.fillRect(barX + 2, barY + 2, barW - 4, barH - 4);

    // 2. Pixelated Solid White Fill with Black Segment Notches
    this.hpFillGfx.clear();
    const maxInnerW = barW - 4;
    const innerW = Math.round(maxInnerW * frac);

    if (innerW > 0) {
      const fx = barX + 2;
      const fy = barY + 2;
      const fh = barH - 4; // 14px

      this.hpFillGfx.fillStyle(0xffffff, 1.0);
      this.hpFillGfx.fillRect(fx, fy, innerW, fh);

      // Segment tick notches every 20px (10 segments)
      this.hpFillGfx.fillStyle(0x000000, 1.0);
      for (let s = 20; s < innerW; s += 20) {
        this.hpFillGfx.fillRect(fx + s, fy, 2, fh);
      }
    }

    if (this.hpText) {
      this.hpText.setText(`${Math.max(0, Math.ceil(this.health))} / ${this.maxHealth}`);
      this.hpText.setColor('#ffffff');
      this.hpText.setStroke('#000000', 3);
    }

    this.updateHeartbeat();
  }

  private updateHeartbeat() {
    const isLowHp = this.health <= 25 && !this.isDead;
    if (isLowHp) {
      if (!this.heartbeatSound) {
        this.heartbeatSound = this.sound.add('heartbeat', { loop: true, volume: 0.70 });
        this.heartbeatSound.play();
      } else if (!this.heartbeatSound.isPlaying) {
        this.heartbeatSound.play();
      }
    } else {
      if (this.heartbeatSound && this.heartbeatSound.isPlaying) {
        this.heartbeatSound.stop();
      }
    }
  }

  // -----------------------------------------------------------------
  // BOSS HEALTH BAR & TITLE (LEVEL 3 - EXECUTIONER)
  // -----------------------------------------------------------------
  private setupBossHealthBar() {
    if (this.bossHealthContainer) {
      this.bossHealthContainer.destroy();
    }

    const { width, height } = this.scale;
    const z = BALANCE.level1CameraZoom;
    const toCamX = (x: number) => width / 2 + (x - width / 2) / z;
    const toCamY = (y: number) => height / 2 + (y - height / 2) / z;

    const barW = 460;
    const barH = 14;

    const container = this.add.container(toCamX(width / 2), toCamY(30));
    this.bossHealthContainer = container;
    container.setScale(1 / z).setScrollFactor(0).setDepth(DEPTH.screen + 10).setAlpha(0);

    this.bossHpBgGfx = this.add.graphics();
    this.bossHpFillGfx = this.add.graphics();

    // Text "EXECUTIONER" positioned directly below the health bar
    this.bossTitleText = this.add.text(0, barH + 9, 'EXECUTIONER', {
      fontFamily: '"Cinzel", "Georgia", serif',
      fontSize: '13px',
      fontStyle: 'bold',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 3,
      letterSpacing: 6,
    }).setOrigin(0.5, 0);

    // HP readout text centered inside the health bar
    this.bossHpText = this.add.text(0, barH / 2, '', {
      fontFamily: '"Cinzel", "Georgia", serif',
      fontSize: '9.5px',
      fontStyle: 'bold',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 3,
      letterSpacing: 1,
    }).setOrigin(0.5, 0.5);

    container.add([this.bossHpBgGfx, this.bossHpFillGfx, this.bossTitleText, this.bossHpText]);

    this.drawBossHealthBar();
  }

  private drawBossHealthBar() {
    if (!this.bossHpBgGfx || !this.bossHpFillGfx || !this.bossEnemy) return;

    const barW = 460;
    const barH = 14;
    const halfW = barW / 2;

    const maxHp = this.bossEnemy.maxHp || 60;
    const currentHp = Math.max(0, this.bossEnemy.currentHp);
    const frac = Phaser.Math.Clamp(currentHp / maxHp, 0, 1);

    this.bossHpBgGfx.clear();

    // 1. Gothic Black & White Ironplate Frame
    this.bossHpBgGfx.fillStyle(0x000000, 1.0);
    this.bossHpBgGfx.fillRect(-halfW - 3, -2, barW + 6, barH + 4);

    this.bossHpBgGfx.lineStyle(1.5, 0xffffff, 1.0);
    this.bossHpBgGfx.strokeRect(-halfW - 3, -2, barW + 6, barH + 4);
    this.bossHpBgGfx.lineStyle(1, 0xffffff, 0.4);
    this.bossHpBgGfx.strokeRect(-halfW - 4, -3, barW + 8, barH + 6);

    // End diamond accents in pure white
    for (const dx of [-halfW - 5, halfW + 5]) {
      this.bossHpBgGfx.fillStyle(0xffffff, 1.0);
      this.bossHpBgGfx.beginPath();
      this.bossHpBgGfx.moveTo(dx, barH / 2 - 4);
      this.bossHpBgGfx.lineTo(dx + (dx > 0 ? 4 : -4), barH / 2);
      this.bossHpBgGfx.lineTo(dx, barH / 2 + 4);
      this.bossHpBgGfx.lineTo(dx - (dx > 0 ? 4 : -4), barH / 2);
      this.bossHpBgGfx.closePath();
      this.bossHpBgGfx.fillPath();
    }

    // Inner empty slot (pure black)
    this.bossHpBgGfx.fillStyle(0x000000, 1.0);
    this.bossHpBgGfx.fillRect(-halfW, 0, barW, barH);

    // 2. Pure White Boss Fill with Black Notches
    this.bossHpFillGfx.clear();
    const innerW = Math.round(barW * frac);

    if (innerW > 0) {
      const fx = -halfW;
      const fy = 0;
      const fh = barH;

      this.bossHpFillGfx.fillStyle(0xffffff, 1.0);
      this.bossHpFillGfx.fillRect(fx, fy, innerW, fh);

      // Segment tick notches every 35px
      this.bossHpFillGfx.fillStyle(0x000000, 1.0);
      for (let s = 35; s < innerW; s += 35) {
        this.bossHpFillGfx.fillRect(fx + s, fy, 2, fh);
      }
    }

    // 3. HP Text Readout
    if (this.bossHpText) {
      this.bossHpText.setText(`${Math.max(0, Math.ceil(currentHp))} / ${maxHp}`);
      this.bossHpText.setColor('#ffffff');
      this.bossHpText.setStroke('#000000', 3);
    }
  }

  // -----------------------------------------------------------------
  // -----------------------------------------------------------------
  // ORNATE ULTIMATE BAR (U) WITH TRANSPARENT MIDDLE CUTOUT
  // -----------------------------------------------------------------
  // Frame natural dimensions: 2172 x 724
  // Transparent slot: x=615, y=344, w=1325, h=78
  // Orb medallion center: x=340, y=367
  private readonly U_BAR_SCALE = 0.23;

  private setupUBar() {
    const { width, height } = this.scale;
    const z = BALANCE.level1CameraZoom;
    const toCamX = (x: number) => width / 2 + (x - width / 2) / z;
    const toCamY = (y: number) => height / 2 + (y - height / 2) / z;

    const scale = this.U_BAR_SCALE;
    const slotX = Math.round(615 * scale);  // 141
    const slotY = Math.round(344 * scale);  // 79
    const slotW = Math.round(1325 * scale); // 305
    const slotH = Math.round(78 * scale);   // 18

    const orbX = Math.round(340 * scale);   // 78
    const orbY = Math.round(367 * scale);   // 84

    const slotCenterX = slotX + slotW / 2;  // ~294
    const slotCenterY = slotY + slotH / 2;  // ~88

    const frameH = Math.round(724 * scale); // ~167

    // Center horizontally and push bar up so bottom filigree sits 18px above screen bottom (not cut off)
    const screenX = Math.round(width / 2 - slotCenterX);
    const screenY = Math.round(height - 18 - frameH);

    const container = this.add.container(toCamX(screenX), toCamY(screenY));
    this.uContainer = container;
    container.setScale(1 / z).setScrollFactor(0).setDepth(DEPTH.screen + 10);

    // 1. Graphics for fill, background & glow (drawn behind the ornate frame)
    this.uBarGfx = this.add.graphics();

    // 2. Ornate frame image (drawn on top of graphics)
    this.uFrameImage = this.add.image(0, 0, 'ultimate_bar')
      .setOrigin(0, 0)
      .setScale(scale);

    // 3. Keybind badge text [ U ] centered on the circular orb medallion
    this.uBadgeText = this.add.text(orbX, orbY, 'U', {
      fontFamily: '"Cinzel", "Georgia", serif',
      fontSize: '15px',
      fontStyle: 'bold',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5, 0.5);

    // 4. Status / readout text centered in the transparent slot
    this.uText = this.add.text(slotCenterX, slotCenterY, '', {
      fontFamily: '"Cinzel", "Georgia", serif',
      fontSize: '10px',
      fontStyle: 'bold',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 3,
      letterSpacing: 1,
    }).setOrigin(0.5, 0.5);

    container.add([this.uBarGfx, this.uFrameImage, this.uBadgeText, this.uText]);

    this.updateUBar();
  }

  private updateUBar() {
    if (!this.uBarGfx || !this.uText) return;

    this.uBarGfx.clear();

    const scale = this.U_BAR_SCALE;
    const slotX = Math.round(615 * scale);  // 141
    const slotY = Math.round(344 * scale);  // 79
    const slotW = Math.round(1325 * scale); // 305
    const slotH = Math.round(78 * scale);   // 18
    const orbX = Math.round(340 * scale);   // 78
    const orbY = Math.round(367 * scale);   // 84

    const isLocked = this.pointsTowardsU < this.REQ_POINTS_U;
    const isOnCooldown = this.cooldownU > 0;
    const isReady = !isLocked && !isOnCooldown;

    let frac = 1.0;
    if (isOnCooldown) {
      frac = Phaser.Math.Clamp(1 - this.cooldownU / this.maxCooldownU, 0, 1);
    } else if (isLocked) {
      frac = Phaser.Math.Clamp(this.pointsTowardsU / this.REQ_POINTS_U, 0, 1);
    }

    // 1. Outer Backing Glow / Plate (behind frame)
    if (isReady) {
      // Crisp white highlight aura behind orb medallion & slot
      this.uBarGfx.fillStyle(0xffffff, 0.22);
      this.uBarGfx.fillCircle(orbX, orbY, 44);
      this.uBarGfx.fillStyle(0xffffff, 0.25);
      this.uBarGfx.fillRoundedRect(slotX - 3, slotY - 3, slotW + 6, slotH + 6, 4);

      if (this.uBadgeText) {
        this.uBadgeText.setColor('#ffffff');
        this.uBadgeText.setStroke('#000000', 3);
        this.uBadgeText.setShadow(0, 0, '#ffffff', 8, true, true);
      }
    } else {
      if (this.uBadgeText) {
        this.uBadgeText.setColor('#ffffff');
        this.uBadgeText.setStroke('#000000', 3);
        this.uBadgeText.setShadow(0, 0, '#000000', 0, false, false);
      }
    }

    // 2. Pure Black Slot Inset Background (under the transparent cutout)
    this.uBarGfx.fillStyle(0x000000, 1.0);
    this.uBarGfx.fillRect(slotX, slotY, slotW, slotH);

    // 3. Pixelated Solid White Fill with Black Notches
    const innerW = Math.round(slotW * frac);
    if (innerW > 0) {
      const fx = slotX;
      const fy = slotY;
      const fh = slotH;

      // Solid pure white ink fill
      this.uBarGfx.fillStyle(0xffffff, 1.0);
      this.uBarGfx.fillRect(fx, fy, innerW, fh);

      // Vertical black tick notches every 25px
      this.uBarGfx.fillStyle(0x000000, 1.0);
      for (let s = 25; s < innerW; s += 25) {
        this.uBarGfx.fillRect(fx + s, fy, 2, fh);
      }
    }

    // 4. Text Display
    if (isReady) {
      this.uText.setText('✦   NOVA READY — PRESS [U]   ✦');
      this.uText.setColor('#ffffff');
      this.uText.setStroke('#000000', 3);
      this.uText.setFontSize('10.5px');
      this.uText.setShadow(0, 0, '#ffffff', 6, true, true);
    } else if (isOnCooldown) {
      this.uText.setText(`RECHARGING  ✦  ${this.cooldownU.toFixed(1)}s`);
      this.uText.setColor('#ffffff');
      this.uText.setStroke('#000000', 3);
      this.uText.setFontSize('10px');
      this.uText.setShadow(0, 0, '#000000', 0, false, false);
    } else {
      this.uText.setText(`NOVA  ✦  ${Math.round(this.pointsTowardsU).toLocaleString()} / ${this.REQ_POINTS_U.toLocaleString()} PTS`);
      this.uText.setColor('#ffffff');
      this.uText.setStroke('#000000', 3);
      this.uText.setFontSize('10px');
      this.uText.setShadow(0, 0, '#000000', 0, false, false);
    }
  }

  // -----------------------------------------------------------------
  // LEVEL 1 CONTROLS CODEX POPUP MODAL
  // -----------------------------------------------------------------
  private showControlsPopup() {
    this.isControlsPopupOpen = true;

    const { width, height } = this.scale;
    const z = BALANCE.level1CameraZoom;
    const toCamX = (x: number) => width / 2 + (x - width / 2) / z;
    const toCamY = (y: number) => height / 2 + (y - height / 2) / z;

    const popupContainer = this.add.container(toCamX(width / 2), toCamY(height / 2));
    this.controlsPopupContainer = popupContainer;
    popupContainer.setScale(1 / z).setScrollFactor(0).setDepth(DEPTH.screen + 100);

    // 1. Semi-transparent backdrop overlay to dim the ruins
    const backdrop = this.add.rectangle(0, 0, width * 3, height * 3, 0x000000, 0.78);
    backdrop.setInteractive();

    // 2. Main Parchment/Codex Tablet Dimensions
    const panelW = 760;
    const panelH = 510;

    const panelGfx = this.add.graphics();
    panelGfx.fillStyle(0x000000, 0.96);
    panelGfx.fillRoundedRect(-panelW / 2, -panelH / 2, panelW, panelH, 8);

    panelGfx.fillStyle(0x000000, 0.85);
    panelGfx.fillRoundedRect(-panelW / 2 + 6, -panelH / 2 + 6, panelW - 12, panelH - 12, 6);

    panelGfx.lineStyle(2, 0xffffff, 1.0);
    panelGfx.strokeRoundedRect(-panelW / 2, -panelH / 2, panelW, panelH, 8);
    panelGfx.lineStyle(1, 0xffffff, 0.45);
    panelGfx.strokeRoundedRect(-panelW / 2 + 4, -panelH / 2 + 4, panelW - 8, panelH - 8, 6);

    // Corner rivets
    const corners = [
      [-panelW / 2 + 10, -panelH / 2 + 10],
      [panelW / 2 - 10, -panelH / 2 + 10],
      [-panelW / 2 + 10, panelH / 2 - 10],
      [panelW / 2 - 10, panelH / 2 - 10],
    ];
    panelGfx.fillStyle(0xffffff, 1.0);
    for (const [cx, cy] of corners) {
      panelGfx.fillCircle(cx, cy, 2.5);
    }

    // Vertical divider line
    panelGfx.lineStyle(1, 0xffffff, 0.6);
    panelGfx.lineBetween(0, -panelH / 2 + 80, 0, panelH / 2 - 68);

    // Top Header
    const titleText = this.add.text(0, -panelH / 2 + 32, '❖   WARRIOR\'S CODEX   ❖', {
      fontFamily: '"Cinzel Decorative", "Cinzel", "Georgia", serif',
      fontSize: '25px',
      fontStyle: 'bold',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 3,
      letterSpacing: 4,
    }).setOrigin(0.5, 0.5);

    const subText = this.add.text(0, -panelH / 2 + 62, 'ANCIENT COMBAT ARTS & SACRED COMMANDS', {
      fontFamily: '"Cinzel", "Georgia", serif',
      fontSize: '11px',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 2,
      letterSpacing: 3,
    }).setOrigin(0.5, 0.5);

    // Columns Content
    const colLeftX = -panelW / 2 + 32;
    const colRightX = 28;
    const startY = -panelH / 2 + 96;

    // --- LEFT COLUMN ---
    const leftHeader1 = this.add.text(colLeftX, startY, '◆   MOVEMENT & EVASION   ◆', {
      fontFamily: '"Cinzel", "Georgia", serif',
      fontSize: '13px',
      fontStyle: 'bold',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 2,
      letterSpacing: 1,
    });

    const leftItems = [
      { key: 'W, A, S, D', title: 'Locomotion', desc: 'Move in 8 directions through the ruins.' },
      { key: 'SHIFT', title: 'Sprint', desc: 'Hold while running to surge into full sprint.' },
      { key: 'SPACE', title: 'Evasive Dash', desc: 'Quick roll with invulnerability (i-frames).' },
      { key: 'C', title: 'Shield Guard', desc: 'Absorb and deflect incoming frontal attacks.' },
    ];

    let curY = startY + 24;
    const leftTextObjs: Phaser.GameObjects.Text[] = [leftHeader1];

    leftItems.forEach(item => {
      const t = this.add.text(colLeftX, curY, `[ ${item.key} ]  ${item.title}\n   ↳ ${item.desc}`, {
        fontFamily: '"Cinzel", "Georgia", serif',
        fontSize: '11px',
        color: '#ffffff',
        stroke: '#000000',
        strokeThickness: 2,
        lineSpacing: 3,
      });
      leftTextObjs.push(t);
      curY += 34;
    });

    curY += 8;
    const leftHeader2 = this.add.text(colLeftX, curY, '◆   RADIANT POWERS   ◆', {
      fontFamily: '"Cinzel", "Georgia", serif',
      fontSize: '13px',
      fontStyle: 'bold',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 2,
      letterSpacing: 1,
    });
    leftTextObjs.push(leftHeader2);
    curY += 24;

    const powerItems = [
      { key: 'X', title: 'Light Orb', desc: 'Piercing radiant sphere. Unlocks at 1,500 pts.' },
      { key: 'U', title: 'Celestial Nova', desc: 'Arena-wide shockwaves. Unlocks at 7,500 pts.' },
    ];

    powerItems.forEach(item => {
      const t = this.add.text(colLeftX, curY, `[ ${item.key} ]  ${item.title}\n   ↳ ${item.desc}`, {
        fontFamily: '"Cinzel", "Georgia", serif',
        fontSize: '11px',
        color: '#ffffff',
        stroke: '#000000',
        strokeThickness: 2,
        lineSpacing: 3,
      });
      leftTextObjs.push(t);
      curY += 34;
    });

    // --- RIGHT COLUMN ---
    const rightHeader1 = this.add.text(colRightX, startY, '◆   BLADE & MARTIAL ARTS   ◆', {
      fontFamily: '"Cinzel", "Georgia", serif',
      fontSize: '13px',
      fontStyle: 'bold',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 2,
      letterSpacing: 1,
    });

    const martialItems = [
      { key: 'LMB', title: 'Sword Strikes', desc: 'Fluid combination chain slashing foes in front.' },
      { key: 'Q', title: 'Thrusting Kick', desc: 'Fast kick delivering heavy knockback recoil.' },
      { key: 'E', title: 'Whirlwind Flurry', desc: '360° spin hitting all foes and stunning them.' },
      { key: 'V', title: 'Pummel', desc: 'Heavy blunt strike that staggers and stuns.' },
      { key: 'R', title: 'Overhead Cleave', desc: 'Crushing executioner downward slam.' },
    ];

    let curRightY = startY + 24;
    const rightTextObjs: Phaser.GameObjects.Text[] = [rightHeader1];

    martialItems.forEach(item => {
      const t = this.add.text(colRightX, curRightY, `[ ${item.key} ]  ${item.title}\n   ↳ ${item.desc}`, {
        fontFamily: '"Cinzel", "Georgia", serif',
        fontSize: '11px',
        color: '#ffffff',
        stroke: '#000000',
        strokeThickness: 2,
        lineSpacing: 3,
      });
      rightTextObjs.push(t);
      curRightY += 34;
    });

    curRightY += 6;
    const rightHeader2 = this.add.text(colRightX, curRightY, '◆   LIGHT & DARKNESS   ◆', {
      fontFamily: '"Cinzel", "Georgia", serif',
      fontSize: '13px',
      fontStyle: 'bold',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 2,
      letterSpacing: 1,
    });
    rightTextObjs.push(rightHeader2);
    curRightY += 22;

    const veilText = this.add.text(colRightX, curRightY, '✦ Slaying shadow monsters restores radiance (+%).\n✦ Shadows roaming the field deepen the darkness.\n   Purge the darkness before the ruins fall!', {
      fontFamily: '"Cinzel", "Georgia", serif',
      fontSize: '10.5px',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 2,
      lineSpacing: 3,
    });
    rightTextObjs.push(veilText);

    // --- UNDERSTOOD BUTTON ---
    const btnY = panelH / 2 - 36;
    const btnW = 260;
    const btnH = 42;

    const btnContainer = this.add.container(0, btnY);
    const btnGfx = this.add.graphics();
    btnGfx.fillStyle(0x000000, 1.0);
    btnGfx.fillRoundedRect(-btnW / 2, -btnH / 2, btnW, btnH, 6);
    btnGfx.lineStyle(1.5, 0xffffff, 1.0);
    btnGfx.strokeRoundedRect(-btnW / 2, -btnH / 2, btnW, btnH, 6);

    const btnText = this.add.text(0, 0, '✦   UNDERSTOOD   ✦', {
      fontFamily: '"Cinzel", "Georgia", serif',
      fontSize: '16px',
      fontStyle: 'bold',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 2,
      letterSpacing: 3,
    }).setOrigin(0.5, 0.5);

    const hitZone = this.add.zone(0, 0, btnW, btnH).setOrigin(0.5, 0.5).setInteractive({ cursor: 'pointer' });
    btnContainer.add([btnGfx, btnText, hitZone]);

    const onUnderstood = () => {
      if (!this.isControlsPopupOpen) return;
      this.isControlsPopupOpen = false;

      this.tweens.add({
        targets: popupContainer,
        alpha: 0,
        duration: 300,
        ease: 'Power2',
        onComplete: () => {
          popupContainer.destroy();
          this.controlsPopupContainer = undefined;
          this.showTitleCard();
          this.startWave(1);
        },
      });
    };

    hitZone.on('pointerover', () => {
      btnGfx.clear();
      btnGfx.fillStyle(0xffffff, 1.0);
      btnGfx.fillRoundedRect(-btnW / 2, -btnH / 2, btnW, btnH, 6);
      btnGfx.lineStyle(2, 0xffffff, 1.0);
      btnGfx.strokeRoundedRect(-btnW / 2, -btnH / 2, btnW, btnH, 6);
      btnText.setColor('#000000');
      btnText.setStroke('#ffffff', 0);
      btnText.setShadow(0, 0, '#ffffff', 8, true, true);
    });

    hitZone.on('pointerout', () => {
      btnGfx.clear();
      btnGfx.fillStyle(0x000000, 1.0);
      btnGfx.fillRoundedRect(-btnW / 2, -btnH / 2, btnW, btnH, 6);
      btnGfx.lineStyle(1.5, 0xffffff, 1.0);
      btnGfx.strokeRoundedRect(-btnW / 2, -btnH / 2, btnW, btnH, 6);
      btnText.setColor('#ffffff');
      btnText.setStroke('#000000', 2);
      btnText.setShadow(0, 0, '#000000', 0, false, false);
    });

    hitZone.on('pointerdown', onUnderstood);

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Enter' || e.code === 'Space') {
        window.removeEventListener('keydown', onKeyDown);
        onUnderstood();
      }
    };
    window.addEventListener('keydown', onKeyDown, { once: true });

    popupContainer.add([
      backdrop,
      panelGfx,
      titleText,
      subText,
      ...leftTextObjs,
      ...rightTextObjs,
      btnContainer,
    ]);
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
        fontFamily: '"Cinzel Decorative", "Cinzel", "Georgia", serif',
        fontSize: '68px',
        fontStyle: 'bold',
        color: '#ffffff',
        stroke: '#000000',
        strokeThickness: 4,
      })
      .setOrigin(0.5)
      .setScale(1 / z)
      .setLetterSpacing(12)
      .setScrollFactor(0)
      .setDepth(DEPTH.screen + 1)
      .setAlpha(0);

    const sub = this.add
      .text(width / 2, toCamY(height * 0.42 + 56), this.level.subtitle, {
        fontFamily: '"Cinzel", "Georgia", serif',
        fontSize: '20px',
        color: '#ffffff',
        stroke: '#000000',
        strokeThickness: 2,
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

    // Corner wave indicator (top-left) - medieval fantasy gothic banner
    this.cornerWaveText = this.add
      .text(toCamX(36), toCamY(24), '❖   W A V E   I   ❖', {
        fontFamily: '"Cinzel", "Georgia", serif',
        fontSize: '17px',
        fontStyle: 'bold',
        color: '#ffffff',
        stroke: '#000000',
        strokeThickness: 3,
        letterSpacing: 4,
      })
      .setOrigin(0, 0)
      .setScale(1 / z)
      .setScrollFactor(0)
      .setDepth(DEPTH.screen + 10)
      .setAlpha(0.95);

    // --- MEDIEVAL FANTASY POINTS & CURRENCY BAR (Top-Right) ---
    const bannerW = 320;
    const bannerH = 46;
    this.scoreContainer = this.add.container(toCamX(width - bannerW - 28), toCamY(20));
    this.scoreContainer.setScale(1 / z).setScrollFactor(0).setDepth(DEPTH.screen + 10);

    this.scoreBannerGfx = this.add.graphics();

    // Main Points Value Text
    this.scoreText = this.add.text(50, 6, `POINTS 0`, {
      fontFamily: '"Cinzel", "Georgia", serif',
      fontSize: '16px',
      fontStyle: 'bold',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 3,
      letterSpacing: 2,
    }).setOrigin(0, 0);

    // Secondary status line (Light level multiplier and ability readiness)
    const pct = Math.round(this.blackPoint * 100);
    const sign = pct > 0 ? '+' : '';
    this.scoreDetailsText = this.add.text(50, 26, `LIGHT ${sign}${pct}%  ✦  X: 0/1.5k  ❖  U: 0/7.5k`, {
      fontFamily: '"Cinzel", "Georgia", serif',
      fontSize: '10px',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 2,
      letterSpacing: 1,
    }).setOrigin(0, 0);

    // Keep lightLevelText reference for compatibility
    this.lightLevelText = this.add.text(0, 0, '', { fontSize: '1px' }).setVisible(false);

    this.scoreContainer.add([this.scoreBannerGfx, this.scoreText, this.scoreDetailsText]);
    this.drawScoreBanner(bannerW, bannerH);
  }

  private drawScoreBanner(w: number, h: number) {
    this.scoreBannerGfx.clear();

    // Dark gothic banner plate with pointed diamond end caps
    this.scoreBannerGfx.fillStyle(0x000000, 0.90);
    this.scoreBannerGfx.beginPath();
    this.scoreBannerGfx.moveTo(0, h / 2);
    this.scoreBannerGfx.lineTo(12, 0);
    this.scoreBannerGfx.lineTo(w - 12, 0);
    this.scoreBannerGfx.lineTo(w, h / 2);
    this.scoreBannerGfx.lineTo(w - 12, h);
    this.scoreBannerGfx.lineTo(12, h);
    this.scoreBannerGfx.closePath();
    this.scoreBannerGfx.fillPath();

    // Crisp white border
    this.scoreBannerGfx.lineStyle(1.5, 0xffffff, 1.0);
    this.scoreBannerGfx.strokePath();
    this.scoreBannerGfx.lineStyle(1, 0xffffff, 0.4);
    this.scoreBannerGfx.strokePath();

    // Medallion on the left
    const coinCX = 26;
    const coinCY = h / 2;
    const coinR = 14;

    this.scoreBannerGfx.fillStyle(0x000000, 1.0);
    this.scoreBannerGfx.fillCircle(coinCX, coinCY, coinR + 1);
    this.scoreBannerGfx.lineStyle(1.5, 0xffffff, 1.0);
    this.scoreBannerGfx.strokeCircle(coinCX, coinCY, coinR);

    // Embossed star diamond inside coin (pure white)
    this.scoreBannerGfx.fillStyle(0xffffff, 1.0);
    this.scoreBannerGfx.beginPath();
    this.scoreBannerGfx.moveTo(coinCX, coinCY - 6);
    this.scoreBannerGfx.lineTo(coinCX + 5, coinCY);
    this.scoreBannerGfx.lineTo(coinCX, coinCY + 6);
    this.scoreBannerGfx.lineTo(coinCX - 5, coinCY);
    this.scoreBannerGfx.closePath();
    this.scoreBannerGfx.fillPath();
  }

  // -----------------------------------------------------------------
  // MEDIEVAL FANTASY ABILITY COOLDOWN DOCK (BOTTOM-RIGHT)
  // -----------------------------------------------------------------
  private setupCooldownHUD() {
    const { width, height } = this.scale;
    const z = BALANCE.level1CameraZoom;
    const toCamX = (x: number) => width / 2 + (x - width / 2) / z;
    const toCamY = (y: number) => height / 2 + (y - height / 2) / z;

    // 6 ability rows: SPACE, Q, E, V, R, X
    const rowH = 22;
    const rowGap = 4;
    const rowsCount = 6;
    const totalW = 214;
    const totalH = rowsCount * rowH + (rowsCount - 1) * rowGap; // 152px

    const container = this.add.container(toCamX(width - totalW - 24), toCamY(height - totalH - 24));
    this.cooldownContainer = container;
    container.setScale(1 / z).setScrollFactor(0).setDepth(DEPTH.screen + 10);

    // Subtle dark gothic backing plate in crisp black and white
    const bgGfx = this.add.graphics();
    bgGfx.fillStyle(0x000000, 0.90);
    bgGfx.fillRoundedRect(-8, -6, totalW + 16, totalH + 12, 6);
    bgGfx.lineStyle(1.5, 0xffffff, 1.0);
    bgGfx.strokeRoundedRect(-8, -6, totalW + 16, totalH + 12, 6);
    bgGfx.lineStyle(1, 0xffffff, 0.4);
    bgGfx.strokeRoundedRect(-9, -7, totalW + 18, totalH + 14, 7);

    const barsGfx = this.add.graphics();
    this.cooldownBarsGfx = barsGfx;
    container.add([bgGfx, barsGfx]);

    this.cooldownRows = [];

    const abilityDefs = [
      { key: 'SPACE', name: 'Dash', maxCd: this.maxCooldownDash, iconType: 'image' as const, texture: 'icon_dash' },
      { key: 'Q', name: 'Kick', maxCd: this.maxCooldownQ, iconType: 'image' as const, texture: 'icon_kick' },
      { key: 'E', name: 'Whirl', maxCd: this.maxCooldownE, iconType: 'sprite' as const, texture: 'icon_whirlwind', anim: 'anim_icon_whirlwind' },
      { key: 'V', name: 'Pummel', maxCd: this.maxCooldownV, iconType: 'image' as const, texture: 'icon_pummel' },
      { key: 'R', name: 'Overhead', maxCd: this.maxCooldownR, iconType: 'image' as const, texture: 'icon_overhead' },
      { key: 'X', name: 'Orb', maxCd: this.maxCooldownX, iconType: 'sprite' as const, texture: 'orb', anim: 'orb_fly_0' },
    ];

    abilityDefs.forEach((def, i) => {
      const y = i * (rowH + rowGap);
      const iconCX = 10;
      const iconCY = y + rowH / 2;

      let iconObj: Phaser.GameObjects.Image | Phaser.GameObjects.Sprite;
      if (def.iconType === 'sprite') {
        const sprite = this.add.sprite(iconCX, iconCY, def.texture);
        if (def.key === 'E') {
          sprite.setScale(16 / 16, 18 / 19);
        } else if (def.key === 'X') {
          sprite.setScale(18 / 167, 18 / 159);
        }
        if (def.anim && this.anims.exists(def.anim)) {
          sprite.play(def.anim);
        }
        iconObj = sprite;
      } else {
        const img = this.add.image(iconCX, iconCY, def.texture);
        img.setDisplaySize(18, 18);
        iconObj = img;
      }

      // Keybind badge text
      const keyTxt = this.add.text(36, iconCY, def.key, {
        fontFamily: '"Cinzel", "Georgia", serif',
        fontSize: def.key === 'SPACE' ? '8.5px' : '11px',
        fontStyle: 'bold',
        color: '#ffffff',
        stroke: '#000000',
        strokeThickness: 2,
      }).setOrigin(0.5, 0.5);

      // Countdown / status text
      const statusTxt = this.add.text(182, iconCY, 'RDY', {
        fontFamily: '"Cinzel", "Georgia", serif',
        fontSize: '10px',
        fontStyle: 'bold',
        color: '#ffffff',
        stroke: '#000000',
        strokeThickness: 2,
      }).setOrigin(0.5, 0.5);

      container.add([iconObj, keyTxt, statusTxt]);

      this.cooldownRows.push({
        key: def.key,
        name: def.name,
        maxCd: def.maxCd,
        icon: iconObj,
        keyText: keyTxt,
        statusText: statusTxt,
      });
    });

    this.updateCooldownHUD();
  }

  private updateCooldownHUD() {
    const gfx = this.cooldownBarsGfx;
    if (!gfx) return;

    gfx.clear();

    const rowH = 22;
    const rowGap = 4;
    const barX = 54;
    const barW = 98;
    const barH = 10;

    this.cooldownRows.forEach((row, i) => {
      const y = i * (rowH + rowGap);
      const barY = y + 6;

      let frac = 1.0;
      let isReady = true;
      let isLocked = false;
      let statusStr = 'RDY';

      switch (row.key) {
        case 'SPACE':
          frac = Phaser.Math.Clamp(1 - this.cooldownDash / this.maxCooldownDash, 0, 1);
          isReady = this.cooldownDash <= 0;
          statusStr = isReady ? 'RDY' : `${this.cooldownDash.toFixed(1)}s`;
          break;
        case 'Q':
          frac = Phaser.Math.Clamp(1 - this.cooldownQ / this.maxCooldownQ, 0, 1);
          isReady = this.cooldownQ <= 0;
          statusStr = isReady ? 'RDY' : `${this.cooldownQ.toFixed(1)}s`;
          break;
        case 'E':
          frac = Phaser.Math.Clamp(1 - this.cooldownE / this.maxCooldownE, 0, 1);
          isReady = this.cooldownE <= 0;
          statusStr = isReady ? 'RDY' : `${this.cooldownE.toFixed(1)}s`;
          break;
        case 'V':
          frac = Phaser.Math.Clamp(1 - this.cooldownV / this.maxCooldownV, 0, 1);
          isReady = this.cooldownV <= 0;
          statusStr = isReady ? 'RDY' : `${this.cooldownV.toFixed(1)}s`;
          break;
        case 'R':
          frac = Phaser.Math.Clamp(1 - this.cooldownR / this.maxCooldownR, 0, 1);
          isReady = this.cooldownR <= 0;
          statusStr = isReady ? 'RDY' : `${this.cooldownR.toFixed(1)}s`;
          break;
        case 'X':
          isLocked = this.pointsTowardsX < this.REQ_POINTS_X;
          if (isLocked) {
            frac = Phaser.Math.Clamp(this.pointsTowardsX / this.REQ_POINTS_X, 0, 1);
            isReady = false;
            statusStr = `${(this.pointsTowardsX / 1000).toFixed(1)}k`;
          } else if (this.cooldownX > 0) {
            frac = Phaser.Math.Clamp(1 - this.cooldownX / this.maxCooldownX, 0, 1);
            isReady = false;
            statusStr = `${this.cooldownX.toFixed(1)}s`;
          } else {
            frac = 1.0;
            isReady = true;
            statusStr = 'RDY';
          }
          break;
      }

      // 1. Icon frame backing & border
      gfx.fillStyle(0x000000, 1.0);
      gfx.fillRect(0, y + 1, 20, 20);
      gfx.lineStyle(1.5, isReady ? 0xffffff : 0x555555, 1.0);
      gfx.strokeRect(0, y + 1, 20, 20);

      // Icon alpha when on cooldown (leave icons untouched as requested)
      if (row.icon) {
        if (isReady) {
          row.icon.setAlpha(1.0);
          if ('clearTint' in row.icon) (row.icon as Phaser.GameObjects.Image).clearTint();
        } else {
          row.icon.setAlpha(0.40);
          if ('clearTint' in row.icon) (row.icon as Phaser.GameObjects.Image).clearTint();
        }
      }

      // 2. Bar slot frame
      gfx.fillStyle(0x000000, 1.0);
      gfx.fillRect(barX, barY, barW, barH);
      gfx.lineStyle(1, isReady ? 0xffffff : 0x555555, 1.0);
      gfx.strokeRect(barX, barY, barW, barH);

      // 3. Pixelated solid white fill with black notch lines
      const maxInnerW = barW - 2;
      const innerW = Math.round(maxInnerW * frac);
      if (innerW > 0) {
        const fx = barX + 1;
        const fy = barY + 1;
        const fh = barH - 2; // 8px

        // Solid pure white fill matching ink drawings
        gfx.fillStyle(0xffffff, 1.0);
        gfx.fillRect(fx, fy, innerW, fh);

        // Notch lines every 20px
        gfx.fillStyle(0x000000, 1.0);
        for (let s = 20; s < innerW; s += 20) {
          gfx.fillRect(fx + s, fy, 2, fh);
        }
      }

      // 4. Update texts
      row.statusText.setText(statusStr);
      row.keyText.setColor('#ffffff');
      row.statusText.setColor('#ffffff');
      row.keyText.setAlpha(isReady ? 1.0 : 0.6);
      row.statusText.setAlpha(isReady ? 1.0 : 0.8);
    });

    this.updateUBar();
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
        fontFamily: '"Cinzel Decorative", "Cinzel", "Georgia", serif',
        fontSize: '68px',
        fontStyle: 'bold',
        color: '#ffffff',
        stroke: '#000000',
        strokeThickness: 5,
      })
      .setOrigin(0.5)
      .setScale(1 / z)
      .setLetterSpacing(12)
      .setScrollFactor(0)
      .setDepth(DEPTH.screen + 2)
      .setAlpha(0);

    const targets: Phaser.GameObjects.Text[] = [this.waveAnnounceTitle];

    if (subText) {
      this.waveAnnounceSub = this.add
        .text(width / 2, toCamY(height * 0.42 + 56), subText, {
          fontFamily: '"Cinzel", "Georgia", serif',
          fontSize: '20px',
          color: '#ffffff',
          stroke: '#000000',
          strokeThickness: 3,
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

    if (entries && entries.length > 0) {
      // Find the entry (stairs / doorway) whose bearing is closest to the wave's angle
      let best = entries[0];
      let bestDiff = Infinity;
      for (const e of entries) {
        const diff = Math.abs(Phaser.Math.Angle.Wrap(Math.atan2(e.y - fc.y, e.x - fc.x) - angleRad));
        if (diff < bestDiff) {
          bestDiff = diff;
          best = e;
        }
      }

      // Angle pointing outward along the stairs / doorway (away from arena floor center)
      const angleFromCenter = Math.atan2(best.y - fc.y, best.x - fc.x);
      // Stagger enemies along the stair depth (step by step up the stairs) so they march down in sequence
      const depthOffset = offsetDist * 0.55;
      // Keep lateral offset narrow (+/- 4px) so enemies stay centered on the solid stone staircase
      const perpAngle = angleFromCenter + Math.PI / 2;
      const perpOffset = Math.sign(offsetDist) * Math.min(4, Math.abs(offsetDist) * 0.08);

      x = best.x + Math.cos(angleFromCenter) * depthOffset + Math.cos(perpAngle) * perpOffset + Phaser.Math.Between(-2, 2);
      y = best.y + Math.sin(angleFromCenter) * depthOffset + Math.sin(perpAngle) * perpOffset + Phaser.Math.Between(-2, 2);
    } else {
      // Default (Level 1): a ring around the floor centre
      // For Enemy3 in Level 1, spawn near the visible perimeter of the arena so player sees him appear and disappear
      const dist = type === 'Enemy3' ? 520 : 850;
      const perpAngle = angleRad + Math.PI / 2;
      x = fc.x + Math.cos(angleRad) * dist + Math.cos(perpAngle) * offsetDist;
      y = fc.y + Math.sin(angleRad) * (dist * 0.7) + Math.sin(perpAngle) * (offsetDist * 0.7);
    }

    const enemy = new Enemy(this, x, y, type, fc);
    this.enemies.push(enemy);
    this.waveGroupEnemies.push(enemy);
    return enemy;
  }

  private startWave(waveNum: number) {
    Enemy.currentTeleporter = null;
    this.currentWave = waveNum;
    this.wavePhase = 0;
    this.waveGroupEnemies = [];
    this.waveTimerEvents.forEach((t) => t.remove());
    this.waveTimerEvents = [];

    const romanNums = ['', 'I', 'II', 'III'];
    const waveRoman = romanNums[waveNum] || `${waveNum}`;

    if (this.cornerWaveText) {
      if (this.level.id === 'level3') {
        this.cornerWaveText.setText('');
      } else {
        this.cornerWaveText.setText(`WAVE ${waveRoman}`);
      }
    }

    if (waveNum === 1) {
      if (this.level.id === 'level3') {
        this.sound.play('waveStart', { volume: 0.70 });
        this.startWave1();
      } else {
        // Delay wave 1 announcement slightly so "The Veil" title card displays first
        this.time.delayedCall(3000, () => {
          this.sound.play('waveStart', { volume: 0.70 });
          this.announceWave(`WAVE ${waveRoman}`);
        });
        this.startWave1();
      }
    } else {
      this.sound.play('waveStart', { volume: 0.70 });
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
    if (this.level.id === 'level3') {
      this.wavePendingSpawns = 0;
      const bossX = this.level.floorCenter.x;
      const bossY = this.level.floorCenter.y - 70;
      const boss = new Enemy(this, bossX, bossY, 'Boss', this.level.floorCenter);
      this.enemies.push(boss);
      this.waveGroupEnemies.push(boss);
      this.bossEnemy = boss;

      // Setup boss health bar (hidden with alpha 0)
      this.setupBossHealthBar();

      // Fade it in after the sprite appears after a 1 second delay
      this.time.delayedCall(1000, () => {
        if (this.bossHealthContainer && this.bossHealthContainer.active) {
          this.tweens.add({
            targets: this.bossHealthContainer,
            alpha: 1,
            duration: 800,
            ease: 'Quad.easeOut',
          });
        }
      });
      return;
    }

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

  // Wave 3: 3 Yis every second for 5 seconds (15 Yis total), then 6 Zeds at 5s, and Enemy3!
  // In Level 1: 2 Enemy3 in the final wave.
  // In Level 2: 2 + 2 extra = 4 Enemy3 in the final wave.
  private startWave3() {
    const isLevel2 = this.level.id === 'level2';
    const enemy3Count = isLevel2 ? 4 : 2;
    this.wavePendingSpawns = 21 + enemy3Count;
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

    // Spawn Enemy3 5 seconds after Zeds have spawned (at t = 10s)
    const tEnemy3 = this.time.delayedCall(10000, () => {
      for (let e = 0; e < enemy3Count; e++) {
        this.wavePendingSpawns--;
        const eAngle = (e * (Math.PI * 2)) / enemy3Count + 0.2;
        const eOffset = e % 2 === 0 ? -45 : 45;
        this.spawnEnemyAtAngle('Enemy3', eAngle, eOffset);
      }
    });
    this.waveTimerEvents.push(tEnemy3);
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

    // Spawn kill effect: motes for Yi, spirits for Zed, purple spirit for Enemy3
    this.spawnEnemyDefeatEffect(enemy);

    // Brighten the background and level props: increase target light level by 5% (0.05) per enemy defeated, capped at 35% (0.35).
    // The smooth, continuous transition is processed frame-by-frame in updateBlackPoint().
    this.targetBlackPoint = Math.min(0.35, this.targetBlackPoint + 0.05);

    this.checkWaveProgress();
  }

  private spawnEnemyDefeatEffect(enemy: Enemy) {
    const x = enemy.x;
    const y = enemy.y;
    const isEnemy3 = enemy.championType === 'Enemy3';
    const isYi = enemy.championType === 'Yi';

    if (isEnemy3) {
      // Enemy3 defeat effect: dark ethereal purple swirling spirit wisps
      const spiritsKey = Atmosphere.key(this.level, 'spirits');
      if (!this.textures.exists(spiritsKey)) return;

      const mainSpirit = this.add
        .image(x, y - 16, spiritsKey)
        .setScale(0.14)
        .setTint(0x9333ea) // Glowing purple
        .setAlpha(0.75)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setDepth(y + 25);

      this.tweens.add({
        targets: mainSpirit,
        x: x + Phaser.Math.Between(-10, 10),
        y: y - 50,
        scaleX: 0.28,
        scaleY: 0.28,
        alpha: 0,
        duration: 1200,
        ease: 'Cubic.easeOut',
        onComplete: () => mainSpirit.destroy(),
      });

      const sideSpirit = this.add
        .image(x + 6, y - 12, spiritsKey)
        .setScale(0.10)
        .setTint(0xc084fc) // Light violet
        .setAlpha(0.55)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setDepth(y + 24);

      this.tweens.add({
        targets: sideSpirit,
        x: x + Phaser.Math.Between(-12, 12),
        y: y - 42,
        scaleX: 0.20,
        scaleY: 0.20,
        alpha: 0,
        duration: 1350,
        delay: 80,
        ease: 'Sine.easeOut',
        onComplete: () => sideSpirit.destroy(),
      });
    } else if (isYi) {
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
    if (this.scoreText && this.scoreText.scene && this.scoreText.active) {
      this.scoreText.setText(`POINTS ${this.score.toLocaleString()}`);
    }
    if (this.scoreDetailsText && this.scoreDetailsText.scene && this.scoreDetailsText.active) {
      const pct = Math.round(this.blackPoint * 100);
      const sign = pct > 0 ? '+' : '';
      const xReady = this.pointsTowardsX >= this.REQ_POINTS_X;
      const xStr = xReady ? 'READY' : `${Math.round(this.pointsTowardsX).toLocaleString()}/${this.REQ_POINTS_X.toLocaleString()}`;
      const uReady = this.pointsTowardsU >= this.REQ_POINTS_U;
      const uStr = uReady ? 'READY' : `${(this.pointsTowardsU / 1000).toFixed(1)}k/${(this.REQ_POINTS_U / 1000).toFixed(1)}k`;
      this.scoreDetailsText.setText(`LIGHT ${sign}${pct}%  ✦  X: ${xStr}  ❖  U: ${uStr}`);
    }
  }

  private showKillPointPopup(points: number) {
    const { width, height } = this.scale;
    const z = BALANCE.level1CameraZoom;
    const toCamX = (x: number) => width / 2 + (x - width / 2) / z;
    const toCamY = (y: number) => height / 2 + (y - height / 2) / z;

    // Slot 0 is base Y below points banner (y = 74); higher slots stack downward
    const slotIndex = this.killPopups.length;
    const screenY = 74 + slotIndex * 22;

    const popupText = this.add
      .text(toCamX(width - 36), toCamY(screenY), `+${points.toLocaleString()}`, {
        fontFamily: '"Cinzel", "Georgia", serif',
        fontSize: '15px',
        fontStyle: 'bold',
        color: '#ffffff',
        stroke: '#000000',
        strokeThickness: 3,
      })
      .setOrigin(1, 0)
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
    if (this.level.id === 'level3') {
      const activeInGroup = this.waveGroupEnemies.filter((e) => !e.isDead);
      if (this.wavePendingSpawns === 0 && activeInGroup.length === 0 && this.waveGroupEnemies.length > 0) {
        if (this.wavePhase === 0) {
          this.wavePhase = 1;
          if (this.bossHealthContainer) {
            this.tweens.add({
              targets: this.bossHealthContainer,
              alpha: 0,
              duration: 1200,
              ease: 'Quad.easeOut',
            });
          }
          if (this.cornerWaveText) {
            this.cornerWaveText.setText('VICTORY');
          }
          if (this.heartbeatSound && this.heartbeatSound.isPlaying) {
            this.heartbeatSound.stop();
          }
          if (this.battleMusic && this.battleMusic.isPlaying) {
            this.tweens.add({
              targets: this.battleMusic,
              volume: 0,
              duration: 1000,
              onComplete: () => {
                this.battleMusic?.stop();
                this.battleMusic?.destroy();
                this.battleMusic = undefined;
              },
            });
          }
          this.sound.play('victory', { volume: 0.80 });
          this.announceWave('VICTORY');
        }
      }
      return;
    }

    const activeInGroup = this.waveGroupEnemies.filter((e) => !e.isDead);

    // Wave 1 Progression
    if (this.currentWave === 1) {
      if (this.wavePhase === 0 && this.wavePendingSpawns === 0 && activeInGroup.length === 0) {
        // All 9 Yis defeated -> spawn 2 Zeds (spaced out)
        this.wavePhase = 1;
        this.waveGroupEnemies = [];
        this.wavePendingSpawns = this.level.id === 'level2' ? 4 : 2;

        const tZeds = this.time.delayedCall(1200, () => {
          this.wavePendingSpawns -= 2;
          this.spawnEnemyAtAngle(this.level.roster.heavy, Math.PI * 0.4, -45);
          this.spawnEnemyAtAngle(this.level.roster.heavy, Math.PI * 1.4, 45);

          if (this.level.id === 'level2') {
            // In Level 2: spawn 2 Enemy3 5 seconds after Zeds have spawned
            const tEnemy3 = this.time.delayedCall(5000, () => {
              this.wavePendingSpawns -= 2;
              this.spawnEnemyAtAngle('Enemy3', Math.PI * 0.35, -40);
              this.spawnEnemyAtAngle('Enemy3', Math.PI * 1.35, 40);
            });
            this.waveTimerEvents.push(tEnemy3);
          }
        });
        this.waveTimerEvents.push(tZeds);
      } else if (
        this.wavePhase === 1 &&
        this.wavePendingSpawns === 0 &&
        this.waveGroupEnemies.length > 0 &&
        this.waveGroupEnemies.every((e) => e.isDead)
      ) {
        // Zeds (and Enemy3 in Level 2) defeated -> Wave 1 Complete!
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
        this.waveGroupEnemies = [];
        this.wavePendingSpawns = this.level.id === 'level2' ? 6 : 4;

        const tZeds = this.time.delayedCall(1200, () => {
          this.wavePendingSpawns -= 4;
          this.spawnEnemyAtAngle(this.level.roster.heavy, Math.PI * 0.25, -40);
          this.spawnEnemyAtAngle(this.level.roster.heavy, Math.PI * 0.75, 40);
          this.spawnEnemyAtAngle(this.level.roster.heavy, Math.PI * 1.25, -40);
          this.spawnEnemyAtAngle(this.level.roster.heavy, Math.PI * 1.75, 40);

          if (this.level.id === 'level2') {
            // In Level 2: spawn 2 Enemy3 5 seconds after Zeds have spawned
            const tEnemy3 = this.time.delayedCall(5000, () => {
              this.wavePendingSpawns -= 2;
              this.spawnEnemyAtAngle('Enemy3', Math.PI * 0.65, -40);
              this.spawnEnemyAtAngle('Enemy3', Math.PI * 1.65, 40);
            });
            this.waveTimerEvents.push(tEnemy3);
          }
        });
        this.waveTimerEvents.push(tZeds);
      } else if (
        this.wavePhase === 1 &&
        this.wavePendingSpawns === 0 &&
        this.waveGroupEnemies.length > 0 &&
        this.waveGroupEnemies.every((e) => e.isDead)
      ) {
        // Zeds (and Enemy3 in Level 2) defeated -> Wave 2 Complete!
        this.wavePhase = 2;
        this.time.delayedCall(2500, () => {
          this.startWave(3);
        });
      }
      return;
    }

    // Wave 3 Progression
    if (this.currentWave === 3) {
      if (
        this.wavePhase === 0 &&
        this.wavePendingSpawns === 0 &&
        this.waveGroupEnemies.length > 0 &&
        this.waveGroupEnemies.every((e) => e.isDead)
      ) {
        this.wavePhase = 1;
        if (this.cornerWaveText) {
          this.cornerWaveText.setText('VICTORY');
        }
        if (this.heartbeatSound && this.heartbeatSound.isPlaying) {
          this.heartbeatSound.stop();
        }
        if (this.battleMusic && this.battleMusic.isPlaying) {
          this.tweens.add({
            targets: this.battleMusic,
            volume: 0,
            duration: 1000,
            onComplete: () => {
              this.battleMusic?.stop();
              this.battleMusic?.destroy();
              this.battleMusic = undefined;
            },
          });
        }
        this.sound.play('victory', { volume: 0.80 });
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

    // Quick Level Navigation Hotkeys: 1 (Level 1), 2 (Level 2), 3 (Level 3 Boss Arena)
    const key1 = kb.addKey(Phaser.Input.Keyboard.KeyCodes.ONE);
    key1.on('down', () => this.scene.start('Level1'));
    const key2 = kb.addKey(Phaser.Input.Keyboard.KeyCodes.TWO);
    key2.on('down', () => this.scene.start('Level2'));
    const key3 = kb.addKey(Phaser.Input.Keyboard.KeyCodes.THREE);
    key3.on('down', () => this.scene.start('Level3'));

    const num1 = kb.addKey(Phaser.Input.Keyboard.KeyCodes.NUMPAD_ONE);
    num1.on('down', () => this.scene.start('Level1'));
    const num2 = kb.addKey(Phaser.Input.Keyboard.KeyCodes.NUMPAD_TWO);
    num2.on('down', () => this.scene.start('Level2'));
    const num3 = kb.addKey(Phaser.Input.Keyboard.KeyCodes.NUMPAD_THREE);
    num3.on('down', () => this.scene.start('Level3'));

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
    if (this.isControlsPopupOpen) {
      return;
    }

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
    if (this.cooldownDash > 0) this.cooldownDash = Math.max(0, this.cooldownDash - dt);
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
      enemy.update(dt, this.player.x, this.player.y, this.env.area, this.currentAimDir, this.enemies);
    }

    // 3. Resolve physical collisions between enemies and with player (small overlap allowed)
    this.resolveEnemyCollisions();

    // 2.5D depth sorting based on ground feet contact position
    this.player.setDepth(this.player.y + 7);

    // Check enemy attacks hitting player
    this.checkEnemyAttackHit(dt);

    // Update boss health bar if present
    if (this.bossEnemy) {
      this.drawBossHealthBar();
    }

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
      if (this.cooldownDash <= 0) {
        this.triggerRoll();
      }
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
    this.sound.play('triggerKick', { volume: 0.65 });
    this.scheduleAttackHitCheck(140, KICK_PROFILE);
  }

  private triggerWhirlwind() {
    this.attackComboStep = 0;
    this.cooldownE = this.maxCooldownE;
    this.actionDir = this.currentAimDir;
    this.currentAction = 'attack';
    this.playDirectional('MeleeSpin', this.currentAimDir, false);
    this.sound.play('whirlwind', { volume: 0.75 });
    this.scheduleAttackHitCheck(280, WHIRLWIND_PROFILE);
  }

  private triggerPummel() {
    this.attackComboStep = 0;
    this.cooldownV = this.maxCooldownV;
    this.actionDir = this.currentAimDir;
    this.currentAction = 'pummel';
    this.playDirectional('Pummel', this.currentAimDir, false);
    this.sound.play('triggerPummel', { volume: 0.70 });
    this.scheduleAttackHitCheck(160, PUMMEL_PROFILE);
  }

  private triggerOverhead() {
    this.attackComboStep = 0;
    this.cooldownR = this.maxCooldownR;
    this.actionDir = this.currentAimDir;
    this.currentAction = 'special1';
    this.playDirectional('Special1', this.currentAimDir, false);
    this.sound.play('triggerOverhead', { volume: 0.75 });
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
    this.sound.play('triggerLightOrb', { volume: 0.70 });

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
        const enemyHitbox = enemy.championType === 'Boss' ? 17 : enemy.championType === 'Zed' ? 20 : enemy.championType === 'Enemy3' ? 8 : 12;
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
          const enemyHitbox = enemy.championType === 'Boss' ? 17 : enemy.championType === 'Zed' ? 20 : enemy.championType === 'Enemy3' ? 8 : 12;
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
    this.sound.play('detonateOrb', { volume: 0.65 });
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
    this.sound.play('triggerShockwave', { volume: 0.80 });

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
        const hitRadius = enemy.championType === 'Boss' ? 17 : 15;
        if (dist <= ring.radius + hitRadius && dist >= ring.radius - 28 - hitRadius) {
          ring.hitEnemies.add(enemy);
          if (this.time.now - this.lastShockwaveHitTime > 120) {
            this.lastShockwaveHitTime = this.time.now;
            this.sound.play('updateShockwaves', { volume: 0.60 });
          }
          const killed = enemy.takeDamage(
            ring.centerX,
            ring.centerY,
            this.env.area,
            2.5,
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
      this.sound.play('triggerAttack', { volume: 0.55 });
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
    this.sound.play('triggerAttack', { volume: 0.55 });
    this.scheduleAttackHitCheck(hitDelay, BASIC_ATTACK_PROFILE);

    this.comboResetTimer = this.time.delayedCall(1200, () => {
      this.attackComboStep = 0;
    });
  }

  private triggerRoll() {
    if (this.currentAction === 'roll' || this.cooldownDash > 0) return;
    this.cooldownDash = this.maxCooldownDash;
    this.sound.play('triggerRoll', { volume: 0.60 });

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

    if (this.heartbeatSound && this.heartbeatSound.isPlaying) {
      this.heartbeatSound.stop();
    }
    if (this.battleMusic && this.battleMusic.isPlaying) {
      this.tweens.add({
        targets: this.battleMusic,
        volume: 0,
        duration: 1000,
        onComplete: () => {
          this.battleMusic?.stop();
          this.battleMusic?.destroy();
          this.battleMusic = undefined;
        },
      });
    }

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

    if (this.controlsPopupContainer) {
      this.controlsPopupContainer.destroy();
      this.controlsPopupContainer = undefined;
      this.isControlsPopupOpen = false;
    }

    // Fade out combat UI
    const hudTargets: Phaser.GameObjects.GameObject[] = [];
    if (this.healthContainer) hudTargets.push(this.healthContainer);
    if (this.uContainer) hudTargets.push(this.uContainer);
    if (this.cooldownContainer) hudTargets.push(this.cooldownContainer);
    if (this.cornerWaveText) hudTargets.push(this.cornerWaveText);
    if (this.scoreContainer) hudTargets.push(this.scoreContainer);
    if (this.scoreText) hudTargets.push(this.scoreText);
    if (this.lightLevelText) hudTargets.push(this.lightLevelText);
    if (this.bossHealthContainer) hudTargets.push(this.bossHealthContainer);
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
    this.targetBlackPoint = -0.50;
    this.blackPoint = -0.50;
    this.applyBlackPoint();

    // Transition directly to the medieval fantasy GameOver screen (with options)
    this.time.delayedCall(1200, () => {
      this.scene.start('GameOver', {
        levelId: this.level.id,
        sceneKey: this.scene.key,
      });
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
    let anyHit = false;

    for (const enemy of this.enemies) {
      if (enemy.isDead) continue;

      const dx = enemy.x - this.player.x;
      const dy = enemy.y - this.player.y;
      const dist = Math.hypot(dx, dy);

      // Boss hitbox reduced by another 50% (17px radius), Zed is 22px, normal minion is 14px
      const enemyHitRadius = enemy.championType === 'Boss' ? 17 : enemy.championType === 'Zed' ? 22 : 14;

      // Player melee attack range: check distance against enemy's outer hit radius
      const effectiveDist = Math.max(0, dist - enemyHitRadius);
      if (effectiveDist > profile.reach) continue;

      // Cannot hit enemies through solid walls/blockers (e.g. through the central altar)
      if (this.env.area && !this.env.area.hasLineOfSight(this.player.x, this.player.y, enemy.x, enemy.y, 8)) {
        continue;
      }

      let isHit = false;
      if (profile.is360 || dist <= enemyHitRadius) {
        // 360-degree hit radius around the player, or player is right next to/inside the enemy's legs/body
        isHit = true;
      } else {
        // Check angle relative to player facing direction
        const angleToEnemy = Math.atan2(dy, dx);
        let degToEnemy = Phaser.Math.RadToDeg(angleToEnemy);
        if (degToEnemy < 0) degToEnemy += 360;

        const playerFacingDeg = this.currentAimDir * 45;
        let diff = Math.abs(degToEnemy - playerFacingDeg);
        if (diff > 180) diff = 360 - diff;

        // Angular span subtended by the enemy's hitbox from the player's position
        const angularSpanDeg = Math.asin(Math.min(1.0, enemyHitRadius / Math.max(1, dist))) * (180 / Math.PI);

        if (diff <= profile.halfAngleDeg + angularSpanDeg) {
          isHit = true;
        }
      }

      if (isHit) {
        anyHit = true;
        const dmg = enemy.championType === 'Zed' || enemy.championType === 'Boss' ? profile.damageZed : profile.damageYi;
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

    if (anyHit) {
      this.sound.play('checkPlayerAttackHit', { volume: 0.60 });
    }

    if (hasKills) {
      this.enemies = this.enemies.filter((e) => !e.isDead);
    }
  }

  private resolveEnemyCollisions() {
    const aliveEnemies: Enemy[] = [];
    for (let i = 0; i < this.enemies.length; i++) {
      const e = this.enemies[i];
      if (!e.isDead && (e.championType !== 'Enemy3' || (e.enemy3State !== 'hidden' && e.visible))) {
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

            // Boss has high poise against minions
            if (e1.championType === 'Boss') {
              e2.pushBody(px * 2, py * 2, this.env.area);
            } else if (e2.championType === 'Boss') {
              e1.pushBody(-px * 2, -py * 2, this.env.area);
            } else {
              e1.pushBody(-px, -py, this.env.area);
              e2.pushBody(px, py, this.env.area);
            }
          }
        }
      }
    }

    // 2. Enemy-to-player physical collision
    // Player is blocked by the Boss (cannot phase through). Boss is a solid, immovable giant!
    const isPlayerDodging =
      this.currentAction === 'roll' ||
      this.currentAction === 'flip' ||
      this.currentAction === 'slide';
    const playerRadius = 18;

    for (let i = 0; i < count; i++) {
      const e = aliveEnemies[i];

      let dx = e.x - this.player.x;
      let dy = (e.y - this.player.y) / 0.8;
      let dist = Math.hypot(dx, dy);

      const targetMinDist = (playerRadius + e.getCollisionRadius()) * 0.90;

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
        const px = nx * overlap;
        const py = ny * overlap * 0.8;

        if (e.championType === 'Boss') {
          // Boss is massive and solid: hero gets blocked and cannot phase through!
          this.movePlayer(-px, -py);

          // If hero rolled/dashed into the Boss, stop/deflect roll momentum at the Boss's body
          if (isPlayerDodging) {
            const dot = this.actionVelocity.x * nx + (this.actionVelocity.y / 0.8) * ny;
            if (dot > 0) {
              this.actionVelocity.x -= dot * nx;
              this.actionVelocity.y -= dot * ny * 0.8;
            }
          }
        } else if (!isPlayerDodging) {
          // Regular minions (Zed/Yi): walking hero pushes against them
          if (!e.isPerformingAttack()) {
            this.movePlayer(-px * 0.5, -py * 0.5);
            e.pushBody(px * 0.5, py * 0.5, this.env.area);
          } else {
            this.movePlayer(-px, -py);
          }
        }
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
      if (enemy.isDead || enemy.isStumbling || !enemy.isAttackInDamageWindow()) continue;

      const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, enemy.x, enemy.y);
      const maxHitDist = enemy.championType === 'Boss' ? 55 : (enemy.championType === 'Enemy3' ? 55 : 75);
      if (dist > maxHitDist) continue;

      // Frontal cone check: attacks only hit within 190° forward arc of the attacker.
      // If the player dodged or stepped behind the enemy during windup, they take no damage.
      if (enemy.championType !== 'Enemy3') {
        const dx = this.player.x - enemy.x;
        const dy = this.player.y - enemy.y;
        let degToPlayer = Phaser.Math.RadToDeg(Math.atan2(dy, dx));
        if (degToPlayer < 0) degToPlayer += 360;
        const facingDeg = enemy.getFacingAngleDeg();
        let angleDiff = Math.abs(degToPlayer - facingDeg);
        if (angleDiff > 180) angleDiff = 360 - angleDiff;
        if (angleDiff > 95) continue; // Behind or flanking outside frontal arc -> escaped damage!
      }

      // Invulnerable during rolls or flips (i-frames: successfully dodged the strike)
      if (this.currentAction === 'roll' || this.currentAction === 'flip') {
        enemy.hasHitInCurrentAttack = true;
        return;
      }

      // Shield block active: absorb impact, reset enemy cooldown, no damage taken
      if (this.currentAction === 'block') {
        enemy.hasHitInCurrentAttack = true;
        const rad = Math.atan2(this.player.y - enemy.y, this.player.x - enemy.x);
        this.movePlayer(Math.cos(rad) * 16, Math.sin(rad) * 16);
        enemy.resetAttackCooldown();
        this.enemyHitCooldown = 0.5;
        return;
      }

      // Strike connects!
      enemy.hasHitInCurrentAttack = true;
      this.damagePlayer(enemy.attackDamage);
      enemy.resetAttackCooldown();
      this.flashPlayerHurt();
      if (enemy.championType === 'Boss') {
        this.cameras.main.shake(140, 0.007);
      }
      this.enemyHitCooldown = enemy.championType === 'Boss' ? 0.6 : (enemy.championType === 'Zed' ? 0.35 : 0.5);
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
