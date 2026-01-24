/**
 * Physics Module - Refactorizado con patrón Strategy
 *
 * Este módulo usa los registries de behaviors para manejar
 * colisiones y efectos de forma extensible (Open/Closed principle).
 *
 * Para agregar un nuevo comportamiento de colisión o efecto,
 * solo necesitas registrar un nuevo behavior con los métodos correspondientes.
 */

import { gameState, endTurn, updateUI } from './game.js';
import { COLS, FAST_SPEED_MULTIPLIER } from './config.js';
import { getWidth, getHeight, getLeftBorder, getRightBorder, getTopOffset, getBottomLine, getCellSize, getBallRadius, getScale, getBrickColor } from './rendering.js';
import { BrickRegistry, BallRegistry, BonusRegistry } from './js/behaviors/index.js';

// ====================================
// SISTEMA DE PARTÍCULAS
// ====================================

export function createParticles(x, y, color, count = 8) {
    for (let i = 0; i < count; i++) {
        const angle = (Math.PI * 2 * i) / count + Math.random() * 0.5;
        const speed = 2 + Math.random() * 3;
        gameState.particles.push({
            x: x,
            y: y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            life: 1,
            color: color,
            size: 3 + Math.random() * 3
        });
    }
}

export function updateParticles() {
    for (let p of gameState.particles) {
        p.x += p.vx;
        p.y += p.vy;
        p.life -= 0.03;
        p.vy += 0.1;
    }
    gameState.particles = gameState.particles.filter(p => p.life > 0);

    if (gameState.laserEffect) {
        gameState.laserEffect.alpha -= 0.05;
        if (gameState.laserEffect.alpha <= 0) {
            gameState.laserEffect = null;
        }
    }
}

// ====================================
// HELPERS PARA BEHAVIORS
// ====================================

const physicsHelpers = {
    getCellSize,
    getLeftBorder,
    getRightBorder,
    getBallRadius,
    getBrickColor,
    getScale,
    createParticles,
    COLS,
    get speedMultiplier() {
        return gameState.speedMultiplier;
    }
};

// ====================================
// EFECTOS DE BLOQUES (usando behaviors)
// ====================================

/**
 * Procesa el efecto de destrucción de un bloque
 * usando su behavior registrado
 */
function processBrickDestruction(brick) {
    const behavior = BrickRegistry.get(brick.type);

    if (behavior && behavior.onDestroy) {
        const result = behavior.onDestroy(brick, gameState, physicsHelpers);

        if (result) {
            // Procesar daño a otros bloques
            if (result.damagedBricks) {
                for (const { brick: targetBrick, damage } of result.damagedBricks) {
                    const targetBehavior = BrickRegistry.get(targetBrick.type);
                    const modifiedDamage = targetBehavior && targetBehavior.onDamage
                        ? targetBehavior.onDamage(targetBrick, damage, gameState)
                        : damage;
                    targetBrick.hp -= modifiedDamage;
                }
            }

            // Procesar spawned bricks
            if (result.spawnedBricks) {
                gameState.bricks.push(...result.spawnedBricks);
            }
        }
    }
}

// ====================================
// HORIZONTAL LASER
// ====================================

export function fireHorizontalLaser(ballY) {
    const cellSize = getCellSize();
    const leftBorder = getLeftBorder();
    const rightBorder = getRightBorder();

    let targetY = null;
    let minDist = Infinity;

    for (let brick of gameState.bricks) {
        const brickCenterY = brick.y + brick.height / 2;
        const dist = Math.abs(ballY - brickCenterY);
        if (dist < minDist) {
            minDist = dist;
            targetY = brickCenterY;
        }
    }

    if (targetY === null) return;

    gameState.laserEffect = {
        y: targetY,
        alpha: 1,
        width: rightBorder - leftBorder
    };

    for (let x = leftBorder; x < rightBorder; x += 30) {
        createParticles(x, targetY, '#3b82f6', 3);
    }

    for (let brick of gameState.bricks) {
        const brickCenterY = brick.y + brick.height / 2;
        if (Math.abs(brickCenterY - targetY) < cellSize / 2) {
            const damage = Math.max(Math.ceil(brick.maxHp * 0.5), Math.ceil(brick.hp * 0.6));

            // Aplicar modificador de daño del behavior
            const behavior = BrickRegistry.get(brick.type);
            const modifiedDamage = behavior && behavior.onDamage
                ? behavior.onDamage(brick, damage, gameState)
                : damage;

            brick.hp -= modifiedDamage;
            createParticles(brick.x + brick.width/2, brick.y + brick.height/2, '#3b82f6', 5);
        }
    }
}

