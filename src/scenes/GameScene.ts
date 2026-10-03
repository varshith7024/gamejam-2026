import Phaser from 'phaser';
import { Enemy } from '../entities/Enemy';
import { Level1Environment, DEPTH } from '../environment/Level1Environment';
import { Atmosphere } from '../effects/Atmosphere';
import { LEVEL1 } from '../environment/level1Data';
import { BALANCE } from '../config/balance';
import { ChampionType } from '../config/championAnimations';
import { TEXT } from '../config/text';

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
  | 'special2'
  | 'block'
  | 'turn'
  | 'hurt'
  | 'die'
  | 'unsheath';

export class GameScene extends Phaser.Scene {
  public env!: Level1Environment;
  private atmosphere!: Atmosphere;
  private player!: Phaser.GameObjects.Sprite;
  private enemies: Enemy[] = [];
  private debugOn = false;

  // Player Health Bar (Clean black bar with red inner bar, bottom-left)
  public readonly maxHealth = 50;
  public health = 50;
  private healthContainer!: Phaser.GameObjects.Container;
  private hpBgGfx!: Phaser.GameObjects.Graphics;
  private hpFillGfx!: Phaser.GameObjects.Graphics;

  // Brightening & Black Point / White Point Mechanic
  public blackPoint = 0.0; // -0.50 to +0.50 (-50% to +50%)
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
  private waveAnnounceTitle: Phaser.GameObjects.Text | null = null;
  private waveAnnounceSub: Phaser.GameObjects.Text | null = null;

  // White bloom glow layers (subtle but noticeable)
  private playerGlowGround!: Phaser.GameObjects.Image;
  private playerGlowCore!: Phaser.GameObjects.Image;

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
  private keyT!: Phaser.Input.Keyboard.Key;
  private keyF!: Phaser.Input.Keyboard.Key;
  private keyZ!: Phaser.Input.Keyboard.Key;
  private keyX!: Phaser.Input.Keyboard.Key;
  private keyV!: Phaser.Input.Keyboard.Key;
  private keyB!: Phaser.Input.Keyboard.Key;
  private keyU!: Phaser.Input.Keyboard.Key;
  private keyH!: Phaser.Input.Keyboard.Key;
  private keyK!: Phaser.Input.Keyboard.Key;
  private keyG!: Phaser.Input.Keyboard.Key;

