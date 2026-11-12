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
    │   ├── BonusBehaviors.js
    │   └── ThreatBehaviors.js   # Amenazas de las eras
    │
    ├── systems/
    │   ├── BrickGenerator.js
    │   ├── CollisionSystem.js   # CCD (swept sphere)
    │   ├── BrickSurfaces.js     # Fusión de bloques adyacentes
    │   ├── Eras.js              # Era y niveles de amenaza por turno (puro)
    │   ├── ThreatSystem.js      # Ejecuta los hooks de las amenazas activas
    │   └── VillainDirector.js   # Poses del villano (máquina de estados pura)
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

Four registries exist in `js/core/Registry.js`:
- `BrickRegistry` - For brick types
- `BallRegistry` - For ball types
- `BonusRegistry` - For bonus/powerup types
- `ThreatRegistry` - For era threats (ver "Eras y amenazas")

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
| `ball` | +N | Adds normal balls (value scales: 1 + turn/25, capped at `BALL_BONUS_MAX_VALUE`) |
| `fireballBall` | 🔥 | Adds fireball |
| `splitterBall` | 💥 | Adds splitter ball |
| `horizontal` | ⚡ | Fires laser at nearest row |
| `strength` | 💪 | Adds strength ball |
| `bombBall` | 💣 | Adds bomb ball |

### Fun Mechanics (v2.7.0)
- **Combo**: bricks destroyed per turn accumulate in `gameState.combo`; every 12 kills grant +1 normal ball at `endTurn` (cap 8). Constants in `config.js`.
- **Overdrive**: kills charge `gameState.overdriveCharge` (max 40); when full, the next `startShooting` activates a x2 damage turn (`overdriveActive`), applied in physics' `onBrickHit`.
- **Shields**: `gameState.shieldCharges` (start 1, max 1 — `MAX_SHIELDS`; no stacking). In `moveBricksDown`, a crossing row consumes a shield and burns only the `SHIELD_BURN_ROWS` lowest rows — with the current value (1), just the row that actually crossed — instead of game over. Bosses grant +1, which with `MAX_SHIELDS = 1` only refills a spent shield. `resumeGame` clamps saved charges to `MAX_SHIELDS`.
- **Ball bonus scaling per difficulty**: `SPAWN_SCHEDULE[d].ballBonuses.ball` accepts an optional `scaleTurns` (default `BALL_BONUS_SCALE_TURNS`) — the bonus grants `min(BALL_BONUS_MAX_VALUE, 1 + floor(turn / scaleTurns))` balls. The cap (v2.11.2, currently 2) exists because of the inventory cap: an unbounded +5/+6 bonus refilled dropped balls instantly, making dropping normals free. Hard uses `interval: 2, scaleTurns: 40` so it is no longer starved of balls (~75-85% of medium instead of ~60%).
- **Ball AoE contract**: a ball behavior's `onCollision` may return `damagedBricks: [{brick, damage}]` — the engine applies it (used by `bomb`, mirrors brick `onDestroy`).
- **Feedback helpers** in `physicsHelpers`: `addFloatingText(x, y, text, {color, size})`, `addScreenShake(intensity)`, `addBallsToInventory(type, count)`, `addShieldCharge()`.
- **Records**: best turn per difficulty stored in `localStorage` (`glowbreak_best_<difficulty>`), only counted when starting from turn 1.

### Eras y amenazas (v2.12.0)

La dificultad de largo plazo NO sube constantes: suma **mecánicas**. Cada
`ERA_SETTINGS[d].interval` turnos (fácil 25, medio/difícil 15 = `BOSS_INTERVAL`)
empieza una era. Las eras **acumulan** amenazas: la Era I no tiene, cada era
siguiente suma la próxima amenaza (por `order`) y las anteriores siguen
activas. Con todas activas, cada era nueva sube +1 nivel a la siguiente (en
orden) hasta su máximo. Difícil activa cada amenaza directamente en nivel 2
(`startLevel`). Todo se deriva del turno (`js/systems/Eras.js`, funciones
puras: `getEra`, `getThreatLevels`, `getEraChange`), así que empezar en el
turno N o reanudar da las mismas amenazas.

