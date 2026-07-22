# Instructions for Claude

## PWA Versioning

**IMPORTANT**: Every code change requires updating the version in TWO places:

1. **`service-worker.js`** - line 2:
   ```javascript
   const APP_VERSION = '2.3.1';  // Change here
   ```

2. **`index.html`** - find the `#versionInfo` div:
   ```html
   <div id="versionInfo">v2.3.1</div>  <!-- And here -->
   ```

### Version Increment Rules

- **PATCH** (2.2.x): Default for all changes (bug fixes, new features, improvements)
- **MINOR** (2.x.0): For large changes or significant refactors
- **MAJOR** (x.0.0): Only when explicitly requested by the user

This ensures that:
- The cache invalidates correctly
- Users can see the new version
- The update banner shows when there are changes

---

## Architecture Overview

This is a Breakout/Ballz-style game built with vanilla JavaScript following the **Open/Closed Principle** via the **Strategy Pattern**.

### Directory Structure

```
glow-break/
├── index.html          # Entry point
├── main.js             # Initialization and event setup
├── game.js             # Game state and turn logic
├── physics.js          # Ball physics and collisions
├── rendering.js        # Canvas rendering
├── input.js            # User input handling
├── config.js           # Difficulty settings and constants
├── service-worker.js   # PWA cache management
│
└── js/
    ├── core/
    │   ├── Constants.js    # Game constants
    │   ├── Config.js       # Difficulty manager
    │   └── Registry.js     # Type registry system
    │
    ├── behaviors/          # Strategy Pattern implementations
    │   ├── index.js        # Exports all behaviors
    │   ├── BrickBehaviors.js
    │   ├── BallBehaviors.js
    │   └── BonusBehaviors.js
    │
    ├── systems/
    │   └── BrickGenerator.js
    │
    ├── entities/
    │   ├── Brick.js
    │   ├── Ball.js
    │   ├── Bonus.js
    │   └── Particle.js
    │
    └── utils/
        ├── CanvasUtils.js
        └── MathUtils.js
```

---

## Open/Closed Principle - Strategy Pattern

The codebase uses a **Registry + Strategy** pattern. This means:
- **Open for extension**: Add new types by creating behaviors
- **Closed for modification**: No need to edit existing code

### Registries

Three registries exist in `js/core/Registry.js`:
- `BrickRegistry` - For brick types
- `BallRegistry` - For ball types
- `BonusRegistry` - For bonus/powerup types

### Adding a New Brick Type

1. Create the behavior in `js/behaviors/BrickBehaviors.js`:

```javascript
const FrozenBrickBehavior = {
    type: 'frozen',
    emoji: '❄️',
    overlayColor: 'rgba(135, 206, 235, 0.3)',

    render(ctx, brick, helpers) {
        const { getFontSize, getScale } = helpers;

        ctx.fillStyle = this.overlayColor;
        ctx.beginPath();
        ctx.roundRect(brick.x + 2, brick.y + 2, brick.width, brick.height, 6);
        ctx.fill();

        ctx.fillStyle = 'rgba(255,255,255,0.8)';
        ctx.font = `${getFontSize(12)}px Arial`;
        ctx.textAlign = 'center';
        ctx.fillText(this.emoji, brick.x + 2 + brick.width / 2, brick.y + 15 * getScale());
    },

    onDestroy(brick, gameState, helpers) {
        // Called when brick is destroyed
        // Return { damagedBricks: [...], spawnedBricks: [...] } for effects
        return null;
    },

    onDamage(brick, damage, gameState) {
        // Modify incoming damage (e.g., return damage * 0.5 for 50% reduction)
        return damage;
    },

    onTurnStart(brick, gameState) {
        // Called at start of each turn
    },

    onTurnEnd(brick, gameState) {
        // Called at end of each turn (e.g., regeneration)
    },

    getConfig() {
        return {
            minTurn: 10,           // Minimum turn to spawn
            category: 'challenging', // 'helpful' or 'challenging'
            configKey: 'frozenChance' // Key in difficulty config
        };
    }
};

// Register it
BrickRegistry.register('frozen', FrozenBrickBehavior);
```

2. Add the spawn chance to `config.js`:
```javascript
// In DIFFICULTY_SETTINGS
frozenChance: 0.05
```

That's it! The brick will automatically:
- Render correctly
- Handle collisions
- Spawn at the right turns

### Adding a New Ball Type

Create in `js/behaviors/BallBehaviors.js`:

