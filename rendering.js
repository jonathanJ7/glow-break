/**
 * Rendering Module - Refactorizado con patrón Strategy
 *
 * Este módulo usa los registries de behaviors para renderizar
 * entidades de forma extensible (Open/Closed principle).
 *
 * Para agregar un nuevo tipo visual, solo necesitas registrar
 * un nuevo behavior con su método render().
 */

import { gameState, difficultyConfig, getTotalBalls } from './game.js';
import { COLS, BRICK_COLORS, BASE_BALL_RADIUS, OVERDRIVE_MAX } from './config.js';
import { calculateTrajectory } from './physics.js';
import { BrickRegistry, BallRegistry, BonusRegistry } from './js/behaviors/index.js';
import { getSlowdownProgress } from './input.js';

export let canvas;
export let ctx;
export let container;
export let prevCellSize = null;
export let prevTopOffset = null;
export let prevLeftBorder = null;

// ====================================
// INICIALIZACIÓN
// ====================================

export function initCanvas() {
    canvas = document.getElementById('gameCanvas');
    ctx = canvas.getContext('2d');
    container = document.getElementById('gameContainer');
}

export function resizeCanvas() {
    const rect = container.getBoundingClientRect();
    canvas.width = rect.width * window.devicePixelRatio;
    canvas.height = rect.height * window.devicePixelRatio;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
}

export function handleResize() {
    const oldCellSize = prevCellSize || getCellSize();
    const oldTopOffset = prevTopOffset || getTopOffset();
    const oldLeftBorder = prevLeftBorder || getLeftBorder();

    resizeCanvas();

    if (gameState && gameState.gameStarted && !gameState.gameOver) {
        const newBottomLine = getBottomLine();
        const newLeftBorder = getLeftBorder();
        const newRightBorder = getRightBorder();
        const newCellSize = getCellSize();
        const newTopOffset = getTopOffset();

        gameState.launchY = newBottomLine;

        const xRatio = (gameState.launchX - oldLeftBorder) / (getWidth() - 2 * oldLeftBorder);
        gameState.launchX = newLeftBorder + xRatio * (newRightBorder - newLeftBorder);
        gameState.launchX = Math.max(newLeftBorder + 20, Math.min(newRightBorder - 20, gameState.launchX));

        const nextXRatio = (gameState.nextLaunchX - oldLeftBorder) / (getWidth() - 2 * oldLeftBorder);
        gameState.nextLaunchX = newLeftBorder + nextXRatio * (newRightBorder - newLeftBorder);
        gameState.nextLaunchX = Math.max(newLeftBorder + 20, Math.min(newRightBorder - 20, gameState.nextLaunchX));

        for (let brick of gameState.bricks) {
            const oldRow = Math.round((brick.y - oldTopOffset) / oldCellSize);
            brick.x = newLeftBorder + brick.col * newCellSize;
            brick.y = newTopOffset + oldRow * newCellSize;
            brick.width = newCellSize - 4;
            brick.height = newCellSize - 4;
        }

        for (let bonus of gameState.bonuses) {
            const oldCol = Math.round((bonus.x - oldLeftBorder - oldCellSize / 2) / oldCellSize);
            const oldRow = Math.round((bonus.y - oldTopOffset - oldCellSize / 2) / oldCellSize);
            bonus.x = newLeftBorder + oldCol * newCellSize + newCellSize / 2;
            bonus.y = newTopOffset + oldRow * newCellSize + newCellSize / 2;
            bonus.radius = Math.max(8, 12 * getScale());
        }

        for (let ball of gameState.balls) {
            if (ball.active) {
                const xRatio = (ball.x - oldLeftBorder) / (getWidth() - 2 * oldLeftBorder);
                const yRatio = (ball.y - oldTopOffset) / (newBottomLine - oldTopOffset);
                ball.x = newLeftBorder + xRatio * (newRightBorder - newLeftBorder);
                ball.y = newTopOffset + yRatio * (newBottomLine - newTopOffset);
            }
        }
    }

    prevCellSize = getCellSize();
    prevTopOffset = getTopOffset();
    prevLeftBorder = getLeftBorder();
}

// ====================================
// UTILIDADES DE DIMENSIONES
// ====================================

export function getWidth() {
    return container.getBoundingClientRect().width;
}

export function getHeight() {
    return container.getBoundingClientRect().height;
}

