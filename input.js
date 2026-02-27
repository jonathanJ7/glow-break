import { gameState, startShooting, shootTimeout, endTurn, initGame, showMainMenu, updateBallsPreview, currentDifficulty } from './game.js';
import { canvas } from './rendering.js';
import { FAST_SPEED_MULTIPLIER } from './config.js';

// ============================================
// SISTEMA DE APUNTADO CON PRECISIÓN
// - Toque inicial: apunta en la dirección del dedo
// - Arrastre: ajustes finos con sensibilidad reducida (2.5x precisión)
// - Se congela si apuntas 3 segundos al mismo lugar
// - Solo se descongela si alejas mucho el dedo
// ============================================

// Configuración del sistema de congelación
const FREEZE_TIME_MS = 3000;        // 3 segundos para congelar
const FREEZE_THRESHOLD = 0.04;      // Umbral más sensible (~2.3°) - pequeños ajustes reinician el timer
const UNFREEZE_DISTANCE = 80;       // Distancia en píxeles para descongelar

// Configuración de precisión de apuntado
// Valor más bajo = más precisión. 0.4 significa que los movimientos del dedo
// producen solo el 40% del cambio angular, dando 2.5x más precisión.
const AIM_SENSITIVITY = 0.4;

// Estado del sistema de congelación
let freezeState = {
    isFrozen: false,                // Si el puntero está congelado
    frozenPointerPos: { x: 0, y: 0 }, // Posición del dedo cuando se congeló
    lastMoveTime: 0,                // Último momento que se movió significativamente
    lastAngle: 0                    // Último ángulo registrado
};

// Estado de apuntado de precisión
let precisionState = {
    baseAngle: -Math.PI / 2,        // Ángulo de mira al momento del toque
    baseRawAngle: -Math.PI / 2,     // Ángulo crudo del dedo al momento del toque
};

// Exportar estado de congelación para efectos visuales
export function isAimFrozen() {
    return freezeState.isFrozen;
}

function resetFreezeState() {
    freezeState = {
        isFrozen: false,
        frozenPointerPos: { x: 0, y: 0 },
        lastMoveTime: performance.now(),
        lastAngle: -Math.PI / 2
    };
}

// Calcula ángulo crudo (limitado) desde posición del puntero al lanzador
function getRawAngle(pos) {
    const dx = pos.x - gameState.launchX;
    const dy = pos.y - gameState.launchY;
    let angle = Math.atan2(dy, dx);
    if (angle > -0.2) angle = -0.2;
    if (angle < -Math.PI + 0.2) angle = -Math.PI + 0.2;
    return angle;
}

// Input handling
export function getPointerPos(e) {
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return {
        x: clientX - rect.left,
        y: clientY - rect.top
    };
}

export function handlePointerDown(e) {
    if (gameState.gameOver || !gameState.gameStarted) return;

    if (gameState.isShooting) {
        gameState.speedMultiplier = FAST_SPEED_MULTIPLIER;
        gameState.isHolding = true;
        document.getElementById('speedIndicator').style.display = 'block';
        return;
    }

    gameState.isAiming = true;
    resetFreezeState();

    // Inicializar precisión: capturar ángulo del toque inicial
    const pos = getPointerPos(e);
    const rawAngle = getRawAngle(pos);
    precisionState.baseAngle = rawAngle;
    precisionState.baseRawAngle = rawAngle;

    handlePointerMove(e);
}

/**
 * Maneja el movimiento del puntero durante el apuntado.
 *
 * Sistema de precisión:
 * - El toque inicial establece la dirección base (snap)
 * - Al arrastrar, los cambios angulares se escalan por AIM_SENSITIVITY
 *   (0.4 = movimientos producen 40% del cambio, dando 2.5x más precisión)
 * - Se congela si estás 3 segundos sin mover mucho
 * - Solo se descongela si alejas mucho el dedo
 */