  constructor(key: string = 'Game') {
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
    this.blackPoint = 0.0;
    this.isDead = false;
    this.enemyHitCooldown = 0;
    this.currentAction = 'idle';
    this.actionVelocity.set(0, 0);

    // Build environment and atmosphere
    this.env = new Level1Environment(this);
    this.atmosphere = new Atmosphere(this);
    this.atmosphere.create();

    // Setup Black Point overlay (modifies background only, depth = DEPTH.base + 0.1)
    this.createBlackPointOverlay();

    // Create player sprite (origin at ground feet contact point)
    this.currentAimDir = 0; // Starts facing right (East)
    this.player = this.add.sprite(LEVEL1.playerStart.x, LEVEL1.playerStart.y, 'Idle', 0);
    this.player.setOrigin(0.5, 0.78);
    this.player.setScale(1.1);
    this.player.setDepth(this.player.y);
    this.playDirectional('Idle', 0, false);

    // Create subtle but noticeable white bloom glow effect
    this.createPlayerBloom();

    this.setupInput();
    this.setupAnimationCallbacks();
    this.setupCamera();
    this.setupHealthBar();
    this.setupWaveUI();
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
  // SUBTLE BUT NOTICEABLE WHITE BLOOM GLOW EFFECT
  // -----------------------------------------------------------------
  private createPlayerBloom() {
    const key = 'player_bloom_halo_noticeable';
    if (!this.textures.exists(key)) {
      const canvas = this.textures.createCanvas(key, 256, 256)!;
      const ctx = canvas.getContext();
      const grad = ctx.createRadialGradient(128, 128, 6, 128, 128, 128);
      grad.addColorStop(0, 'rgba(255, 255, 255, 0.90)');
      grad.addColorStop(0.2, 'rgba(255, 255, 255, 0.65)');
      grad.addColorStop(0.45, 'rgba(235, 245, 255, 0.28)');
      grad.addColorStop(0.75, 'rgba(215, 230, 255, 0.08)');
      grad.addColorStop(1, 'rgba(200, 220, 255, 0.0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 256, 256);
      canvas.refresh();
    }

    // 1. Noticeable isometric ground bloom halo
    this.playerGlowGround = this.add
      .image(this.player.x, this.player.y - 12, key)
      .setOrigin(0.5, 0.5)
      .setScale(0.95, 0.5)
      .setAlpha(0.42)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(this.player.y - 1);

    this.tweens.add({
      targets: this.playerGlowGround,
      scaleX: 1.08,
      scaleY: 0.58,
      alpha: 0.52,
      duration: 1600,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    // 2. Noticeable core bloom around torso and sword
    this.playerGlowCore = this.add
      .image(this.player.x, this.player.y - 38, key)
      .setOrigin(0.5, 0.5)
      .setScale(0.48)
      .setAlpha(0.35)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(this.player.y + 0.1);

    this.tweens.add({
      targets: this.playerGlowCore,
      scale: 0.56,
      alpha: 0.44,
      duration: 1300,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  private updatePlayerBloom() {
    if (!this.playerGlowGround || !this.playerGlowCore) return;

    if (this.isDead) {
      this.playerGlowGround.setVisible(false);
      this.playerGlowCore.setVisible(false);
      return;
    }

    this.playerGlowGround.setVisible(true);
    this.playerGlowCore.setVisible(true);
    this.playerGlowGround.setPosition(this.player.x, this.player.y - 12);
    this.playerGlowGround.setDepth(this.player.y - 1);
    this.playerGlowCore.setPosition(this.player.x, this.player.y - 38);
    this.playerGlowCore.setDepth(this.player.y + 0.1);
  }

  // -----------------------------------------------------------------
  // BRIGHTENING & DARKENING MECHANIC (BLACK POINT & WHITE POINT)
  // -----------------------------------------------------------------
  private createBlackPointOverlay() {
    // White screen overlay placed directly above veil_master image (DEPTH.base is -10000)
    // Screen blend formula: Output = blackPoint + (1 - blackPoint) * Background
    // Lifts the black point of the background when blackPoint > 0 (scene gets brighter)
    this.blackPointOverlay = this.add
      .rectangle(0, 0, LEVEL1.world.width, LEVEL1.world.height, 0xffffff)
      .setOrigin(0, 0)
      .setDepth(DEPTH.base + 0.1)
      .setBlendMode(Phaser.BlendModes.SCREEN)
      .setAlpha(0);

    // Black normal overlay to lower the white point when blackPoint < 0 (scene gets darker)
    // Formula: Output = (1 - darkness) * Background
    this.whitePointDarkOverlay = this.add
      .rectangle(0, 0, LEVEL1.world.width, LEVEL1.world.height, 0x000000)
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
    // Decrease black point by 1% (0.01) per second ONLY when enemies are on screen
    // Can decrease below 0 (down to -50% / -0.50) to darken the whole scene by lowering the white point
    if (this.isAnyEnemyOnScreen()) {
      this.blackPoint = Math.max(-0.50, this.blackPoint - 0.01 * dt);
    }
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
      .text(width / 2, toCamY(height * 0.42), TEXT.level1Title, {
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
      .text(width / 2, toCamY(height * 0.42 + 56), TEXT.level1Subtitle, {
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
  }

  private announceWave(titleText: string, subText: string = '') {
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

  private spawnEnemyAtAngle(type: ChampionType, angleRad: number): Enemy {
    const cx = LEVEL1.floorCenter.x;
    const cy = LEVEL1.floorCenter.y;
    const dist = 850;
    const x = cx + Math.cos(angleRad) * dist;
    const y = cy + Math.sin(angleRad) * (dist * 0.7);

    const enemy = new Enemy(this, x, y, type);
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

  // Wave 1: 3 Yis from different angles spaced 2s apart, then 1 Zed after defeating all of them
  private startWave1() {
    this.wavePendingSpawns = 3;
    const angles = [0, (Math.PI * 2) / 3, (Math.PI * 4) / 3];

    angles.forEach((angle, i) => {
      const t = this.time.delayedCall(i * 2000, () => {
        this.wavePendingSpawns--;
        this.spawnEnemyAtAngle('Yi', angle);
      });
      this.waveTimerEvents.push(t);
    });
  }

  // Wave 2: 2 Yis at a time twice separated by 6s, then 2 Zeds after defeating all of them
  private startWave2() {
    this.wavePendingSpawns = 4;

    // Spawn 2 Yis at 0s
    this.wavePendingSpawns -= 2;
    this.spawnEnemyAtAngle('Yi', Math.PI * 0.25);
    this.spawnEnemyAtAngle('Yi', Math.PI * 1.25);

    // Spawn 2 Yis at 6s
    const t = this.time.delayedCall(6000, () => {
      this.wavePendingSpawns -= 2;
      this.spawnEnemyAtAngle('Yi', Math.PI * 0.75);
      this.spawnEnemyAtAngle('Yi', Math.PI * 1.75);
    });
    this.waveTimerEvents.push(t);
  }

  // Wave 3: 1 Yi every second until 5 Yis, then 3 Zeds. All in different locations.
  private startWave3() {
    this.wavePendingSpawns = 8;
    // 8 distinct angles evenly distributed around the perimeter
    const angles = Array.from({ length: 8 }, (_, i) => i * ((Math.PI * 2) / 8) + 0.15);

    // Spawn 5 Yis, 1 second apart (t = 0, 1, 2, 3, 4s)
    for (let i = 0; i < 5; i++) {
      const t = this.time.delayedCall(i * 1000, () => {
        this.wavePendingSpawns--;
        this.spawnEnemyAtAngle('Yi', angles[i]);
      });
      this.waveTimerEvents.push(t);
    }

    // Spawn 3 Zeds at 5s in 3 different locations
    const tBoss = this.time.delayedCall(5000, () => {
      for (let j = 5; j < 8; j++) {
        this.wavePendingSpawns--;
        this.spawnEnemyAtAngle('Zed', angles[j]);
      }
    });
    this.waveTimerEvents.push(tBoss);
  }

  private onEnemyDefeated(enemy: Enemy) {
    // Brighten the background and level props: increase black point by 5% (0.05) per enemy defeated, capped at 50% (0.50)
    this.blackPoint = Math.min(0.50, this.blackPoint + 0.05);
    this.applyBlackPoint();

    this.checkWaveProgress();
  }

  private checkWaveProgress() {
    const activeInGroup = this.waveGroupEnemies.filter((e) => !e.isDead);

    // Wave 1 Progression
    if (this.currentWave === 1) {
      if (this.wavePhase === 0 && this.wavePendingSpawns === 0 && activeInGroup.length === 0) {
        // All 3 Yis defeated -> spawn 1 Zed
        this.wavePhase = 1;
        this.time.delayedCall(1200, () => {
          this.waveGroupEnemies = [];
          this.spawnEnemyAtAngle('Zed', Math.PI * 0.5);
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
        // All 4 Yis defeated -> spawn 2 Zeds at different locations
        this.wavePhase = 1;
        this.time.delayedCall(1200, () => {
          this.waveGroupEnemies = [];
          this.spawnEnemyAtAngle('Zed', Math.PI * 0.5);
          this.spawnEnemyAtAngle('Zed', Math.PI * 1.5);
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
    this.keyT = kb.addKey(Phaser.Input.Keyboard.KeyCodes.T);
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
          this.currentAction = 'idle';
          this.actionVelocity.set(0, 0);
        }
      },
    );
  }

  // ---------- Camera ----------
  private setupCamera() {
    const cam = this.cameras.main;
    cam.setBounds(0, 0, LEVEL1.world.width, LEVEL1.world.height);
    cam.setRoundPixels(true);
    cam.setZoom(BALANCE.level1CameraZoom);
    const t = this.cameraTarget();
    cam.setScroll(t.x, t.y);
  }

  private cameraTarget() {
    const cam = this.cameras.main;
    const f = BALANCE.level1CameraFollow;
    const cx = LEVEL1.floorCenter.x + (this.player.x - LEVEL1.floorCenter.x) * f;
    const cy = LEVEL1.floorCenter.y + (this.player.y - LEVEL1.floorCenter.y) * f;
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
      if (
        Phaser.Input.Keyboard.JustDown(this.keyK) ||
        Phaser.Input.Keyboard.JustDown(this.keySpace)
      ) {
        this.revive();
      }
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
      (moveX !== 0 || moveY !== 0)
    ) {
      this.currentAimDir = this.computeMoveDirection(moveX, moveY);
    }

    this.handleActionInputs();
    this.handleLocomotion(dt);

    // 1. Compute crowd separation vectors for all alive enemies
    for (const enemy of this.enemies) {
      enemy.computeSeparation(this.enemies);
    }

    // 2. Update all enemies pursuing the player in the arena
    for (const enemy of this.enemies) {
      enemy.update(dt, this.player.x, this.player.y, this.env.area);
    }

    // 2.5D depth sorting based on ground feet position
    this.player.setDepth(this.player.y);

    // Sync white bloom glow with character position & depth
    this.updatePlayerBloom();

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
      this.triggerHurt();
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

    if (Phaser.Input.Keyboard.JustDown(this.keyQ)) {
      this.playOneShotAction('Kick', 'kick');
      return;
    }

    if (Phaser.Input.Keyboard.JustDown(this.keyE)) {
      this.playOneShotAction('MeleeSpin', 'attack');
      return;
    }

    if (Phaser.Input.Keyboard.JustDown(this.keyR)) {
      this.playOneShotAction('Special1', 'special1');
      return;
    }

    if (Phaser.Input.Keyboard.JustDown(this.keyT)) {
      this.playOneShotAction('Special2', 'special2');
      return;
    }

    if (Phaser.Input.Keyboard.JustDown(this.keyX)) {
      this.playOneShotAction('CastSpell', 'spell');
      return;
    }

    if (Phaser.Input.Keyboard.JustDown(this.keyV)) {
      this.playOneShotAction('Pummel', 'pummel');
      return;
    }

    if (Phaser.Input.Keyboard.JustDown(this.keyB)) {
      this.actionDir = (this.currentAimDir + 4) % 8;
      this.currentAction = 'turn';
      this.playDirectional('180Turn', this.currentAimDir, false);
      return;
    }

    if (Phaser.Input.Keyboard.JustDown(this.keyU)) {
      this.playOneShotAction('UnSheathSword', 'unsheath');
      return;
    }

    this.handleShieldBlock();
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
    if (this.currentAction === 'roll' || this.currentAction === 'die') return;

    const moveVector = this.getMovementInput();
    const isRunning = moveVector.lengthSq() > 0 && this.keyShift.isDown;

    if (isRunning) {
      this.actionDir = this.currentAimDir;
      this.currentAction = 'attack';
      this.playDirectional('MeleeRun', this.currentAimDir, false);
      this.scheduleAttackHitCheck(120, true);
      return;
    }

    if (this.comboResetTimer) {
      this.comboResetTimer.remove();
    }

    let nextAnim = 'Melee';
    if (this.attackComboStep === 1) {
      nextAnim = 'Melee2';
      this.attackComboStep = 2;
    } else if (this.attackComboStep === 2) {
      nextAnim = 'MeleeSpin';
      this.attackComboStep = 0;
    } else {
      nextAnim = 'Melee';
      this.attackComboStep = 1;
    }

    this.actionDir = this.currentAimDir;
    this.currentAction = 'attack';
    this.playDirectional(nextAnim, this.currentAimDir, false);
    this.scheduleAttackHitCheck(130, true);

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

  private triggerHurt() {
    this.actionDir = this.currentAimDir;
    const rad = Phaser.Math.DegToRad(this.actionDir * 45);
    this.actionVelocity.set(-Math.cos(rad) * 140, -Math.sin(rad) * 140);

    this.currentAction = 'hurt';
    this.playDirectional('TakeDamage', this.actionDir, false);
  }

  private die() {
    this.isDead = true;
    this.currentAction = 'die';
    this.actionVelocity.set(0, 0);
    this.playDirectional('Die', this.currentAimDir, false);
    if (this.playerGlowGround && this.playerGlowCore) {
      this.playerGlowGround.setVisible(false);
      this.playerGlowCore.setVisible(false);
    }
  }

  private revive() {
    this.isDead = false;
    this.currentAction = 'idle';
    this.health = this.maxHealth;
    this.drawHealthBar();
    this.player.setPosition(LEVEL1.playerStart.x, LEVEL1.playerStart.y);
    this.playDirectional('Idle', this.currentAimDir, false);
    if (this.playerGlowGround && this.playerGlowCore) {
      this.playerGlowGround.setVisible(true);
      this.playerGlowCore.setVisible(true);
    }
    if (this.cornerWaveText) {
      const romanNums = ['', 'I', 'II', 'III'];
      this.cornerWaveText.setText(`WAVE ${romanNums[this.currentWave] || this.currentWave}`);
    }
  }

  private playOneShotAction(animBase: string, actionState: ActionState) {
    this.actionDir = this.currentAimDir;
    this.currentAction = actionState;
    this.playDirectional(animBase, this.currentAimDir, false);
  }

  private scheduleAttackHitCheck(delayMs: number, isLeftClick = true) {
    this.time.delayedCall(delayMs, () => {
      if (
        this.currentAction === 'attack' ||
        this.currentAction === 'kick' ||
        this.currentAction === 'pummel' ||
        this.currentAction === 'special1' ||
        this.currentAction === 'special2'
      ) {
        if (isLeftClick) {
          this.checkPlayerAttackHit();
        }
      }
    });
  }

  private checkPlayerAttackHit() {
    if (this.enemies.length === 0 || this.isDead) return;

    let hasKills = false;

    for (const enemy of this.enemies) {
      if (enemy.isDead) continue;

      const dx = enemy.x - this.player.x;
      const dy = enemy.y - this.player.y;
      const dist = Math.hypot(dx, dy);

      // Player melee attack range
      if (dist > 95) continue;

      // Check angle relative to player facing direction
      const angleToEnemy = Math.atan2(dy, dx);
      let degToEnemy = Phaser.Math.RadToDeg(angleToEnemy);
      if (degToEnemy < 0) degToEnemy += 360;

      const playerFacingDeg = this.currentAimDir * 45;
      let diff = Math.abs(degToEnemy - playerFacingDeg);
      if (diff > 180) diff = 360 - diff;

      // 360-degree hit for spinning attacks, 85-degree forward cone for standard strikes
      const isSpin =
        this.player.anims.currentAnim?.key.startsWith('MeleeSpin_') ||
        this.player.anims.currentAnim?.key.startsWith('Special1_');
      if (isSpin || diff < 85) {
        // Left click deals 1 damage (Yi dies in 2 hits, Zed dies in 4 hits)
        const killed = enemy.takeDamage(this.player.x, this.player.y, this.env.area, 1);
        if (killed) {
          hasKills = true;
          this.onEnemyDefeated(enemy);
        }
      }
    }

    if (hasKills) {
      this.enemies = this.enemies.filter((e) => !e.isDead);
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

      // Player takes damage: Yi deals 1 (1s cd), Zed deals 5 (0.75s cd)
      this.damagePlayer(enemy.attackDamage);
      enemy.resetAttackCooldown();
      this.triggerHurt();
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

    // Fixed momentum actions (roll, flip, slide, hurt knockback)
    if (
      this.currentAction === 'roll' ||
      this.currentAction === 'flip' ||
      this.currentAction === 'slide' ||
      this.currentAction === 'hurt'
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
      this.currentAction === 'special2' ||
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
