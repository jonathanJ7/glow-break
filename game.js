/**
 * Game Module - Refactorizado con patrón Strategy
 *
 * Este módulo usa los registries de behaviors para manejar
 * el estado del juego de forma extensible (Open/Closed principle).
 *
 * Para agregar nuevos tipos de bloques, bolas o bonuses,
 * solo necesitas registrar nuevos behaviors.
 */

import { DIFFICULTY_SETTINGS, SPAWN_SCHEDULE, COLS, SHOOT_DELAY, MAX_BALLS_ON_SCREEN, FAST_SPEED_MULTIPLIER, BASE_BALL_RADIUS, BALL_SPEED, COMBO_BALLS_PER, COMBO_MAX_REWARD, OVERDRIVE_MAX, BOSS_INTERVAL, BOSS_HP_MULTIPLIER, STARTING_SHIELDS, SHIELD_BURN_ROWS, BALL_BONUS_SCALE_TURNS, HP_LOG_FACTOR } from './config.js';
import { getWidth, getHeight, getCellSize, getLeftBorder, getTopOffset, getBottomLine, getScale, getBallRadius } from './rendering.js';
import { updateBalls, updateParticles, createParticles, addFloatingText } from './physics.js';
import { BrickRegistry, BallRegistry, BonusRegistry } from './js/behaviors/index.js';

// ====================================
// EVENT EMITTER
// ====================================

/**
 * Mini event emitter para desacoplar dominio de UI.
 * Permite que physics.js notifique cambios sin importar updateUI
 * directamente (lo que rompia el lado UI de la dependencia circular).
 */
class Emitter {
    constructor() {
        this._listeners = new Map();
    }
    on(event, fn) {
        if (!this._listeners.has(event)) this._listeners.set(event, new Set());
        this._listeners.get(event).add(fn);
        return () => this._listeners.get(event)?.delete(fn);
    }
    emit(event, payload) {
        const set = this._listeners.get(event);
        if (!set) return;
        for (const fn of set) fn(payload);
    }
}

export const events = new Emitter();

// ====================================
// ESTADO DEL JUEGO
// ====================================
export let gameState = {
    turn: 1,
    // Inventario de bolas keyed por behavior.type. Vacio al inicio;
    // initGame lo poblara con los starting balls del registry.
    // Toda lectura debe usar `inventory[type] || 0`.
    ballInventory: {},
    balls: [],
    bricks: [],
    bonuses: [],
    particles: [],
    laserEffect: null,
    launchX: 0,
    launchY: 0,
    nextLaunchX: 0,
    isAiming: false,
    isShooting: false,
    isHolding: false,
    aimAngle: -Math.PI / 2,
    ballsToShoot: [],  // Cola de tipos de bola a disparar
    ballsLanded: 0,
    totalBallsToShoot: 0,
    firstBallLanded: false,
    gameOver: false,
    gameStarted: false,
    showInstructions: true,
    speedMultiplier: 1,
    // Mecánicas de diversión
    combo: 0,               // Ladrillos destruidos este turno
    overdriveCharge: 0,     // 0..OVERDRIVE_MAX; lleno = próximo turno x2
    overdriveActive: false, // Este turno las bolas hacen daño x2
    shieldCharges: STARTING_SHIELDS, // Segundas oportunidades
    floatingTexts: [],      // Textos flotantes de feedback
    shake: 0                // Intensidad de screen shake
};

export let currentDifficulty = 'easy';
export let difficultyConfig = DIFFICULTY_SETTINGS.easy;
export let startingTurn = 1;
export let shootTimeout = null;

// ====================================
// HELPERS DE INVENTARIO
// ====================================

export function getTotalBalls() {
    let sum = 0;
    for (const type of BallRegistry.getTypes()) {
        sum += gameState.ballInventory[type] || 0;
    }
    return sum;
}

// ====================================
// SPAWN DETERMINISTA
// ====================================

/**
 * Devuelve los bonuses programados para un turno y dificultad dados.
 * Resultado puro (sin azar): mismo turn + difficulty = mismo resultado siempre.
 *
 * @returns {{ ballBonus: {type,value}|null, powerup: {type}|null }}
 */
