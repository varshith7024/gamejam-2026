import Phaser from 'phaser';

export class Cutscene2Scene extends Phaser.Scene {
  private iframe?: HTMLIFrameElement;
  private isDone = false;
  private score = 0;

  constructor() {
    super('Cutscene2');
  }

  init(data?: { score?: number }) {
    this.score = data?.score ?? (this.registry.get('finalScore') || 0);
  }

  create() {
    this.cameras.main.setBackgroundColor('#000000');
    this.isDone = false;

    // Create fullscreen iframe overlay for Cutscene 2
    const iframe = document.createElement('iframe');
    iframe.src = 'assets/cutscene2.html';
    iframe.style.position = 'fixed';
    iframe.style.top = '0';
    iframe.style.left = '0';
    iframe.style.width = '100vw';
    iframe.style.height = '100vh';
    iframe.style.border = 'none';
    iframe.style.zIndex = '99999';
    iframe.style.backgroundColor = '#000000';
    iframe.allow = 'autoplay';

    this.iframe = iframe;
    document.body.appendChild(iframe);

    const onComplete = () => {
      if (this.isDone) return;
      this.isDone = true;

      // 1. Immediately cancel speech synthesis in both top window and iframe
      try {
        window.speechSynthesis.cancel();
      } catch {}

      // 2. Stop any audio/speech running in the cutscene iframe
      try {
        const cw = this.iframe?.contentWindow as any;
        if (cw) {
          if (cw.terminateCutscene) cw.terminateCutscene();
          if (cw.speechSynthesis) cw.speechSynthesis.cancel();
          if (cw.stopMusic) cw.stopMusic();
          if (cw.ac && cw.ac.close) cw.ac.close();
        }
      } catch {}

      // 3. Clear iframe src to about:blank to instantly sever all background execution
      if (this.iframe) {
        try {
          this.iframe.src = 'about:blank';
        } catch {}
      }
      this.cleanup();

      // 4. Force-unlock and resume parent Web Audio context
      const snd = this.sound as any;
      if (snd.context && snd.context.state === 'suspended') {
        snd.context.resume();
      }
      snd.locked = false;
      snd.unlocked = true;
      this.sound.emit(Phaser.Sound.Events.UNLOCKED, this.sound);

      // 5. Transition directly to the points screen
      this.scene.start('Points', { score: this.score });
    };

    // Attach listeners across all possible event pathways
    iframe.onload = () => {
      try {
        const cw = iframe.contentWindow as any;
        if (cw) {
          cw.addEventListener('cutscene:complete', onComplete);
          cw.onCutsceneComplete = onComplete;
          if (cw.ac && cw.ac.state === 'suspended') {
            cw.ac.resume();
          }
        }
      } catch (err) {
        console.warn('Cutscene2 iframe hook warning:', err);
      }
    };

    const messageHandler = (event: MessageEvent) => {
      if (event.data === 'cutscene:complete') {
        onComplete();
      }
    };
    window.addEventListener('message', messageHandler);

    const customEventHandler = () => {
      onComplete();
    };
    window.addEventListener('cutscene:complete', customEventHandler);

    // Keyboard shortcut fallback: Escape key allows skipping the cutscene
    const escKey = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);
    escKey?.once('down', onComplete);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      window.removeEventListener('message', messageHandler);
      window.removeEventListener('cutscene:complete', customEventHandler);
      this.cleanup();
    });

    this.events.once(Phaser.Scenes.Events.DESTROY, () => {
      window.removeEventListener('message', messageHandler);
      window.removeEventListener('cutscene:complete', customEventHandler);
      this.cleanup();
    });
  }

  private cleanup() {
    if (this.iframe) {
      try {
        this.iframe.src = 'about:blank';
      } catch {}
      if (this.iframe.parentElement) {
        this.iframe.parentElement.removeChild(this.iframe);
      }
      this.iframe = undefined;
    }
  }
}
