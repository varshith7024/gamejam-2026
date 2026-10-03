import Phaser from 'phaser';
import { Enemy } from '../entities/Enemy';
import { Level1Environment, DEPTH } from '../environment/Level1Environment';
import { Atmosphere } from '../effects/Atmosphere';
import { LEVEL1 } from '../environment/level1Data';
import { BALANCE } from '../config/balance';
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

    // Reset state in case of restart
    this.enemies = [];
    this.isDead = false;
    this.enemyHitCooldown = 0;
    this.currentAction = 'idle';
    this.actionVelocity.set(0, 0);

    // Build environment and atmosphere
    this.env = new Level1Environment(this);
    this.atmosphere = new Atmosphere(this);
    this.atmosphere.create();

    // Create player sprite (origin at ground feet contact point)
    this.currentAimDir = 0; // Starts facing right (East)
    this.player = this.add.sprite(LEVEL1.playerStart.x, LEVEL1.playerStart.y, 'Idle', 0);
    this.player.setOrigin(0.5, 0.78);
    this.player.setScale(1.1);
    this.player.setDepth(this.player.y);
    this.playDirectional('Idle', 0, false);

    // Spawn 20 enemies around the edges of LEVEL1.world
    this.spawnEdgeEnemies(20);

    this.setupInput();
    this.setupAnimationCallbacks();
    this.setupCamera();
    this.showTitleCard();

    // Debug mode (?debug in URL)
    if (new URLSearchParams(window.location.search).has('debug')) {
      this.debugOn = true;
      this.env.setDebug(true);
      (window as unknown as Record<string, unknown>).__level1 = this;
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

  // ---------- UI ----------
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
      onComplete: () => [title, sub].forEach((t) => t.destroy()),
    });

    this.add
      .text(
        width / 2,
        toCamY(height - 22),
        'WASD: Move | Shift: Sprint | Space: Roll | L-Click: Attack | R-Click: Block | G: Toggle Debug',
        {
          fontSize: '15px',
          color: '#e4e0f2',
          stroke: '#000000',
          strokeThickness: 4,
        },
      )
      .setOrigin(0.5)
      .setScale(1 / z)
      .setScrollFactor(0)
      .setDepth(DEPTH.screen + 1)
      .setAlpha(0.75);
  }

  // -----------------------------------------------------------------
  // 8-DIRECTION CALCULATION (0=E, 1=SE, 2=S, 3=SW, 4=W, 5=NW, 6=N, 7=NE)
  // -----------------------------------------------------------------
  private computeAimDirection(): number {
    const pointer = this.input.activePointer;
    const dx = pointer.worldX - this.player.x;
    const dy = pointer.worldY - this.player.y;

    if (dx * dx + dy * dy < 16) {
      return this.currentAimDir; // keep previous if right on player
    }

    const rad = Math.atan2(dy, dx);
    let deg = Phaser.Math.RadToDeg(rad);
    if (deg < 0) deg += 360;

    // Sector of 45° centered at 0° is [-22.5°, 22.5°), so add 22.5°
    return Math.floor(((deg + 22.5) % 360) / 45);
  }

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

    // Preserve frame progress when rotating the same animation across directions
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

    // Track mouse aim direction
    this.currentAimDir = this.computeAimDirection();

    this.handleActionInputs();
    this.handleLocomotion(dt);

    // 1. Compute crowd separation vectors for all enemies
    for (const enemy of this.enemies) {
      enemy.computeSeparation(this.enemies);
    }

    // 2. Update all enemies pursuing the player in the arena
    for (const enemy of this.enemies) {
      enemy.update(dt, this.player.x, this.player.y, this.env.area);
    }

    // 2.5D depth sorting based on ground feet position
    this.player.setDepth(this.player.y);

    // Check enemy attacks hitting player
    this.checkEnemyAttackHit(dt);

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
      // 180 turn opposite to current aim
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
        // Track mouse rotation while holding block
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
      this.scheduleAttackHitCheck(120);
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
    this.scheduleAttackHitCheck(130);

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
    // Knockback opposite to facing
    this.actionVelocity.set(-Math.cos(rad) * 140, -Math.sin(rad) * 140);

    this.currentAction = 'hurt';
    this.playDirectional('TakeDamage', this.actionDir, false);
  }

  private die() {
    this.isDead = true;
    this.currentAction = 'die';
    this.actionVelocity.set(0, 0);
    this.playDirectional('Die', this.currentAimDir, false);
  }

  private revive() {
    this.isDead = false;
    this.currentAction = 'idle';
    this.player.setPosition(LEVEL1.playerStart.x, LEVEL1.playerStart.y);
    this.playDirectional('Idle', this.currentAimDir, false);
  }

  private playOneShotAction(animBase: string, actionState: ActionState) {
    this.actionDir = this.currentAimDir;
    this.currentAction = actionState;
    this.playDirectional(animBase, this.currentAimDir, false);

    if (
      actionState === 'kick' ||
      actionState === 'pummel' ||
      animBase === 'MeleeSpin' ||
      animBase === 'Special1' ||
      animBase === 'Special2'
    ) {
      this.scheduleAttackHitCheck(140);
    }
  }

  private scheduleAttackHitCheck(delayMs: number) {
    this.time.delayedCall(delayMs, () => {
      if (
        this.currentAction === 'attack' ||
        this.currentAction === 'kick' ||
        this.currentAction === 'pummel' ||
        this.currentAction === 'special1' ||
        this.currentAction === 'special2'
      ) {
        this.checkPlayerAttackHit();
      }
    });
  }

  private spawnEdgeEnemies(count: number) {
    const worldW = LEVEL1.world.width;
    const worldH = LEVEL1.world.height;
    const margin = 100;

    for (let i = 0; i < count; i++) {
      // Distribute evenly across 4 edges: 0=Top, 1=Right, 2=Bottom, 3=Left
      const edge = i % 4;
      let startX = 0;
      let startY = 0;

      // Distance offset just outside visible frame so they stream in continuously
      const depthOffset = Phaser.Math.Between(50, 180);

      switch (edge) {
        case 0: // Top
          startX = Phaser.Math.Between(margin, worldW - margin);
          startY = -depthOffset;
          break;
        case 1: // Right
          startX = worldW + depthOffset;
          startY = Phaser.Math.Between(margin, worldH - margin);
          break;
        case 2: // Bottom
          startX = Phaser.Math.Between(margin, worldW - margin);
          startY = worldH + depthOffset;
          break;
        case 3: // Left
          startX = -depthOffset;
          startY = Phaser.Math.Between(margin, worldH - margin);
          break;
      }

      const championType = i % 2 === 0 ? 'Yi' : 'Zed';
      const enemy = new Enemy(this, startX, startY, championType);
      this.enemies.push(enemy);
    }
  }

  private checkPlayerAttackHit() {
    if (this.enemies.length === 0 || this.isDead) return;

    for (const enemy of this.enemies) {
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
        enemy.takeDamage(this.player.x, this.player.y, this.env.area);
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
      if (!enemy.isPerformingAttack()) continue;

      const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, enemy.x, enemy.y);
      if (dist > 75) continue;

      // Invulnerable during rolls or flips
      if (this.currentAction === 'roll' || this.currentAction === 'flip') {
        return;
      }

      // Shield block active: absorb impact and push back slightly
      if (this.currentAction === 'block') {
        const rad = Math.atan2(this.player.y - enemy.y, this.player.x - enemy.x);
        this.movePlayer(Math.cos(rad) * 16, Math.sin(rad) * 16);
        this.enemyHitCooldown = 0.5;
        return;
      }

      // Player takes damage
      this.triggerHurt();
      this.enemyHitCooldown = 0.8;
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

      // Angular difference between aim direction and movement direction
      const moveDir = this.computeMoveDirection(moveInput.x, moveInput.y);
      let diff = Math.abs(this.currentAimDir - moveDir);
      if (diff > 4) diff = 8 - diff;

      let targetAnim = 'Walk';

      if (isCrouching) {
        targetAnim = 'CrouchRun';
      } else if (diff >= 3) {
        // Moving backwards relative to mouse aim
        targetAnim = 'RunBackwards';
      } else if (diff === 2) {
        // Moving sideways perpendicular to mouse aim
        const signedDiff = (moveDir - this.currentAimDir + 8) % 8;
        targetAnim = signedDiff === 2 ? 'StrafeRight' : 'StrafeLeft';
      } else if (isSprinting) {
        targetAnim = 'Run';
      } else {
        targetAnim = 'Walk';
      }

      this.playDirectional(targetAnim, this.currentAimDir, true);
    } else {
      // Standing still facing mouse direction
      this.currentAction = 'idle';

      const isCrouching = this.keyC.isDown;
      const idleAnim = isCrouching ? 'CrouchIdle' : 'Idle';

      this.playDirectional(idleAnim, this.currentAimDir, true);
    }
  }
}