| Orden | Amenaza | Efecto | Niveles (`levels`) |
|-------|---------|--------|--------------------|
| 1 | ☣️ `corruption` | Cada `seedEvery` turnos un bloque nuevo nace corrupto; al fin de turno cada corrupto contagia a TODOS sus vecinos (`diagonal`: también diagonales) y el grupo entero (él + vecinos) se iguala al HP del más fuerte. Jefes inmunes y fuera del grupo | 6 · 4 · 3+diag |
| 2 | 🌊 `waves` | En turnos múltiplos de `every`, al terminar el tablero baja 2 filas (fila extra sin bonus, `generateNewRow({extraRow:true})`) | 6 · 5 · 4 |
| 3 | 🧬 `adaptation` | Daño de ÁREA (`bomb`, `explosion`, `laser`) deja caparazón (`brick.shellUntil`): inmune a área ese turno + `shellTurns`. Bola directa siempre pega. N3: bloques nacen con caparazón | 1 · 2 · 2+nacen |
| 4 | 🐛 `crawlers` | Por fila se eligen `perRow` bloques con `chance` de ser reptador; al fin de turno baja 1 fila extra si la celda de abajo está libre (aplasta bonuses) | 50%/1 · 75%/1 · 75%/2 |
| 5 | 🌫️ `fog` | Las `rows` filas de arriba se dibujan grises con "?" (sin HP, tipo ni marcas) hasta que el bloque recibe daño (`brick.revealed`) | 3 · 4 · 5 |

Calibración (medio): un bot que prueba 10 ángulos por turno muere entre los
turnos ~60 y ~95; sin eras llegaba a ~170+.

**Integración con el motor** (vía `js/systems/ThreatSystem.js`; el motor no
conoce amenazas concretas):
- `gameState.threatLevels` (tipo → nivel) del turno actual; se recalcula con
  `refreshThreatLevels()` en `initGame`, `resumeGame` y `endTurn`.
- `generateNewRow` → `runRowGenerated` (niveles del turno de esa fila).
- `endTurn` → `runTurnEnd` y `getExtraAdvance` con los niveles del turno que
  TERMINA, antes de `moveBricksDown`; después muestra `gameState.eraBanner`
  si cambió la era.
- **Todo daño a bloques pasa por `physics.damageBrick(brick, amount, source)`**
  (`DAMAGE_SOURCES`: `ball`, `bomb`, `explosion`, `laser`): aplica `onDamage`
  del bloque, después `modifyDamage` de las amenazas, y marca `revealed`. No
  restes `brick.hp` a mano en código nuevo.
- Render: `isBrickHidden` (niebla), `renderBrickOverlays`, `renderBoardOverlays`.
- Guardado: `corrupt`, `crawler`, `shellUntil` y `revealed` se guardan por bloque.
- HUD: `#threatHud` (era en romanos + íconos con pista, ej. turnos a la
  oleada); tocarlo abre `#threatPanel` (`js/ui/ThreatPanel.js`). La guía tiene
  la sección "Eras y amenazas", generada desde el registry.

**Agregar una amenaza**: registrar en `ThreatRegistry` un behavior con `type`,
`order`, `displayName`, `icon`, `levels` (array de params por nivel) y
`describe(level)` con números exactos, más los hooks que use
(`onRowGenerated`, `onTurnEnd`, `getExtraAdvance`, `modifyDamage`,
`hidesBrick`, `renderBrick`, `renderBoard`, `getHudHint`). Se suma sola a la
era siguiente según su `order`.

### Ayudas por dificultad (v2.8.0, ampliado en v2.9.0)

Cada entrada de `DIFFICULTY_SETTINGS` tiene un objeto `assists` que controla cuánta **información** recibe el jugador y cuánto puede confiar en su puntería (la dificultad no es solo números):

| Campo | Efecto | Dónde se aplica |
|-------|--------|-----------------|
| `aimBounces` | Rebotes que simula la línea de puntería. `0` = la línea recorre todo el tramo pero **termina en el primer impacto**, sin marcar rebote | `rendering.js` → `drawAimLine`, `CollisionSystem.js` → `simulateTrajectory` |
| `aimLength` | Largo de la mira como fracción del alto del área (`null` = sin límite) | `rendering.js` → `drawAimLine` |
| `freezeAim` | Si el apuntado fino con congelación está disponible | `input.js` → `handlePointerMove` |
| `aimScatter` | Si las bolas pueden salir desviadas del ángulo apuntado | `game.js` → `applyAimScatter` (llamado por `shootNextBall`) |
| `hpRoundStep` | El HP mostrado se redondea HACIA ARRIBA a múltiplos de este valor (exacto si HP < step); el HP real no cambia | `rendering.js` → `drawBrick` |

Valores actuales — Fácil: todas las ayudas (mira completa 5 rebotes, congelación, HP exacto, sin dispersión). Medio: la mira solo llega al primer rebote. Difícil: mira completa hasta el primer impacto pero sin mostrar el rebote, congelación disponible, HP redondeado a decenas y **dispersión activa**.

