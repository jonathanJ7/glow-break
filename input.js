import { gameState, startShooting, shootTimeout, shootNextBall, endTurn, initGame, showMainMenu, updateBallsPreview, currentDifficulty } from './game.js';
import { canvas, getLeftBorder, getRightBorder } from './rendering.js';
import { FAST_SPEED_MULTIPLIER } from './config.js';

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
    handlePointerMove(e);
}

// Tiempo en ms para ignorar micro-movimientos al soltar el dedo
const RELEASE_STABILIZATION_TIME = 80;

/**
 * Maneja el movimiento del puntero durante el apuntado.
 *
 * IMPORTANTE: El ángulo mostrado (displayAimAngle) es EXACTAMENTE el mismo
 * que el ángulo de disparo (aimAngle). Esto garantiza que la trayectoria
 * que ve el jugador sea exactamente la que seguirán las bolas.
 *
 * El historial de ángulos se usa para ignorar micro-movimientos involuntarios
 * al levantar el dedo, tomando el ángulo estable de hace ~80ms.
 */
export function handlePointerMove(e) {
    if (!gameState.isAiming || gameState.isShooting) return;

    const pos = getPointerPos(e);
    const dx = pos.x - gameState.launchX;
    const dy = pos.y - gameState.launchY;

    let angle = Math.atan2(dy, dx);

    // Limitar el ángulo para que solo apunte hacia arriba
    // Rango: aproximadamente de -170° a -10° (hemisferio superior)
    if (angle > -0.2) angle = -0.2;
    if (angle < -Math.PI + 0.2) angle = -Math.PI + 0.2;

    // Guardar en historial con timestamp para estabilización al soltar
    const now = Date.now();
    gameState.aimHistory.push({ angle, time: now });

    // Mantener solo los últimos 200ms de historial
    const cutoff = now - 200;
    gameState.aimHistory = gameState.aimHistory.filter(h => h.time > cutoff);

    // CRÍTICO: El ángulo de disparo Y el ángulo mostrado son el mismo
    // Esto garantiza que lo que ves es exactamente lo que obtienes
    gameState.aimAngle = angle;
    gameState.displayAimAngle = angle;
}

export function handlePointerUp(e) {
    if (gameState.isHolding) {
        gameState.speedMultiplier = 1;
        gameState.isHolding = false;
        document.getElementById('speedIndicator').style.display = 'none';
        return;
    }

    if (!gameState.isAiming) return;

    // Usar el ángulo estabilizado para evitar micro-movimientos al soltar
    if (gameState.aimHistory.length > 1) {
        const now = Date.now();
        const targetTime = now - RELEASE_STABILIZATION_TIME;

        // Buscar el ángulo más cercano a targetTime (hace ~80ms)
        let stableEntry = gameState.aimHistory[0];
        for (const entry of gameState.aimHistory) {
            if (entry.time <= targetTime) {
                stableEntry = entry;
            } else {
                break;
            }
        }

        // Usar el ángulo estable
        gameState.aimAngle = stableEntry.angle;
        gameState.displayAimAngle = stableEntry.angle;
    }

    gameState.isAiming = false;
    gameState.aimHistory = [];

    startShooting();
}

// Setup event listeners
export function setupEventListeners() {
    canvas.addEventListener('mousedown', handlePointerDown);
    canvas.addEventListener('mousemove', handlePointerMove);
    canvas.addEventListener('mouseup', handlePointerUp);
    canvas.addEventListener('mouseleave', () => {
        gameState.isAiming = false;
        gameState.aimHistory = [];
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
                // Note: shootTimeout is exported from game.js but can't be modified here
                // This should be refactored to use a function call
            }
            for (let ball of gameState.balls) {
                ball.active = false;
            }
            endTurn();
        }
    });
}
