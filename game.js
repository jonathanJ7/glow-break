/**
 * Game Module - Refactorizado con patrón Strategy
 *
 * Este módulo usa los registries de behaviors para manejar
 * el estado del juego de forma extensible (Open/Closed principle).
 *
 * Para agregar nuevos tipos de bloques, bolas o bonuses,
 * solo necesitas registrar nuevos behaviors.
 */

import { DIFFICULTY_SETTINGS, COLS, SHOOT_DELAY, MAX_BALLS_ON_SCREEN, FAST_SPEED_MULTIPLIER, BASE_BALL_RADIUS, BALL_SPEED } from './config.js';
import { getWidth, getHeight, getCellSize, getLeftBorder, getTopOffset, getBottomLine, getScale, getBallRadius } from './rendering.js';
import { updateBalls, updateParticles, createParticles } from './physics.js';
import { BrickRegistry, BallRegistry, BonusRegistry } from './js/behaviors/index.js';

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

export function calculateStartingBalls(turn, difficulty) {
    const defaultType = BallRegistry.defaultType;

    if (turn <= 1) {
        return { inventory: { [defaultType]: 1 }, total: 1 };
    }

    const ballsPerTurn = {
        easy: 1.2,
        medium: 0.9,
        hard: 0.5
    };

    const rate = ballsPerTurn[difficulty];
    const baseBalls = Math.floor((turn - 1) * rate);

    const variance = Math.floor(baseBalls * 0.15);
    const totalBalls = Math.max(1, baseBalls + Math.floor(Math.random() * variance * 2) - variance);

    // Distribuir por tipo iterando el registry: cada behavior con
    // startingShare en su getConfig() reclama su porcion segun el turno.
    // El remainder cae al defaultType.
    const inventory = {};
    let remaining = totalBalls;

    for (const [type, behavior] of BallRegistry.getAll()) {
        if (type === defaultType) continue;
        const cfg = behavior.getConfig();
        if (turn < (cfg.minTurn || 0)) continue;
        if (!cfg.startingShare) continue;
        const count = Math.floor(totalBalls * cfg.startingShare);
        if (count > 0) {
            inventory[type] = count;
            remaining -= count;
        }
    }

    inventory[defaultType] = Math.max(0, remaining);

    return { inventory, total: totalBalls };
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

/**
 * Elige un bonus type del BonusRegistry filtrando por category
 * ('ball' o 'powerup') y respetando minTurn de cada behavior.
 *
 * Para 'ball' usa los `probability` declarados en getConfig() (acumulativo).
 * Para 'powerup' es uniform random entre los candidatos elegibles.
 *
 * Reemplaza los antiguos hardcoded if (turn >= 8) ... fireballBall
 * y los arrays ['horizontal', 'strength'].
 */
function pickBonusByCategory(category, turn) {
    const candidates = [];
    let cumulative = 0;
    for (const [type, behavior] of BonusRegistry.getAll()) {
        const cfg = behavior.getConfig();
        if (cfg.category !== category) continue;
        if (turn < (cfg.minTurn || 0)) continue;
        candidates.push({ type, behavior, cfg });
    }
    if (candidates.length === 0) return null;

    if (category === 'ball') {
        // Pesos via cfg.probability acumulativo. El default (sin probability)
        // captura el remainder para garantizar siempre un resultado.
        const roll = Math.random();
        for (const c of candidates) {
            if (!c.cfg.probability) continue;
            const threshold = cumulative + c.cfg.probability;
            if (roll >= cumulative && roll < threshold) return c.type;
            cumulative = threshold;
        }
        return BonusRegistry.defaultType;
    }

    // 'powerup': uniform pick
    return candidates[Math.floor(Math.random() * candidates.length)].type;
}

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

    let bonusPlaced = false;
    let powerupPlaced = false;

    for (let col = 0; col < COLS; col++) {
        const rand = Math.random();

        if (rand < density) {
            const hpVariation = config.hpVariationMin + Math.random() * (config.hpVariationMax - config.hpVariationMin);
            const hp = Math.max(1, Math.floor(baseHP * hpVariation * rowHpMultiplier));

            // Determinar tipo de bloque iterando los behaviors registrados.
            // Cada behavior expone su propia baseChance + difficultyMultiplier
            // en getConfig(); la dificultad solo escala. Cero hardcoded keys
            // por dificultad en config.js.
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
        } else if (rand < density + config.bonusChance && !bonusPlaced) {
            // Tipo de bola bonus iterando BonusRegistry filtrando category 'ball'.
            const ballType = pickBonusByCategory('ball', turn);

            const bonusCount = Math.random() < config.multiBallChance && turn > 10 ? 2 : 1;
            gameState.bonuses.push({
                x: leftBorder + col * cellSize + cellSize / 2,
                y: topOffset + cellSize / 2,
                radius: Math.max(8, 12 * getScale()),
                type: ballType,
                value: bonusCount
            });
            bonusPlaced = true;
        } else if (rand < density + config.bonusChance + config.powerupChance && !powerupPlaced && turn > 3) {
            // Power-ups especiales — itera la categoria 'powerup' del BonusRegistry.
            const ptype = pickBonusByCategory('powerup', turn);
            if (!ptype) continue;
            gameState.bonuses.push({
                x: leftBorder + col * cellSize + cellSize / 2,
                y: topOffset + cellSize / 2,
                radius: Math.max(10, 14 * getScale()),
                type: ptype
            });
            powerupPlaced = true;
        }
    }

    // Garantizar bonus
    const guaranteedBonusChance = currentDifficulty === 'easy' ? 0.9 : currentDifficulty === 'medium' ? 0.6 : 0.35;
    if (!bonusPlaced && Math.random() < guaranteedBonusChance) {
        const emptyCol = findEmptyColumn();
        if (emptyCol !== -1) {
            gameState.bonuses.push({
                x: leftBorder + emptyCol * cellSize + cellSize / 2,
                y: topOffset + cellSize / 2,
                radius: Math.max(8, 12 * getScale()),
                type: 'ball',
                value: 1
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
