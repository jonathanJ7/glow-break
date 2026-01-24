/**
 * Rendering Module - Refactorizado con patrón Strategy
 *
 * Este módulo usa los registries de behaviors para renderizar
 * entidades de forma extensible (Open/Closed principle).
 *
 * Para agregar un nuevo tipo visual, solo necesitas registrar
 * un nuevo behavior con su método render().
 */

import { gameState, difficultyConfig } from './game.js';
import { COLS, BRICK_COLORS, BASE_BALL_RADIUS } from './config.js';
import { calculateTrajectory } from './physics.js';
import { BrickRegistry, BallRegistry, BonusRegistry } from './js/behaviors/index.js';

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
    if (behavior && behavior.render) {
        behavior.render(ctx, brick, renderHelpers);
    }

    // HP text
    ctx.fillStyle = 'white';
    const hpFontSize = getFontSize(brick.hp > 999 ? 10 : brick.hp > 99 ? 12 : 14);
    ctx.font = `bold ${hpFontSize}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Ajustar posición del texto si tiene emoji
    const hasEmoji = behavior && behavior.emoji;
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
    const behavior = BonusRegistry.get(bonus.type);
    if (behavior && behavior.render) {
        behavior.render(ctx, bonus, renderHelpers);
    }
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

    const behavior = BallRegistry.get(ball.ballType);
    if (behavior && behavior.render) {
        behavior.render(ctx, ball, renderHelpers);
    }
}

function drawBalls() {
    for (const ball of gameState.balls) {
        drawBall(ball);
    }
}

function drawLaunchIndicator() {
    if (gameState.isShooting) return;

    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.beginPath();
    ctx.arc(gameState.launchX, gameState.launchY, getBallRadius() + 2, 0, Math.PI * 2);
    ctx.fill();

    const totalBalls = gameState.ballInventory.normal +
                       gameState.ballInventory.fireball +
                       gameState.ballInventory.splitter +
                       gameState.ballInventory.strength;

    if (totalBalls > 1) {
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.font = `bold ${getFontSize(11)}px Arial`;
        ctx.textAlign = 'center';
        ctx.fillText('x' + totalBalls, gameState.launchX, gameState.launchY + 22 * getScale());
    }
}

function drawAimLine() {
    if (!gameState.isAiming || gameState.isShooting) return;

    const trajectory = calculateTrajectory(
        gameState.launchX,
        gameState.launchY,
        gameState.displayAimAngle,
        5
    );

    ctx.lineWidth = 2;
    ctx.setLineDash([8, 8]);

    for (let i = 0; i < trajectory.length - 1; i++) {
        const alpha = 1 - (i * 0.15);
        ctx.strokeStyle = `rgba(255,255,255,${Math.max(0.2, alpha * 0.7)})`;

        ctx.beginPath();
        ctx.moveTo(trajectory[i].x, trajectory[i].y);
        ctx.lineTo(trajectory[i + 1].x, trajectory[i + 1].y);
        ctx.stroke();
    }

    ctx.setLineDash([]);

    for (let i = 1; i < trajectory.length - 1; i++) {
        const point = trajectory[i];
        if (point.isBounce) {
            ctx.fillStyle = 'rgba(255,255,255,0.8)';
            ctx.beginPath();
            ctx.arc(point.x, point.y, 4, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    if (trajectory.length > 1) {
        const endPoint = trajectory[trajectory.length - 1];
        ctx.fillStyle = `${difficultyConfig.color}cc`;
        ctx.beginPath();
        ctx.arc(endPoint.x, endPoint.y, 6, 0, Math.PI * 2);
        ctx.fill();
    }
}

/**
 * Renderiza los indicadores de inventario de bolas especiales
 * Usa los behaviors registrados para obtener colores
 */
function drawBallInventory(leftBorder) {
    const inv = gameState.ballInventory;
    if (inv.fireball <= 0 && inv.splitter <= 0 && inv.strength <= 0) return;

    const scale = getScale();
    let indicatorX = leftBorder + 10 * scale;
    const indicatorY = getBottomLine() + 20 * scale;
    const indicatorW = 50 * scale;
    const indicatorH = 20 * scale;

    // Usar los behaviors para obtener colores consistentes
    const inventoryItems = [
        { key: 'fireball', type: 'fireball', emoji: '🔥', bgColor: 'rgba(255, 107, 107, 0.8)', textColor: 'white' },
        { key: 'splitter', type: 'splitter', emoji: '💥', bgColor: 'rgba(249, 237, 105, 0.8)', textColor: '#333' },
        { key: 'strength', type: 'strength', emoji: '💪', bgColor: 'rgba(255, 140, 0, 0.8)', textColor: 'white' }
    ];

    for (const item of inventoryItems) {
        if (inv[item.key] > 0) {
            ctx.fillStyle = item.bgColor;
            ctx.beginPath();
            ctx.roundRect(indicatorX, indicatorY, indicatorW, indicatorH, 10 * scale);
            ctx.fill();

            ctx.fillStyle = item.textColor;
            ctx.font = `${getFontSize(11)}px Arial`;
            ctx.textAlign = 'center';
            ctx.fillText(`${item.emoji} ${inv[item.key]}`, indicatorX + indicatorW / 2, indicatorY + indicatorH * 0.7);

            indicatorX += indicatorW + 10 * scale;
        }
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

    drawPlayArea(leftBorder, rightBorder);
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
}
