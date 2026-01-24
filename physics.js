import { gameState, endTurn, updateUI } from './game.js';
import { COLS, FAST_SPEED_MULTIPLIER } from './config.js';
import { getWidth, getHeight, getLeftBorder, getRightBorder, getTopOffset, getBottomLine, getCellSize, getBallRadius, getScale, getBrickColor } from './rendering.js';

// Particle effects
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

// Explosion for explosive bricks
export function explodeBrick(brick) {
    const cellSize = getCellSize();
    const centerX = brick.x + brick.width / 2;
    const centerY = brick.y + brick.height / 2;

    createParticles(centerX, centerY, '#ff6b6b', 16);

    const explosionRadius = cellSize * 1.5;
    for (let other of gameState.bricks) {
        if (other === brick) continue;
        const otherCenterX = other.x + other.width / 2;
        const otherCenterY = other.y + other.height / 2;
        const dist = Math.hypot(centerX - otherCenterX, centerY - otherCenterY);

        if (dist < explosionRadius) {
            const damage = brick.maxHp;  // Daño igual al HP inicial del explosivo
            other.hp -= damage;
        }
    }
}

// Spawner brick creates new bricks when destroyed
export function spawnBricks(brick) {
    const cellSize = getCellSize();
    const leftBorder = getLeftBorder();

    createParticles(brick.x + brick.width/2, brick.y + brick.height/2, '#a855f7', 12);

    const spawnCount = 1 + Math.floor(Math.random() * 2);
    const nearbyPositions = [];

    for (let dc = -1; dc <= 1; dc++) {
        const newCol = brick.col + dc;
        if (newCol >= 0 && newCol < COLS) {
            const newX = leftBorder + newCol * cellSize;
            const newY = brick.y;

            const occupied = gameState.bricks.some(b =>
                Math.abs(b.x - newX) < cellSize * 0.5 && Math.abs(b.y - newY) < cellSize * 0.5
            );

            if (!occupied) {
                nearbyPositions.push({col: newCol, x: newX, y: newY});
            }
        }
    }

    for (let i = 0; i < Math.min(spawnCount, nearbyPositions.length); i++) {
        const pos = nearbyPositions[Math.floor(Math.random() * nearbyPositions.length)];
        nearbyPositions.splice(nearbyPositions.indexOf(pos), 1);

        const hp = Math.floor(brick.maxHp * 0.5);
        gameState.bricks.push({
            x: pos.x,
            y: pos.y,
            width: cellSize - 4,
            height: cellSize - 4,
            hp: hp,
            maxHp: hp,
            col: pos.col,
            type: 'spawner'
        });
    }
}

// Horizontal laser - finds nearest row with bricks and destroys them
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
            brick.hp -= damage;
            createParticles(brick.x + brick.width/2, brick.y + brick.height/2, '#3b82f6', 5);
        }
    }
}

// Ball physics
export function updateBalls() {
    const width = getWidth();
    const leftBorder = getLeftBorder();
    const rightBorder = getRightBorder();
    const bottomLine = getBottomLine();
    const minY = getTopOffset() + (getBottomLine() - getTopOffset()) * 0.6;
    const topLimit = getTopOffset() - 15;

    const iterations = gameState.speedMultiplier > 1 ? FAST_SPEED_MULTIPLIER : 1;

    for (let iter = 0; iter < iterations; iter++) {
        for (let ball of gameState.balls) {
            if (!ball.active) continue;

            ball.x += ball.vx;
            ball.y += ball.vy;

            if (ball.y < minY) {
                ball.hasGoneUp = true;
            }

            // Wall collisions
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

            // Bottom - ball lands
            if (ball.hasGoneUp && ball.y + getBallRadius() > bottomLine) {
                ball.y = bottomLine;
                ball.active = false;
                gameState.ballsLanded++;

                if (!gameState.firstBallLanded) {
                    gameState.firstBallLanded = true;
                    gameState.nextLaunchX = Math.max(leftBorder + 20, Math.min(rightBorder - 20, ball.x));
                }
            }

            // Safety: force land balls that are out of bounds
            if (ball.x < 0 || ball.x > width || ball.y > getHeight() || ball.y < 0) {
                ball.active = false;
                gameState.ballsLanded++;
                if (!gameState.firstBallLanded) {
                    gameState.firstBallLanded = true;
                    gameState.nextLaunchX = width / 2;
                }
            }

            // Safety: force land stuck balls
            ball.lifetime = (ball.lifetime || 0) + 1;
            if (ball.lifetime > 5000) {
                ball.active = false;
                gameState.ballsLanded++;
                if (!gameState.firstBallLanded) {
                    gameState.firstBallLanded = true;
                    gameState.nextLaunchX = width / 2;
                }
            }

            checkBrickCollisions(ball);
            checkBonusCollisions(ball);
        }

        // Handle destroyed bricks
        const destroyedBricks = gameState.bricks.filter(b => b.hp <= 0);
        for (let brick of destroyedBricks) {
            if (brick.type === 'explosive') {
                explodeBrick(brick);
            } else if (brick.type === 'spawner') {
                spawnBricks(brick);
            }
        }
        gameState.bricks = gameState.bricks.filter(b => b.hp > 0);
    }

    checkTurnEnd();
}