// Agregar laser helper para bonuses
physicsHelpers.fireHorizontalLaser = fireHorizontalLaser;

// ====================================
// FÍSICA DE BOLAS
// ====================================

export function updateBalls() {
    const width = getWidth();
    const leftBorder = getLeftBorder();
    const rightBorder = getRightBorder();
    const bottomLine = getBottomLine();
    const minY = getTopOffset() + (getBottomLine() - getTopOffset()) * 0.6;
    const topLimit = getTopOffset() - 15;

    const iterations = gameState.speedMultiplier > 1 ? FAST_SPEED_MULTIPLIER : 1;

    for (let iter = 0; iter < iterations; iter++) {
        // Bolas nuevas a agregar (desde splits)
        const newBalls = [];

        for (let ball of gameState.balls) {
            if (!ball.active) continue;

            ball.x += ball.vx;
            ball.y += ball.vy;

            if (ball.y < minY) {
                ball.hasGoneUp = true;
            }

            // Colisiones con paredes
            if (ball.x - getBallRadius() < leftBorder) {
                ball.x = leftBorder + getBallRadius();
                ball.vx *= -1;
            }
            if (ball.x + getBallRadius() > rightBorder) {
                ball.x = rightBorder - getBallRadius();
                ball.vx *= -1;
            }
            if (ball.y - getBallRadius() < topLimit) {
                ball.y = topLimit + getBallRadius();
                ball.vy *= -1;
            }

            // Fondo - bola aterriza
            if (ball.hasGoneUp && ball.y + getBallRadius() > bottomLine) {
                ball.y = bottomLine;
                ball.active = false;
                gameState.ballsLanded++;

                if (!gameState.firstBallLanded) {
                    gameState.firstBallLanded = true;
                    gameState.nextLaunchX = Math.max(leftBorder + 20, Math.min(rightBorder - 20, ball.x));
                }
            }

            // Seguridad: aterrizar bolas fuera de límites
            if (ball.x < 0 || ball.x > width || ball.y > getHeight() || ball.y < 0) {
                ball.active = false;
                gameState.ballsLanded++;
                if (!gameState.firstBallLanded) {
                    gameState.firstBallLanded = true;
                    gameState.nextLaunchX = width / 2;
                }
            }

            // Seguridad: aterrizar bolas atascadas
            ball.lifetime = (ball.lifetime || 0) + 1;
            if (ball.lifetime > 5000) {
                ball.active = false;
                gameState.ballsLanded++;
                if (!gameState.firstBallLanded) {
                    gameState.firstBallLanded = true;
                    gameState.nextLaunchX = width / 2;
                }
            }

            // Colisiones con bloques (usando behaviors)
            const collisionResult = checkBrickCollisions(ball);
            if (collisionResult && collisionResult.spawnBalls) {
                newBalls.push(...collisionResult.spawnBalls);
            }

            checkBonusCollisions(ball);
        }

        // Agregar nuevas bolas (desde splits)
        if (newBalls.length > 0) {
            gameState.balls.push(...newBalls);
        }

        // Procesar bloques destruidos usando sus behaviors
        const destroyedBricks = gameState.bricks.filter(b => b.hp <= 0);
        for (let brick of destroyedBricks) {
            processBrickDestruction(brick);
        }
        gameState.bricks = gameState.bricks.filter(b => b.hp > 0);
    }

    checkTurnEnd();
}

// ====================================
// DETECCIÓN DE COLISIONES
// ====================================

function checkTurnEnd() {
    if (!gameState.isShooting) return;

    const activeBalls = gameState.balls.filter(b => b.active).length;
    const allBallsShot = gameState.ballsToShoot.length === 0;
    const noBallsActive = activeBalls === 0;

    if (allBallsShot && noBallsActive) {
        endTurn();
        return;
    }

    gameState.shootingTime = (gameState.shootingTime || 0) + 1;

    if (gameState.shootingTime > 600 && noBallsActive) {
        console.log('Safety: forcing turn end due to stuck state');
        endTurn();
        return;
    }

    if (gameState.shootingTime > 1800) {
        console.log('Safety: forcing turn end due to timeout');
        for (let ball of gameState.balls) {
            ball.active = false;
        }
        endTurn();
        return;
    }
}