export function getScheduledSpawns(turn, difficulty) {
    const schedule = SPAWN_SCHEDULE[difficulty];
    const result = { ballBonus: null, powerup: null };

    // Ball bonuses — el orden en el config define la prioridad (más raro primero).
    // El primer tipo que coincida gana; 'ball' (default) se chequea al final.
    for (const [type, cfg] of Object.entries(schedule.ballBonuses)) {
        if (type === 'ball') continue;
        if (turn >= cfg.first && (turn - cfg.first) % cfg.interval === 0) {
            result.ballBonus = { type, value: 1 };
            break;
        }
    }
    if (!result.ballBonus) {
        const ballCfg = schedule.ballBonuses.ball;
        if (ballCfg && turn >= ballCfg.first && (turn - ballCfg.first) % ballCfg.interval === 0) {
            // El valor escala con el turno para que el poder de fuego no
            // quede atrás de la curva de HP en runs largas.
            result.ballBonus = { type: 'ball', value: 1 + Math.floor(turn / BALL_BONUS_SCALE_TURNS) };
        }
    }

    // Powerups — primer match gana
    for (const [type, cfg] of Object.entries(schedule.powerups)) {
        if (turn >= cfg.first && (turn - cfg.first) % cfg.interval === 0) {
            result.powerup = { type };
            break;
        }
    }

    return result;
}

export function calculateStartingBalls(turn, difficulty) {
    const defaultType = BallRegistry.defaultType;

    if (turn <= 1) {
        return { inventory: { [defaultType]: 1 }, total: 1 };
    }

    // Simular todos los turnos previos usando el schedule determinista.
    // Asumimos que el jugador recolecta todos los bonuses.
    const inventory = { [defaultType]: 1 }; // 1 bola inicial

    for (let t = 1; t < turn; t++) {
        const scheduled = getScheduledSpawns(t, difficulty);

        if (scheduled.ballBonus) {
            const behavior = BonusRegistry.get(scheduled.ballBonus.type);
            const ballType = behavior.targetBallType || defaultType;
            const count = scheduled.ballBonus.value || 1;
            inventory[ballType] = (inventory[ballType] || 0) + count;
        }

        if (scheduled.powerup) {
            const behavior = BonusRegistry.get(scheduled.powerup.type);
            if (behavior.targetBallType) {
                inventory[behavior.targetBallType] = (inventory[behavior.targetBallType] || 0) + 1;
            }
        }
    }

    const total = Object.values(inventory).reduce((a, b) => a + b, 0);
    return { inventory, total };
}

export function updateBallsPreview() {
    const turnInput = document.getElementById('startTurnInput');
    const preview = document.getElementById('ballsPreview');
    const turn = Math.max(1, Math.min(500, parseInt(turnInput.value) || 1));

    if (turn === 1) {
        preview.innerHTML = '🔵 1 bola';
    } else {
        const easyBalls = calculateStartingBalls(turn, 'easy');
        const mediumBalls = calculateStartingBalls(turn, 'medium');
        const hardBalls = calculateStartingBalls(turn, 'hard');

        preview.innerHTML = `<span style="color:#4ecca3">😊${easyBalls.total}</span> · <span style="color:#f5b942">😤${mediumBalls.total}</span> · <span style="color:#e94560">💀${hardBalls.total}</span>`;
    }
}

// ====================================
// GENERACIÓN DE FILAS (usando behaviors)
// ====================================

