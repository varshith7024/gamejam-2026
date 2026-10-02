#!/usr/bin/env bash
# Negative Space - TEAM bootstrap for Linux
#
# Every teammate runs this once on their own machine, from inside the repo:
#   bash bootstrap.sh
#
# It is safe to re-run. It never overwrites existing files.
#
#   1. System tools   : git, curl, unzip (via dnf / pacman / apt if missing)
#   2. Node.js        : distro package on Fedora and Arch, nvm elsewhere
#   3. Git identity   : asks for name/email if not set (commit history is audited)
#   4. Project        : if package.json is missing, runs setup.sh (first person only);
#                       otherwise just runs npm install
#   5. Team files     : CONTRIBUTING, PR template, CI workflow, editorconfig,
#                       ROLES doc, pre-commit typecheck hook
#   6. Editor         : installs the VS Code Prettier extension if 'code' exists
#   7. Health check   : prints what works and what does not
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
say() { printf '\n\033[1m==> %s\033[0m\n' "$1"; }
ok()  { printf '  \033[32m[ok]\033[0m   %s\n' "$1"; }
bad() { printf '  \033[31m[FAIL]\033[0m %s\n' "$1"; }
put() {  # put <path>  (content from stdin, never overwrites)
  if [ -e "$1" ]; then echo "  skip (exists)  $1"; cat > /dev/null; return; fi
  mkdir -p "$(dirname "$1")"; cat > "$1"; echo "  created        $1"
}