export function handlePointerMove(e) {
    if (!gameState.isAiming || gameState.isShooting) return;

    const pos = getPointerPos(e);
    const now = performance.now();

    // Calcular ángulo crudo desde posición del dedo
    const rawAngle = getRawAngle(pos);

    // Aplicar precisión: escalar el delta desde el toque inicial
    const delta = rawAngle - precisionState.baseRawAngle;
    let precisionAngle = precisionState.baseAngle + delta * AIM_SENSITIVITY;
    if (precisionAngle > -0.2) precisionAngle = -0.2;
    if (precisionAngle < -Math.PI + 0.2) precisionAngle = -Math.PI + 0.2;

    if (freezeState.isFrozen) {
        // Estamos congelados - verificar si hay que descongelar
        const distFromFrozen = Math.hypot(
            pos.x - freezeState.frozenPointerPos.x,
            pos.y - freezeState.frozenPointerPos.y
        );

        if (distFromFrozen > UNFREEZE_DISTANCE) {
            // El dedo se alejó mucho - descongelar
            freezeState.isFrozen = false;
            freezeState.lastMoveTime = now;
            freezeState.lastAngle = precisionAngle;

            // Resetear base de precisión: continuar desde ángulo congelado
            precisionState.baseAngle = gameState.aimAngle;
            precisionState.baseRawAngle = rawAngle;
        }
        // Si sigue congelado, no actualizar el ángulo
    } else {
        // No estamos congelados - verificar congelación con ángulo de precisión
        const angleDiff = Math.abs(precisionAngle - freezeState.lastAngle);

        if (angleDiff > FREEZE_THRESHOLD) {
            // Hubo movimiento significativo - resetear timer
            freezeState.lastMoveTime = now;
            freezeState.lastAngle = precisionAngle;
        } else {
            // Poco movimiento - verificar si pasaron 3 segundos
            const timeSinceMove = now - freezeState.lastMoveTime;

            if (timeSinceMove >= FREEZE_TIME_MS) {
                // Congelar!
                freezeState.isFrozen = true;
                freezeState.frozenPointerPos = { x: pos.x, y: pos.y };
                return; // No actualizar más el ángulo
            }
        }

        // Actualizar ángulo con precisión aplicada
        gameState.aimAngle = precisionAngle;
    }
}

export function handlePointerUp(e) {
    if (gameState.isHolding) {
        gameState.speedMultiplier = 1;
        gameState.isHolding = false;
        document.getElementById('speedIndicator').style.display = 'none';
        return;
    }

    if (!gameState.isAiming) return;

    gameState.isAiming = false;
    resetFreezeState();
    startShooting();
}

// Setup event listeners
export function setupEventListeners() {
    canvas.addEventListener('mousedown', handlePointerDown);
    canvas.addEventListener('mousemove', handlePointerMove);
    canvas.addEventListener('mouseup', handlePointerUp);
    canvas.addEventListener('mouseleave', () => {
        gameState.isAiming = false;
        resetFreezeState();
        if (gameState.isHolding) {
            gameState.speedMultiplier = 1;
            gameState.isHolding = false;
            document.getElementById('speedIndicator').style.display = 'none';
        }
    });

    canvas.addEventListener('touchstart', (e) => {
        e.preventDefault();
        handlePointerDown(e);
    });
    canvas.addEventListener('touchmove', (e) => {
        e.preventDefault();
        handlePointerMove(e);
    });
    canvas.addEventListener('touchend', (e) => {
        e.preventDefault();
        handlePointerUp(e);
    });

    // Menu buttons
    document.getElementById('easyBtn').addEventListener('click', () => initGame('easy'));
    document.getElementById('mediumBtn').addEventListener('click', () => initGame('medium'));
    document.getElementById('hardBtn').addEventListener('click', () => initGame('hard'));
    document.getElementById('restartBtn').addEventListener('click', () => initGame(currentDifficulty || 'easy'));
    document.getElementById('menuBtn').addEventListener('click', showMainMenu);

    // Turn input listener
    document.getElementById('startTurnInput').addEventListener('input', updateBallsPreview);
    document.getElementById('startTurnInput').addEventListener('change', function() {
        this.value = Math.max(1, Math.min(500, parseInt(this.value) || 1));
        updateBallsPreview();
    });

    // Skip button
    document.getElementById('skipBtn').addEventListener('click', function() {
        if (gameState.isShooting && !gameState.gameOver) {
            gameState.ballsToShoot = [];  // Vaciar la cola de bolas
            if (shootTimeout) {
                clearTimeout(shootTimeout);
            }
            for (let ball of gameState.balls) {
                ball.active = false;
            }
            endTurn();
        }
    });
}
