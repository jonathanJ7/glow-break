/**
 * Game Module - Refactorizado con patrón Strategy
 *
 * Este módulo usa los registries de behaviors para manejar
 * el estado del juego de forma extensible (Open/Closed principle).
 *
 * Para agregar nuevos tipos de bloques, bolas o bonuses,
 * solo necesitas registrar nuevos behaviors.
 */

import { DIFFICULTY_SETTINGS, SPAWN_SCHEDULE, COLS, SHOOT_DELAY, MAX_BALLS_ON_SCREEN, FAST_SPEED_MULTIPLIER, BASE_BALL_RADIUS, BALL_SPEED, COMBO_BALLS_PER, COMBO_MAX_REWARD, OVERDRIVE_MAX, BOSS_INTERVAL, BOSS_HP_MULTIPLIER, STARTING_SHIELDS, MAX_SHIELDS, SHIELD_BURN_ROWS, BALL_BONUS_SCALE_TURNS, HP_LOG_FACTOR, DEFAULT_AIM_SCATTER, AIM_ANGLE_MIN, AIM_ANGLE_MAX } from './config.js';
import { getWidth, getHeight, getCellSize, getLeftBorder, getRightBorder, getTopOffset, getBottomLine, getScale, getBallRadius } from './rendering.js';
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
    aimScatterOffsets: {}, // Desvío de puntería de ESTE turno, por tipo de bola
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
            // quede atrás de la curva de HP en runs largas. Cada dificultad
            // puede definir su propio ritmo con scaleTurns.
            const scaleTurns = ballCfg.scaleTurns || BALL_BONUS_SCALE_TURNS;
            result.ballBonus = { type: 'ball', value: 1 + Math.floor(turn / scaleTurns) };
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
    // quema solo las SHIELD_BURN_ROWS filas más bajas — con el valor
    // actual (1), únicamente la fila que colisionó. Sin escudo: fin.
    const crossing = gameState.bricks.filter(b => b.y + b.height > dangerLine);
    if (crossing.length > 0) {
        if (gameState.shieldCharges > 0) {
            gameState.shieldCharges--;
            // Se cuenta desde la fila más baja que cruzó hacia arriba. El
            // medio cell de margen absorbe el ruido de coma flotante sin
            // llegar a alcanzar la fila siguiente.
            const lowestRowY = Math.max(...crossing.map(b => b.y));
            const burnTopY = lowestRowY - cellSize * (SHIELD_BURN_ROWS - 0.5);
            const burned = new Set(gameState.bricks.filter(b => b.y >= burnTopY));
            for (const b of burned) {
                createParticles(b.x + b.width / 2, b.y + b.height / 2, '#38bdf8', 10);
            }
            gameState.bricks = gameState.bricks.filter(b => !burned.has(b));
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
    const inv = gameState.ballInventory;
    const maxBalls = MAX_BALLS_ON_SCREEN;

    const shootOrder = BallRegistry.getTypes()
        .slice()
        .sort((a, b) =>
            (BallRegistry.get(a).getConfig().shootPriority ?? 100) -
            (BallRegistry.get(b).getConfig().shootPriority ?? 100));

    // Cuando el inventario supera el tope de bolas en pantalla, las
    // especiales tienen prioridad de SELECCIÓN (son pocas y valiosas) y
    // las normales rellenan los lugares restantes. El ORDEN de disparo
    // sigue siendo por shootPriority. Sin esta reserva, en turnos altos
    // las normales (prioridad más baja, se encolan primero) llenaban el
    // tope y las especiales no se disparaban nunca.
    const defaultType = BallRegistry.defaultType;
    const selectedCounts = {};
    let slotsLeft = maxBalls;
    for (const ballType of shootOrder) {
        if (ballType === defaultType) continue;
        const take = Math.min(inv[ballType] || 0, slotsLeft);
        selectedCounts[ballType] = take;
        slotsLeft -= take;
    }
    selectedCounts[defaultType] = Math.min(inv[defaultType] || 0, slotsLeft);

    const shootQueue = [];
    for (const ballType of shootOrder) {
        const count = selectedCounts[ballType] || 0;
        for (let i = 0; i < count; i++) {
            shootQueue.push(ballType);
        }
    }

    gameState.ballsToShoot = shootQueue;
    gameState.totalBallsToShoot = shootQueue.length;

    // Un dado por tipo para todo el turno (ver rollAimScatter)
    gameState.aimScatterOffsets = rollAimScatter();

    shootNextBall();
}

/**
 * Dispersión de puntería: en las dificultades con `assists.aimScatter`,
 * se tira UN dado por TIPO de bola al empezar el turno. El tipo que saca
 * desviación la aplica a TODAS sus bolas, así que el chorro se mantiene
 * junto: todas las normales salen por un lado, todas las de fuego por
 * otro. Los valores salen del `aimScatter` del ball type, o de
 * DEFAULT_AIM_SCATTER.
 *
 * @returns {Object} desvío en radianes por tipo (0 = sale exacta)
 */
export function rollAimScatter() {
    const offsets = {};
    if (!difficultyConfig.assists?.aimScatter) return offsets;

    for (const type of BallRegistry.getTypes()) {
        const { chance, maxDegrees } = BallRegistry.get(type).aimScatter || DEFAULT_AIM_SCATTER;
        offsets[type] = Math.random() < chance
            ? (Math.random() * 2 - 1) * maxDegrees * Math.PI / 180
            : 0;
    }
    return offsets;
}

/**
 * Ángulo real de salida de un tipo de bola: el apuntado más el desvío que
 * le tocó a su tipo este turno, recortado al mismo rango que el apuntado
 * manual para que ninguna bola salga horizontal o hacia abajo.
 */
export function applyAimScatter(angle, ballType) {
    const offset = gameState.aimScatterOffsets[ballType] || 0;
    if (offset === 0) return angle;
    return Math.max(AIM_ANGLE_MIN, Math.min(AIM_ANGLE_MAX, angle + offset));
}

export function shootNextBall() {
    if (gameState.ballsToShoot.length === 0 || gameState.gameOver) return;

    const ballType = gameState.ballsToShoot.shift();
    const behavior = BallRegistry.get(ballType);
    const angle = applyAimScatter(gameState.aimAngle, ballType);
    const vx = Math.cos(angle) * BALL_SPEED;
    const vy = Math.sin(angle) * BALL_SPEED;

    // El registry valida que cada ball type tenga createBall (Fase 2),
    // por lo que esta es la unica via canonica de creacion.
    const ball = behavior.createBall(
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
        // Punto de guardado: inicio de turno, sin bolas en vuelo.
        saveGame();
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
    // Una partida terminada no se puede resumir
    clearSavedGame();
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
    updateBallInventoryHud();
}

/**
 * HUD de bolas especiales (#ballInventory): píldoras DOM centradas bajo
 * la línea inferior. Iteramos el registry: cualquier ball type con
 * showInInventoryHud y count > 0 aparece — cero hardcoded keys, agregar
 * una bola nueva solo requiere showInInventoryHud: true en su behavior.
 */
function updateBallInventoryHud() {
    const el = document.getElementById('ballInventory');
    if (!el) return;

    let html = '';
    for (const [type, behavior] of BallRegistry.getAll()) {
        if (!behavior.showInInventoryHud) continue;
        const count = gameState.ballInventory[type] || 0;
        if (count <= 0) continue;

        const bg = behavior.bgColor || 'rgba(255,255,255,0.5)';
        const fg = behavior.textColor || 'white';
        html += `<span class="inv-pill" style="background:${bg};color:${fg}">${behavior.icon || '?'} ${count}</span>`;
    }
    el.innerHTML = html;
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

/**
 * Resetea el gameState y elige la dificultad activa. Compartido por
 * initGame (partida nueva) y resumeGame (partida guardada), que después
 * pisan turno/inventario/bricks según corresponda.
 */
function resetSessionState(difficulty) {
    currentDifficulty = difficulty;
    difficultyConfig = DIFFICULTY_SETTINGS[difficulty];

    const width = getWidth();

    gameState.turn = 1;
    gameState.ballInventory = {};
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
    gameState.aimScatterOffsets = {};
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
    document.getElementById('ballInventory').style.display = 'flex';
    document.getElementById('instructions').style.display = 'block';
    document.getElementById('instructions').style.opacity = '1';
    document.getElementById('speedIndicator').style.display = 'none';
    document.getElementById('skipBtn').style.display = 'none';

    const badge = document.getElementById('difficultyBadge');
    badge.textContent = difficultyConfig.emoji + ' ' + difficultyConfig.name;
    badge.style.background = difficultyConfig.color;
    badge.style.color = difficulty === 'medium' ? '#333' : 'white';
}

export function initGame(difficulty) {
    resetSessionState(difficulty);

    const turnInput = document.getElementById('startTurnInput');
    startingTurn = Math.max(1, Math.min(500, parseInt(turnInput.value) || 1));

    const startingBalls = calculateStartingBalls(startingTurn, difficulty);

    gameState.turn = startingTurn;
    gameState.ballInventory = { ...startingBalls.inventory };

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
    saveGame();
}

export function showMainMenu() {
    gameState.gameStarted = false;
    document.getElementById('mainMenu').style.display = 'flex';
    document.getElementById('gameOver').style.display = 'none';
    document.getElementById('ui').style.display = 'none';
    document.getElementById('ballInventory').style.display = 'none';
    document.getElementById('instructions').style.display = 'none';

    setMenuDifficulty(currentDifficulty);
    updateBallsPreview();
    updateContinueButton();
}

// ====================================
// PARTIDA GUARDADA (resumir tras crash/cierre)
// ====================================
// Se guarda un snapshot al inicio de cada turno (final de endTurn, cuando
// no hay bolas en vuelo) y al iniciar partida. Si la app se cierra o
// crashea a mitad de un turno, se reanuda desde el inicio de ese turno.
// Las posiciones se guardan en coordenadas de grilla (col/row) para que
// el snapshot sobreviva a cambios de tamaño de pantalla.

const SAVE_KEY = 'glowbreak_save';
const SAVE_VERSION = 1;

export function saveGame() {
    if (!gameState.gameStarted || gameState.gameOver) return;
    try {
        const cellSize = getCellSize();
        const topOffset = getTopOffset();
        const leftBorder = getLeftBorder();

        const snapshot = {
            version: SAVE_VERSION,
            difficulty: currentDifficulty,
            startingTurn: startingTurn,
            turn: gameState.turn,
            ballInventory: { ...gameState.ballInventory },
            shieldCharges: gameState.shieldCharges,
            overdriveCharge: gameState.overdriveCharge,
            launchXRatio: gameState.launchX / getWidth(),
            bricks: gameState.bricks.map(b => ({
                col: b.col,
                row: Math.round((b.y - topOffset) / cellSize),
                widthCells: Math.max(1, Math.round((b.width + 4) / cellSize)),
                hp: b.hp,
                maxHp: b.maxHp,
                type: b.type,
                isReinforced: !!b.isReinforced
            })),
            bonuses: gameState.bonuses.map(b => ({
                col: Math.floor((b.x - leftBorder) / cellSize),
                row: Math.floor((b.y - topOffset) / cellSize),
                type: b.type,
                value: b.value
            }))
        };

        localStorage.setItem(SAVE_KEY, JSON.stringify(snapshot));
    } catch (e) {
        // localStorage no disponible (modo privado, cuota llena) — sin guardado
    }
}

export function loadSavedGame() {
    try {
        const raw = localStorage.getItem(SAVE_KEY);
        if (!raw) return null;
        const save = JSON.parse(raw);
        if (save.version !== SAVE_VERSION) return null;
        if (!DIFFICULTY_SETTINGS[save.difficulty]) return null;
        if (!Number.isFinite(save.turn) || save.turn < 1) return null;
        if (!Array.isArray(save.bricks) || typeof save.ballInventory !== 'object') return null;
        return save;
    } catch (e) {
        return null;
    }
}

export function clearSavedGame() {
    try {
        localStorage.removeItem(SAVE_KEY);
    } catch (e) {
        // sin localStorage no hay nada que limpiar
    }
}

export function resumeGame() {
    const save = loadSavedGame();
    if (!save) return false;

    resetSessionState(save.difficulty);

    startingTurn = Math.max(1, parseInt(save.startingTurn) || 1);
    gameState.turn = save.turn;
    gameState.ballInventory = { ...save.ballInventory };
    // Clamp: un guardado viejo pudo acumular más escudos de los que ahora
    // permite MAX_SHIELDS.
    gameState.shieldCharges = Number.isFinite(save.shieldCharges)
        ? Math.min(save.shieldCharges, MAX_SHIELDS) : STARTING_SHIELDS;
    gameState.overdriveCharge = Number.isFinite(save.overdriveCharge)
        ? save.overdriveCharge : 0;

    const cellSize = getCellSize();
    const topOffset = getTopOffset();
    const leftBorder = getLeftBorder();

    if (Number.isFinite(save.launchXRatio)) {
        const x = save.launchXRatio * getWidth();
        gameState.launchX = Math.max(leftBorder + 20, Math.min(getRightBorder() - 20, x));
        gameState.nextLaunchX = gameState.launchX;
    }

    gameState.bricks = save.bricks
        .filter(b => Number.isFinite(b.col) && Number.isFinite(b.row) && b.hp > 0)
        .map(b => {
            const widthCells = Math.max(1, b.widthCells || 1);
            return {
                x: leftBorder + b.col * cellSize,
                y: topOffset + b.row * cellSize,
                width: cellSize * widthCells - 4,
                height: cellSize - 4,
                hp: b.hp,
                maxHp: b.maxHp || b.hp,
                col: b.col,
                type: BrickRegistry.has(b.type) ? b.type : BrickRegistry.defaultType,
                isReinforced: !!b.isReinforced
            };
        });

    gameState.bonuses = (save.bonuses || [])
        .filter(b => Number.isFinite(b.col) && Number.isFinite(b.row) && BonusRegistry.has(b.type))
        .map(b => {
            const isPowerup = BonusRegistry.get(b.type).getConfig().category === 'powerup';
            return {
                x: leftBorder + b.col * cellSize + cellSize / 2,
                y: topOffset + b.row * cellSize + cellSize / 2,
                radius: isPowerup ? Math.max(10, 14 * getScale()) : Math.max(8, 12 * getScale()),
                type: b.type,
                value: b.value
            };
        });

    updateUI();
    return true;
}

/**
 * Muestra u oculta el botón "Continuar" del menú según haya o no una
 * partida guardada, con el turno y la dificultad de esa partida.
 */
export function updateContinueButton() {
    const btn = document.getElementById('continueBtn');
    if (!btn) return;

    const save = loadSavedGame();
    if (save) {
        const cfg = DIFFICULTY_SETTINGS[save.difficulty];
        btn.textContent = `⏯️ Continuar — ${cfg.emoji} Turno ${save.turn}`;
        btn.style.display = 'block';
    } else {
        btn.style.display = 'none';
    }
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
