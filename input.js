import { gameState, startShooting, shootTimeout, endTurn, initGame, showMainMenu, updateBallsPreview, currentDifficulty } from './game.js';
import { canvas } from './rendering.js';
import { FAST_SPEED_MULTIPLIER } from './config.js';

// ============================================
// SISTEMA DE PUNTERO SIMPLIFICADO
// - Tiempo real sin retraso
// - Se congela si apuntas 3 segundos al mismo lugar
// - Solo se descongela si alejas mucho el dedo
// ============================================

// Configuración del sistema de congelación
const FREEZE_TIME_MS = 3000;        // 3 segundos para congelar
const FREEZE_THRESHOLD = 0.1;       // Umbral de movimiento angular para considerar "quieto" (radianes)
const UNFREEZE_DISTANCE = 80;       // Distancia en píxeles para descongelar

// Estado del sistema de congelación
let freezeState = {
    isFrozen: false,                // Si el puntero está congelado
    frozenPointerPos: { x: 0, y: 0 }, // Posición del dedo cuando se congeló
    lastMoveTime: 0,                // Último momento que se movió significativamente
    lastAngle: 0                    // Último ángulo registrado
};

function resetFreezeState() {
    freezeState = {
        isFrozen: false,
        frozenPointerPos: { x: 0, y: 0 },
        lastMoveTime: performance.now(),
        lastAngle: -Math.PI / 2
    };
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
    handlePointerMove(e);
}

/**
 * Maneja el movimiento del puntero durante el apuntado.
 *
 * Sistema simplificado:
 * - Movimiento en tiempo real sin filtros
 * - Se congela si estás 3 segundos sin mover mucho
 * - Solo se descongela si alejas mucho el dedo
 */
export function handlePointerMove(e) {
    if (!gameState.isAiming || gameState.isShooting) return;

    const pos = getPointerPos(e);
    const now = performance.now();

    // Calcular ángulo directo (sin filtro)
    const dx = pos.x - gameState.launchX;
    const dy = pos.y - gameState.launchY;
    let rawAngle = Math.atan2(dy, dx);

    // Limitar el ángulo para que solo apunte hacia arriba
    if (rawAngle > -0.2) rawAngle = -0.2;
    if (rawAngle < -Math.PI + 0.2) rawAngle = -Math.PI + 0.2;

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
            freezeState.lastAngle = rawAngle;

            // Actualizar ángulo
            gameState.aimAngle = rawAngle;
        }
        // Si sigue congelado, no actualizar el ángulo
    } else {
        // No estamos congelados - actualizar en tiempo real
        const angleDiff = Math.abs(rawAngle - freezeState.lastAngle);

        if (angleDiff > FREEZE_THRESHOLD) {
            // Hubo movimiento significativo - resetear timer
            freezeState.lastMoveTime = now;
            freezeState.lastAngle = rawAngle;
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

        // Actualizar ángulo en tiempo real
        gameState.aimAngle = rawAngle;
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