```javascript
const PiercingBallBehavior = {
    type: 'piercing',
    color: '#00ffff',
    glowColor: '#00ffff',
    damage: 2,

    render(ctx, ball, helpers) {
        const { getBallRadius } = helpers;
        ctx.shadowColor = this.glowColor;
        ctx.shadowBlur = 8;
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(ball.x, ball.y, getBallRadius(), 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
    },

    onCollision(ball, brick, gameState, helpers) {
        // Return: { bounce: bool, damage: number, continueChecking: bool, spawnBalls?: [] }
        return {
            bounce: true,
            damage: this.damage,
            continueChecking: false
        };
    },

    createBall(x, y, vx, vy) {
        return {
            x, y, vx, vy,
            active: true,
            hasGoneUp: false,
            ballType: 'piercing',
            damage: this.damage,
            // ... other properties
        };
    },

    getConfig() {
        return {
            minTurn: 20,
            inventoryKey: 'piercing'
        };
    }
};

BallRegistry.register('piercing', PiercingBallBehavior);
```

### Adding a New Bonus Type

Create in `js/behaviors/BonusBehaviors.js`:

```javascript
const ShieldBonusBehavior = {
    type: 'shield',
    color: '#9333ea',
    icon: '🛡️',

    render(ctx, bonus, helpers) {
        const { getFontSize } = helpers;
        ctx.shadowColor = this.color;
        ctx.shadowBlur = 10;
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(bonus.x, bonus.y, bonus.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        ctx.fillStyle = 'white';
        ctx.font = `${getFontSize(14)}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(this.icon, bonus.x, bonus.y + 1);
    },

    onCollect(bonus, ball, gameState, helpers) {
        // Apply effect
        gameState.hasShield = true;
        return { effect: 'shield' };
    },

    getConfig() {
        return {
            minTurn: 5,
            category: 'powerup'
        };
    }
};

BonusRegistry.register('shield', ShieldBonusBehavior);
```

---

## Existing Types Reference

### Brick Types
| Type | Emoji | Effect | Config Key |
|------|-------|--------|------------|
| `normal` | - | Standard brick | - |
| `explosive` | 💥 | Damages adjacent bricks on destroy | `explosiveChance` |
| `armored` | (border) | Takes 50% less damage | `armoredChance` |
| `spawner` | 👾 | Spawns 1-2 new bricks on destroy | `poisonBrickChance` |
| `regenerator` | 💚 | Heals to 90% at turn end | `regeneratorChance` |
| `gold` | 🪙 | Half HP; grants +1 normal ball on destroy | (baseChance in behavior) |
| `mystery` | 🎁 | Random reward on destroy (balls or laser) | (baseChance in behavior) |
| `boss` | 👑 | 3 columns wide, spawned every 15 turns by `generateNewRow` (never random); shockwave + loot (+2 balls, +1 shield) on destroy | - |

### Ball Types
| Type | Color | Effect | Inventory Key |
|------|-------|--------|---------------|
| `normal` | White | Standard bounce | `normal` |
| `fireball` | Red | Passes through bricks | `fireball` |
| `splitter` | Yellow | Splits into 2 balls (±30°) on its 5th hit; children can split again | `splitter` |
| `strength` | Orange | Does 3 damage instead of 1 | `strength` |
| `bomb` | Red/orange | AoE damage (15% of hit brick's maxHp) to bricks within 1.5 cells, with a wearing fuse: 1st blast needs 3 hits, each blast makes the next fuse cost +1 hit (3, 4, 5…; `hitsPerFuse` + `fuseWear`, per-ball `state.fuseCost`) | `bomb` |

### Bonus Types
| Type | Icon | Effect |
|------|------|--------|
| `ball` | +N | Adds normal balls (value scales: 1 + turn/25) |
| `fireballBall` | 🔥 | Adds fireball |
| `splitterBall` | 💥 | Adds splitter ball |
| `horizontal` | ⚡ | Fires laser at nearest row |
| `strength` | 💪 | Adds strength ball |
| `bombBall` | 💣 | Adds bomb ball |

### Fun Mechanics (v2.7.0)
- **Combo**: bricks destroyed per turn accumulate in `gameState.combo`; every 12 kills grant +1 normal ball at `endTurn` (cap 8). Constants in `config.js`.
- **Overdrive**: kills charge `gameState.overdriveCharge` (max 40); when full, the next `startShooting` activates a x2 damage turn (`overdriveActive`), applied in physics' `onBrickHit`.
- **Shields**: `gameState.shieldCharges` (start 1, max 3). In `moveBricksDown`, a crossing row consumes a shield and burns the bottom 2 rows instead of game over. Bosses grant +1.
- **Ball AoE contract**: a ball behavior's `onCollision` may return `damagedBricks: [{brick, damage}]` — the engine applies it (used by `bomb`, mirrors brick `onDestroy`).
- **Feedback helpers** in `physicsHelpers`: `addFloatingText(x, y, text, {color, size})`, `addScreenShake(intensity)`, `addBallsToInventory(type, count)`, `addShieldCharge()`.
- **Records**: best turn per difficulty stored in `localStorage` (`glowbreak_best_<difficulty>`), only counted when starting from turn 1.

### Ayudas por dificultad (v2.8.0)

Cada entrada de `DIFFICULTY_SETTINGS` tiene un objeto `assists` que controla cuánta **información** recibe el jugador (la dificultad no es solo números):

| Campo | Efecto | Dónde se aplica |
|-------|--------|-----------------|
| `aimBounces` | Rebotes que simula la línea de puntería | `rendering.js` → `drawAimLine` |
| `aimLength` | Largo de la mira como fracción del alto del área (`null` = sin límite) | `rendering.js` → `drawAimLine` |
| `freezeAim` | Si el apuntado fino con congelación está disponible | `input.js` → `handlePointerMove` |
| `hpRoundStep` | El HP mostrado se redondea HACIA ARRIBA a múltiplos de este valor (exacto si HP < step); el HP real no cambia | `rendering.js` → `drawBrick` |

Valores actuales — Fácil: todas las ayudas (mira completa 5 rebotes, congelación, HP exacto). Medio: la mira solo llega al primer rebote. Difícil: mira corta (35% del área), sin congelación, HP redondeado a decenas.

La guía (`js/ui/Guide.js`) genera su tabla de ayudas y los textos de controles desde `assists` — al cambiar un valor en config, la guía se actualiza sola.

### HUD de inventario (v2.8.0)

El inventario de bolas especiales es el elemento DOM `#ballInventory` (píldoras flexbox centradas bajo la línea inferior), regenerado por `updateBallInventoryHud()` en `game.js` dentro de `updateUI()`. Ya NO se dibuja en el canvas. Un ball type aparece si tiene `showInInventoryHud: true` y count > 0; usa `icon`, `bgColor` y `textColor` del behavior.