export function generateNewRow() {
    const cellSize = getCellSize();
    const topOffset = getTopOffset();
    const leftBorder = getLeftBorder();
    const turn = gameState.turn;
    const config = difficultyConfig;

    // La curva de HP usa un factor logarítmico suave para que el poder
    // de fuego del jugador pueda seguirle el ritmo en runs largas.
    const baseHP = Math.floor(turn * (1 + Math.log(turn + 1) * HP_LOG_FACTOR) * config.hpMultiplier);
    const density = Math.min(config.densityBase + turn * config.densityGrowth, config.maxDensity);

    const isBossTurn = turn >= BOSS_INTERVAL && turn % BOSS_INTERVAL === 0;

    if (isBossTurn) {
        // Turno de jefe: un único ladrillo de 3 columnas con mucho HP.
        // La fila queda libre alrededor para dar respiro al jugador.
        const startCol = Math.floor(Math.random() * (COLS - 2));
        const bossHp = Math.max(10, Math.floor(baseHP * BOSS_HP_MULTIPLIER));
        gameState.bricks.push({
            x: leftBorder + startCol * cellSize,
            y: topOffset,
            width: cellSize * 3 - 4,
            height: cellSize - 4,
            hp: bossHp,
            maxHp: bossHp,
            col: startCol,
            type: 'boss',
            isReinforced: false
        });
    } else {
        const isReinforcedRow = config.reinforcedRows && turn % 10 === 0;
        const rowHpMultiplier = isReinforcedRow ? 2.0 : 1.0;

        // Paso 1: generar ladrillos (posición aleatoria, tipo probabilístico)
        for (let col = 0; col < COLS; col++) {
            if (Math.random() < density) {
                const hpVariation = config.hpVariationMin + Math.random() * (config.hpVariationMax - config.hpVariationMin);
                let hp = Math.max(1, Math.floor(baseHP * hpVariation * rowHpMultiplier));

                let type = BrickRegistry.defaultType;
                const specialRoll = Math.random();
                let cumulativeProbability = 0;

                for (const [brickType, behavior] of BrickRegistry.getAll()) {
                    if (brickType === BrickRegistry.defaultType) continue;

                    const brickConfig = behavior.getConfig();
                    const baseChance = brickConfig.baseChance || 0;
                    const mult = brickConfig.difficultyMultiplier?.[currentDifficulty] ?? 1;
                    const chance = baseChance * mult;

                    if (chance <= 0) continue;
                    if (turn <= (brickConfig.minTurn || 0)) continue;

                    const threshold = cumulativeProbability + chance;
                    if (specialRoll >= cumulativeProbability && specialRoll < threshold) {
                        type = brickType;
                        break;
                    }
                    cumulativeProbability = threshold;
                }

                // Algunos tipos (ej: dorado) tienen menos HP que la base
                const hpFactor = BrickRegistry.get(type).getConfig().hpFactor;
                if (hpFactor) {
                    hp = Math.max(1, Math.floor(hp * hpFactor));
                }

                gameState.bricks.push({
                    x: leftBorder + col * cellSize,
                    y: topOffset,
                    width: cellSize - 4,
                    height: cellSize - 4,
                    hp: hp,
                    maxHp: hp,
                    col: col,
                    type: type,
                    isReinforced: isReinforcedRow
                });
            }
        }

        // Asegurar que siempre haya al menos una columna libre en la fila
        const topOffset0 = topOffset;
        const newRowBricks = gameState.bricks.filter(b => b.y === topOffset0);
        if (newRowBricks.length >= COLS) {
            const removeIdx = Math.floor(Math.random() * newRowBricks.length);
            const toRemove = newRowBricks[removeIdx];
            gameState.bricks.splice(gameState.bricks.indexOf(toRemove), 1);
        }
    }

    // Paso 2: colocar bonuses deterministas según el schedule
    const scheduled = getScheduledSpawns(turn, currentDifficulty);

    if (scheduled.ballBonus) {
        const emptyCol = findEmptyColumn();
        if (emptyCol !== -1) {
            gameState.bonuses.push({
                x: leftBorder + emptyCol * cellSize + cellSize / 2,
                y: topOffset + cellSize / 2,
                radius: Math.max(8, 12 * getScale()),
                type: scheduled.ballBonus.type,
                value: scheduled.ballBonus.value || 1
            });
        }
    }

    if (scheduled.powerup) {
        const emptyCol = findEmptyColumn();
        if (emptyCol !== -1) {
            gameState.bonuses.push({
                x: leftBorder + emptyCol * cellSize + cellSize / 2,
                y: topOffset + cellSize / 2,
                radius: Math.max(10, 14 * getScale()),
                type: scheduled.powerup.type
            });
        }
    }
}

function findEmptyColumn() {
    const cellSize = getCellSize();
    const topOffset = getTopOffset();
    // Un ladrillo puede ocupar varias columnas (jefes son 3 de ancho),
    // así que marcamos todas las columnas que cubre su ancho.
    const occupiedCols = new Set();
    for (const b of gameState.bricks) {
        if (b.y >= topOffset + cellSize) continue;
        const colSpan = Math.max(1, Math.round((b.width + 4) / cellSize));
        for (let c = b.col; c < b.col + colSpan; c++) {
            occupiedCols.add(c);
        }
    }

    const bonusCols = new Set(gameState.bonuses
        .filter(b => b.y < topOffset + cellSize)
        .map(b => Math.floor((b.x - getLeftBorder()) / cellSize)));

    const emptyCols = [];
    for (let i = 0; i < COLS; i++) {
        if (!occupiedCols.has(i) && !bonusCols.has(i)) emptyCols.push(i);
    }

    return emptyCols.length > 0 ? emptyCols[Math.floor(Math.random() * emptyCols.length)] : -1;
}

