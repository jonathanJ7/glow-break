import { gameState, difficultyConfig, startShooting, shootTimeout, endTurn, initGame, showMainMenu, updateBallsPreview, setMenuDifficulty, currentDifficulty } from './game.js';
import { canvas } from './rendering.js';
import { FAST_SPEED_MULTIPLIER } from './config.js';

// ============================================
// SISTEMA DE APUNTADO UNIFICADO: slowdown progresivo → congelación
// - Toque inicial: apunta en la dirección del dedo, velocidad total
// - Al mantener el dedo quieto, el puntero se ralentiza progresivamente
//   (sensibilidad = 1 - progreso) hasta congelarse a los 5 segundos
// - La línea punteada actúa como barra de carga del congelamiento
// - Al alejar el dedo >80px del punto de congelación, se recupera la
//   velocidad total para apuntar a otro lugar
// ============================================

export const FREEZE_TIME_MS = 5000;            // Tiempo total para llegar a congelación
const ACTIVITY_RAW_THRESHOLD = 0.04;           // Delta crudo (~2.3°) que resetea el progreso
export const UNFREEZE_DISTANCE = 80;           // Píxeles para romper el congelamiento

// Estado unificado del apuntado
let aimState = {
    lastRawAngle: -Math.PI / 2,         // Ángulo crudo del dedo en el frame anterior
    lastMoveTime: 0,                    // Última actividad significativa del dedo
    slowdownProgress: 0,                // 0 = velocidad total, 1 = congelado
    frozenPointerPos: { x: 0, y: 0 }    // Posición del dedo al congelarse
};

// Exportar el progreso para el renderizado de la barra de carga
export function getSlowdownProgress() {
    return aimState.slowdownProgress;
}

