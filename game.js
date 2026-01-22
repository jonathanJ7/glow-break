import { DIFFICULTY_SETTINGS, COLS, SHOOT_DELAY, MAX_BALLS_ON_SCREEN, FAST_SPEED_MULTIPLIER, BASE_BALL_RADIUS, BALL_SPEED } from './config.js';
import { getWidth, getHeight, getCellSize, getLeftBorder, getTopOffset, getBottomLine, getScale, getBallRadius } from './rendering.js';
import { updateBalls, updateParticles, createParticles } from './physics.js';

// ====================================
// ESTADO DEL JUEGO
// ====================================
export let gameState = {
    turn: 1,
    ballCount: 1,
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
    displayAimAngle: -Math.PI / 2,
    aimHistory: [],
    ballsToShoot: 0,
    ballsLanded: 0,
    firstBallLanded: false,
    gameOver: false,
    gameStarted: false,
    showInstructions: true,
    activePowerups: {
        fireball: 0,
        superDamage: 0
    },
    speedMultiplier: 1
};

export let currentDifficulty = 'easy';
export let difficultyConfig = DIFFICULTY_SETTINGS.easy;
export let startingTurn = 1;
export let shootTimeout = null;

// Calculate expected balls for a given turn based on difficulty
export function calculateStartingBalls(turn, difficulty) {
    const config = DIFFICULTY_SETTINGS[difficulty];

    if (turn <= 1) return 1;

    const ballsPerTurn = {
        easy: 0.85,
        medium: 0.55,
        hard: 0.35
    };

    const rate = ballsPerTurn[difficulty];
    const baseBalls = Math.floor((turn - 1) * rate);

    const variance = Math.floor(baseBalls * 0.15);
    const finalBalls = Math.max(1, baseBalls + Math.floor(Math.random() * variance * 2) - variance);

    return finalBalls;
}

// Update balls preview when turn input changes
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

        preview.innerHTML = `<span style="color:#4ecca3">😊${easyBalls}</span> · <span style="color:#f5b942">😤${mediumBalls}</span> · <span style="color:#e94560">💀${hardBalls}</span>`;
    }
}

// Generate a new row of bricks
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

            let type = 'normal';
            const specialRoll = Math.random();
            let cumulativeProbability = 0;

            if (turn > 3) {
                const explosiveThreshold = cumulativeProbability + config.explosiveChance;
                if (specialRoll >= cumulativeProbability && specialRoll < explosiveThreshold) {
                    type = 'explosive';
                }
                cumulativeProbability = explosiveThreshold;
            }

            if (type === 'normal' && turn > 5) {
                const armoredThreshold = cumulativeProbability + config.armoredChance;
                if (specialRoll >= cumulativeProbability && specialRoll < armoredThreshold) {
                    type = 'armored';
                }
                cumulativeProbability = armoredThreshold;
            }

            if (type === 'normal' && config.poisonBrickChance && turn > 8) {
                const spawnerThreshold = cumulativeProbability + config.poisonBrickChance;
                if (specialRoll >= cumulativeProbability && specialRoll < spawnerThreshold) {
                    type = 'spawner';
                }
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
            const bonusCount = Math.random() < config.multiBallChance && turn > 10 ? 2 : 1;
            gameState.bonuses.push({
                x: leftBorder + col * cellSize + cellSize / 2,
                y: topOffset + cellSize / 2,
                radius: Math.max(8, 12 * getScale()),
                type: 'ball',
                value: bonusCount
            });
            bonusPlaced = true;
        } else if (rand < density + config.bonusChance + config.powerupChance && !powerupPlaced && turn > 3) {
            const powerupTypes = ['fireball', 'horizontal', 'superDamage', 'ballMultiplier'];
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

// Move bricks down
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

// Shooting mechanics
export function startShooting() {
    if (gameState.isShooting || gameState.gameOver) return;

    gameState.isShooting = true;
    gameState.shootingTime = 0;
    gameState.ballsToShoot = Math.min(gameState.ballCount, MAX_BALLS_ON_SCREEN);
    gameState.ballsLanded = 0;
    gameState.firstBallLanded = false;
    gameState.showInstructions = false;
    document.getElementById('instructions').style.opacity = '0';
    document.getElementById('skipBtn').style.display = 'block';

    shootNextBall();
}

export function shootNextBall() {
    if (gameState.ballsToShoot <= 0 || gameState.gameOver) return;

    const vx = Math.cos(gameState.aimAngle) * BALL_SPEED;
    const vy = Math.sin(gameState.aimAngle) * BALL_SPEED;

    const isFireball = gameState.activePowerups.fireball > 0;
    if (isFireball) gameState.activePowerups.fireball--;

    const isSuperDamage = gameState.activePowerups.superDamage > 0;
    if (isSuperDamage) gameState.activePowerups.superDamage--;

    gameState.balls.push({
        x: gameState.launchX,
        y: gameState.launchY - getBallRadius() - 1,
        vx: vx,
        vy: vy,
        active: true,
        hasGoneUp: false,
        fireball: isFireball,
        damage: isSuperDamage ? 3 : 1,
        hitBricks: isFireball ? new Set() : null
    });

    gameState.ballsToShoot--;

    if (gameState.ballsToShoot > 0) {
        const delay = gameState.speedMultiplier > 1 ? SHOOT_DELAY / 3 : SHOOT_DELAY;
        shootTimeout = setTimeout(shootNextBall, delay);
    }
}

export function endTurn() {
    gameState.isShooting = false;
    gameState.balls = [];
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

    moveBricksDown();

    if (!gameState.gameOver) {
        generateNewRow();
        updateUI();
    }
}

export function endGame() {
    gameState.gameOver = true;
    gameState.speedMultiplier = 1;
    document.getElementById('speedIndicator').style.display = 'none';
    document.getElementById('skipBtn').style.display = 'none';
    document.getElementById('finalTurn').textContent = gameState.turn;
    document.getElementById('finalBalls').textContent = gameState.ballCount;

    const diffLabel = document.getElementById('finalDifficulty');
    diffLabel.textContent = difficultyConfig.emoji + ' ' + difficultyConfig.name;
    diffLabel.style.background = difficultyConfig.color;
    diffLabel.style.color = currentDifficulty === 'medium' ? '#333' : 'white';

    document.getElementById('gameOver').style.display = 'flex';
}

export function updateUI() {
    document.getElementById('turnDisplay').textContent = gameState.turn;
    document.getElementById('ballDisplay').textContent = gameState.ballCount;
}

// Menu animations
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

// Initialize game
export function initGame(difficulty) {
    currentDifficulty = difficulty;
    difficultyConfig = DIFFICULTY_SETTINGS[difficulty];

    const turnInput = document.getElementById('startTurnInput');
    startingTurn = Math.max(1, Math.min(500, parseInt(turnInput.value) || 1));

    const startingBalls = calculateStartingBalls(startingTurn, difficulty);

    const width = getWidth();

    gameState.turn = startingTurn;
    gameState.ballCount = startingBalls;
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
    gameState.displayAimAngle = -Math.PI / 2;
    gameState.aimHistory = [];
    gameState.ballsToShoot = 0;
    gameState.ballsLanded = 0;
    gameState.firstBallLanded = false;
    gameState.gameOver = false;
    gameState.gameStarted = true;
    gameState.showInstructions = true;
    gameState.activePowerups = {
        fireball: 0,
        superDamage: 0
    };
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

// Game loop
export function gameLoop() {
    if (gameState.gameStarted && !gameState.gameOver) {
        updateBalls();
        updateParticles();
    }
}