**Dispersión de puntería (v2.9.0)**: con `assists.aimScatter`, `startShooting` llama a `rollAimScatter()`, que tira **un dado por TIPO de bola** y guarda el resultado en `gameState.aimScatterOffsets` (radianes por tipo, 0 = sin desvío). `shootNextBall` lo aplica vía `applyAimScatter(angle, ballType)`, así que todas las bolas de un mismo tipo salen juntas con el mismo desvío — no se abren en abanico. El desvío es uniforme dentro de ±`maxDegrees` y se recorta a `[AIM_ANGLE_MIN, AIM_ANGLE_MAX]` (los mismos topes que usa el apuntado manual en `input.js`). Cada ball behavior puede declarar su propio `aimScatter: { chance, maxDegrees }`; los que no, usan `DEFAULT_AIM_SCATTER` de `config.js`. Valores actuales: normal 20%/±4°, fuego 25%/±5°, divisora 30%/±6°, fuerza 30%/±6°, bomba 35%/±7°.

La guía (`js/ui/Guide.js`) genera su tabla de ayudas y los textos de controles desde `assists` — al cambiar un valor en config, la guía se actualiza sola.

### HUD de inventario (v2.8.0)

El inventario de bolas especiales es el elemento DOM `#ballInventory` (píldoras flexbox centradas bajo la línea inferior), regenerado por `updateBallInventoryHud()` en `game.js` dentro de `updateUI()`. Ya NO se dibuja en el canvas. Un ball type aparece si tiene `showInInventoryHud: true` y count > 0; usa `icon`, `bgColor` y `textColor` del behavior.

### Partida guardada y cola de disparo (v2.8.1)

- **Guardado automático**: `saveGame()` en `game.js` persiste un snapshot de la partida en `localStorage` (`glowbreak_save`) al iniciar partida y al final de cada `endTurn` (inicio de turno, sin bolas en vuelo). Las posiciones se guardan en coordenadas de grilla (col/row) para sobrevivir a cambios de tamaño de pantalla. Si la app crashea a mitad de un turno, se reanuda desde el inicio de ese turno.
- **Botón Continuar**: `#continueBtn` en el menú principal, visible solo si hay guardado (`updateContinueButton()`); `resumeGame()` restaura turno, inventario, bloques, bonuses, escudos y overdrive. `endGame()` borra el guardado (una partida terminada no se resume).
- **Cola de disparo con inventario grande**: en `startShooting`, cuando el inventario total supera `MAX_BALLS_ON_SCREEN`, las bolas especiales tienen prioridad de SELECCIÓN (entran todas a la cola) y las normales rellenan el resto; el ORDEN de disparo sigue siendo por `shootPriority`. Sin esta reserva, las especiales no se disparaban nunca en turnos altos.

### Tope de inventario y tirar bolas (v2.11.0)

Antes el tope de bolas (`MAX_BALLS_ON_SCREEN`, hoy 100) solo existía en la cola de
disparo: se podían juntar más bolas, pero las de más nunca salían (el
inventario no se gasta al disparar). Ahora el tope es del **inventario**:
`MAX_BALL_INVENTORY` en `config.js` (= `MAX_BALLS_ON_SCREEN`, así toda bola
que tenés se dispara). Lógica en `js/systems/BallInventory.js`
(`addToInventory`, `dropFromInventory`, `clampInventory`, `getFreeSpace`).

- **Bonuses de bolas** (behaviors con `targetBallType`): con el inventario
  lleno `physics.checkBonusCollisions` ni llama a `onCollect` — la bola pasa
  de largo, el bonus queda en el tablero y se dibuja apagado (alpha 0.3).
  Si entran algunas, `onCollect` devuelve `leftover` > 0 y el bonus se queda
  con ese `value`. Bonuses nuevos de bolas deben usar `collectBalls(...)`.
- **Otras fuentes** (combo, dorado, misterioso, jefe): `addBallsToInventory`
  devuelve cuántas entraron de verdad.
- **Tirar bolas**: `js/ui/DropPanel.js`, se abre tocando 🎒 en el HUD o las
  píldoras, solo entre turnos. −1 / −10 / Todas por tipo; siempre queda
  `MIN_BALLS_KEPT` (1). Guarda la partida al tirar.
- **Coherencia de UI — cada dato en un solo lugar**: total y tope solo en
  `#ballsHud` (🎒 N/100, amarillo cuando está lleno); el lanzador ya NO
  dibuja "xN". Cantidad por tipo: píldoras de abajo, o la fila del panel
  mientras está abierto (el panel tapa las píldoras y queda debajo del HUD).