// Check if turn should end
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

function checkBrickCollisions(ball) {
    for (let brick of gameState.bricks) {
        if (brick.hp <= 0) continue;

        const brickId = `${brick.x},${brick.y}`;

        if (circleRectCollision(ball.x, ball.y, getBallRadius(),
            brick.x + 2, brick.y + 2, brick.width, brick.height)) {

            // Si es una bola splitter, dividirse en 5 bolas normales
            if (ball.splitter && !ball.hasSplit) {
                const damage = ball.damage * (brick.type === 'armored' ? 0.5 : 1);
                brick.hp -= damage;
                splitBall(ball);
                return;
            }

            if (!ball.fireball) {
                // Normal ball: bounce
                const ballCenterX = ball.x;
                const ballCenterY = ball.y;
                const brickCenterX = brick.x + 2 + brick.width / 2;
                const brickCenterY = brick.y + 2 + brick.height / 2;

                const dx = ballCenterX - brickCenterX;
                const dy = ballCenterY - brickCenterY;

                const overlapX = brick.width / 2 + getBallRadius() - Math.abs(dx);
                const overlapY = brick.height / 2 + getBallRadius() - Math.abs(dy);

                if (overlapX < overlapY) {
                    ball.vx *= -1;
                    ball.x += dx > 0 ? overlapX : -overlapX;
                } else {
                    ball.vy *= -1;
                    ball.y += dy > 0 ? overlapY : -overlapY;
                }

                const damage = ball.damage * (brick.type === 'armored' ? 0.5 : 1);
                brick.hp -= damage;

                if (gameState.speedMultiplier === 1) {
                    createParticles(ball.x, ball.y, getBrickColor(brick.hp, brick.maxHp), 3);
                }

                return;
            } else {
                // Fireball: pass through
                if (!ball.hitBricks.has(brickId)) {
                    ball.hitBricks.add(brickId);

                    const damage = ball.damage * (brick.type === 'armored' ? 0.5 : 1);
                    brick.hp -= damage;

                    if (gameState.speedMultiplier === 1) {
                        createParticles(ball.x, ball.y, getBrickColor(brick.hp, brick.maxHp), 3);
                    }
                }
            }
        } else if (ball.fireball && ball.hitBricks && ball.hitBricks.has(brickId)) {
            ball.hitBricks.delete(brickId);
        }
    }
}


// Split a splitter ball into 5 normal balls
function splitBall(ball) {
    if (ball.hasSplit) return;  // Solo dividir una vez

    ball.hasSplit = true;
    ball.active = false;  // Desactivar la bola original
    gameState.ballsLanded++;  // Contar como aterrizada

    const speed = Math.hypot(ball.vx, ball.vy);
    const currentAngle = Math.atan2(ball.vy, ball.vx);

    // Crear 5 bolas normales en abanico
    const angleOffsets = [-Math.PI / 3, -Math.PI / 6, 0, Math.PI / 6, Math.PI / 3]; // -60°, -30°, 0°, +30°, +60°

    for (const offset of angleOffsets) {
        const newAngle = currentAngle + offset;
        const newBall = {
            x: ball.x,
            y: ball.y,
            vx: Math.cos(newAngle) * speed,
            vy: Math.sin(newAngle) * speed,
            active: true,
            hasGoneUp: ball.hasGoneUp,
            ballType: 'normal',
            fireball: false,
            splitter: false,
            hasSplit: false,
            damage: 1,
            hitBricks: null,
            lifetime: 0
        };
        gameState.balls.push(newBall);
    }

    createParticles(ball.x, ball.y, '#f9ed69', 12);
}