// ====================================
// MOVIMIENTO DE BLOQUES
// ====================================

export function moveBricksDown() {
    const cellSize = getCellSize();
    const dangerLine = getBottomLine() - 10;

    for (let brick of gameState.bricks) {
        brick.y += cellSize;
    }

    // ¿Alguna fila cruzó la línea? Con escudo disponible, se consume y
    // quema las 2 filas de abajo (segunda oportunidad). Sin escudo: fin.
    const crossed = gameState.bricks.some(b => b.y + b.height > dangerLine);
    if (crossed) {
        if (gameState.shieldCharges > 0) {
            gameState.shieldCharges--;
            const burnLine = dangerLine - cellSize * SHIELD_BURN_ROWS;
            const burned = gameState.bricks.filter(b => b.y + b.height > burnLine);
            for (const b of burned) {
                createParticles(b.x + b.width / 2, b.y + b.height / 2, '#38bdf8', 10);
            }
            gameState.bricks = gameState.bricks.filter(b => b.y + b.height <= burnLine);
            addFloatingText(getWidth() / 2, dangerLine - cellSize * 2.5, '🛡️ ¡ESCUDO!', { color: '#38bdf8', size: 22 });
            gameState.shake = Math.max(gameState.shake, 6);
            updateUI();
        } else {
            endGame();
            return;
        }
    }

    for (let bonus of gameState.bonuses) {
        bonus.y += cellSize;

        if (bonus.y > getBottomLine() - 20) {
            gameState.bonuses = gameState.bonuses.filter(b => b !== bonus);
        }
    }
}

// ====================================
// MECÁNICAS DE DISPARO (usando behaviors)
// ====================================

export function startShooting() {
    if (gameState.isShooting || gameState.gameOver) return;

    gameState.isShooting = true;
    gameState.shootingTime = 0;
    gameState.ballsLanded = 0;
    gameState.firstBallLanded = false;
    gameState.showInstructions = false;

    // Medidor lleno → este turno es OVERDRIVE: todas las bolas hacen x2
    if (gameState.overdriveCharge >= OVERDRIVE_MAX) {
        gameState.overdriveActive = true;
        gameState.overdriveCharge = 0;
        addFloatingText(getWidth() / 2, getBottomLine() - 80, '⚡ ¡OVERDRIVE x2!', { color: '#fbbf24', size: 24 });
    }
    document.getElementById('instructions').style.opacity = '0';
    document.getElementById('skipBtn').style.display = 'block';

    // Llamar onTurnStart de cada bloque usando su behavior
    for (let brick of gameState.bricks) {
        BrickRegistry.get(brick.type).onTurnStart(brick, gameState);
    }

    // Crear cola de bolas usando los behaviors registrados.
    // El orden viene del registry: shootPriority asc.
    const shootQueue = [];
    const inv = gameState.ballInventory;
    const maxBalls = MAX_BALLS_ON_SCREEN;

    const shootOrder = BallRegistry.getTypes()
        .slice()
        .sort((a, b) =>
            (BallRegistry.get(a).getConfig().shootPriority ?? 100) -
            (BallRegistry.get(b).getConfig().shootPriority ?? 100));

    for (const ballType of shootOrder) {
        const count = inv[ballType] || 0;
        for (let i = 0; i < count && shootQueue.length < maxBalls; i++) {
            shootQueue.push(ballType);
        }
    }

    gameState.ballsToShoot = shootQueue;
    gameState.totalBallsToShoot = shootQueue.length;

    shootNextBall();
}

export function shootNextBall() {
    if (gameState.ballsToShoot.length === 0 || gameState.gameOver) return;

    const ballType = gameState.ballsToShoot.shift();
    const vx = Math.cos(gameState.aimAngle) * BALL_SPEED;
    const vy = Math.sin(gameState.aimAngle) * BALL_SPEED;

    // El registry valida que cada ball type tenga createBall (Fase 2),
    // por lo que esta es la unica via canonica de creacion.
    const ball = BallRegistry.get(ballType).createBall(
        gameState.launchX,
        gameState.launchY - getBallRadius() - 1,
        vx,
        vy
    );

    gameState.balls.push(ball);

    if (gameState.ballsToShoot.length > 0) {
        const delay = gameState.speedMultiplier > 1 ? SHOOT_DELAY / 3 : SHOOT_DELAY;
        shootTimeout = setTimeout(shootNextBall, delay);
    }
}