/**
 * Verifica colisiones de una bola con bloques
 * usando el behavior de la bola para determinar el resultado
 */
function checkBrickCollisions(ball) {
    const ballBehavior = BallRegistry.get(ball.ballType);
    let collisionResult = null;

    for (let brick of gameState.bricks) {
        if (brick.hp <= 0) continue;

        const brickId = `${brick.x},${brick.y}`;

        if (circleRectCollision(ball.x, ball.y, getBallRadius(),
            brick.x + 2, brick.y + 2, brick.width, brick.height)) {

            // Usar el behavior de la bola para manejar la colisión
            if (ballBehavior && ballBehavior.onCollision) {
                const result = ballBehavior.onCollision(ball, brick, gameState, physicsHelpers);

                if (result) {
                    // Aplicar modificador de daño del bloque
                    const brickBehavior = BrickRegistry.get(brick.type);
                    let damage = result.damage;
                    if (brickBehavior && brickBehavior.onDamage) {
                        damage = brickBehavior.onDamage(brick, damage, gameState);
                    }
                    brick.hp -= damage;

                    // Guardar resultado de colisión
                    collisionResult = result;

                    // Si no debemos seguir chequeando, salir
                    if (!result.continueChecking) {
                        return collisionResult;
                    }
                }
            }
        } else if (ball.fireball && ball.hitBricks && ball.hitBricks.has(brickId)) {
            // Limpiar registro de fireball cuando sale del bloque
            if (ballBehavior && ballBehavior.onExitBrick) {
                ballBehavior.onExitBrick(ball, brick);
            } else {
                ball.hitBricks.delete(brickId);
            }
        }
    }

    return collisionResult;
}

/**
 * Verifica colisiones de una bola con bonuses
 * usando el behavior del bonus para aplicar el efecto
 */
function checkBonusCollisions(ball) {
    for (let bonus of gameState.bonuses) {
        const dist = Math.hypot(ball.x - bonus.x, ball.y - bonus.y);

        if (dist < getBallRadius() + bonus.radius) {
            // Usar el behavior del bonus para aplicar el efecto
            const behavior = BonusRegistry.get(bonus.type);

            if (behavior && behavior.onCollect) {
                behavior.onCollect(bonus, ball, gameState, physicsHelpers);
            }

            createParticles(bonus.x, bonus.y, '#f9ed69', 8);
            gameState.bonuses = gameState.bonuses.filter(b => b !== bonus);

            updateUI();
        }
    }
}

function circleRectCollision(cx, cy, cr, rx, ry, rw, rh) {
    const closestX = Math.max(rx, Math.min(cx, rx + rw));
    const closestY = Math.max(ry, Math.min(cy, ry + rh));
    const dist = Math.hypot(cx - closestX, cy - closestY);
    return dist < cr;
}

// ====================================
// PREDICCIÓN DE TRAYECTORIA
// ====================================

export function calculateTrajectory(startX, startY, angle, maxBounces) {
    const leftBorder = getLeftBorder();
    const rightBorder = getRightBorder();
    const topLimit = getTopOffset() - 15;
    const points = [{x: startX, y: startY, isBounce: false}];

    let x = startX;
    let y = startY;
    let vx = Math.cos(angle);
    let vy = Math.sin(angle);
    let bounces = 0;
    const maxDistance = 1200;
    let totalDistance = 0;

    while (bounces <= maxBounces && totalDistance < maxDistance) {
        let minDist = Infinity;
        let hitType = null;
        let hitSide = null;

        if (vx < 0) {
            const dist = (leftBorder + getBallRadius() - x) / vx;
            if (dist > 0 && dist < minDist) {
                minDist = dist;
                hitType = 'left';
            }
        }
        if (vx > 0) {
            const dist = (rightBorder - getBallRadius() - x) / vx;
            if (dist > 0 && dist < minDist) {
                minDist = dist;
                hitType = 'right';
            }
        }
        if (vy < 0) {
            const dist = (topLimit + getBallRadius() - y) / vy;
            if (dist > 0 && dist < minDist) {
                minDist = dist;
                hitType = 'top';
            }
        }

        for (let brick of gameState.bricks) {
            const collision = raycastToBrick(x, y, vx, vy, brick);
            if (collision && collision.dist > 0.1 && collision.dist < minDist) {
                minDist = collision.dist;
                hitType = 'brick';
                hitSide = collision.side;
            }
        }

        if (minDist === Infinity || minDist > maxDistance - totalDistance) {
            const remainingDist = Math.min(250, maxDistance - totalDistance);
            points.push({
                x: x + vx * remainingDist,
                y: y + vy * remainingDist,
                isBounce: false
            });
            break;
        }

        x += vx * minDist;
        y += vy * minDist;
        totalDistance += minDist;

        points.push({x: x, y: y, isBounce: true});
        bounces++;

        if (hitType === 'left' || hitType === 'right') {
            vx *= -1;
        } else if (hitType === 'top') {
            vy *= -1;
        } else if (hitType === 'brick') {
            if (hitSide === 'left' || hitSide === 'right') {
                vx *= -1;
            } else {
                vy *= -1;
            }
        }
    }

    return points;
}

