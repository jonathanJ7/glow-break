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
    // Inventario de bolas por tipo
    ballInventory: {
        normal: 1,      // Bolas comunes
        fireball: 0,    // Bolas de fuego (atraviesan bloques)
        splitter: 0,    // Bolas que se dividen en 5 al golpear
        strength: 0     // Bolas con daño aumentado (+2)
    },
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
    return gameState.ballInventory.normal +
           gameState.ballInventory.fireball +
           gameState.ballInventory.splitter +
           gameState.ballInventory.strength;
}

export function calculateStartingBalls(turn, difficulty) {
    if (turn <= 1) return { normal: 1, fireball: 0, splitter: 0, total: 1 };

    const ballsPerTurn = {
        easy: 1.2,
        medium: 0.9,
        hard: 0.5
    };

    const rate = ballsPerTurn[difficulty];
    const baseBalls = Math.floor((turn - 1) * rate);

    const variance = Math.floor(baseBalls * 0.15);
    const totalBalls = Math.max(1, baseBalls + Math.floor(Math.random() * variance * 2) - variance);

    // Distribuir bolas por tipo según el turno
    let normal = totalBalls;
    let fireball = 0;
    let splitter = 0;

    // Fireballs aparecen a partir del turno 8
    if (turn >= 8) {
        fireball = Math.floor(totalBalls * 0.15);
        normal -= fireball;
    }

    // Splitters aparecen a partir del turno 15
    if (turn >= 15) {
        splitter = Math.floor(totalBalls * 0.10);
        normal -= splitter;
    }

    return { normal, fireball, splitter, total: totalBalls };
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

    let bonusPlaced = false;
    let powerupPlaced = false;

    for (let col = 0; col < COLS; col++) {
        const rand = Math.random();

        if (rand < density) {
            const hpVariation = config.hpVariationMin + Math.random() * (config.hpVariationMax - config.hpVariationMin);
            const hp = Math.max(1, Math.floor(baseHP * hpVariation * rowHpMultiplier));

            // Determinar tipo de bloque usando los behaviors registrados
            let type = 'normal';
            const specialRoll = Math.random();
            let cumulativeProbability = 0;

            // Iterar sobre todos los tipos de bloques registrados
            for (const [brickType, behavior] of BrickRegistry.getAll()) {
                if (brickType === 'normal') continue;

                const brickConfig = behavior.getConfig();
                if (!brickConfig.configKey) continue;

                const chance = config[brickConfig.configKey] || 0;
                if (chance <= 0) continue;
                if (turn <= brickConfig.minTurn) continue;

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
            // Determinar tipo de bola bonus usando los behaviors
            let ballType = 'ball';
            const typeRoll = Math.random();

            // Fireballs aparecen a partir del turno 8
            if (turn >= 8 && typeRoll < 0.15) {
                ballType = 'fireballBall';
            }
            // Splitters aparecen a partir del turno 15
            else if (turn >= 15 && typeRoll < 0.25) {
                ballType = 'splitterBall';
            }

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
            // Power-ups especiales
            const powerupTypes = ['horizontal', 'strength'];
            const ptype = powerupTypes[Math.floor(Math.random() * powerupTypes.length)];
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
        const behavior = BrickRegistry.get(brick.type);
        if (behavior && behavior.onTurnStart) {
            behavior.onTurnStart(brick, gameState);
        }
    }

    // Crear cola de bolas usando los behaviors registrados
    const shootQueue = [];
    const inv = gameState.ballInventory;
    const maxBalls = MAX_BALLS_ON_SCREEN;

    // Orden de disparo basado en los behaviors
    const shootOrder = ['normal', 'fireball', 'splitter', 'strength'];

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

    // Usar el behavior de la bola para crearla
    const behavior = BallRegistry.get(ballType);
    let ball;

    if (behavior && behavior.createBall) {
        ball = behavior.createBall(
            gameState.launchX,
            gameState.launchY - getBallRadius() - 1,
            vx,
            vy
        );
    } else {
        // Fallback para tipos desconocidos
        ball = {
            x: gameState.launchX,
            y: gameState.launchY - getBallRadius() - 1,
            vx: vx,
            vy: vy,
            active: true,
            hasGoneUp: false,
            ballType: ballType,
            fireball: ballType === 'fireball',
            splitter: ballType === 'splitter',
            strength: ballType === 'strength',
            hasSplit: false,
            damage: ballType === 'strength' ? 3 : 1,
            hitBricks: ballType === 'fireball' ? new Set() : null
        };
    }

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
        const behavior = BrickRegistry.get(brick.type);
        if (behavior && behavior.onTurnEnd) {
            behavior.onTurnEnd(brick, gameState);
        }
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
    gameState.ballInventory = {
        normal: startingBalls.normal,
        fireball: startingBalls.fireball,
        splitter: startingBalls.splitter,
        strength: 0
    };
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
