#!/usr/bin/env bash
# Negative Space - project setup for Linux
#
# Run from the ROOT of your existing git repo:
#   bash setup.sh
#
# What it does:
#   1. Checks you are inside a git repo (does NOT run git init or commit)
#   2. Installs Node.js 20 via nvm if Node is missing or too old
#   3. Creates the folder structure and starter files (never overwrites existing files)
#   4. Installs Phaser 3 + Vite + TypeScript + Prettier + bestzip
set -euo pipefail

say() { printf '\n\033[1m==> %s\033[0m\n' "$1"; }
put() {  # put <path>  (file content comes from stdin)
  if [ -e "$1" ]; then echo "  skip (exists)  $1"; cat > /dev/null; return; fi
  mkdir -p "$(dirname "$1")"
  cat > "$1"
  echo "  created        $1"
}

# ---------- 1. Checks ----------
say "Checking environment"
command -v git >/dev/null || { echo "git not found. Install: sudo apt install git"; exit 1; }
git rev-parse --show-toplevel >/dev/null 2>&1 || { echo "Not inside a git repo. cd into your repo first."; exit 1; }
cd "$(git rev-parse --show-toplevel)"
echo "Repo root: $(pwd)"

# ---------- 2. Node.js ----------
need_node=1
if command -v node >/dev/null 2>&1; then
  major=$(node -v | sed 's/v\([0-9]*\).*/\1/')
  [ "$major" -ge 18 ] && need_node=0
fi
if [ "$need_node" -eq 1 ]; then
  say "Installing Node.js 20 via nvm"
  command -v curl >/dev/null || { echo "curl not found. Install: sudo apt install curl"; exit 1; }
  curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
  export NVM_DIR="$HOME/.nvm"
  # shellcheck disable=SC1091
  . "$NVM_DIR/nvm.sh"
  nvm install 20
  nvm use 20
fi
echo "node $(node -v)  |  npm $(npm -v)"

# ---------- 3. Files ----------
say "Creating files"

put package.json <<'EOF'
{
  "name": "negative-space",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview",
    "typecheck": "tsc --noEmit",
    "format": "prettier --write \"src/**/*.ts\"",
    "zip": "npm run build && cd dist && bestzip ../negative-space-web.zip *"
  }
}
EOF

put .nvmrc <<'EOF'
20
EOF

put tsconfig.json <<'EOF'
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "isolatedModules": true
  },
  "include": ["src"]
}
EOF

# base './' is REQUIRED so the build works inside itch.io
put vite.config.ts <<'EOF'
import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: { chunkSizeWarningLimit: 2000 },
});
EOF

put .prettierrc <<'EOF'
{ "singleQuote": true, "semi": true, "printWidth": 100 }
EOF

# append to .gitignore if it exists, otherwise create it
touch .gitignore
for line in node_modules dist '*.zip' .DS_Store; do
  grep -qxF "$line" .gitignore || echo "$line" >> .gitignore
done

put index.html <<'EOF'
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Negative Space</title>
    <style>
      html, body { margin: 0; height: 100%; background: #000; overflow: hidden; }
      #game { width: 100%; height: 100%; }
    </style>
  </head>
  <body>
    <div id="game"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
EOF

put src/main.ts <<'EOF'
import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { MenuScene } from './scenes/MenuScene';
import { GameScene } from './scenes/GameScene';

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#000000',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: 1280,
    height: 720,
  },
  scene: [BootScene, MenuScene, GameScene],
});
EOF

put src/config/balance.ts <<'EOF'
// All tunable numbers live here so design/QA can tweak without touching logic.
export const BALANCE = {
  startLight: 0.3,      // 0..1
  dimPerSecond: 0.02,   // how fast the screen dims on its own
  killLightGain: 0.05,  // light added per kill (before multiplier)
  playerSpeed: 320,
};
EOF

put src/config/text.ts <<'EOF'
// All narration / on-screen text lives here (owned by the writer).
export const TEXT = {
  title: 'NEGATIVE SPACE',
  start: 'CLICK TO START',
  gameOver: 'THE LIGHT IS GONE',
};
EOF

put src/systems/LightSystem.ts <<'EOF'
import Phaser from 'phaser';
import { BALANCE } from '../config/balance';

/** One brightness value (0..1) drives survival, score and visibility. */
export class LightSystem extends Phaser.Events.EventEmitter {
  value = BALANCE.startLight;

  update(deltaMs: number) {
    this.setValue(this.value - BALANCE.dimPerSecond * (deltaMs / 1000));
  }

  add(amount: number) {
    this.setValue(this.value + amount);
  }

  private setValue(v: number) {
    this.value = Phaser.Math.Clamp(v, 0, 1);
    this.emit('changed', this.value);
    if (this.value <= 0) this.emit('dead');
  }
}
EOF

put src/scenes/BootScene.ts <<'EOF'
import Phaser from 'phaser';