function raycastToCircle(x, y, vx, vy, cx, cy, radius) {
    const dx = x - cx;
    const dy = y - cy;

    const a = vx * vx + vy * vy;
    const b = 2 * (dx * vx + dy * vy);
    const c = dx * dx + dy * dy - radius * radius;

    const discriminant = b * b - 4 * a * c;

    if (discriminant < 0) return null;

    const t1 = (-b - Math.sqrt(discriminant)) / (2 * a);
    const t2 = (-b + Math.sqrt(discriminant)) / (2 * a);

    if (t1 > 0) return {dist: t1};
    if (t2 > 0) return {dist: t2};
    return null;
}

function raycastToBrick(x, y, vx, vy, brick) {
    const brickLeft = brick.x + 2;
    const brickRight = brick.x + 2 + brick.width;
    const brickTop = brick.y + 2;
    const brickBottom = brick.y + 2 + brick.height;

    const radius = getBallRadius();

    let minDist = Infinity;
    let hitSide = null;

    // Raycast contra los cuatro lados del rectángulo expandido
    if (vx > 0) {
        const t = (brickLeft - radius - x) / vx;
        const hitY = y + vy * t;
        if (t > 0 && hitY >= brickTop && hitY <= brickBottom && t < minDist) {
            minDist = t;
            hitSide = 'left';
        }
    }
    if (vx < 0) {
        const t = (brickRight + radius - x) / vx;
        const hitY = y + vy * t;
        if (t > 0 && hitY >= brickTop && hitY <= brickBottom && t < minDist) {
            minDist = t;
            hitSide = 'right';
        }
    }
    if (vy > 0) {
        const t = (brickTop - radius - y) / vy;
        const hitX = x + vx * t;
        if (t > 0 && hitX >= brickLeft && hitX <= brickRight && t < minDist) {
            minDist = t;
            hitSide = 'top';
        }
    }
    if (vy < 0) {
        const t = (brickBottom + radius - y) / vy;
        const hitX = x + vx * t;
        if (t > 0 && hitX >= brickLeft && hitX <= brickRight && t < minDist) {
            minDist = t;
            hitSide = 'bottom';
        }
    }

    // Raycast contra las cuatro esquinas (como círculos)
    const corners = [
        {x: brickLeft, y: brickTop, sideX: 'left', sideY: 'top'},
        {x: brickRight, y: brickTop, sideX: 'right', sideY: 'top'},
        {x: brickLeft, y: brickBottom, sideX: 'left', sideY: 'bottom'},
        {x: brickRight, y: brickBottom, sideX: 'right', sideY: 'bottom'}
    ];

    for (let corner of corners) {
        const collision = raycastToCircle(x, y, vx, vy, corner.x, corner.y, radius);
        if (collision && collision.dist > 0 && collision.dist < minDist) {
            const hitX = x + vx * collision.dist;
            const hitY = y + vy * collision.dist;

            const inCornerX = (corner.x === brickLeft && hitX < brickLeft) ||
                            (corner.x === brickRight && hitX > brickRight);
            const inCornerY = (corner.y === brickTop && hitY < brickTop) ||
                            (corner.y === brickBottom && hitY > brickBottom);

            if (inCornerX || inCornerY) {
                minDist = collision.dist;
                const dx = hitX - corner.x;
                const dy = hitY - corner.y;
                if (Math.abs(dx) > Math.abs(dy)) {
                    hitSide = corner.sideX;
                } else {
                    hitSide = corner.sideY;
                }
            }
        }
    }

    if (minDist === Infinity) return null;
    return {dist: minDist, side: hitSide};
}