export function getScale() {
    return Math.min(getHeight() / 700, getWidth() / 400);
}

export function getCellSize() {
    const maxCellWidth = (getWidth() - 20) / COLS;
    const availableHeight = getBottomLine() - getTopOffset() - 40;
    const maxCellHeight = availableHeight / 7;
    return Math.min(maxCellWidth, maxCellHeight);
}

export function getLeftBorder() {
    const cellSize = getCellSize();
    const gridWidth = cellSize * COLS;
    return (getWidth() - gridWidth) / 2;
}

export function getRightBorder() {
    return getWidth() - getLeftBorder();
}

export function getTopOffset() {
    return Math.max(40, getHeight() * 0.07);
}

export function getBottomLine() {
    return getHeight() - Math.max(35, getHeight() * 0.06);
}

export function getBallRadius() {
    return Math.max(4, BASE_BALL_RADIUS * getScale());
}

export function getFontSize(baseSize) {
    return Math.max(8, Math.round(baseSize * getScale()));
}

export function getBrickColor(hp, maxHp) {
    const ratio = hp / Math.max(maxHp, 1);
    const index = Math.min(Math.floor((1 - ratio) * 4) + Math.floor(Math.log2(maxHp + 1)) * 4, BRICK_COLORS.length - 1);
    return BRICK_COLORS[Math.max(0, index)];
}

// ====================================
// HELPERS PARA BEHAVIORS
// ====================================

const renderHelpers = {
    getFontSize,
    getScale,
    getBallRadius,
    getBrickColor
};

// ====================================
// FUNCIONES DE RENDERIZADO MODULARES
// ====================================

function drawBackground(width, height) {
    ctx.fillStyle = '#12121f';
    ctx.fillRect(0, 0, width, height);
}

function drawPlayArea(leftBorder, rightBorder) {
    const topY = getTopOffset() - 15;
    const areaHeight = getBottomLine() - topY + 10;

    ctx.strokeStyle = '#2a2a45';
    ctx.lineWidth = 3;
    ctx.strokeRect(leftBorder, topY, rightBorder - leftBorder, areaHeight);

    ctx.strokeStyle = `${difficultyConfig.color}40`;
    ctx.lineWidth = 1;
    ctx.strokeRect(leftBorder - 1, topY - 1, rightBorder - leftBorder + 2, areaHeight + 2);
}

function drawBottomLine(leftBorder, rightBorder) {
    ctx.strokeStyle = 'rgba(233, 69, 96, 0.5)';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(leftBorder, getBottomLine());
    ctx.lineTo(rightBorder, getBottomLine());
    ctx.stroke();
    ctx.setLineDash([]);
}

function drawGrid(leftBorder) {
    ctx.strokeStyle = 'rgba(255,255,255,0.03)';
    ctx.lineWidth = 1;
    const cellSize = getCellSize();
    for (let i = 1; i < COLS; i++) {
        ctx.beginPath();
        ctx.moveTo(leftBorder + i * cellSize, getTopOffset() - 20);
        ctx.lineTo(leftBorder + i * cellSize, getBottomLine());
        ctx.stroke();
    }
}

/**
 * Renderiza un bloque usando su behavior registrado
 */