function resetAimState() {
    aimState = {
        lastRawAngle: -Math.PI / 2,
        lastMoveTime: performance.now(),
        slowdownProgress: 0,
        frozenPointerPos: { x: 0, y: 0 }
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
    resetAimState();

    // Snap inicial: apuntar en la dirección del dedo
    const pos = getPointerPos(e);
    const rawAngle = getRawAngle(pos);
    gameState.aimAngle = rawAngle;
    aimState.lastRawAngle = rawAngle;
    aimState.lastMoveTime = performance.now();
}

/**
 * Maneja el movimiento del puntero durante el apuntado.
 *
 * Sistema unificado:
 * - Integración incremental: cada frame suma (delta crudo × sensibilidad actual)
 * - Sensibilidad = 1 - slowdownProgress, va bajando mientras el dedo está quieto
 * - Al llegar a slowdownProgress = 1, el puntero queda congelado
 * - La congelación se rompe al alejar el dedo >80px del punto de congelación,
 *   momento en el que se recupera la velocidad total para re-apuntar
 */
export function handlePointerMove(e) {
    if (!gameState.isAiming || gameState.isShooting) return;

    const pos = getPointerPos(e);
    const now = performance.now();

    const rawAngle = getRawAngle(pos);
    const rawDelta = rawAngle - aimState.lastRawAngle;
    aimState.lastRawAngle = rawAngle;

    if (aimState.slowdownProgress >= 1) {
        // Congelado: el ángulo está bloqueado, sólo buscamos la condición de descongelación
        const dist = Math.hypot(
            pos.x - aimState.frozenPointerPos.x,
            pos.y - aimState.frozenPointerPos.y
        );

        if (dist > UNFREEZE_DISTANCE) {
            // El dedo se alejó: descongelar y recuperar velocidad total
            aimState.slowdownProgress = 0;
            aimState.lastMoveTime = now;
            // Snap al nuevo ángulo del dedo para empezar limpio
            gameState.aimAngle = rawAngle;
        }
        return;
    }

    // No congelado: integración incremental con sensibilidad cuadrática
    // La curva (1-p)² hace que la sensibilidad baje más rápido al inicio,
    // permitiendo ajustes finos antes sin cambiar el tiempo total de congelación
    const sensitivity = (1 - aimState.slowdownProgress) ** 2;
    let next = gameState.aimAngle + rawDelta * sensitivity;
    if (next > -0.2) next = -0.2;
    if (next < -Math.PI + 0.2) next = -Math.PI + 0.2;
    gameState.aimAngle = next;

    // Actualizar progreso según la actividad cruda del dedo.
    // El apuntado fino con congelación es una ayuda por dificultad
    // (assists.freezeAim): sin ella, el progreso nunca acumula y el
    // puntero mantiene siempre la sensibilidad total.
    if (!difficultyConfig.assists?.freezeAim) {
        aimState.slowdownProgress = 0;
    } else if (Math.abs(rawDelta) > ACTIVITY_RAW_THRESHOLD) {
        aimState.lastMoveTime = now;
        aimState.slowdownProgress = 0;
    } else {
        aimState.slowdownProgress = Math.min(
            1,
            (now - aimState.lastMoveTime) / FREEZE_TIME_MS
        );
        if (aimState.slowdownProgress >= 1) {
            aimState.frozenPointerPos = { x: pos.x, y: pos.y };
        }
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
    resetAimState();
    startShooting();
}

// Setup event listeners
export function setupEventListeners() {
    canvas.addEventListener('mousedown', handlePointerDown);
    canvas.addEventListener('mousemove', handlePointerMove);
    canvas.addEventListener('mouseup', handlePointerUp);
    canvas.addEventListener('mouseleave', () => {
        gameState.isAiming = false;
        resetAimState();
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

    // Play button — starts game with currently selected difficulty
    document.getElementById('playBtn').addEventListener('click', () => {
        const active = document.querySelector('.diff-chip--active');
        const diff = active ? active.dataset.diff : 'medium';
        initGame(diff);
    });

    // Difficulty chips — select difficulty (updates play button color)
    document.querySelectorAll('.diff-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            setMenuDifficulty(chip.dataset.diff);
            updateBallsPreview();
        });
    });

    // Advanced toggle — show/hide turn selector
    document.getElementById('advancedToggle').addEventListener('click', () => {
        document.getElementById('advancedPanel').classList.toggle('open');
        document.querySelector('.toggle-arrow').classList.toggle('open');
    });

    // Game over buttons
    document.getElementById('restartBtn').addEventListener('click', () => initGame(currentDifficulty || 'medium'));
    document.getElementById('menuBtn').addEventListener('click', showMainMenu);

    // Turn swipe selector
    setupTurnSwipeSelector();

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

// ============================================
// SWIPE SELECTOR — Turn picker sin teclado
// ============================================

function setupTurnSwipeSelector() {
    const hiddenInput = document.getElementById('startTurnInput');
    const track = document.getElementById('turnSwipeTrack');
    const valueEl = document.getElementById('turnSwipeValue');
    const decreaseBtn = document.getElementById('turnDecrease');
    const increaseBtn = document.getElementById('turnIncrease');

    const MIN = 1;
    const MAX = 500;
    // Pixels of horizontal drag per +1 turn
    const PX_PER_STEP = 12;

    let currentValue = parseInt(hiddenInput.value) || 1;
    let dragging = false;

    // Contrato programático: setear .value y disparar input/change en el
    // hidden input se comporta como si el usuario eligiera ese turno
    // (clamp incluido). Lo usan los tests y cualquier automatización.
    const syncFromInput = () => setValue(parseInt(hiddenInput.value) || 1);
    hiddenInput.addEventListener('input', syncFromInput);
    hiddenInput.addEventListener('change', syncFromInput);
    let startX = 0;
    let accumulated = 0;
    let lastVelocity = 0;
    let lastX = 0;
    let lastTime = 0;
    let momentumRAF = 0;

    function setValue(v) {
        currentValue = Math.max(MIN, Math.min(MAX, Math.round(v)));
        hiddenInput.value = currentValue;
        valueEl.textContent = currentValue;
        updateBallsPreview();
    }

    // Arrow buttons — tap and hold support
    let holdInterval = null;
    let holdTimeout = null;

    function startHold(delta) {
        setValue(currentValue + delta);
        holdTimeout = setTimeout(() => {
            let speed = 80;
            holdInterval = setInterval(() => {
                setValue(currentValue + delta);
                // Accelerate
                if (speed > 20) {
                    clearInterval(holdInterval);
                    speed = Math.max(20, speed - 10);
                    holdInterval = setInterval(() => setValue(currentValue + delta), speed);
                }
            }, speed);
        }, 400);
    }

    function stopHold() {
        clearTimeout(holdTimeout);
        clearInterval(holdInterval);
        holdTimeout = null;
        holdInterval = null;
    }

    decreaseBtn.addEventListener('mousedown', (e) => { e.preventDefault(); startHold(-1); });
    decreaseBtn.addEventListener('touchstart', (e) => { e.preventDefault(); startHold(-1); });
    increaseBtn.addEventListener('mousedown', (e) => { e.preventDefault(); startHold(1); });
    increaseBtn.addEventListener('touchstart', (e) => { e.preventDefault(); startHold(1); });

    document.addEventListener('mouseup', stopHold);
    document.addEventListener('touchend', stopHold);

    // Swipe / drag on the track
    function onStart(x) {
        cancelAnimationFrame(momentumRAF);
        dragging = true;
        startX = x;
        accumulated = 0;
        lastX = x;
        lastTime = performance.now();
        lastVelocity = 0;
    }

    function onMove(x) {
        if (!dragging) return;
        const dx = lastX - x; // drag left = increase
        const now = performance.now();
        const dt = now - lastTime;
        if (dt > 0) lastVelocity = dx / dt;
        lastX = x;
        lastTime = now;

        accumulated += dx;
        const steps = Math.trunc(accumulated / PX_PER_STEP);
        if (steps !== 0) {
            setValue(currentValue + steps);
            accumulated -= steps * PX_PER_STEP;
        }
    }

    function onEnd() {
        if (!dragging) return;
        dragging = false;

        // Momentum — coast based on velocity
        const v = lastVelocity; // px/ms
        if (Math.abs(v) > 0.3) {
            let velocity = v * PX_PER_STEP; // steps/ms scaled
            const friction = 0.92;
            let remainder = 0;

            function tick() {
                velocity *= friction;
                if (Math.abs(velocity) < 0.05) return;
                remainder += velocity;
                const steps = Math.trunc(remainder);
                if (steps !== 0) {
                    setValue(currentValue + steps);
                    remainder -= steps;
                }
                momentumRAF = requestAnimationFrame(tick);
            }
            momentumRAF = requestAnimationFrame(tick);
        }
    }

    // Touch events on track
    track.addEventListener('touchstart', (e) => {
        e.preventDefault();
        onStart(e.touches[0].clientX);
    });
    track.addEventListener('touchmove', (e) => {
        e.preventDefault();
        onMove(e.touches[0].clientX);
    });
    track.addEventListener('touchend', (e) => {
        e.preventDefault();
        onEnd();
    });

    // Mouse events on track
    track.addEventListener('mousedown', (e) => {
        e.preventDefault();
        onStart(e.clientX);

        const moveHandler = (ev) => onMove(ev.clientX);
        const upHandler = () => {
            onEnd();
            document.removeEventListener('mousemove', moveHandler);
            document.removeEventListener('mouseup', upHandler);
        };
        document.addEventListener('mousemove', moveHandler);
        document.addEventListener('mouseup', upHandler);
    });
}
