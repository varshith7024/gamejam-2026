import Phaser from 'phaser';
import {
  KNIGHT_ANIMATIONS,
  KNIGHT_FRAME_WIDTH,
  KNIGHT_FRAME_HEIGHT,
  FRAMES_PER_DIR,
  NUM_DIRECTIONS,
} from '../config/animations';
import {
  YI_CONFIG,
  ZED_CONFIG,
  ORB_CONFIG,
  ENEMY3_CONFIG,
  BOSS_DIRS,
  BOSS_FRAME_COUNTS,
} from '../config/championAnimations';
import { Level1Environment } from '../environment/Level1Environment';
import { LEVEL1 } from '../environment/level1Data';
import { LEVEL2 } from '../environment/level2Data';
import { LEVEL3 } from '../environment/level3Data';
import { Atmosphere } from '../effects/Atmosphere';
import { ColorCurvePipeline } from '../shaders/ColorCurvePipeline';

export class BootScene extends Phaser.Scene {
  private loadingFillGfx?: Phaser.GameObjects.Graphics;
  private loadingStatusText?: Phaser.GameObjects.Text;
  private loadingPercentText?: Phaser.GameObjects.Text;
  private barX = 640;
  private barY = 400;
  private barW = 480;
  private barH = 22;

  constructor() {
    super('Boot');
  }

  private drawProgressBar(progress: number) {
    if (!this.loadingFillGfx) return;
    this.loadingFillGfx.clear();
    const clamped = Math.max(0, Math.min(1, progress));
    const fillW = Math.round(this.barW * clamped);
    if (fillW > 0) {
      this.loadingFillGfx.fillStyle(0xffffff, 1.0);
      this.loadingFillGfx.fillRect(this.barX - this.barW / 2, this.barY - this.barH / 2, fillW, this.barH);

      // Distinct black vertical notch marks across fill for ink-codex aesthetic
      this.loadingFillGfx.fillStyle(0x000000, 1.0);
      const notchInterval = 16;
      for (let gx = this.barX - this.barW / 2 + notchInterval; gx < this.barX - this.barW / 2 + fillW; gx += notchInterval) {
        this.loadingFillGfx.fillRect(gx - 1, this.barY - this.barH / 2, 2, this.barH);
      }
    }
  }