# ---------- 1. System tools ----------
say "1/7 System tools"
missing=()
for t in git curl unzip; do command -v "$t" >/dev/null 2>&1 || missing+=("$t"); done
if [ ${#missing[@]} -gt 0 ]; then
  echo "Missing: ${missing[*]}"
  SUDO=""; [ "$(id -u)" -ne 0 ] && SUDO="sudo"
  if   command -v apt-get >/dev/null; then $SUDO apt-get update -y && $SUDO apt-get install -y "${missing[@]}"
  elif command -v dnf     >/dev/null; then $SUDO dnf install -y "${missing[@]}"
  elif command -v pacman  >/dev/null; then $SUDO pacman -S --needed --noconfirm "${missing[@]}"
  else echo "Unknown package manager. Please install: ${missing[*]}"; exit 1; fi
fi
ok "git, curl, unzip present"

git rev-parse --show-toplevel >/dev/null 2>&1 || { echo "Not inside a git repo. cd into the repo first."; exit 1; }
cd "$(git rev-parse --show-toplevel)"
echo "Repo root: $(pwd)"

# ---------- 2. Node.js ----------
say "2/7 Node.js"
need_node=1
if command -v node >/dev/null 2>&1; then
  major=$(node -v | sed 's/v\([0-9]*\).*/\1/'); [ "$major" -ge 18 ] && need_node=0
fi
if [ "$need_node" -eq 1 ]; then
  SUDO=""; [ "$(id -u)" -ne 0 ] && SUDO="sudo"
  if command -v dnf >/dev/null; then
    echo "Fedora: installing Node.js from the distro repos"
    $SUDO dnf install -y nodejs npm
  elif command -v pacman >/dev/null; then
    echo "Arch: installing Node.js from the distro repos"
    $SUDO pacman -S --needed --noconfirm nodejs npm
  else
    echo "Installing Node.js 20 via nvm"
    curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
    export NVM_DIR="$HOME/.nvm"
    # shellcheck disable=SC1091
    . "$NVM_DIR/nvm.sh"
    nvm install 20 && nvm use 20
    echo "NOTE: open a NEW terminal afterwards so 'node' is on your PATH."
  fi
fi
command -v node >/dev/null && command -v npm >/dev/null || { echo "Node/npm still not found. Install Node 20+ manually and re-run."; exit 1; }
ok "node $(node -v), npm $(npm -v)"

# ---------- 3. Git identity ----------
say "3/7 Git identity"
if [ -z "$(git config user.name || true)" ]; then
  read -r -p "Your full name for commits: " n; git config --global user.name "$n"
fi
if [ -z "$(git config user.email || true)" ]; then
  read -r -p "Your email for commits (same as your GitHub email): " e; git config --global user.email "$e"
fi
ok "committing as $(git config user.name) <$(git config user.email)>"

# ---------- 4. Project ----------
say "4/7 Project"
if [ ! -f package.json ]; then
  echo "No package.json found -> creating the project skeleton (first-person setup)."
  [ -f "$SCRIPT_DIR/setup.sh" ] || { echo "setup.sh not found next to bootstrap.sh"; exit 1; }
  bash "$SCRIPT_DIR/setup.sh"
else
  echo "package.json exists -> installing dependencies."
  if [ -f package-lock.json ]; then npm ci; else npm install; fi
fi

# ---------- 5. Team files ----------
say "5/7 Team files"

put .editorconfig <<'EOF'
root = true
[*]
indent_style = space
indent_size = 2
end_of_line = lf
charset = utf-8
trim_trailing_whitespace = true
insert_final_newline = true
EOF

put CONTRIBUTING.md <<'EOF'
# How we work (Team SuperThick)

1. Never push to `main`. Create a branch per feature: `git checkout -b feature/enemy-ai`
2. Commit small and often, with clear messages. Do not squash history (it is audited).
3. Before pushing: `npm run format && npm run typecheck`
4. Open a Pull Request. Another teammate reviews, then merge.
5. Numbers go in `src/config/balance.ts`. Text goes in `src/config/text.ts`.
6. Asset naming: `enemy_crawler_walk_01.png` (lowercase, underscores).
7. Added an asset or used an AI tool? Update `CREDITS.md` in the SAME commit.
8. Only free / CC0 / CC BY / open-source / AI-generated assets. No paid assets.
9. Do not paste in whole starter kits or other people's games.
EOF

put docs/ROLES.md <<'EOF'
# Roles and file ownership

Owning a folder = you are the person who reviews changes there. Everyone can still contribute.

| Member | Role | Owns |
|---|---|---|
| M1 | Gameplay programmer | src/entities/, src/scenes/GameScene.ts |
| M2 | Systems programmer | src/systems/, src/config/balance.ts, CI, merging PRs |
| M3 | Technical artist | src/shaders/, visual effects |
| M4 | 2D artist | public/assets/ (images), art direction |
| M5 | Writer / audio / QA / release | src/config/text.ts, audio, CREDITS.md, README.md, itch.io page |

Fill in names:
- M1:
- M2:
- M3:
- M4:
- M5:
EOF

put .github/pull_request_template.md <<'EOF'
## What does this change?

## How did you test it?

## Checklist
- [ ] `npm run typecheck` passes
- [ ] Added/updated CREDITS.md if I added an asset or used an AI tool
EOF

put .github/workflows/ci.yml <<'EOF'
name: CI
on:
  pull_request:
  push:
    branches: [main]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm run build
EOF

put .githooks/pre-commit <<'EOF'
#!/usr/bin/env bash
# Blocks commits that do not type-check. Skip once with: git commit --no-verify
npm run --silent typecheck
EOF
chmod +x .githooks/pre-commit
git config core.hooksPath .githooks
ok "pre-commit typecheck hook enabled"

# ---------- 6. Editor ----------
say "6/7 Editor"
EDITOR_CMD=""
for c in code codium code-oss; do command -v "$c" >/dev/null 2>&1 && { EDITOR_CMD="$c"; break; }; done
if [ -n "$EDITOR_CMD" ]; then
  "$EDITOR_CMD" --install-extension esbenp.prettier-vscode >/dev/null 2>&1 \
    && ok "$EDITOR_CMD: Prettier extension installed" \
    || echo "  could not auto-install the extension (non-fatal). In VS Code: Extensions -> search 'Prettier' -> Install."
else
  echo "  No 'code' command found (Flatpak VS Code?). In VS Code: Extensions -> search 'Prettier' -> Install."
fi

# ---------- 7. Health check ----------
say "7/7 Health check"
chk() { if "${@:2}" >/dev/null 2>&1; then ok "$1"; else bad "$1"; fi; }
chk "git"                git --version
chk "node 18+"           node -e 'process.exit(parseInt(process.versions.node)>=18?0:1)'
chk "npm"                npm -v
chk "phaser installed"   test -d node_modules/phaser
chk "typescript works"   npx --no-install tsc --version
chk "project type-checks" npm run --silent typecheck
chk "git hooks active"   test "$(git config core.hooksPath)" = ".githooks"

say "All set"
echo "Run the game:   npm run dev     (open the localhost link)"
echo "Make a branch:  git checkout -b feature/<what-you-are-doing>"
echo "Read:           CONTRIBUTING.md and docs/ROLES.md"
