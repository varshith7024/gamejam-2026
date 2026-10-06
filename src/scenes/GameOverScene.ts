import Phaser from 'phaser';

export interface GameOverData {
  levelId?: string;
  sceneKey?: string;
}

export class GameOverScene extends Phaser.Scene {
  private targetScene = 'Level1';

  constructor() {
    super('GameOver');
  }

  init(data?: GameOverData) {
    if (data?.sceneKey) {
      this.targetScene = data.sceneKey;
    } else if (data?.levelId === 'level3') {
      this.targetScene = 'Level3';
    } else if (data?.levelId === 'level2') {
      this.targetScene = 'Level2';
    } else {
      this.targetScene = 'Level1';
    }
  }

  create() {
    const { width, height } = this.scale;

    // Pitch black background
    this.cameras.main.setBackgroundColor('#000000');
    this.cameras.main.fadeIn(600, 0, 0, 0);

    // Stop combat audio
    this.sound.stopByKey('battleMusic');
    this.sound.stopByKey('heartbeat');
    this.sound.stopByKey('victory');

    const centerX = width / 2;
    const centerY = height * 0.40;

    // Main Title: "YOU HAVE FALLEN"
    const title = this.add.text(centerX, centerY, 'YOU HAVE FALLEN', {
      fontFamily: '"Cinzel Decorative", "Cinzel", "Georgia", serif',
      fontSize: '52px',
      fontStyle: 'bold',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 4,
      letterSpacing: 8,
    }).setOrigin(0.5);

    // Divider line
    const divider = this.add.text(centerX, centerY + 50, '───────  ❖  ───────', {
      fontFamily: '"Cinzel", "Georgia", serif',
      fontSize: '16px',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 2,
      letterSpacing: 4,
    }).setOrigin(0.5);

    // Subtitle
    const subtitle = this.add.text(centerX, centerY + 82, 'THE SHADOWS HAVE CONSUMED YOUR LIGHT', {
      fontFamily: '"Cinzel", "Georgia", serif',
      fontSize: '13px',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 2,
      letterSpacing: 6,
    }).setOrigin(0.5);

    // Options Container
    const optionsY = centerY + 180;
    const optionSpacing = 58;

    // --- TRY AGAIN OPTION ---
    const retryContainer = this.add.container(centerX, optionsY);

    const retryText = this.add.text(0, 0, 'TRY AGAIN', {
      fontFamily: '"Cinzel", "Georgia", serif',
      fontSize: '26px',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 3,
      letterSpacing: 8,
    }).setOrigin(0.5);

    const retryDiamondLeft = this.add.text(-140, 0, '✦', {
      fontFamily: '"Cinzel", "Georgia", serif',
      fontSize: '16px',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 2,
    }).setOrigin(0.5).setAlpha(0);

    const retryDiamondRight = this.add.text(140, 0, '✦', {
      fontFamily: '"Cinzel", "Georgia", serif',
      fontSize: '16px',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 2,
    }).setOrigin(0.5).setAlpha(0);

    retryContainer.add([retryText, retryDiamondLeft, retryDiamondRight]);

    const retryHitBox = this.add.zone(0, 0, 320, 48).setOrigin(0.5).setInteractive({ cursor: 'pointer' });
    retryContainer.add(retryHitBox);

    const onRetry = () => {
      this.cameras.main.fade(400, 0, 0, 0);
      this.time.delayedCall(400, () => {
        this.scene.start(this.targetScene);
      });
    };

    retryHitBox.on('pointerover', () => {
      retryText.setColor('#ffffff');
      retryText.setShadow(0, 0, '#ffffff', 12, true, true);
      retryDiamondLeft.setAlpha(1);
      retryDiamondRight.setAlpha(1);
    });

    retryHitBox.on('pointerout', () => {
      retryText.setColor('#ffffff');
      retryText.setShadow(0, 0, '#000000', 0, false, false);
      retryDiamondLeft.setAlpha(0);
      retryDiamondRight.setAlpha(0);
    });

    retryHitBox.on('pointerdown', onRetry);

    // --- MAIN MENU OPTION ---
    const menuContainer = this.add.container(centerX, optionsY + optionSpacing);

    const menuText = this.add.text(0, 0, 'MAIN MENU', {
      fontFamily: '"Cinzel", "Georgia", serif',
      fontSize: '22px',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 2,
      letterSpacing: 6,
    }).setOrigin(0.5);

    const menuDiamondLeft = this.add.text(-130, 0, '❖', {
      fontFamily: '"Cinzel", "Georgia", serif',
      fontSize: '14px',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 2,
    }).setOrigin(0.5).setAlpha(0);

    const menuDiamondRight = this.add.text(130, 0, '❖', {
      fontFamily: '"Cinzel", "Georgia", serif',
      fontSize: '14px',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 2,
    }).setOrigin(0.5).setAlpha(0);

    menuContainer.add([menuText, menuDiamondLeft, menuDiamondRight]);

    const menuHitBox = this.add.zone(0, 0, 300, 44).setOrigin(0.5).setInteractive({ cursor: 'pointer' });
    menuContainer.add(menuHitBox);

    const onMenu = () => {
      this.cameras.main.fade(400, 0, 0, 0);
      this.time.delayedCall(400, () => {
        this.scene.start('MainMenu');
      });
    };

    menuHitBox.on('pointerover', () => {
      menuText.setColor('#ffffff');
      menuText.setShadow(0, 0, '#ffffff', 10, true, true);
      menuDiamondLeft.setAlpha(1);
      menuDiamondRight.setAlpha(1);
    });

    menuHitBox.on('pointerout', () => {
      menuText.setColor('#ffffff');
      menuText.setShadow(0, 0, '#000000', 0, false, false);
      menuDiamondLeft.setAlpha(0);
      menuDiamondRight.setAlpha(0);
    });

    menuHitBox.on('pointerdown', onMenu);

    // Keyboard controls
    this.input.keyboard?.once('keydown-R', onRetry);
    this.input.keyboard?.once('keydown-ENTER', onRetry);
    this.input.keyboard?.once('keydown-SPACE', onRetry);
    this.input.keyboard?.once('keydown-M', onMenu);
    this.input.keyboard?.once('keydown-ESC', onMenu);
  }
}
