/**
 * Game Module - Refactorizado con patrón Strategy
 *
 * Este módulo usa los registries de behaviors para manejar
 * el estado del juego de forma extensible (Open/Closed principle).
 *
 * Para agregar nuevos tipos de bloques, bolas o bonuses,
 * solo necesitas registrar nuevos behaviors.
 */

import { DIFFICULTY_SETTINGS, SPAWN_SCHEDULE, COLS, SHOOT_DELAY, MAX_BALLS_ON_SCREEN, FAST_SPEED_MULTIPLIER, BASE_BALL_RADIUS, BALL_SPEED } from './config.js';
import { getWidth, getHeight, getCellSize, getLeftBorder, getTopOffset, getBottomLine, getScale, getBallRadius } from './rendering.js';
import { updateBalls, updateParticles, createParticles } from './physics.js';
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
    speedMultiplier: 1
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
            result.ballBonus = { type: 'ball', value: 1 };
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

    const baseHP = Math.floor(turn * (1 + Math.log(turn + 1) * 0.25) * config.hpMultiplier);
    const density = Math.min(config.densityBase + turn * config.densityGrowth, config.maxDensity);

    const isReinforcedRow = config.reinforcedRows && turn % 10 === 0;
    const rowHpMultiplier = isReinforcedRow ? 2.0 : 1.0;

    // Paso 1: generar ladrillos (posición aleatoria, tipo probabilístico)
    for (let col = 0; col < COLS; col++) {
        if (Math.random() < density) {
            const hpVariation = config.hpVariationMin + Math.random() * (config.hpVariationMax - config.hpVariationMin);
            const hp = Math.max(1, Math.floor(baseHP * hpVariation * rowHpMultiplier));

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
    const occupiedCols = new Set(gameState.bricks
        .filter(b => b.y < topOffset + cellSize)
        .map(b => b.col));

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

    for (let brick of gameState.bricks) {
        brick.y += cellSize;

        if (brick.y + brick.height > getBottomLine() - 10) {
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

export function endGame() {
    gameState.gameOver = true;
    gameState.speedMultiplier = 1;
    document.getElementById('speedIndicator').style.display = 'none';
    document.getElementById('skipBtn').style.display = 'none';
    document.getElementById('finalTurn').textContent = gameState.turn;
    document.getElementById('finalBalls').textContent = getTotalBalls();

    const diffLabel = document.getElementById('finalDifficulty');
    diffLabel.textContent = difficultyConfig.emoji + ' ' + difficultyConfig.name;
    diffLabel.style.background = difficultyConfig.color;
    diffLabel.style.color = currentDifficulty === 'medium' ? '#333' : 'white';

    document.getElementById('gameOver').style.display = 'flex';
}

export function updateUI() {
    document.getElementById('turnDisplay').textContent = gameState.turn;
    document.getElementById('ballDisplay').textContent = getTotalBalls();
}

// physics.js emite 'inventoryChanged' al recolectar bonuses; aqui
// reaccionamos refrescando el HUD. Cualquier nueva UI (sound effects,
// achievements, etc.) puede suscribirse sin tocar physics.
events.on('inventoryChanged', () => updateUI());

// ====================================
// MENÚ
// ====================================

export function createMenuBalls() {
    const container = document.getElementById('menuBalls');
    container.innerHTML = '';

    for (let i = 0; i < 15; i++) {
        const ball = document.createElement('div');
        ball.className = 'menu-ball';
        const size = 20 + Math.random() * 60;
        ball.style.width = size + 'px';
        ball.style.height = size + 'px';
        ball.style.left = Math.random() * 100 + '%';
        ball.style.top = Math.random() * 100 + '%';
        ball.style.background = ['#4ecca3', '#f9ed69', '#e94560', '#a855f7', '#3b82f6'][Math.floor(Math.random() * 5)];
        container.appendChild(ball);
    }
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

    updateBallsPreview();
    createMenuBalls();
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
