# Instructions for Claude

## PWA Versioning

**IMPORTANT**: Every code change requires updating the version in TWO places:

1. **`service-worker.js`** - line 2:
   ```javascript
   const APP_VERSION = '2.3.0';  // Change here
   ```

2. **`index.html`** - find the `#versionInfo` div:
   ```html
   <div id="versionInfo">v2.3.0</div>  <!-- And here -->
   ```

### Version Increment Rules

- **MINOR** (2.x.0): Default for all changes (bug fixes, new features, improvements)
- **MAJOR** (x.0.0): Only for large architectural refactors that change how the codebase works fundamentally

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

### Ball Types
| Type | Color | Effect | Inventory Key |
|------|-------|--------|---------------|
| `normal` | White | Standard bounce | `normal` |
| `fireball` | Red | Passes through bricks | `fireball` |
| `splitter` | Yellow | Splits into 5 balls on hit | `splitter` |
| `strength` | Orange | Does 3 damage instead of 1 | `strength` |

### Bonus Types
| Type | Icon | Effect |
|------|------|--------|
| `ball` | +N | Adds normal balls |
| `fireballBall` | 🔥 | Adds fireball |
| `splitterBall` | 💥 | Adds splitter ball |
| `horizontal` | ⚡ | Fires laser at nearest row |
| `strength` | 💪 | Adds strength ball |

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