  preload() {
    const { width, height } = this.scale;
    this.cameras.main.setBackgroundColor('#000000');

    this.barX = width / 2;
    this.barY = height * 0.55;
    this.barW = 480;
    this.barH = 22;

    // --- 1. VISUAL LOADING SCREEN ---
    this.add.text(this.barX, height * 0.36, 'NEGATIVE SPACE', {
      fontFamily: '"Cinzel Decorative", "Cinzel", "Georgia", serif',
      fontSize: '44px',
      fontStyle: 'bold',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 4,
      letterSpacing: 8,
    }).setOrigin(0.5, 0.5);

    this.add.text(this.barX, height * 0.36 + 46, '❖   AWAKENING THE RUINS   ❖', {
      fontFamily: '"Cinzel", "Georgia", serif',
      fontSize: '13px',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 2,
      letterSpacing: 4,
    }).setOrigin(0.5, 0.5);

    // Ornate Progress Bar Frame
    const barFrameGfx = this.add.graphics();
    // Backing plate
    barFrameGfx.fillStyle(0x000000, 1.0);
    barFrameGfx.fillRect(this.barX - this.barW / 2 - 4, this.barY - this.barH / 2 - 4, this.barW + 8, this.barH + 8);
    // Outer white frame
    barFrameGfx.lineStyle(2, 0xffffff, 1.0);
    barFrameGfx.strokeRect(this.barX - this.barW / 2 - 2, this.barY - this.barH / 2 - 2, this.barW + 4, this.barH + 4);
    // Inner subtle guide line
    barFrameGfx.lineStyle(1, 0xffffff, 0.4);
    barFrameGfx.strokeRect(this.barX - this.barW / 2, this.barY - this.barH / 2, this.barW, this.barH);

    // Corner rivets
    barFrameGfx.fillStyle(0xffffff, 1.0);
    const cr = [
      [this.barX - this.barW / 2 - 2, this.barY - this.barH / 2 - 2],
      [this.barX + this.barW / 2 + 2, this.barY - this.barH / 2 - 2],
      [this.barX - this.barW / 2 - 2, this.barY + this.barH / 2 + 2],
      [this.barX + this.barW / 2 + 2, this.barY + this.barH / 2 + 2],
    ];
    for (const [cx, cy] of cr) {
      barFrameGfx.fillRect(cx - 1.5, cy - 1.5, 3, 3);
    }

    this.loadingFillGfx = this.add.graphics();

    this.loadingStatusText = this.add.text(this.barX - this.barW / 2, this.barY + this.barH / 2 + 12, 'INITIALIZING COMBAT REALM...', {
      fontFamily: '"Cinzel", "Georgia", serif',
      fontSize: '11px',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 2,
      letterSpacing: 2,
    }).setOrigin(0, 0);

    this.loadingPercentText = this.add.text(this.barX + this.barW / 2, this.barY + this.barH / 2 + 12, '0%', {
      fontFamily: '"Cinzel", "Georgia", serif',
      fontSize: '13px',
      fontStyle: 'bold',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 2,
      letterSpacing: 1,
    }).setOrigin(1, 0);

    this.add.text(this.barX, height * 0.72, '✦ Slay the encroaching shadows to restore the light ✦', {
      fontFamily: '"Cinzel", "Georgia", serif',
      fontSize: '12px',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 2,
      letterSpacing: 3,
    }).setOrigin(0.5, 0.5);

    // Loader event listeners
    this.load.on('progress', (val: number) => {
      this.drawProgressBar(val);
      this.loadingPercentText?.setText(`${Math.round(val * 100)}%`);
    });

    this.load.on('fileprogress', (file: Phaser.Loader.File) => {
      const key = file.key || file.src || '';
      let display = key;
      if (key.startsWith('Boss_')) {
        display = 'EXECUTIONER INK SPRITES';
      } else if (key.startsWith('Yi_') || key.startsWith('Zed_') || key.startsWith('Enemy3_')) {
        display = 'SHADOW MONSTERS';
      } else if (key.startsWith('level1_prop_')) {
        display = `PROP: ${key.replace('level1_prop_', '').toUpperCase()}`;
      } else if (key.includes('atmos')) {
        display = 'ATMOSPHERE & SPIRITS';
      } else if (key.includes('Music') || key.includes('music') || key.startsWith('trigger') || key.startsWith('detonate') || key.startsWith('check')) {
        display = 'COMBAT AUDIO & MUSIC';
      } else if (key.includes('master')) {
        display = 'ANCIENT ARENA ARCHITECTURE';
      } else if (key.startsWith('icon_') || key.includes('ultimate')) {
        display = 'MARTIAL ABILITY CODEX';
      }
      this.loadingStatusText?.setText(`CONJURING ${display}...`);
    });

    this.load.on('complete', () => {
      this.drawProgressBar(1.0);
      this.loadingPercentText?.setText('100%');
      this.loadingStatusText?.setText('SANCTUARY PREPARED');
    });

    // --- 2. ASSET QUEUE ---
    this.load.setPath('');
    this.load.image('ball_only', 'assets/ball_only.png');

    // Preload Orb spritesheet
    this.load.spritesheet(ORB_CONFIG.key, ORB_CONFIG.file, {
      frameWidth: ORB_CONFIG.frameWidth,
      frameHeight: ORB_CONFIG.frameHeight,
      endFrame: ORB_CONFIG.frames * ORB_CONFIG.directions - 1,
    });

    // Preload Ability Icons & HUD Frames
    this.load.image('icon_sword', 'assets/ability/sword_normal.png');
    this.load.image('icon_dash', 'assets/ability/dash.png');
    this.load.spritesheet('icon_whirlwind', 'assets/ability/whirlwind.png', {
      frameWidth: 16,
      frameHeight: 19,
    });
    this.load.image('icon_pummel', 'assets/ability/pummel.png');
    this.load.image('icon_overhead', 'assets/ability/overhead.png');
    this.load.image('icon_kick', 'assets/ability/kick.png');
    this.load.image('ultimate_bar', 'assets/ability/ultimate_bar.png');
    this.load.image('ultimatebar', 'assets/ability/ultimate_bar.png');

    // Preload Audio Assets
    this.load.audio('battleMusic', 'assets/audio/battleMusic.wav');
    this.load.audio('menumusic', 'assets/audio/menumusic.wav');
    this.load.audio('waveStart', 'assets/audio/waveStart.wav');
    this.load.audio('victory', 'assets/audio/victory.mp3');
    this.load.audio('heartbeat', 'assets/audio/heartbeat.wav');
    this.load.audio('triggerAttack', 'assets/audio/triggerAttack.wav');
    this.load.audio('checkPlayerAttackHit', 'assets/audio/checkPlayerAttackHit.wav');
    this.load.audio('triggerRoll', 'assets/audio/triggerRoll.wav');
    this.load.audio('triggerKick', 'assets/audio/triggerKick.wav');
    this.load.audio('whirlwind', 'assets/audio/whirlwind.mp3');
    this.load.audio('triggerWhirlwind', 'assets/audio/whirlwind.mp3');
    this.load.audio('triggerPummel', 'assets/audio/triggerPummel.wav');
    this.load.audio('triggerOverhead', 'assets/audio/triggerOverhead.wav');
    this.load.audio('triggerLightOrb', 'assets/audio/triggerLightOrb.wav');
    this.load.audio('detonateOrb', 'assets/audio/detonateOrb.wav');
    this.load.audio('triggerShockwave', 'assets/audio/triggerShockwave.wav');
    this.load.audio('updateShockwaves', 'assets/audio/updateShockwaves.wav');

    // Preload Knight animations (1920x1024, 15 cols x 8 rows)
    for (const anim of KNIGHT_ANIMATIONS) {
      this.load.spritesheet(anim.key, `assets/knight/${anim.fileName}`, {
        frameWidth: KNIGHT_FRAME_WIDTH,
        frameHeight: KNIGHT_FRAME_HEIGHT,
        endFrame: FRAMES_PER_DIR * NUM_DIRECTIONS - 1,
      });
    }

    // Preload Yi animations
    for (const anim of YI_CONFIG.animations) {
      this.load.spritesheet(`Yi_${anim.key}`, anim.file, {
        frameWidth: anim.frameWidth,
        frameHeight: anim.frameHeight,
        endFrame: anim.frames * anim.directions - 1,
      });
    }

    // Preload Zed animations
    for (const anim of ZED_CONFIG.animations) {
      this.load.spritesheet(`Zed_${anim.key}`, anim.file, {
        frameWidth: anim.frameWidth,
        frameHeight: anim.frameHeight,
        endFrame: anim.frames * anim.directions - 1,
      });
    }

    // Preload Enemy3 animations
    for (const anim of ENEMY3_CONFIG.animations) {
      this.load.spritesheet(`Enemy3_${anim.key}`, anim.file, {
        frameWidth: anim.frameWidth,
        frameHeight: anim.frameHeight,
        endFrame: anim.frames * anim.directions - 1,
      });
    }

    // Preload Boss animations (8 directions: idle, walk, attack)
    for (let dir = 0; dir < 8; dir++) {
      const dName = BOSS_DIRS[dir];
      for (const anim of ['idle', 'walk', 'attack']) {
        this.load.spritesheet(
          `Boss_${anim}_${dir}`,
          `assets/boss_ink/${dName}/${dName}_${anim}.png`,
          {
            frameWidth: 256,
            frameHeight: 256,
          },
        );
      }
    }

    // Explicitly preload all props in Level 1 to guarantee all props are loaded
    const LEVEL1_PROPS = [
      'arch_ruin', 'brazier_ruin', 'floor_slab', 'gate_wall',
      'pedestal_block', 'pillar_broken', 'pillar_tall', 'rubble_scatter',
      'rubble_tomb', 'ruin_pile', 'shrine_tree', 'statue_small',
      'statue_tree', 'tree_rubble_big', 'tree_rubble_small',
    ];
    for (const p of LEVEL1_PROPS) {
      this.load.image(`level1_prop_${p}`, `assets/level1/props/prop_${p}.png`);
    }

    // Explicitly preload all occluders for all levels
    this.load.image('occ_pillar_cluster_se', 'assets/level1/occluders/occ_pillar_cluster_se.png');
    this.load.image('occ_altar', 'assets/level2/occluders/occ_altar.png');
    this.load.image('occ_brazier_nw', 'assets/level2/occluders/occ_brazier_nw.png');
    this.load.image('occ_brazier_w', 'assets/level2/occluders/occ_brazier_w.png');
    this.load.image('occ_brazier_e', 'assets/level2/occluders/occ_brazier_e.png');

    // Explicitly preload all Level 2 animated flame & waterfall spritesheets
    const LEVEL2_ANIMS = [
      { key: 'level2_anim_altar', file: 'assets/level2/anim/altar.png', w: 98, h: 150 },
      { key: 'level2_anim_nw', file: 'assets/level2/anim/nw.png', w: 97, h: 106 },
      { key: 'level2_anim_w', file: 'assets/level2/anim/w.png', w: 76, h: 110 },
      { key: 'level2_anim_e', file: 'assets/level2/anim/e.png', w: 82, h: 98 },
      { key: 'level2_anim_se', file: 'assets/level2/anim/se.png', w: 70, h: 100 },
      { key: 'level2_anim_s', file: 'assets/level2/anim/s.png', w: 72, h: 110 },
      { key: 'level2_anim_n1', file: 'assets/level2/anim/n1.png', w: 71, h: 97 },
      { key: 'level2_anim_n2', file: 'assets/level2/anim/n2.png', w: 88, h: 85 },
      { key: 'level2_anim_fall_w1', file: 'assets/level2/anim/fall_w1.png', w: 110, h: 260 },
      { key: 'level2_anim_fall_w2', file: 'assets/level2/anim/fall_w2.png', w: 82, h: 168 },
      { key: 'level2_anim_fall_w3', file: 'assets/level2/anim/fall_w3.png', w: 92, h: 134 },
      { key: 'level2_anim_fall_n1', file: 'assets/level2/anim/fall_n1.png', w: 110, h: 136 },
      { key: 'level2_anim_fall_n2', file: 'assets/level2/anim/fall_n2.png', w: 89, h: 146 },
      { key: 'level2_anim_fall_e1', file: 'assets/level2/anim/fall_e1.png', w: 107, h: 155 },
      { key: 'level2_anim_fall_e2', file: 'assets/level2/anim/fall_e2.png', w: 82, h: 106 },
      { key: 'level2_anim_fall_e3', file: 'assets/level2/anim/fall_e3.png', w: 89, h: 172 },
      { key: 'level2_anim_fall_e4', file: 'assets/level2/anim/fall_e4.png', w: 119, h: 209 },
      { key: 'level2_anim_fall_s1', file: 'assets/level2/anim/fall_s1.png', w: 122, h: 224 },
      { key: 'level2_anim_fall_s2', file: 'assets/level2/anim/fall_s2.png', w: 104, h: 108 },
    ];
    for (const a of LEVEL2_ANIMS) {
      this.load.spritesheet(a.key, a.file, { frameWidth: a.w, frameHeight: a.h });
    }

    // Preload each level's environment & atmospheric effects (same loaders, per-level data)
    for (const level of [LEVEL1, LEVEL2, LEVEL3]) {
      Level1Environment.preload(this, level);
      Atmosphere.preload(this, level);
    }
    this.load.setPath('');
  }

