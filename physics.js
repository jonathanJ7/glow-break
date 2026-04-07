/**
 * Physics Module - Refactorizado con patrón Strategy y CCD
 *
 * Este módulo usa:
 * 1. Registries de behaviors para manejar colisiones y efectos (Open/Closed principle)
 * 2. Continuous Collision Detection (CCD) para evitar tunneling
 * 3. Sistema unificado de colisiones para predicción y simulación
 *
 * Para agregar un nuevo comportamiento de colisión o efecto,
 * solo necesitas registrar un nuevo behavior con los métodos correspondientes.
 */

import { gameState, endTurn, updateUI } from './game.js';
import { COLS, FAST_SPEED_MULTIPLIER, BALL_SPEED } from './config.js';
import { getWidth, getHeight, getLeftBorder, getRightBorder, getTopOffset, getBottomLine, getCellSize, getBallRadius, getScale, getBrickColor } from './rendering.js';
import { BrickRegistry, BallRegistry, BonusRegistry } from './js/behaviors/index.js';
import { processPhysicsStep, simulateTrajectory, circleRectOverlap, reflectVelocity } from './js/systems/CollisionSystem.js';

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
    const result = behavior.onDestroy(brick, gameState, physicsHelpers);

    if (result) {
        // Procesar daño a otros bloques
        if (result.damagedBricks) {
            for (const { brick: targetBrick, damage } of result.damagedBricks) {
                const targetBehavior = BrickRegistry.get(targetBrick.type);
                targetBrick.hp -= targetBehavior.onDamage(targetBrick, damage, gameState);
            }
        }

        // Procesar spawned bricks
        if (result.spawnedBricks) {
            gameState.bricks.push(...result.spawnedBricks);
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
            brick.hp -= behavior.onDamage(brick, damage, gameState);
            createParticles(brick.x + brick.width/2, brick.y + brick.height/2, '#3b82f6', 5);
        }
    }
}

// Agregar laser helper para bonuses
physicsHelpers.fireHorizontalLaser = fireHorizontalLaser;

// ====================================
// FÍSICA DE BOLAS - Con Continuous Collision Detection
// ====================================

/**
 * Obtiene los límites del área de juego para el sistema de colisiones
 */
function getGameBounds() {
    return {
        left: getLeftBorder(),
        right: getRightBorder(),
        top: getTopOffset() - 15,
        bottom: getBottomLine()
    };
}

