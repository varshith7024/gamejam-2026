# Main Character Controls

Complete control guide for the controllable Knight character in **Negative Space**.

---

## 1. Locomotion & Stance

| Control | Action | Details |
| :--- | :--- | :--- |
| **Mouse Pointer** | **Aim / Facing** | Character faces the cursor dynamically across all 8 rendered directions. |
| `W`, `A`, `S`, `D` | **Walk** | Omnidirectional free movement at **180 px/s**. Plays `Walk`. |
| `Shift` + `WASD` | **Sprint / Run** | High-speed forward sprint at **320 px/s**. Plays `Run`. |
| `C` (Hold) | **Crouch Idle** | Low-profile crouching posture. Plays `CrouchIdle`. |
| `C` + `WASD` | **Crouch Walk** | Low-profile movement at **100 px/s**. Plays `CrouchRun`. |
| `S` (Relative to cursor) | **Run Backwards** | Automatic backwards jog when moving opposite to mouse aim. |
| `A` / `D` (Relative to cursor) | **Strafe Left / Right** | Automatic sidestep animations when moving perpendicular to mouse aim. |

---

## 2. Melee Combat & Combos

| Control | Action | Details |
| :--- | :--- | :--- |
| **Left Click** | **Primary Combo** | **3-hit chaining attack sequence** (resets after 1.2s of inactivity):<br>• **Hit 1**: Standard Melee Slash (`Melee`)<br>• **Hit 2**: Cross Slash (`Melee2`)<br>• **Hit 3**: 360° Whirlwind Finisher (`MeleeSpin`) |
| `Shift` + `WASD` + **Left Click** | **Running Slash** | Running forward thrust (`MeleeRun`). Maintains sprint momentum. |
| `E` | **Whirlwind Spin** | Instant 360° sweeping sword spin (`MeleeSpin`). Hits all surrounding enemies. |
| `Q` | **Kick** | Forward physical boot kick (`Kick`). Knocks back close targets. |
| `V` | **Pummel** | Heavy close-quarters pommel strike (`Pummel`). |
| `R` | **Special Strike 1** | Acrobatic overhead leaping strike (`Special1`). |
| `T` | **Special Strike 2** | Heavy vertical execution slam (`Special2`). |
| `X` | **Cast Spell** | Channeling magic stance (`CastSpell`). |
| `U` | **Unsheath Sword** | Combat-ready sword draw animation (`UnSheathSword`). |

---

## 3. Defense & Evasion

| Control | Action | Details |
| :--- | :--- | :--- |
| **Right Click** (Hold) | **Shield Block** | Raises shield (`ShieldBlockStart` $\rightarrow$ `ShieldBlockMid`).<br>• Blocks enemy melee strikes and absorbs damage.<br>• Mouse rotates the shield direction while held.<br>• Allows slow tactical movement at **90 px/s**. |
| `Space` | **Combat Roll** | High-speed evasive dodge roll at **420 px/s** (`Rolling`).<br>• Invulnerable to incoming attacks during roll.<br>• Rolls toward movement keys, or toward cursor if stationary. |
| `F` | **Front Flip** | Forward acrobatic evasive leap at **280 px/s** (`FrontFlip`). Invulnerable during flip. |
| `Z` | **Slide** | Low-profile slide tackle at **360 px/s** (`SlideStart` $\rightarrow$ `Slide` $\rightarrow$ `SlideEnd`). |

---

## 4. Utility & Reactions

| Control | Action | Details |
| :--- | :--- | :--- |
| `B` | **180° Quick Turn** | Instantly spins character 180° opposite to current mouse cursor (`180Turn`). |
| `H` | **Take Damage** | Flinch and recoil with slight knockback (`TakeDamage`). |
| `K` | **Die** | Trigger character death collapse (`Die`). |
| `K` or `Space` (When dead) | **Revive** | Revives character back to full standing idle (`Idle`). |