- `resumeGame` y `calculateStartingBalls` recortan inventarios excedidos
  (primero se descartan normales).

### Tablero de tamaño fijo (v2.12.2)

La cantidad de filas hasta la línea de peligro es **la misma en cualquier
pantalla**: `BOARD_ROWS` (8) filas de bloques + `LAUNCH_ZONE_ROWS` (0,6) de
aire sobre la línea (`config.js`). Antes salía del alto de la ventana: la
vista principal del jugador (pantalla dividida, ~390x541) daba ~8,6 filas y
pantalla completa ~13,7, así que la misma partida era mucho más difícil en
dividida. Los valores actuales reproducen exactamente esa vista dividida.

- `getCellSize()` = mín(ancho / `COLS`, alto disponible / filas fijas).
- El tablero se ancla **abajo**: `getBottomLine()` queda donde siempre y
  `getTopOffset()` se calcula desde ella. Si la pantalla es más alta, el
  espacio sobrante queda libre arriba del tablero.
- `DANGER_LINE_GAP` (10px) es la distancia entre la línea de peligro y la del
  lanzador; usala en vez de un `10` suelto.
- Nunca derives filas del alto de la pantalla en código nuevo. Test:
  `tests/integration/board-size.spec.js`.
- Ojo al calibrar dificultad: el viewport de los tests (iPhone 13, 390x664)
  antes daba ~10,7 filas; ahora da las mismas 8,6 que el jugador.

### Villano del espacio libre (v2.13.0)