### Partida guardada y cola de disparo (v2.8.1)

- **Guardado automático**: `saveGame()` en `game.js` persiste un snapshot de la partida en `localStorage` (`glowbreak_save`) al iniciar partida y al final de cada `endTurn` (inicio de turno, sin bolas en vuelo). Las posiciones se guardan en coordenadas de grilla (col/row) para sobrevivir a cambios de tamaño de pantalla. Si la app crashea a mitad de un turno, se reanuda desde el inicio de ese turno.
- **Botón Continuar**: `#continueBtn` en el menú principal, visible solo si hay guardado (`updateContinueButton()`); `resumeGame()` restaura turno, inventario, bloques, bonuses, escudos y overdrive. `endGame()` borra el guardado (una partida terminada no se resume).
- **Cola de disparo con inventario grande**: en `startShooting`, cuando el inventario total supera `MAX_BALLS_ON_SCREEN`, las bolas especiales tienen prioridad de SELECCIÓN (entran todas a la cola) y las normales rellenan el resto; el ORDEN de disparo sigue siendo por `shootPriority`. Sin esta reserva, las especiales no se disparaban nunca en turnos altos.

### In-Game Guide (v2.7.1)

`js/ui/Guide.js` renders the "📖 Guía del juego" screen (opened from the main menu). Its content is **generated from the live registries and `config.js`** — never hardcode game numbers in the guide.

**Contract for new types**: every registered behavior should define:
- `displayName` — Spanish display name shown in the guide
- `describe()` — precise description with EXACT numbers. Derive them from the behavior's own properties (e.g. `this.damage`, `this.healRatio`) or `config.js` constants, so guide and engine can never disagree. Ambiguous wording ("mucho daño", "a veces") is not allowed.
- Optional `guideIcon` — guide-only icon for types without `emoji`/`icon` (do NOT set `emoji` on bricks that shouldn't offset their HP text in rendering).

The `guide.spec.js` test fails if any registered type is missing from the guide.

---

## Helpers Available in Behaviors

### Render Helpers (in `render()`)
- `getFontSize(baseSize)` - Scaled font size
- `getScale()` - Current scale factor
- `getBallRadius()` - Current ball radius
- `getBrickColor(hp, maxHp)` - Color based on HP

### Physics Helpers (in `onCollision()`, `onDestroy()`, etc.)
- `getCellSize()` - Grid cell size
- `getLeftBorder()` / `getRightBorder()` - Play area bounds
- `getBallRadius()` - Ball radius
- `getBrickColor(hp, maxHp)` - Color for particles
- `createParticles(x, y, color, count)` - Spawn particles
- `fireHorizontalLaser(y)` - Fire laser effect
- `addFloatingText(x, y, text, {color, size})` - Floating feedback text
- `addScreenShake(intensity)` - Shake the frame
- `addBallsToInventory(type, count)` - Grant balls + refresh HUD
- `addShieldCharge()` - Grant a shield (capped at MAX_SHIELDS)
- `COLS` - Number of columns
- `speedMultiplier` - Current speed (1 or 5)

---

## Key Files to Know

| File | Purpose |
|------|---------|
| `game.js` | Game state, turn management, shooting |
| `physics.js` | Ball movement, collisions, brick destruction |
| `rendering.js` | Canvas drawing, UI elements |
| `config.js` | Difficulty settings, constants |
| `js/behaviors/*.js` | All type behaviors (Strategy Pattern) |
| `js/core/Registry.js` | Type registration system |
