import { gameState, startShooting, shootTimeout, shootNextBall, endTurn, initGame, showMainMenu, updateBallsPreview, currentDifficulty } from './game.js';
import { canvas, getLeftBorder, getRightBorder } from './rendering.js';
import { FAST_SPEED_MULTIPLIER } from './config.js';

// ============================================
// ONE EURO FILTER - Estándar de la industria
// para filtrar jitter en input táctil
// Ref: CHI '12 - Casiez, Roussel, Vogel
// ============================================

class LowPassFilter {
    constructor(alpha, initval = 0) {
        this.y = this.s = initval;
        this.setAlpha(alpha);
    }

    setAlpha(alpha) {
        this.a = Math.max(0, Math.min(1, alpha));
    }

    filter(value) {
        this.y = value;
        this.s = this.a * value + (1 - this.a) * this.s;
        return this.s;
    }

    lastValue() {
        return this.y;
    }
}

class OneEuroFilter {
    /**
     * @param {number} freq - Frecuencia de muestreo estimada (Hz)
     * @param {number} minCutoff - Frecuencia de corte mínima (Hz). Menor = más suave
     * @param {number} beta - Sensibilidad a la velocidad. Mayor = menos lag pero más jitter
     * @param {number} dCutoff - Frecuencia de corte para la derivada
     */
    constructor(freq = 60, minCutoff = 1.0, beta = 0.007, dCutoff = 1.0) {
        this.freq = freq;
        this.minCutoff = minCutoff;
        this.beta = beta;
        this.dCutoff = dCutoff;
        this.x = new LowPassFilter(this.alpha(minCutoff));
        this.dx = new LowPassFilter(this.alpha(dCutoff), 0);
        this.lastTime = null;
    }

    alpha(cutoff) {
        const te = 1.0 / this.freq;
        const tau = 1.0 / (2 * Math.PI * cutoff);
        return 1.0 / (1.0 + tau / te);
    }

    filter(x, timestamp = null) {
        // Calcular frecuencia real basada en timestamps
        if (this.lastTime !== null && timestamp !== null) {
            const dt = (timestamp - this.lastTime) / 1000; // ms a segundos
            if (dt > 0) {
                this.freq = 1.0 / dt;
            }
        }
        this.lastTime = timestamp;

        // Calcular derivada (velocidad del cambio)
        const prevX = this.x.lastValue();
        const dx = (x - prevX) * this.freq;

        // Filtrar la derivada
        const edx = this.dx.filter(dx);

        // Calcular cutoff adaptativo: más movimiento = menos filtro
        const cutoff = this.minCutoff + this.beta * Math.abs(edx);

        // Aplicar filtro con cutoff adaptativo
        this.x.setAlpha(this.alpha(cutoff));
        return this.x.filter(x);
    }

    reset(value = 0) {
        this.x = new LowPassFilter(this.alpha(this.minCutoff), value);
        this.dx = new LowPassFilter(this.alpha(this.dCutoff), 0);
        this.lastTime = null;
    }
}

// Filtro para el ángulo de apuntado
// Parámetros ajustados para touch input en juego:
// - minCutoff bajo (1.0): suavizado fuerte cuando está quieto
// - beta bajo (0.007): respuesta rápida a movimientos intencionales
const angleFilter = new OneEuroFilter(60, 1.0, 0.007, 1.0);

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
    // Resetear el filtro al comenzar a apuntar
    angleFilter.reset(-Math.PI / 2);
    handlePointerMove(e);
}

/**
 * Maneja el movimiento del puntero durante el apuntado.
 *
 * Usa el One Euro Filter (estándar de la industria) para:
 * - Filtrar jitter/temblor cuando el dedo está quieto o se mueve lento
 * - Responder rápidamente a movimientos intencionales (sin lag)
 *
 * IMPORTANTE: El ángulo mostrado es el mismo que el de disparo.
 */
export function handlePointerMove(e) {
    if (!gameState.isAiming || gameState.isShooting) return;

    const pos = getPointerPos(e);
    const dx = pos.x - gameState.launchX;
    const dy = pos.y - gameState.launchY;

    let rawAngle = Math.atan2(dy, dx);

    // Limitar el ángulo para que solo apunte hacia arriba
    if (rawAngle > -0.2) rawAngle = -0.2;
    if (rawAngle < -Math.PI + 0.2) rawAngle = -Math.PI + 0.2;

    // Aplicar One Euro Filter para suavizar
    const timestamp = performance.now();
    const filteredAngle = angleFilter.filter(rawAngle, timestamp);

    // El ángulo filtrado es tanto el mostrado como el de disparo
    gameState.aimAngle = filteredAngle;
    gameState.displayAimAngle = filteredAngle;
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
    startShooting();
}

// Setup event listeners
export function setupEventListeners() {
    canvas.addEventListener('mousedown', handlePointerDown);
    canvas.addEventListener('mousemove', handlePointerMove);
    canvas.addEventListener('mouseup', handlePointerUp);
    canvas.addEventListener('mouseleave', () => {
        gameState.isAiming = false;
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