function drawBrick(brick) {
    const color = getBrickColor(brick.hp, brick.maxHp);

    // Sombra
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.roundRect(brick.x + 4, brick.y + 4, brick.width, brick.height, 6);
    ctx.fill();

    // Bloque base
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(brick.x + 2, brick.y + 2, brick.width, brick.height, 6);
    ctx.fill();

    // Borde reforzado
    if (brick.isReinforced) {
        ctx.strokeStyle = 'rgba(233, 69, 96, 0.6)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(brick.x + 2, brick.y + 2, brick.width, brick.height, 6);
        ctx.stroke();
    }

    // Renderizado específico del tipo (usando Strategy pattern)
    const behavior = BrickRegistry.get(brick.type);
    behavior.render(ctx, brick, renderHelpers);

    // HP text
    ctx.fillStyle = 'white';
    const hpFontSize = getFontSize(brick.hp > 999 ? 10 : brick.hp > 99 ? 12 : 14);
    ctx.font = `bold ${hpFontSize}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Ajustar posición del texto si tiene emoji
    const hasEmoji = behavior.emoji;
    const textY = hasEmoji
        ? brick.y + 2 + brick.height / 2 + 8 * getScale()
        : brick.y + 2 + brick.height / 2;

    ctx.fillText(Math.ceil(brick.hp), brick.x + 2 + brick.width / 2, textY);
}

function drawBricks() {
    for (const brick of gameState.bricks) {
        drawBrick(brick);
    }
}

/**
 * Renderiza un bonus usando su behavior registrado
 */
function drawBonus(bonus) {
    BonusRegistry.get(bonus.type).render(ctx, bonus, renderHelpers);
}

function drawBonuses() {
    for (const bonus of gameState.bonuses) {
        drawBonus(bonus);
    }
}

function drawParticles() {
    for (const p of gameState.particles) {
        ctx.globalAlpha = p.life;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.globalAlpha = 1;
}

function drawLaserEffect(leftBorder, rightBorder) {
    if (!gameState.laserEffect) return;

    const laser = gameState.laserEffect;
    ctx.globalAlpha = laser.alpha;

    ctx.shadowColor = '#3b82f6';
    ctx.shadowBlur = 20;

    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(leftBorder, laser.y);
    ctx.lineTo(rightBorder, laser.y);
    ctx.stroke();

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(leftBorder, laser.y);
    ctx.lineTo(rightBorder, laser.y);
    ctx.stroke();

    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
}

/**
 * Renderiza una bola usando su behavior registrado
 */
function drawBall(ball) {
    if (!ball.active) return;
    BallRegistry.get(ball.ballType).render(ctx, ball, renderHelpers);

    // En OVERDRIVE todas las bolas llevan un anillo dorado
    if (gameState.overdriveActive) {
        ctx.strokeStyle = 'rgba(251, 191, 36, 0.9)';
        ctx.lineWidth = 2;
        ctx.shadowColor = '#fbbf24';
        ctx.shadowBlur = 6;
        ctx.beginPath();
        ctx.arc(ball.x, ball.y, getBallRadius() + 3, 0, Math.PI * 2);
        ctx.stroke();
        ctx.shadowBlur = 0;
    }
}

function drawBalls() {
    for (const ball of gameState.balls) {
        drawBall(ball);
    }
}

// ====================================
// FEEDBACK: TEXTOS FLOTANTES, OVERDRIVE, COMBO
// ====================================

function drawFloatingTexts() {
    for (const t of gameState.floatingTexts) {
        ctx.globalAlpha = Math.min(1, t.life * 1.5);
        ctx.fillStyle = t.color;
        ctx.font = `bold ${getFontSize(t.size)}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = 'rgba(0,0,0,0.8)';
        ctx.shadowBlur = 4;
        ctx.fillText(t.text, t.x, t.y);
        ctx.shadowBlur = 0;
    }
    ctx.globalAlpha = 1;
}

