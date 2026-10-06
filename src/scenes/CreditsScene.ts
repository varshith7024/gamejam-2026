import Phaser from 'phaser';

export class CreditsScene extends Phaser.Scene {
  private isReturning = false;
  private creditsMusic?: Phaser.Sound.BaseSound;

  constructor() {
    super('Credits');
  }

  create() {
    this.isReturning = false;
    const { width, height } = this.scale;

    // Pitch black background matching game theme
    this.cameras.main.setBackgroundColor('#000000');
    this.cameras.main.fadeIn(500, 0, 0, 0);

    // Audio: ensure menu music keeps playing smoothly
    this.startMusic();

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      // Don't kill music abruptly if returning to MainMenu which uses the same track
    });

    const centerX = width / 2;
    const centerY = height * 0.44;

    // --- 1. HEADER ---
    this.add.text(centerX, 72, 'NEGATIVE SPACE', {
      fontFamily: '"Cinzel Decorative", "Cinzel", "Georgia", serif',
      fontSize: '44px',
      fontStyle: 'bold',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 4,
      letterSpacing: 8,
    }).setOrigin(0.5, 0.5);

    this.add.text(centerX, 120, '❖   CREDITS   ❖', {
      fontFamily: '"Cinzel", "Georgia", serif',
      fontSize: '15px',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 2,
      letterSpacing: 5,
    }).setOrigin(0.5, 0.5);

    this.add.text(centerX, 148, '───────  ✦  ───────', {
      fontFamily: '"Cinzel", "Georgia", serif',
      fontSize: '14px',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 2,
      letterSpacing: 4,
    }).setOrigin(0.5, 0.5);

    // --- 2. TEAM NAME ---
    this.add.text(centerX, 190, 'TEAM SUPERTHICK', {
      fontFamily: '"Cinzel Decorative", "Cinzel", "Georgia", serif',
      fontSize: '26px',
      fontStyle: 'bold',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 3,
      letterSpacing: 6,
    }).setOrigin(0.5, 0.5);

    // --- 3. TEAM ROSTER TABLET ---
    const panelW = 720;
    const panelH = 290;
    const panelY = centerY + 45;

    const panelGfx = this.add.graphics();
    // Backing plate
    panelGfx.fillStyle(0x000000, 0.95);
    panelGfx.fillRoundedRect(centerX - panelW / 2, panelY - panelH / 2, panelW, panelH, 6);
    // Outer white border
    panelGfx.lineStyle(2, 0xffffff, 1.0);
    panelGfx.strokeRoundedRect(centerX - panelW / 2, panelY - panelH / 2, panelW, panelH, 6);
    // Inner frame
    panelGfx.lineStyle(1, 0xffffff, 0.4);
    panelGfx.strokeRoundedRect(centerX - panelW / 2 + 4, panelY - panelH / 2 + 4, panelW - 8, panelH - 8, 4);

    // Corner rivets
    panelGfx.fillStyle(0xffffff, 1.0);
    const corners = [
      [centerX - panelW / 2 + 8, panelY - panelH / 2 + 8],
      [centerX + panelW / 2 - 8, panelY - panelH / 2 + 8],
      [centerX - panelW / 2 + 8, panelY + panelH / 2 - 8],
      [centerX + panelW / 2 - 8, panelY + panelH / 2 - 8],
    ];
    for (const [cx, cy] of corners) {
      panelGfx.fillCircle(cx, cy, 2.5);
    }

    // Credits Members & Roles
    const members = [
      { name: 'VARSHITH', role: 'CTO' },
      { name: 'AKASH', role: 'CEO' },
      { name: 'SRAVAN', role: 'GAME TESTER' },
      { name: 'SAMYAK', role: 'ARTISTIC DIRECTOR' },
      { name: 'SUPRATHEEK', role: 'PART OF THE TEAM' },
    ];

    const startListY = panelY - panelH / 2 + 42;
    const rowSpacing = 44;

    members.forEach((m, idx) => {
      const y = startListY + idx * rowSpacing;

      // Left diamond bullet
      this.add.text(centerX - panelW / 2 + 36, y, '✦', {
        fontFamily: '"Cinzel", "Georgia", serif',
        fontSize: '13px',
        color: '#ffffff',
        stroke: '#000000',
        strokeThickness: 2,
      }).setOrigin(0, 0.5);

      // Member name
      this.add.text(centerX - panelW / 2 + 64, y, m.name, {
        fontFamily: '"Cinzel", "Georgia", serif',
        fontSize: '16px',
        fontStyle: 'bold',
        color: '#ffffff',
        stroke: '#000000',
        strokeThickness: 2,
        letterSpacing: 2,
      }).setOrigin(0, 0.5);

      // Ornate separator dash
      this.add.text(centerX + 30, y, '—', {
        fontFamily: '"Cinzel", "Georgia", serif',
        fontSize: '16px',
        color: '#ffffff',
        stroke: '#000000',
        strokeThickness: 2,
      }).setOrigin(0.5, 0.5);

      // Role title
      this.add.text(centerX + panelW / 2 - 36, y, m.role, {
        fontFamily: '"Cinzel", "Georgia", serif',
        fontSize: '15px',
        color: '#ffffff',
        stroke: '#000000',
        strokeThickness: 2,
        letterSpacing: 2,
      }).setOrigin(1, 0.5);

      // Row divider line (except after the last item)
      if (idx < members.length - 1) {
        panelGfx.lineStyle(1, 0xffffff, 0.15);
        panelGfx.lineBetween(
          centerX - panelW / 2 + 30,
          y + rowSpacing / 2,
          centerX + panelW / 2 - 30,
          y + rowSpacing / 2,
        );
      }
    });

    // --- 4. RETURN BUTTON ---
    const btnY = height - 60;
    const btnW = 280;
    const btnH = 42;

    const btnContainer = this.add.container(centerX, btnY);
    const btnGfx = this.add.graphics();
    btnGfx.fillStyle(0x000000, 1.0);
    btnGfx.fillRoundedRect(-btnW / 2, -btnH / 2, btnW, btnH, 6);
    btnGfx.lineStyle(1.5, 0xffffff, 1.0);
    btnGfx.strokeRoundedRect(-btnW / 2, -btnH / 2, btnW, btnH, 6);

    const btnText = this.add.text(0, 0, '✦   MAIN MENU   ✦', {
      fontFamily: '"Cinzel", "Georgia", serif',
      fontSize: '15px',
      fontStyle: 'bold',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 2,
      letterSpacing: 3,
    }).setOrigin(0.5, 0.5);

    const hitZone = this.add.zone(0, 0, btnW, btnH).setOrigin(0.5, 0.5).setInteractive({ cursor: 'pointer' });
    btnContainer.add([btnGfx, btnText, hitZone]);

    const onReturn = () => {
      if (this.isReturning) return;
      this.isReturning = true;

      this.cameras.main.fade(350, 0, 0, 0);
      this.time.delayedCall(350, () => {
        this.scene.start('MainMenu');
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

    hitZone.on('pointerdown', onReturn);

    // Keyboard shortcuts
    this.input.keyboard?.once('keydown-ESC', onReturn);
    this.input.keyboard?.once('keydown-ENTER', onReturn);
    this.input.keyboard?.once('keydown-SPACE', onReturn);
    this.input.keyboard?.once('keydown-B', onReturn);
    this.input.keyboard?.once('keydown-M', onReturn);
  }

  private startMusic() {
    const existing = this.sound.getAll('menumusic');
    for (const m of existing) {
      if (m.isPlaying) {
        this.creditsMusic = m;
        return;
      }
    }

    if (!this.sound.locked) {
      this.creditsMusic = this.sound.add('menumusic', { loop: true, volume: 0.60 });
      this.creditsMusic.play();
    }
  }
}