// ====================================
// FIN DE TURNO (usando behaviors)
// ====================================

export function endTurn() {
    gameState.isShooting = false;
    gameState.balls = [];
    gameState.ballsToShoot = [];
    gameState.totalBallsToShoot = 0;
    gameState.shootingTime = 0;
    gameState.launchX = gameState.nextLaunchX || getWidth() / 2;

    // Recompensa de combo: cada COMBO_BALLS_PER ladrillos destruidos este
    // turno dan +1 bola normal. Premia los turnos explosivos y le da al
    // jugador un motor de catch-up contra la curva de HP.
    const comboReward = Math.min(COMBO_MAX_REWARD, Math.floor(gameState.combo / COMBO_BALLS_PER));
    if (comboReward > 0) {
        const defaultType = BallRegistry.defaultType;
        gameState.ballInventory[defaultType] = (gameState.ballInventory[defaultType] || 0) + comboReward;
        addFloatingText(
            gameState.launchX,
            getBottomLine() - 60,
            `🎯 COMBO x${gameState.combo} → +${comboReward} bola${comboReward > 1 ? 's' : ''}`,
            { color: '#4ecca3', size: 16 }
        );
    }
    gameState.combo = 0;
    gameState.overdriveActive = false;

    gameState.turn++;
    gameState.speedMultiplier = 1;
    document.getElementById('speedIndicator').style.display = 'none';
    document.getElementById('skipBtn').style.display = 'none';

    if (shootTimeout) {
        clearTimeout(shootTimeout);
        shootTimeout = null;
    }

    // Llamar onTurnEnd de cada bloque usando su behavior
    for (let brick of gameState.bricks) {
        BrickRegistry.get(brick.type).onTurnEnd(brick, gameState);
    }

    moveBricksDown();

    if (!gameState.gameOver) {
        generateNewRow();
        updateUI();
    }
}

// ====================================
// FIN DE JUEGO
// ====================================

export function getBestTurn(difficulty) {
    try {
        return parseInt(localStorage.getItem('glowbreak_best_' + difficulty)) || 0;
    } catch (e) {
        return 0;
    }
}

function saveBestTurn(difficulty, turn) {
    try {
        localStorage.setItem('glowbreak_best_' + difficulty, String(turn));
    } catch (e) {
        // localStorage no disponible (modo privado, etc.) — sin récords
    }
}

export function endGame() {
    gameState.gameOver = true;
    gameState.speedMultiplier = 1;
    document.getElementById('speedIndicator').style.display = 'none';
    document.getElementById('skipBtn').style.display = 'none';
    document.getElementById('finalTurn').textContent = gameState.turn;
    document.getElementById('finalBalls').textContent = getTotalBalls();

    // Récord por dificultad (solo cuenta si empezaste desde el turno 1,
    // para que arrancar en turno 200 no infle el récord)
    const prevBest = getBestTurn(currentDifficulty);
    const isRecord = startingTurn === 1 && gameState.turn > prevBest;
    if (isRecord) {
        saveBestTurn(currentDifficulty, gameState.turn);
    }
    const bestLine = document.getElementById('bestTurnLine');
    if (bestLine) {
        const best = Math.max(prevBest, isRecord ? gameState.turn : 0);
        bestLine.textContent = best > 0 ? `Récord: turno ${best}` : '';
    }
    const recordBadge = document.getElementById('newRecordBadge');
    if (recordBadge) {
        recordBadge.style.display = isRecord && prevBest > 0 ? 'block' : 'none';
    }

    const diffLabel = document.getElementById('finalDifficulty');
    diffLabel.textContent = difficultyConfig.emoji + ' ' + difficultyConfig.name;
    diffLabel.style.background = difficultyConfig.color;
    diffLabel.style.color = currentDifficulty === 'medium' ? '#333' : 'white';

    document.getElementById('gameOver').style.display = 'flex';
}

export function updateUI() {
    document.getElementById('turnDisplay').textContent = gameState.turn;
    document.getElementById('ballDisplay').textContent = getTotalBalls();
    const shieldDisplay = document.getElementById('shieldDisplay');
    if (shieldDisplay) {
        shieldDisplay.textContent = gameState.shieldCharges;
    }
}