function drawOverdriveMeter(leftBorder, rightBorder) {
    // La línea de peligro inferior duplica como medidor de overdrive:
    // la carga la va pintando de dorado de izquierda a derecha.
    const ratio = Math.min(1, gameState.overdriveCharge / OVERDRIVE_MAX);
    if (ratio <= 0) return;

    const y = getBottomLine();
    const full = ratio >= 1;
    const pulse = full ? 0.6 + Math.sin(performance.now() * 0.008) * 0.4 : 0.85;

    ctx.globalAlpha = pulse;
    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = 3;
    ctx.shadowColor = '#fbbf24';
    ctx.shadowBlur = full ? 12 : 5;
    ctx.setLineDash(full ? [] : [5, 5]);
    ctx.beginPath();
    ctx.moveTo(leftBorder, y);
    ctx.lineTo(leftBorder + (rightBorder - leftBorder) * ratio, y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;

    if (full && !gameState.isShooting) {
        ctx.fillStyle = '#fbbf24';
        ctx.font = `bold ${getFontSize(10)}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText('⚡ ¡OVERDRIVE LISTO! El próximo disparo hace x2', (leftBorder + rightBorder) / 2, y - 6);
    }
}

function drawComboCounter() {
    if (!gameState.isShooting || gameState.combo < 4) return;

    const pop = 1 + Math.min(0.5, gameState.combo * 0.01);
    ctx.fillStyle = gameState.combo >= 20 ? '#f9ed69' : 'rgba(255,255,255,0.85)';
    ctx.font = `bold ${Math.round(getFontSize(16) * pop)}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.shadowColor = 'rgba(0,0,0,0.7)';
    ctx.shadowBlur = 4;
    ctx.fillText(`Combo x${gameState.combo}`, getWidth() / 2, getTopOffset() + 4);
    ctx.shadowBlur = 0;
}

function drawOverdriveActiveFrame(leftBorder, rightBorder) {
    if (!gameState.overdriveActive) return;

    // Marco dorado pulsante alrededor del área de juego durante el turno x2
    const topY = getTopOffset() - 15;
    const areaHeight = getBottomLine() - topY + 10;
    const pulse = 0.5 + Math.sin(performance.now() * 0.006) * 0.3;

    ctx.strokeStyle = `rgba(251, 191, 36, ${pulse})`;
    ctx.lineWidth = 3;
    ctx.shadowColor = '#fbbf24';
    ctx.shadowBlur = 12;
    ctx.strokeRect(leftBorder, topY, rightBorder - leftBorder, areaHeight);
    ctx.shadowBlur = 0;
}

function drawLaunchIndicator() {
    if (gameState.isShooting) return;

    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.beginPath();
    ctx.arc(gameState.launchX, gameState.launchY, getBallRadius() + 2, 0, Math.PI * 2);
    ctx.fill();

    const totalBalls = getTotalBalls();

    if (totalBalls > 1) {
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.font = `bold ${getFontSize(11)}px Arial`;
        ctx.textAlign = 'center';
        ctx.fillText('x' + totalBalls, gameState.launchX, gameState.launchY + 22 * getScale());
    }
}

// Estado para animación de hielo
let iceAnimationTime = 0;

/**
 * Dibuja un cristal de hielo en una posición dada
 */
function drawIceCrystal(x, y, size, rotation, alpha) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rotation);
    ctx.globalAlpha = alpha;

    // Cristal principal (hexágono simplificado)
    ctx.fillStyle = 'rgba(200, 230, 255, 0.8)';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.lineWidth = 1;

    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
        const angle = (i * Math.PI) / 3;
        const px = Math.cos(angle) * size;
        const py = Math.sin(angle) * size;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Líneas internas del cristal
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.lineWidth = 0.5;
    for (let i = 0; i < 3; i++) {
        const angle = (i * Math.PI) / 3;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(angle) * size, Math.sin(angle) * size);
        ctx.stroke();
    }

    ctx.restore();
}

/**
 * Dibuja partículas de escarcha flotando a lo largo de la trayectoria.
 * Acepta un `count` para permitir aparición gradual según el progreso de congelación.
 */
function drawFrostParticles(trajectory, time, count = 12) {
    const particleCount = count;
    if (particleCount <= 0) return;

    for (let i = 0; i < particleCount; i++) {
        // Posición a lo largo de la trayectoria
        const trajIndex = Math.floor((i / particleCount) * (trajectory.length - 1));
        if (trajIndex >= trajectory.length - 1) continue;

        const basePoint = trajectory[trajIndex];

        // Offset animado perpendicular a la trayectoria
        const offsetPhase = time * 0.002 + i * 0.5;
        const offsetX = Math.sin(offsetPhase) * 15;
        const offsetY = Math.cos(offsetPhase * 1.3) * 10;

        const x = basePoint.x + offsetX;
        const y = basePoint.y + offsetY;

        // Tamaño y rotación animados
        const size = 2 + Math.sin(time * 0.003 + i) * 1;
        const rotation = time * 0.001 + i;
        const alpha = 0.4 + Math.sin(time * 0.002 + i * 0.7) * 0.3;

        drawIceCrystal(x, y, size, rotation, alpha);
    }
}