export class BootScene extends Phaser.Scene {
  constructor() { super('Boot'); }
  preload() {
    // Load assets from public/assets/, e.g.:
    // this.load.image('player', 'assets/player.png');
  }
  create() { this.scene.start('Menu'); }
}
EOF

put src/scenes/MenuScene.ts <<'EOF'
import Phaser from 'phaser';
import { TEXT } from '../config/text';

export class MenuScene extends Phaser.Scene {
  constructor() { super('Menu'); }
  create() {
    const { width, height } = this.scale;
    this.add.text(width / 2, height / 2 - 40, TEXT.title, { fontSize: '64px', color: '#fff' }).setOrigin(0.5);
    this.add.text(width / 2, height / 2 + 40, TEXT.start, { fontSize: '24px', color: '#aaa' }).setOrigin(0.5);
    this.input.once('pointerdown', () => this.scene.start('Game'));
  }
}
EOF

put src/scenes/GameScene.ts <<'EOF'
import Phaser from 'phaser';
import { BALANCE } from '../config/balance';
import { TEXT } from '../config/text';
import { LightSystem } from '../systems/LightSystem';

// Tiny demo so everyone can confirm the setup works. Replace freely.
export class GameScene extends Phaser.Scene {
  private light!: LightSystem;
  private player!: Phaser.GameObjects.Rectangle;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private hud!: Phaser.GameObjects.Text;
  private overlay!: Phaser.GameObjects.Rectangle;

  constructor() { super('Game'); }

  create() {
    const { width, height } = this.scale;
    this.light = new LightSystem();
    this.overlay = this.add.rectangle(0, 0, width, height, 0xffffff).setOrigin(0).setDepth(-1);
    this.player = this.add.rectangle(width / 2, height / 2, 32, 32, 0x00ffcc);
    this.hud = this.add.text(16, 16, '', { fontSize: '20px', color: '#f0f' });
    this.keys = this.input.keyboard!.addKeys('W,A,S,D,SPACE') as Record<string, Phaser.Input.Keyboard.Key>;

    // SPACE simulates a kill for now
    this.keys.SPACE.on('down', () => this.light.add(BALANCE.killLightGain));
    this.light.on('dead', () => {
      this.add.text(width / 2, height / 2, TEXT.gameOver, { fontSize: '48px', color: '#fff' }).setOrigin(0.5);
      this.scene.pause();
    });
  }

  update(_t: number, dt: number) {
    this.light.update(dt);
    const s = BALANCE.playerSpeed * (dt / 1000);
    if (this.keys.A.isDown) this.player.x -= s;
    if (this.keys.D.isDown) this.player.x += s;
    if (this.keys.W.isDown) this.player.y -= s;
    if (this.keys.S.isDown) this.player.y += s;
    this.overlay.setAlpha(this.light.value);
    this.hud.setText('LIGHT ' + Math.round(this.light.value * 100) + '%  (WASD move, SPACE = fake kill)');
  }
}
EOF

mkdir -p public/assets src/entities src/ui src/shaders
touch public/assets/.gitkeep src/entities/.gitkeep src/ui/.gitkeep src/shaders/.gitkeep

put LICENSE <<'EOF'
MIT License

Copyright (c) YEAR Team SuperThick

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
EOF
[ -f LICENSE ] && sed -i "s/YEAR/$(date +%Y)/" LICENSE

put README.md <<'EOF'
# Negative Space

Play it here: **ITCH_IO_LINK_HERE**

## Setup and run
```
npm install
npm run dev      # local dev server (http://localhost:5173)
npm run build    # production build into dist/
npm run zip      # build + negative-space-web.zip for itch.io upload
```
Requires Node.js 20 LTS and Git.

## Controls
- (fill in as controls are finalised)

## Team SuperThick
- Varshith - indieconnect.in/dev/varshithanthagiri
- Samyak - indieconnect.in/dev/catchsamyak
- Supratheek - indieconnect.in/dev/suprocks
- Akash - indieconnect.in/dev/bigblast_66
- Sravan - indieconnect.in/dev/sraav

## AI disclosure and credits
See CREDITS.md.
EOF

put CREDITS.md <<'EOF'
# Credits and AI Disclosure

Update this file the moment you add any asset or use any AI tool.

## Third-party assets
| Asset | Author / source link | Licence | Used for |
|---|---|---|---|
| Phaser 3 (engine) | https://phaser.io | MIT | Game engine |

## AI tools used
| Tool | What it produced | Where used | Edited by humans? |
|---|---|---|---|
| (example) Claude | Setup script, code help | Project skeleton | Yes |
EOF

# ---------- 4. Dependencies ----------
say "Installing dependencies"
npm install phaser@3
npm install -D vite@5 typescript@5 prettier bestzip

say "Done"
echo "Next:  npm run dev   (then open the localhost link)"
echo "Then review with:  git status   and commit on a branch:"
echo "  git checkout -b chore/project-setup && git add -A && git commit -m 'Add project skeleton'"