  create() {
    if (this.textures.exists('ball_only')) {
      this.textures.get('ball_only').setFilter(Phaser.Textures.FilterMode.NEAREST);
    }

    // Generate soft feathered ground shadow texture (matches the player's soft contact shadow)
    if (!this.textures.exists('character_shadow')) {
      const canvas = this.textures.createCanvas('character_shadow', 64, 32);
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

    // Register 8-directional Knight animations
    for (const anim of KNIGHT_ANIMATIONS) {
      for (let dir = 0; dir < NUM_DIRECTIONS; dir++) {
        const key = `${anim.key}_${dir}`;
        if (!this.anims.exists(key)) {
          this.anims.create({
            key,
            frames: this.anims.generateFrameNumbers(anim.key, {
              start: dir * FRAMES_PER_DIR,
              end: dir * FRAMES_PER_DIR + FRAMES_PER_DIR - 1,
            }),
            frameRate: anim.fps,
            repeat: anim.repeat,
          });
        }
      }
    }

    // Register 8-directional Yi animations
    for (const anim of YI_CONFIG.animations) {
      for (let dir = 0; dir < anim.directions; dir++) {
        const key = `Yi_${anim.key}_${dir}`;
        if (!this.anims.exists(key)) {
          this.anims.create({
            key,
            frames: this.anims.generateFrameNumbers(`Yi_${anim.key}`, {
              start: dir * anim.frames,
              end: dir * anim.frames + anim.frames - 1,
            }),
            frameRate: anim.fps,
            repeat: anim.repeat,
          });
        }
      }
    }

    // Register 8-directional Zed animations
    for (const anim of ZED_CONFIG.animations) {
      for (let dir = 0; dir < anim.directions; dir++) {
        const key = `Zed_${anim.key}_${dir}`;
        if (!this.anims.exists(key)) {
          this.anims.create({
            key,
            frames: this.anims.generateFrameNumbers(`Zed_${anim.key}`, {
              start: dir * anim.frames,
              end: dir * anim.frames + anim.frames - 1,
            }),
            frameRate: anim.fps,
            repeat: anim.repeat,
          });
        }
      }
    }

    // Register 8-directional Orb animations (orb_fly_0 ... orb_fly_7)
    if (this.textures.exists(ORB_CONFIG.key)) {
      this.textures.get(ORB_CONFIG.key).setFilter(Phaser.Textures.FilterMode.NEAREST);
    }
    for (let dir = 0; dir < ORB_CONFIG.directions; dir++) {
      const key = `${ORB_CONFIG.key}_fly_${dir}`;
      if (!this.anims.exists(key)) {
        this.anims.create({
          key,
          frames: this.anims.generateFrameNumbers(ORB_CONFIG.key, {
            start: dir * ORB_CONFIG.frames,
            end: dir * ORB_CONFIG.frames + ORB_CONFIG.frames - 1,
          }),
          frameRate: ORB_CONFIG.fps,
          repeat: ORB_CONFIG.repeat,
        });
      }
    }

    // Filter nearest on Enemy3 textures
    for (const key of ['Enemy3_idle', 'Enemy3_attack', 'Enemy3_disappear']) {
      if (this.textures.exists(key)) {
        this.textures.get(key).setFilter(Phaser.Textures.FilterMode.NEAREST);
      }
    }

    // Register directional Enemy3 animations
    // User direction specifications:
    // for idle: rows are South(0), South-East(1), North-East(2), North-West(3), North(4), West(5), East(6), South-West(7)
    // for attack: rows are South(0), South-East(1), North-East(2), North-West(3), North(4), West(5), East(6) (no SW row in sheet)
    // for disappear: rows are South(0), East(1), North-East(2), North-West(3), North(4), West(5), South-East(6), South-West(7)
    // Standard game engine directions: 0=E, 1=SE, 2=S, 3=SW, 4=W, 5=NW, 6=N, 7=NE
    const ENEMY3_IDLE_ROWS = [6, 1, 0, 7, 5, 3, 4, 2];
    const ENEMY3_ATTACK_ROWS = [6, 1, 0, 1, 5, 3, 4, 2]; // SW (3) maps to row 1 (SE) with flipX
    const ENEMY3_DISAPPEAR_ROWS = [1, 6, 0, 7, 5, 3, 4, 2];

    for (let stdDir = 0; stdDir < 8; stdDir++) {
      // 1. Idle (8 frames per row)
      const idleRow = ENEMY3_IDLE_ROWS[stdDir];
      const idleKey = `Enemy3_idle_${stdDir}`;
      if (!this.anims.exists(idleKey)) {
        this.anims.create({
          key: idleKey,
          frames: this.anims.generateFrameNumbers('Enemy3_idle', {
            start: idleRow * 8,
            end: idleRow * 8 + 7,
          }),
          frameRate: 8,
          repeat: -1,
        });
      }

      // 2. Attack (9 frames per row)
      const attackRow = ENEMY3_ATTACK_ROWS[stdDir];
      const attackKey = `Enemy3_attack_${stdDir}`;
      if (!this.anims.exists(attackKey)) {
        this.anims.create({
          key: attackKey,
          frames: this.anims.generateFrameNumbers('Enemy3_attack', {
            start: attackRow * 9,
            end: attackRow * 9 + 8,
          }),
          frameRate: 16,
          repeat: 0,
        });
      }

      // 3. Disappear (frames 0 to 4 of disappear row)
      const disRow = ENEMY3_DISAPPEAR_ROWS[stdDir];
      const disKey = `Enemy3_disappear_${stdDir}`;
      if (!this.anims.exists(disKey)) {
        this.anims.create({
          key: disKey,
          frames: this.anims.generateFrameNumbers('Enemy3_disappear', {
            start: disRow * 8,
            end: disRow * 8 + 4,
          }),
          frameRate: 10,
          repeat: 0,
        });
      }

      // 4. Appear (frames 4 to 7 of disappear row)
      const appKey = `Enemy3_appear_${stdDir}`;
      if (!this.anims.exists(appKey)) {
        this.anims.create({
          key: appKey,
          frames: this.anims.generateFrameNumbers('Enemy3_disappear', {
            start: disRow * 8 + 4,
            end: disRow * 8 + 7,
          }),
          frameRate: 10,
          repeat: 0,
        });
      }

      // 5. Die (full disappear row frames 0 to 7)
      const dieKey = `Enemy3_die_${stdDir}`;
      if (!this.anims.exists(dieKey)) {
        this.anims.create({
          key: dieKey,
          frames: this.anims.generateFrameNumbers('Enemy3_disappear', {
            start: disRow * 8,
            end: disRow * 8 + 7,
          }),
          frameRate: 10,
          repeat: 0,
        });
      }
    }

    // Register 8-directional Boss animations
    for (let dir = 0; dir < 8; dir++) {
      const dName = BOSS_DIRS[dir];
      const counts = BOSS_FRAME_COUNTS[dName];

      const idleKey = `Boss_idle_${dir}`;
      if (!this.anims.exists(idleKey)) {
        this.anims.create({
          key: idleKey,
          frames: this.anims.generateFrameNumbers(idleKey, {
            start: 0,
            end: counts.idle - 1,
          }),
          frameRate: 10,
          repeat: -1,
        });
      }

      const walkKey = `Boss_walk_${dir}`;
      if (!this.anims.exists(walkKey)) {
        this.anims.create({
          key: walkKey,
          frames: this.anims.generateFrameNumbers(walkKey, {
            start: 0,
            end: counts.walk - 1,
          }),
          frameRate: 12,
          repeat: -1,
        });
      }

      const attackKey = `Boss_attack_${dir}`;
      if (!this.anims.exists(attackKey)) {
        this.anims.create({
          key: attackKey,
          frames: this.anims.generateFrameNumbers(attackKey, {
            start: 0,
            end: counts.attack - 1,
          }),
          frameRate: 15,
          repeat: 0,
        });
      }
    }

    if (!this.anims.exists('anim_icon_whirlwind')) {
      this.anims.create({
        key: 'anim_icon_whirlwind',
        frames: this.anims.generateFrameNumbers('icon_whirlwind', { start: 0, end: 3 }),
        frameRate: 6,
        repeat: -1,
      });
    }

    for (const key of ['icon_sword', 'icon_dash', 'icon_whirlwind', 'icon_pummel', 'icon_overhead', 'icon_kick']) {
      if (this.textures.exists(key)) {
        this.textures.get(key).setFilter(Phaser.Textures.FilterMode.NEAREST);
      }
    }

    if (this.renderer instanceof Phaser.Renderer.WebGL.WebGLRenderer) {
      this.renderer.pipelines.addPostPipeline(
        ColorCurvePipeline.PIPELINE_NAME,
        ColorCurvePipeline,
      );
    }

    this.drawProgressBar(1.0);
    this.loadingPercentText?.setText('100%');
    this.loadingStatusText?.setText('SANCTUARY RESTORED');

    // Smooth transition into Main Menu after ensuring all props and assets are loaded
    this.time.delayedCall(250, () => {
      this.cameras.main.fade(350, 0, 0, 0);
      this.time.delayedCall(350, () => {
        this.scene.start('MainMenu');
      });
    });
  }
}