export function updateBalls() {
    const width = getWidth();
    const leftBorder = getLeftBorder();
    const rightBorder = getRightBorder();
    const bottomLine = getBottomLine();
    const minY = getTopOffset() + (getBottomLine() - getTopOffset()) * 0.6;
    const radius = getBallRadius();
    const bounds = getGameBounds();

    const iterations = gameState.speedMultiplier > 1 ? FAST_SPEED_MULTIPLIER : 1;

    for (let iter = 0; iter < iterations; iter++) {
        // Bolas nuevas a agregar (desde splits)
        const newBalls = [];

        for (let ball of gameState.balls) {
            if (!ball.active) continue;

            const ballBehavior = BallRegistry.get(ball.ballType);
            const isFireball = ball.fireball || ball.ballType === 'fireball';

            // Callback para manejar colisiones con bloques
            const onBrickHit = (ball, brick, collision) => {
                const brickId = `${brick.x},${brick.y}`;

                // Fireball atraviesa bloques y solo daña una vez por bloque
                if (isFireball) {
                    if (!ball.hitBricks) ball.hitBricks = new Set();

                    if (!ball.hitBricks.has(brickId)) {
                        ball.hitBricks.add(brickId);

                        const brickBehavior = BrickRegistry.get(brick.type);
                        const damage = brickBehavior.onDamage(brick, ball.damage || 1, gameState);
                        brick.hp -= damage;

                        if (gameState.speedMultiplier === 1) {
                            createParticles(collision.hitX, collision.hitY, getBrickColor(brick.hp, brick.maxHp), 3);
                        }
                    }
                    // passThrough: true indica que la bola atraviesa el bloque sin detenerse
                    return { shouldBounce: false, damage: 0, passThrough: true };
                }

                // Bola normal o splitter
                const result = ballBehavior.onCollision(ball, brick, gameState, physicsHelpers);
                const brickBehavior = BrickRegistry.get(brick.type);
                const damage = brickBehavior.onDamage(brick, result.damage, gameState);
                brick.hp -= damage;

                if (result.spawnBalls) {
                    newBalls.push(...result.spawnBalls);
                }
                if (result.ballLanded) {
                    gameState.ballsLanded++;
                }

                return { shouldBounce: result.bounce, damage };
            };

            // Usar el nuevo sistema de colisiones CCD
            const physicsResult = processPhysicsStep(
                ball, radius, gameState.bricks, bounds, onBrickHit
            );

            // Actualizar posición y velocidad
            ball.x = physicsResult.newX;
            ball.y = physicsResult.newY;

            // Siempre actualizar velocidad - el sistema de colisiones ya maneja
            // que fireballs no reboten en bloques (shouldBounce: false) pero sí
            // reboten en paredes
            ball.vx = physicsResult.newVx;
            ball.vy = physicsResult.newVy;

            // Limpiar registro de fireball cuando sale de bloques
            if (isFireball && ball.hitBricks) {
                for (const brickId of ball.hitBricks) {
                    const [bx, by] = brickId.split(',').map(Number);
                    const brick = gameState.bricks.find(b => b.x === bx && b.y === by);
                    if (brick && !circleRectOverlap(ball.x, ball.y, radius, brick.x + 2, brick.y + 2, brick.width, brick.height)) {
                        ball.hitBricks.delete(brickId);
                    }
                }
            }

            // Verificar si ha subido lo suficiente
            if (ball.y < minY) {
                ball.hasGoneUp = true;
            }

            // Fondo - bola aterriza
            if (ball.hasGoneUp && ball.y + radius > bottomLine) {
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

// checkBrickCollisions ha sido reemplazada por el sistema CCD en updateBalls

/**
 * Verifica colisiones de una bola con bonuses
 * usando el behavior del bonus para aplicar el efecto
 */
function checkBonusCollisions(ball) {
    for (let bonus of gameState.bonuses) {
        const dist = Math.hypot(ball.x - bonus.x, ball.y - bonus.y);

        if (dist < getBallRadius() + bonus.radius) {
            // Usar el behavior del bonus para aplicar el efecto
            BonusRegistry.get(bonus.type).onCollect(bonus, ball, gameState, physicsHelpers);

            createParticles(bonus.x, bonus.y, '#f9ed69', 8);
            gameState.bonuses = gameState.bonuses.filter(b => b !== bonus);

            updateUI();
        }
    }
}

// circleRectCollision ha sido reemplazada por circleRectOverlap del CollisionSystem

// ====================================
// PREDICCIÓN DE TRAYECTORIA - Unificada con sistema de colisiones
// ====================================

/**
 * Calcula la trayectoria predicha usando el mismo sistema de colisiones
 * que la simulación real. Esto garantiza que lo que se muestra al apuntar
 * sea exactamente lo que sucederá al disparar.
 *
 * @param {number} startX - Posición inicial X
 * @param {number} startY - Posición inicial Y
 * @param {number} angle - Ángulo de disparo
 * @param {number} maxBounces - Máximo de rebotes a mostrar
 * @returns {Array<{x: number, y: number, isBounce: boolean}>}
 */
export function calculateTrajectory(startX, startY, angle, maxBounces) {
    const bounds = {
        left: getLeftBorder(),
        right: getRightBorder(),
        top: getTopOffset() - 15,
        bottom: getBottomLine()
    };

    const radius = getBallRadius();
    const speed = BALL_SPEED; // Usar la misma velocidad que las bolas reales

    // Usar el sistema unificado de simulación de trayectoria
    return simulateTrajectory(
        startX,
        startY,
        angle,
        speed,
        radius,
        gameState.bricks,
        bounds,
        maxBounces,
        1200 // maxDistance
    );
}
