import { gameState, difficultyConfig } from './game.js';
import { COLS, BRICK_COLORS, BASE_BALL_RADIUS } from './config.js';
import { calculateTrajectory } from './physics.js';

export let canvas;
export let ctx;
export let container;
export let prevCellSize = null;
export let prevTopOffset = null;
export let prevLeftBorder = null;

// Initialize canvas
export function initCanvas() {
    canvas = document.getElementById('gameCanvas');
    ctx = canvas.getContext('2d');
    container = document.getElementById('gameContainer');
}

// Responsive canvas
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

// Dimension utilities
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

// Drawing
export function draw() {
    const width = getWidth();
    const height = getHeight();
    const leftBorder = getLeftBorder();
    const rightBorder = getRightBorder();

    ctx.fillStyle = '#12121f';
    ctx.fillRect(0, 0, width, height);

    if (!gameState.gameStarted) return;

    // Draw play area border
    const topY = getTopOffset() - 15;
    const areaHeight = getBottomLine() - topY + 10;

    ctx.strokeStyle = '#2a2a45';
    ctx.lineWidth = 3;
    ctx.strokeRect(leftBorder, topY, rightBorder - leftBorder, areaHeight);

    ctx.strokeStyle = `${difficultyConfig.color}40`;
    ctx.lineWidth = 1;
    ctx.strokeRect(leftBorder - 1, topY - 1, rightBorder - leftBorder + 2, areaHeight + 2);

    // Draw bottom line
    ctx.strokeStyle = 'rgba(233, 69, 96, 0.5)';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(leftBorder, getBottomLine());
    ctx.lineTo(rightBorder, getBottomLine());
    ctx.stroke();
    ctx.setLineDash([]);

    // Draw grid lines
    ctx.strokeStyle = 'rgba(255,255,255,0.03)';
    ctx.lineWidth = 1;
    const cellSize = getCellSize();
    for (let i = 1; i < COLS; i++) {
        ctx.beginPath();
        ctx.moveTo(leftBorder + i * cellSize, getTopOffset() - 20);
        ctx.lineTo(leftBorder + i * cellSize, getBottomLine());
        ctx.stroke();
    }

    // Draw bricks
    for (let brick of gameState.bricks) {
        const color = getBrickColor(brick.hp, brick.maxHp);

        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.beginPath();
        ctx.roundRect(brick.x + 4, brick.y + 4, brick.width, brick.height, 6);
        ctx.fill();

        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.roundRect(brick.x + 2, brick.y + 2, brick.width, brick.height, 6);
        ctx.fill();

        if (brick.isReinforced) {
            ctx.strokeStyle = 'rgba(233, 69, 96, 0.6)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.roundRect(brick.x + 2, brick.y + 2, brick.width, brick.height, 6);
            ctx.stroke();
        }

        // Special brick indicators
        if (brick.type === 'explosive') {
            ctx.fillStyle = 'rgba(255,100,100,0.3)';
            ctx.beginPath();
            ctx.roundRect(brick.x + 2, brick.y + 2, brick.width, brick.height, 6);
            ctx.fill();

            ctx.fillStyle = 'rgba(255,255,255,0.8)';
            ctx.font = `${getFontSize(12)}px Arial`;
            ctx.textAlign = 'center';
            ctx.fillText('💥', brick.x + 2 + brick.width / 2, brick.y + 15 * getScale());
        }

        if (brick.type === 'armored') {
            ctx.strokeStyle = 'rgba(255,255,255,0.5)';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.roundRect(brick.x + 5, brick.y + 5, brick.width - 6, brick.height - 6, 4);
            ctx.stroke();
        }

        if (brick.type === 'spawner') {
            ctx.fillStyle = 'rgba(168, 85, 247, 0.3)';
            ctx.beginPath();
            ctx.roundRect(brick.x + 2, brick.y + 2, brick.width, brick.height, 6);
            ctx.fill();

            ctx.fillStyle = 'rgba(255,255,255,0.8)';
            ctx.font = `${getFontSize(12)}px Arial`;
            ctx.textAlign = 'center';
            ctx.fillText('👾', brick.x + 2 + brick.width / 2, brick.y + 15 * getScale());
        }

        // HP text
        ctx.fillStyle = 'white';
        const hpFontSize = getFontSize(brick.hp > 999 ? 10 : brick.hp > 99 ? 12 : 14);
        ctx.font = `bold ${hpFontSize}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const textY = (brick.type === 'explosive' || brick.type === 'spawner')
            ? brick.y + 2 + brick.height / 2 + 8 * getScale()
            : brick.y + 2 + brick.height / 2;
        ctx.fillText(Math.ceil(brick.hp), brick.x + 2 + brick.width / 2, textY);
    }

    // Draw bonuses
    for (let bonus of gameState.bonuses) {
        let color = '#4ecca3';
        let text = '+' + (bonus.value || 1);
        let icon = null;

        if (bonus.type === 'ball') {
            // Bola normal - verde
            color = '#4ecca3';
        } else if (bonus.type === 'fireballBall') {
            // Bola de fuego - roja
            color = '#ff6b6b';
            text = '';
            icon = '🔥';
        } else if (bonus.type === 'splitterBall') {
            // Bola divisora - amarilla
            color = '#f9ed69';
            text = '';
            icon = '💥';
        } else if (bonus.type === 'horizontal') {
            color = '#3b82f6';
            text = '';
            icon = '⚡';
        } else if (bonus.type === 'strength') {
            color = '#ff8c00';  // Naranja para fuerza
            text = '';
            icon = '💪';
        }

        ctx.shadowColor = color;
        ctx.shadowBlur = 10;

        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(bonus.x, bonus.y, bonus.radius, 0, Math.PI * 2);
        ctx.fill();

        ctx.shadowBlur = 0;

        ctx.fillStyle = 'white';
        ctx.font = icon ? `${getFontSize(14)}px Arial` : `bold ${getFontSize(12)}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(icon || text, bonus.x, bonus.y + (icon ? 1 : 0));
    }

    // Draw particles
    for (let p of gameState.particles) {
        ctx.globalAlpha = p.life;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Draw laser effect
    if (gameState.laserEffect) {
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

    // Draw balls
    for (let ball of gameState.balls) {
        if (!ball.active) continue;

        if (ball.fireball) {
            // Bola de fuego - roja con glow
            ctx.shadowColor = '#ff6b6b';
            ctx.shadowBlur = 8;
            ctx.fillStyle = '#ff6b6b';
        } else if (ball.splitter && !ball.hasSplit) {
            // Bola divisora - amarilla con glow
            ctx.shadowColor = '#f9ed69';
            ctx.shadowBlur = 8;
            ctx.fillStyle = '#f9ed69';
        } else {
            // Bola normal - blanca
            ctx.fillStyle = '#fff';
        }

        ctx.beginPath();
        ctx.arc(ball.x, ball.y, getBallRadius(), 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
    }

    // Draw launch indicator
    if (!gameState.isShooting) {
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.beginPath();
        ctx.arc(gameState.launchX, gameState.launchY, getBallRadius() + 2, 0, Math.PI * 2);
        ctx.fill();

        const totalBalls = gameState.ballInventory.normal + gameState.ballInventory.fireball + gameState.ballInventory.splitter;
        if (totalBalls > 1) {
            ctx.fillStyle = 'rgba(255,255,255,0.6)';
            ctx.font = `bold ${getFontSize(11)}px Arial`;
            ctx.textAlign = 'center';
            ctx.fillText('x' + totalBalls, gameState.launchX, gameState.launchY + 22 * getScale());
        }
    }

    // Draw aim line
    if (gameState.isAiming && !gameState.isShooting) {
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

    // Draw ball inventory indicators (show special balls)
    const inv = gameState.ballInventory;
    if (inv.fireball > 0 || inv.splitter > 0) {
        const scale = getScale();
        let indicatorX = leftBorder + 10 * scale;
        const indicatorY = getBottomLine() + 20 * scale;
        const indicatorW = 50 * scale;
        const indicatorH = 20 * scale;

        if (inv.fireball > 0) {
            ctx.fillStyle = 'rgba(255, 107, 107, 0.8)';
            ctx.beginPath();
            ctx.roundRect(indicatorX, indicatorY, indicatorW, indicatorH, 10 * scale);
            ctx.fill();
            ctx.fillStyle = 'white';
            ctx.font = `${getFontSize(11)}px Arial`;
            ctx.textAlign = 'center';
            ctx.fillText('🔥 ' + inv.fireball, indicatorX + indicatorW / 2, indicatorY + indicatorH * 0.7);
            indicatorX += indicatorW + 10 * scale;
        }

        if (inv.splitter > 0) {
            ctx.fillStyle = 'rgba(249, 237, 105, 0.8)';
            ctx.beginPath();
            ctx.roundRect(indicatorX, indicatorY, indicatorW, indicatorH, 10 * scale);
            ctx.fill();
            ctx.fillStyle = '#333';
            ctx.font = `${getFontSize(11)}px Arial`;
            ctx.textAlign = 'center';
            ctx.fillText('💥 ' + inv.splitter, indicatorX + indicatorW / 2, indicatorY + indicatorH * 0.7);
        }
    }
}