Cuando la pantalla es más alta que el tablero fijo (ver "Tablero de tamaño
fijo"), en el espacio libre de arriba aparece **el Arquitecto**: un villano
neón que "arroja" cada fila nueva y reacciona a la partida. Es **puramente
cosmético**: no toca la física ni el estado del juego. En la vista dividida
(la principal) no hay espacio y no se dibuja nada.

| Archivo | Rol |
|---------|-----|
| `js/systems/VillainDirector.js` | Máquina de estados **pura** (recibe `now`): pose base en bucle + pose actual con duración + cola, con prioridades |
| `js/ui/villain/Villain.js` | Controlador: suscribe eventos, layout, caché, `drawVillainBackdrop` / `drawVillainForeground` / `isNewRowHidden` |
| `js/ui/villain/ArquitectoSprite.js` | Dibujo del personaje (poses, `POSE_FRAMES`), determinista |
| `js/ui/villain/NeonPainter.js` | Primitivas neón (tubo, extremidad, bloque de luz…) |
| `js/ui/villain/VillainSpriteCache.js` | Caché LRU de cuadros pre-dibujados |

**Eventos** (emisor `events` de `game.js`; el motor no conoce al villano):
`gameStarted` (initGame/resumeGame), `shootingStarted`, `bricksDestroyed
{count}` (physics), `shieldUsed`, `turnEnded {turn, eraChanged}` (fin de
`endTurn`, sin game over) y `gameOver`. Reacciones: fin de turno →
prepara + lanza (+ furia si cambió la era, + burla si se gastó un escudo);
`VILLAIN.golpeKills` bloques rotos en un turno → golpe (una vez por turno).

**Buenas prácticas aplicadas** — mantenelas al tocar esto:
- `shadowBlur` es caro: los cuadros se **pre-dibujan una vez** en un canvas
  fuera de pantalla (LRU, tope `VILLAIN.cacheMaxFrames`, resolución con tope
  `cacheScaleMax`) y se pre-calientan con `requestIdleCallback`. Medido con
  CPU x4: 2,9 ms dibujando en vivo vs 0,13 ms desde la caché. Nunca llames
  a `drawArquitecto` por frame.
- Animación por **tiempo** (`performance.now()`), no por cuadros.
- `prefers-reduced-motion: reduce` → poses quietas, sin bloque cayendo y la
  fila nueva aparece al instante. Las interferencias son estáticas (sin
  destellos que alternen).
- La fila nueva solo se **oculta visualmente** (`isNewRowHidden`) hasta que
  cae el bloque, y solo si el villano se ve; la física la tiene desde el
  fin del turno.
- Constantes en `config.js` → `VILLAIN`. Tests: `tests/integration/villain.spec.js`.

### Superficies fusionadas de bloques (v2.10.0)

`js/systems/BrickSurfaces.js` fusiona los bloques adyacentes en **una sola
superficie continua**, y esa geometría la comparten la física y el
renderizado (por eso lo que se ve es literalmente la superficie de colisión).

**Problema que resolvía**: cada bloque se dibujaba y colisionaba como un rect
independiente con 2px de margen por lado. Entre dos vecinos quedaba una ranura
de 4px, y cada uno aportaba sus propias caras y esquinas redondeadas INTERNAS.
Una bola que pegaba en la costura entre dos bloques rebotaba contra una esquina
fantasma y salía desviada hasta ~17°. Con margen > 0 aparecía además un
escalón visible ("pico") cuando dos bloques de la misma fila no coincidían en
tener vecino abajo: uno terminaba 2px más arriba que el otro. Por eso
`BRICK_INSET = 0` y la superficie de un bloque es **su celda completa**: la
unión de celdas adyacentes nunca tiene escalones.

**Cómo funciona**: `getBrickSurfaces(bricks, cellSize)` (con caché por firma
del conjunto de bloques) devuelve un `Map<brick, surface>` donde cada surface
tiene:

| Campo | Significado |
|-------|-------------|
| `x0, y0, x1, y1` | Rect fusionado = la celda completa, así dos vecinos comparten exactamente la misma arista |
| `leftExposed` / `rightExposed` | Si esa cara se testea en colisión (las internas no) |
| `topSegments` / `bottomSegments` | Tramos expuestos del lado horizontal — un jefe ocupa 3 celdas y puede estar tapado solo en parte |
| `topSeams` / `bottomSeams` | Tramos cubiertos (solo para dibujar la costura fina) |
| `corners` | `{tl, tr, bl, br}` — una esquina solo existe si sus DOS caras están expuestas ahí |

- **Física**: `CollisionSystem.sweepSphereSurface` testea solo caras y
  esquinas expuestas. Las esquinas se testean **sin filtrar por dirección**
  (v2.11.3): filtrar por "se acerca en los dos ejes" dejaba pasar a una bola
  que rozaba la esquina alejándose en un eje, y se metía en el bloque. `findFirstCollision` (y por lo tanto también la línea
  de puntería vía `simulateTrajectory`) usa las superficies.
- **Render**: `rendering.js` dibuja el rect fusionado con `roundRect` y radio
  **0** en las esquinas pegadas a otro bloque, en tres pasadas (sombras →
  cuerpos → costuras) para que la sombra de un bloque no caiga sobre el
  vecino. `helpers.getBrickRect(brick)` expone ese rect a los behaviors.

**Contrato para tipos nuevos**: en `render()` usá `helpers.getBrickRect(brick)`
y pintá con `rect.x/rect.y/rect.width/rect.height` y `rect.radii`. Dibujar con
`brick.x + 2` desalinea el gráfico de la superficie de colisión.

Los bloques siguen alineados a la grilla: `brick.x`/`brick.y` son el origen de
la celda, `width = cellSize * columnas - BRICK_CELL_GAP`. `BrickSurfaces`
deriva los índices de celda de esas coordenadas, así que cualquier bloque
nuevo (spawner, jefe, etc.) se fusiona solo.

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
- `getBrickRect(brick)` - **Rect fusionado del bloque** (ver "Superficies fusionadas"). Devuelve `{x, y, width, height, radii, centerX, centerY}`. Los behaviors de bloque DEBEN dibujar con esto, nunca con `brick.x + 2` / `brick.width`

### Physics Helpers (in `onCollision()`, `onDestroy()`, etc.)
- `getCellSize()` - Grid cell size
- `getLeftBorder()` / `getRightBorder()` - Play area bounds
- `getBallRadius()` - Ball radius
- `getBrickColor(hp, maxHp)` - Color for particles
- `getBrickRect(brick)` - Rect fusionado del bloque (misma geometría que usa la colisión)
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
| `js/systems/CollisionSystem.js` | CCD swept sphere, trayectoria de puntería |
| `js/systems/BrickSurfaces.js` | Fusión de bloques adyacentes (geometría compartida física/render) |
| `js/systems/BallInventory.js` | Tope del inventario de bolas (agregar/tirar/recortar) |
| `js/ui/DropPanel.js` | Panel 🎒 para tirar bolas entre turnos |
| `js/behaviors/ThreatBehaviors.js` | Amenazas de las eras (corrupción, oleadas, adaptación, reptadores, niebla) |
| `js/systems/Eras.js` | Era y niveles de amenaza de cada turno (puro) |
| `js/systems/ThreatSystem.js` | Hooks de amenazas activas + `buildGrid` |
| `js/systems/VillainDirector.js` | Poses del villano (máquina de estados pura) |
| `js/ui/villain/Villain.js` | Villano del espacio libre: eventos, caché y dibujo |