function drawAimLine() {
    if (!gameState.isAiming || gameState.isShooting) return;

    const radius = getBallRadius();
    // Use the actual ball spawn position for trajectory calculation
    // (balls spawn at launchY - radius - 1, matching shootNextBall in game.js)
    const ballSpawnY = gameState.launchY - radius - 1;
    const trajectory = calculateTrajectory(
        gameState.launchX,
        ballSpawnY,
        gameState.aimAngle,
        5
    );

    // Replace the first point with the visual launcher position
    // so the line connects to the launch indicator
    if (trajectory.length > 0) {
        trajectory[0] = { x: gameState.launchX, y: gameState.launchY, isBounce: false };
    }

    // Progreso de congelación: la línea punteada actúa como barra de carga.
    // 0 = velocidad total / blanco, 1 = congelado / cian con cristales.
    const progress = getSlowdownProgress();
    iceAnimationTime = performance.now();

    // Longitudes acumuladas a lo largo de la polyline para repartir el "fill"
    const cumLen = [0];
    let totalLength = 0;
    for (let i = 0; i < trajectory.length - 1; i++) {
        const dx = trajectory[i + 1].x - trajectory[i].x;
        const dy = trajectory[i + 1].y - trajectory[i].y;
        totalLength += Math.hypot(dx, dy);
        cumLen.push(totalLength);
    }
    const filledLength = totalLength * progress;

    const segmentFade = (i) => Math.max(0.2, (1 - i * 0.15) * 0.7);

    // Dibuja una sub-sección en estilo "sin cargar" (blanco tenue)
    const strokeUnlit = (x1, y1, x2, y2, i) => {
        ctx.lineWidth = 2;
        ctx.setLineDash([8, 8]);
        ctx.shadowBlur = 0;
        ctx.strokeStyle = `rgba(255,255,255,${segmentFade(i)})`;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
    };

    // Dibuja una sub-sección en estilo "cargado" (cian, intensidad escalada por progreso)
    const strokeLit = (x1, y1, x2, y2, i) => {
        ctx.lineWidth = 2 + progress;
        ctx.setLineDash([10, 6]);
        ctx.shadowColor = '#7dd3fc';
        ctx.shadowBlur = 15 * progress;
        const shimmer = Math.sin(iceAnimationTime * 0.003 + i) * 30 * progress;
        const r = Math.round(255 + (135 - 255) * progress);
        const g = Math.round(255 + (200 - 255) * progress + shimmer);
        const alpha = Math.max(0.3, (1 - i * 0.12) * (0.7 + 0.15 * progress));
        ctx.strokeStyle = `rgba(${r}, ${g}, 255, ${alpha})`;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
    };

    // Recorrer segmentos y dibujar split en el borde de carga cuando corresponda
    for (let i = 0; i < trajectory.length - 1; i++) {
        const p1 = trajectory[i];
        const p2 = trajectory[i + 1];
        const segStart = cumLen[i];
        const segEnd = cumLen[i + 1];
        const segLen = segEnd - segStart;

        if (segLen <= 0) continue;

        if (segEnd <= filledLength) {
            strokeLit(p1.x, p1.y, p2.x, p2.y, i);
        } else if (segStart >= filledLength) {
            strokeUnlit(p1.x, p1.y, p2.x, p2.y, i);
        } else {
            const t = (filledLength - segStart) / segLen;
            const mx = p1.x + (p2.x - p1.x) * t;
            const my = p1.y + (p2.y - p1.y) * t;
            strokeLit(p1.x, p1.y, mx, my, i);
            strokeUnlit(mx, my, p2.x, p2.y, i);
        }
    }

    ctx.setLineDash([]);
    ctx.shadowBlur = 0;

    // Cristales flotantes: aparecen a partir del 60% y crecen hasta el 100%
    if (progress >= 0.6) {
        const t = (progress - 0.6) / 0.4; // 0..1
        drawFrostParticles(trajectory, iceAnimationTime, Math.round(t * 12));
    }

    // Puntos de rebote: "lit" si ya cruzó el borde de carga
    for (let i = 1; i < trajectory.length - 1; i++) {
        const point = trajectory[i];
        if (!point.isBounce) continue;
        const lit = cumLen[i] <= filledLength;

        if (lit) {
            ctx.shadowColor = '#7dd3fc';
            ctx.shadowBlur = 8;
            ctx.fillStyle = 'rgba(180, 220, 255, 0.9)';
            ctx.beginPath();
            ctx.arc(point.x, point.y, 5, 0, Math.PI * 2);
            ctx.fill();
            drawIceCrystal(point.x, point.y, 4, iceAnimationTime * 0.002 + i, 0.7);
            ctx.shadowBlur = 0;
        } else {
            ctx.fillStyle = 'rgba(255,255,255,0.8)';
            ctx.beginPath();
            ctx.arc(point.x, point.y, 4, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    // Punto final: normal con overlay cian proporcional, o completo con copo cuando congelado
    if (trajectory.length > 1) {
        const endPoint = trajectory[trajectory.length - 1];

        if (progress >= 1) {
            ctx.shadowColor = '#38bdf8';
            ctx.shadowBlur = 20;
            ctx.fillStyle = 'rgba(56, 189, 248, 0.8)';
            ctx.beginPath();
            ctx.arc(endPoint.x, endPoint.y, 8, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;

            drawIceCrystal(endPoint.x, endPoint.y, 6, iceAnimationTime * 0.001, 0.9);

            ctx.font = `${getFontSize(12)}px Arial`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('❄️', endPoint.x, endPoint.y - 18);
        } else {
            ctx.fillStyle = `${difficultyConfig.color}cc`;
            ctx.beginPath();
            ctx.arc(endPoint.x, endPoint.y, 6, 0, Math.PI * 2);
            ctx.fill();
            if (progress > 0) {
                ctx.fillStyle = `rgba(56, 189, 248, ${0.8 * progress})`;
                ctx.beginPath();
                ctx.arc(endPoint.x, endPoint.y, 6, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    }

    // Indicador de ángulo (grados desde vertical), con lerp de color por progreso
    const degFromVert = (gameState.aimAngle + Math.PI / 2) * (180 / Math.PI);
    const ar = Math.round(255 + (135 - 255) * progress);
    const ag = Math.round(255 + (200 - 255) * progress);
    const aa = 0.35 + (0.6 - 0.35) * progress;
    ctx.fillStyle = `rgba(${ar}, ${ag}, 255, ${aa})`;
    ctx.font = `${getFontSize(10)}px monospace`;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    ctx.fillText(degFromVert.toFixed(1) + '°', getRightBorder() - 5, getBottomLine() + 5);
}

/**
 * Renderiza los indicadores de inventario de bolas especiales
 * Usa los behaviors registrados para obtener colores
 */
function drawBallInventory(leftBorder) {
    const inv = gameState.ballInventory;

    // Iteramos el registry: cualquier ball type con showInInventoryHud
    // y count > 0 aparece. Cero hardcoded keys, agregar una bola nueva
    // solo requiere setear showInInventoryHud: true en su behavior.
    let hasAny = false;
    for (const [type, behavior] of BallRegistry.getAll()) {
        if (!behavior.showInInventoryHud) continue;
        if ((inv[type] || 0) > 0) { hasAny = true; break; }
    }
    if (!hasAny) return;

    const scale = getScale();
    let indicatorX = leftBorder + 10 * scale;
    const indicatorY = getBottomLine() + 20 * scale;
    const indicatorW = 50 * scale;
    const indicatorH = 20 * scale;

    for (const [type, behavior] of BallRegistry.getAll()) {
        if (!behavior.showInInventoryHud) continue;
        const count = inv[type] || 0;
        if (count <= 0) continue;

        ctx.fillStyle = behavior.bgColor || 'rgba(255,255,255,0.5)';
        ctx.beginPath();
        ctx.roundRect(indicatorX, indicatorY, indicatorW, indicatorH, 10 * scale);
        ctx.fill();

        ctx.fillStyle = behavior.textColor || 'white';
        ctx.font = `${getFontSize(11)}px Arial`;
        ctx.textAlign = 'center';
        ctx.fillText(`${behavior.icon || '?'} ${count}`, indicatorX + indicatorW / 2, indicatorY + indicatorH * 0.7);

        indicatorX += indicatorW + 10 * scale;
    }
}

// ====================================
// FUNCIÓN PRINCIPAL DE DIBUJO
// ====================================

export function draw() {
    const width = getWidth();
    const height = getHeight();
    const leftBorder = getLeftBorder();
    const rightBorder = getRightBorder();

    drawBackground(width, height);

    if (!gameState.gameStarted) return;

    // Screen shake: desplaza todo el frame mientras haya intensidad
    const shaking = gameState.shake > 0;
    if (shaking) {
        ctx.save();
        ctx.translate(
            (Math.random() - 0.5) * gameState.shake * 2,
            (Math.random() - 0.5) * gameState.shake * 2
        );
    }

    drawPlayArea(leftBorder, rightBorder);
    drawOverdriveActiveFrame(leftBorder, rightBorder);
    drawBottomLine(leftBorder, rightBorder);
    drawGrid(leftBorder);
    drawBricks();
    drawBonuses();
    drawParticles();
    drawLaserEffect(leftBorder, rightBorder);
    drawBalls();
    drawLaunchIndicator();
    drawAimLine();
    drawBallInventory(leftBorder);
    drawOverdriveMeter(leftBorder, rightBorder);
    drawComboCounter();
    drawFloatingTexts();

    if (shaking) {
        ctx.restore();
    }
}