// physics.js emite 'inventoryChanged' al recolectar bonuses; aqui
// reaccionamos refrescando el HUD. Cualquier nueva UI (sound effects,
// achievements, etc.) puede suscribirse sin tocar physics.
events.on('inventoryChanged', () => updateUI());

// ====================================
// MENÚ
// ====================================

export function setMenuDifficulty(diff) {
    document.querySelectorAll('.diff-chip').forEach(c => c.classList.remove('diff-chip--active'));
    const chip = document.querySelector(`.diff-chip[data-diff="${diff}"]`);
    if (chip) chip.classList.add('diff-chip--active');
    document.getElementById('playBtn').dataset.diff = diff;
}

// ====================================
// INICIALIZACIÓN
// ====================================

export function initGame(difficulty) {
    currentDifficulty = difficulty;
    difficultyConfig = DIFFICULTY_SETTINGS[difficulty];

    const turnInput = document.getElementById('startTurnInput');
    startingTurn = Math.max(1, Math.min(500, parseInt(turnInput.value) || 1));

    const startingBalls = calculateStartingBalls(startingTurn, difficulty);

    const width = getWidth();

    gameState.turn = startingTurn;
    gameState.ballInventory = { ...startingBalls.inventory };
    gameState.balls = [];
    gameState.bricks = [];
    gameState.bonuses = [];
    gameState.particles = [];
    gameState.laserEffect = null;
    gameState.launchX = width / 2;
    gameState.launchY = getBottomLine();
    gameState.nextLaunchX = width / 2;
    gameState.isAiming = false;
    gameState.isShooting = false;
    gameState.isHolding = false;
    gameState.aimAngle = -Math.PI / 2;
    gameState.ballsToShoot = [];
    gameState.totalBallsToShoot = 0;
    gameState.ballsLanded = 0;
    gameState.firstBallLanded = false;
    gameState.gameOver = false;
    gameState.gameStarted = true;
    gameState.showInstructions = true;
    gameState.speedMultiplier = 1;
    gameState.combo = 0;
    gameState.overdriveCharge = 0;
    gameState.overdriveActive = false;
    gameState.shieldCharges = STARTING_SHIELDS;
    gameState.floatingTexts = [];
    gameState.shake = 0;

    document.getElementById('mainMenu').style.display = 'none';
    document.getElementById('gameOver').style.display = 'none';
    document.getElementById('ui').style.display = 'flex';
    document.getElementById('instructions').style.display = 'block';
    document.getElementById('instructions').style.opacity = '1';
    document.getElementById('speedIndicator').style.display = 'none';
    document.getElementById('skipBtn').style.display = 'none';

    const badge = document.getElementById('difficultyBadge');
    badge.textContent = difficultyConfig.emoji + ' ' + difficultyConfig.name;
    badge.style.background = difficultyConfig.color;
    badge.style.color = difficulty === 'medium' ? '#333' : 'white';

    const rowsToGenerate = Math.min(6, Math.floor(startingTurn / 3) + 1);

    for (let i = 0; i < rowsToGenerate; i++) {
        // Cada fila usa el turno que le correspondería históricamente
        // para que el schedule determinista genere los bonuses correctos.
        const rowTurn = Math.max(1, startingTurn - (rowsToGenerate - 1 - i));
        gameState.turn = rowTurn;
        generateNewRow();
        if (i < rowsToGenerate - 1) {
            const cellSize = getCellSize();
            for (let brick of gameState.bricks) {
                brick.y += cellSize;
            }
            for (let bonus of gameState.bonuses) {
                bonus.y += cellSize;
            }
        }
    }
    gameState.turn = startingTurn;

    updateUI();
}

export function showMainMenu() {
    gameState.gameStarted = false;
    document.getElementById('mainMenu').style.display = 'flex';
    document.getElementById('gameOver').style.display = 'none';
    document.getElementById('ui').style.display = 'none';
    document.getElementById('instructions').style.display = 'none';

    setMenuDifficulty(currentDifficulty);
    updateBallsPreview();
}

// ====================================
// GAME LOOP
// ====================================

export function gameLoop() {
    if (gameState.gameStarted && !gameState.gameOver) {
        updateBalls();
        updateParticles();
    }
}