function checkBonusCollisions(ball) {
    for (let bonus of gameState.bonuses) {
        const dist = Math.hypot(ball.x - bonus.x, ball.y - bonus.y);

        if (dist < getBallRadius() + bonus.radius) {
            const count = bonus.value || 1;

            if (bonus.type === 'ball') {
                // Bola normal
                gameState.ballInventory.normal += count;
            } else if (bonus.type === 'fireballBall') {
                // Bola de fuego
                gameState.ballInventory.fireball += count;
            } else if (bonus.type === 'splitterBall') {
                // Bola que se divide
                gameState.ballInventory.splitter += count;
            } else if (bonus.type === 'horizontal') {
                fireHorizontalLaser(ball.y);
            } else if (bonus.type === 'strength') {
                // Agregar bola de fuerza al inventario
                gameState.ballInventory.strength += 1;
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

// Trajectory prediction
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

// Helper function for ray-circle intersection
function raycastToCircle(x, y, vx, vy, cx, cy, radius) {
    // Ray: P(t) = (x,y) + t*(vx,vy)
    // Circle: (P.x - cx)^2 + (P.y - cy)^2 = radius^2

    const dx = x - cx;
    const dy = y - cy;

    const a = vx * vx + vy * vy;
    const b = 2 * (dx * vx + dy * vy);
    const c = dx * dx + dy * dy - radius * radius;

    const discriminant = b * b - 4 * a * c;

    if (discriminant < 0) return null;

    const t1 = (-b - Math.sqrt(discriminant)) / (2 * a);
    const t2 = (-b + Math.sqrt(discriminant)) / (2 * a);

    // Return the closest positive t
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

    // Raycast against the four sides of the expanded rectangle
    // Left side
    if (vx > 0) {
        const t = (brickLeft - radius - x) / vx;
        const hitY = y + vy * t;
        if (t > 0 && hitY >= brickTop && hitY <= brickBottom && t < minDist) {
            minDist = t;
            hitSide = 'left';
        }
    }
    // Right side
    if (vx < 0) {
        const t = (brickRight + radius - x) / vx;
        const hitY = y + vy * t;
        if (t > 0 && hitY >= brickTop && hitY <= brickBottom && t < minDist) {
            minDist = t;
            hitSide = 'right';
        }
    }
    // Top side
    if (vy > 0) {
        const t = (brickTop - radius - y) / vy;
        const hitX = x + vx * t;
        if (t > 0 && hitX >= brickLeft && hitX <= brickRight && t < minDist) {
            minDist = t;
            hitSide = 'top';
        }
    }
    // Bottom side
    if (vy < 0) {
        const t = (brickBottom + radius - y) / vy;
        const hitX = x + vx * t;
        if (t > 0 && hitX >= brickLeft && hitX <= brickRight && t < minDist) {
            minDist = t;
            hitSide = 'bottom';
        }
    }

    // Raycast against the four corners (as circles)
    // This handles cases where the ball hits the rounded corners
    const corners = [
        {x: brickLeft, y: brickTop, sideX: 'left', sideY: 'top'},
        {x: brickRight, y: brickTop, sideX: 'right', sideY: 'top'},
        {x: brickLeft, y: brickBottom, sideX: 'left', sideY: 'bottom'},
        {x: brickRight, y: brickBottom, sideX: 'right', sideY: 'bottom'}
    ];

    for (let corner of corners) {
        const collision = raycastToCircle(x, y, vx, vy, corner.x, corner.y, radius);
        if (collision && collision.dist > 0 && collision.dist < minDist) {
            // Check if this corner hit is outside the main rectangle bounds
            const hitX = x + vx * collision.dist;
            const hitY = y + vy * collision.dist;

            // Only count corner hits that are actually in the corner region
            const inCornerX = (corner.x === brickLeft && hitX < brickLeft) ||
                            (corner.x === brickRight && hitX > brickRight);
            const inCornerY = (corner.y === brickTop && hitY < brickTop) ||
                            (corner.y === brickBottom && hitY > brickBottom);

            if (inCornerX || inCornerY) {
                minDist = collision.dist;
                // Determine hit side based on which component has larger deviation
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
