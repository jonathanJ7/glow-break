/**
 * CollisionSystem - Sistema de colisiones unificado con Continuous Collision Detection
 *
 * Este módulo implementa Swept Sphere Collision Detection para:
 * 1. Evitar tunneling (bolas pasando a través de bloques)
 * 2. Unificar la predicción de trayectoria con las colisiones reales
 * 3. Calcular normales de superficie precisas para rebotes físicos correctos
 *
 * El algoritmo trata el movimiento de la bola como un segmento de línea y
 * verifica intersección con rectángulos expandidos por el radio de la bola
 * (Minkowski sum approach).
 */

// Epsilon para comparaciones de punto flotante
const EPSILON = 1e-6;

/**
 * Resultado de una colisión swept sphere
 * @typedef {Object} SweptCollisionResult
 * @property {number} t - Tiempo de colisión normalizado [0, 1]
 * @property {number} hitX - Posición X del punto de impacto
 * @property {number} hitY - Posición Y del punto de impacto
 * @property {number} normalX - Normal de superficie X
 * @property {number} normalY - Normal de superficie Y
 * @property {string} side - Lado del impacto ('left', 'right', 'top', 'bottom', 'corner')
 * @property {Object} [brick] - Referencia al bloque (si aplica)
 */

/**
 * Verifica colisión swept sphere contra un segmento de línea horizontal o vertical
 * @param {number} x0 - Posición inicial X del centro de la bola
 * @param {number} y0 - Posición inicial Y del centro de la bola
 * @param {number} dx - Desplazamiento X
 * @param {number} dy - Desplazamiento Y
 * @param {number} lineStart - Coordenada de inicio del segmento
 * @param {number} lineEnd - Coordenada de fin del segmento
 * @param {number} linePos - Posición fija del segmento (X para vertical, Y para horizontal)
 * @param {boolean} isVertical - Si el segmento es vertical
 * @param {number} radius - Radio de la bola
 * @returns {Object|null} - { t, hitX, hitY } o null si no hay colisión
 */
function sweepAgainstSegment(x0, y0, dx, dy, lineStart, lineEnd, linePos, isVertical, radius) {
    if (isVertical) {
        // Segmento vertical (pared izquierda o derecha)
        if (Math.abs(dx) < EPSILON) return null;

        // Tiempo para alcanzar la línea (considerando el radio)
        const targetX = dx > 0 ? linePos - radius : linePos + radius;
        const t = (targetX - x0) / dx;

        if (t < EPSILON || t > 1 + EPSILON) return null;

        const hitY = y0 + dy * t;

        // Verificar que el punto de impacto está dentro del segmento
        if (hitY < lineStart || hitY > lineEnd) return null;

        return {
            t: Math.max(0, t),
            hitX: x0 + dx * t,
            hitY: hitY,
            normalX: dx > 0 ? -1 : 1,
            normalY: 0
        };
    } else {
        // Segmento horizontal (pared superior o inferior)
        if (Math.abs(dy) < EPSILON) return null;

        const targetY = dy > 0 ? linePos - radius : linePos + radius;
        const t = (targetY - y0) / dy;

        if (t < EPSILON || t > 1 + EPSILON) return null;

        const hitX = x0 + dx * t;

        if (hitX < lineStart || hitX > lineEnd) return null;

        return {
            t: Math.max(0, t),
            hitX: hitX,
            hitY: y0 + dy * t,
            normalX: 0,
            normalY: dy > 0 ? -1 : 1
        };
    }
}

/**
 * Verifica colisión swept sphere contra un punto (esquina del rectángulo)
 * Esto trata la esquina como un círculo con el radio de la bola
 * @param {number} x0 - Posición inicial X
 * @param {number} y0 - Posición inicial Y
 * @param {number} dx - Desplazamiento X
 * @param {number} dy - Desplazamiento Y
 * @param {number} cornerX - Posición X de la esquina
 * @param {number} cornerY - Posición Y de la esquina
 * @param {number} radius - Radio de la bola
 * @returns {Object|null} - { t, hitX, hitY, normalX, normalY } o null
 */
function sweepAgainstCorner(x0, y0, dx, dy, cornerX, cornerY, radius) {
    // Vector desde la esquina al punto inicial
    const fx = x0 - cornerX;
    const fy = y0 - cornerY;

    // Coeficientes de la ecuación cuadrática para intersección rayo-círculo
    const a = dx * dx + dy * dy;
    const b = 2 * (fx * dx + fy * dy);
    const c = fx * fx + fy * fy - radius * radius;

    if (Math.abs(a) < EPSILON) return null;

    const discriminant = b * b - 4 * a * c;

    if (discriminant < 0) return null;

    const sqrtDisc = Math.sqrt(discriminant);

    // Tomar la raíz más pequeña positiva
    let t = (-b - sqrtDisc) / (2 * a);

    if (t < EPSILON) {
        t = (-b + sqrtDisc) / (2 * a);
    }

    if (t < EPSILON || t > 1 + EPSILON) return null;

    const hitX = x0 + dx * t;
    const hitY = y0 + dy * t;

    // Normal apunta desde la esquina hacia el punto de impacto
    const nx = hitX - cornerX;
    const ny = hitY - cornerY;
    const len = Math.sqrt(nx * nx + ny * ny);

    if (len < EPSILON) return null;

    return {
        t: Math.max(0, t),
        hitX: hitX,
        hitY: hitY,
        normalX: nx / len,
        normalY: ny / len
    };
}

/**
 * Verifica colisión swept sphere contra un rectángulo (bloque)
 * Usa Minkowski sum: expande el rectángulo por el radio de la bola
 * y hace raycast contra el rectángulo expandido con esquinas redondeadas
 *
 * @param {number} x0 - Posición inicial X del centro de la bola
 * @param {number} y0 - Posición inicial Y del centro de la bola
 * @param {number} dx - Desplazamiento X
 * @param {number} dy - Desplazamiento Y
 * @param {number} radius - Radio de la bola
 * @param {number} rectX - Posición X del rectángulo
 * @param {number} rectY - Posición Y del rectángulo
 * @param {number} rectW - Ancho del rectángulo
 * @param {number} rectH - Alto del rectángulo
 * @returns {SweptCollisionResult|null}
 */
export function sweepSphereRect(x0, y0, dx, dy, radius, rectX, rectY, rectW, rectH) {
    // Bordes del rectángulo
    const left = rectX;
    const right = rectX + rectW;
    const top = rectY;
    const bottom = rectY + rectH;

    let bestCollision = null;
    let bestT = Infinity;

    // Verificar colisión con los 4 lados expandidos
    // Solo verificamos colisiones donde la bola se acerca al lado

    // Lado izquierdo (solo si la bola se mueve hacia la derecha)
    if (dx > EPSILON) {
        const collision = sweepAgainstSegment(x0, y0, dx, dy, top, bottom, left, true, radius);
        if (collision && collision.t < bestT) {
            bestT = collision.t;
            bestCollision = { ...collision, side: 'left' };
        }
    }

    // Lado derecho (solo si la bola se mueve hacia la izquierda)
    if (dx < -EPSILON) {
        const collision = sweepAgainstSegment(x0, y0, dx, dy, top, bottom, right, true, radius);
        if (collision && collision.t < bestT) {
            bestT = collision.t;
            bestCollision = { ...collision, side: 'right' };
        }
    }

    // Lado superior (solo si la bola se mueve hacia abajo)
    if (dy > EPSILON) {
        const collision = sweepAgainstSegment(x0, y0, dx, dy, left, right, top, false, radius);
        if (collision && collision.t < bestT) {
            bestT = collision.t;
            bestCollision = { ...collision, side: 'top' };
        }
    }

    // Lado inferior (solo si la bola se mueve hacia arriba)
    if (dy < -EPSILON) {
        const collision = sweepAgainstSegment(x0, y0, dx, dy, left, right, bottom, false, radius);
        if (collision && collision.t < bestT) {
            bestT = collision.t;
            bestCollision = { ...collision, side: 'bottom' };
        }
    }

    // Verificar colisión con las 4 esquinas (esquinas redondeadas del Minkowski sum)
    const corners = [
        { x: left, y: top, checkDx: 1, checkDy: 1 },    // Esquina superior izquierda
        { x: right, y: top, checkDx: -1, checkDy: 1 },   // Esquina superior derecha
        { x: left, y: bottom, checkDx: 1, checkDy: -1 }, // Esquina inferior izquierda
        { x: right, y: bottom, checkDx: -1, checkDy: -1 } // Esquina inferior derecha
    ];

    for (const corner of corners) {
        // Solo verificar esquinas donde la bola se aproxima en la dirección correcta
        if ((dx * corner.checkDx > 0 || Math.abs(dx) < EPSILON) &&
            (dy * corner.checkDy > 0 || Math.abs(dy) < EPSILON)) {

            const collision = sweepAgainstCorner(x0, y0, dx, dy, corner.x, corner.y, radius);

            if (collision && collision.t < bestT) {
                // Verificar que la colisión ocurre en la región de la esquina
                // (fuera de los lados extendidos del rectángulo)
                const hitX = collision.hitX;
                const hitY = collision.hitY;

                const inCornerRegion = (
                    (corner.x === left && hitX < left) ||
                    (corner.x === right && hitX > right)
                ) && (
                    (corner.y === top && hitY < top) ||
                    (corner.y === bottom && hitY > bottom)
                );

                if (inCornerRegion) {
                    bestT = collision.t;
                    bestCollision = { ...collision, side: 'corner' };
                }
            }
        }
    }

    return bestCollision;
}

/**
 * Verifica si un círculo está actualmente colisionando con un rectángulo
 * (detección instantánea, no swept)
 *
 * @param {number} cx - Centro X del círculo
 * @param {number} cy - Centro Y del círculo
 * @param {number} radius - Radio del círculo
 * @param {number} rectX - Posición X del rectángulo
 * @param {number} rectY - Posición Y del rectángulo
 * @param {number} rectW - Ancho del rectángulo
 * @param {number} rectH - Alto del rectángulo
 * @returns {boolean}
 */
export function circleRectOverlap(cx, cy, radius, rectX, rectY, rectW, rectH) {
    const closestX = Math.max(rectX, Math.min(cx, rectX + rectW));
    const closestY = Math.max(rectY, Math.min(cy, rectY + rectH));
    const dist = Math.hypot(cx - closestX, cy - closestY);
    return dist < radius;
}

/**
 * Calcula la velocidad reflejada dado un vector de velocidad y una normal
 * Usa reflexión perfecta: v' = v - 2(v·n)n
 *
 * @param {number} vx - Velocidad X
 * @param {number} vy - Velocidad Y
 * @param {number} nx - Normal X (normalizado)
 * @param {number} ny - Normal Y (normalizado)
 * @returns {{vx: number, vy: number}}
 */
export function reflectVelocity(vx, vy, nx, ny) {
    const dot = vx * nx + vy * ny;
    return {
        vx: vx - 2 * dot * nx,
        vy: vy - 2 * dot * ny
    };
}

/**
 * Encuentra la primera colisión de una bola moviéndose contra múltiples rectángulos
 *
 * @param {number} x - Posición X de la bola
 * @param {number} y - Posición Y de la bola
 * @param {number} vx - Velocidad X
 * @param {number} vy - Velocidad Y
 * @param {number} radius - Radio de la bola
 * @param {Array} bricks - Array de bloques [{x, y, width, height, hp, ...}]
 * @param {Object} bounds - Límites del área de juego {left, right, top, bottom}
 * @param {Set} [excludeBricks] - Set de bloques a excluir de la detección
 * @returns {SweptCollisionResult|null}
 */
export function findFirstCollision(x, y, vx, vy, radius, bricks, bounds, excludeBricks = null) {
    let bestCollision = null;
    let bestT = 1 + EPSILON; // 1 = fin del paso de tiempo

    // Verificar paredes
    // Pared izquierda
    if (vx < -EPSILON) {
        const t = (bounds.left + radius - x) / vx;
        if (t > EPSILON && t < bestT) {
            bestT = t;
            bestCollision = {
                t: t,
                hitX: x + vx * t,
                hitY: y + vy * t,
                normalX: 1,
                normalY: 0,
                side: 'wall-left',
                brick: null
            };
        }
    }

    // Pared derecha
    if (vx > EPSILON) {
        const t = (bounds.right - radius - x) / vx;
        if (t > EPSILON && t < bestT) {
            bestT = t;
            bestCollision = {
                t: t,
                hitX: x + vx * t,
                hitY: y + vy * t,
                normalX: -1,
                normalY: 0,
                side: 'wall-right',
                brick: null
            };
        }
    }

    // Techo
    if (vy < -EPSILON) {
        const t = (bounds.top + radius - y) / vy;
        if (t > EPSILON && t < bestT) {
            bestT = t;
            bestCollision = {
                t: t,
                hitX: x + vx * t,
                hitY: y + vy * t,
                normalX: 0,
                normalY: 1,
                side: 'wall-top',
                brick: null
            };
        }
    }

    // Verificar cada bloque
    for (const brick of bricks) {
        if (brick.hp <= 0) continue;

        // Excluir bloques que la bola está atravesando
        if (excludeBricks && excludeBricks.has(brick)) continue;

        // Los bloques tienen un offset de +2 para la colisión
        const collision = sweepSphereRect(
            x, y, vx, vy, radius,
            brick.x + 2, brick.y + 2, brick.width, brick.height
        );

        if (collision && collision.t < bestT) {
            bestT = collision.t;
            bestCollision = {
                ...collision,
                brick: brick
            };
        }
    }

    return bestCollision;
}

/**
 * Simula el movimiento de una bola con colisiones precisas
 * Devuelve una serie de puntos de trayectoria (útil para predicción)
 *
 * @param {number} startX - Posición inicial X
 * @param {number} startY - Posición inicial Y
 * @param {number} angle - Ángulo de disparo
 * @param {number} speed - Velocidad de la bola (usado para normalización)
 * @param {number} radius - Radio de la bola
 * @param {Array} bricks - Array de bloques
 * @param {Object} bounds - Límites del juego
 * @param {number} maxBounces - Máximo de rebotes a simular
 * @param {number} maxDistance - Máxima distancia a simular
 * @returns {Array<{x: number, y: number, isBounce: boolean}>}
 */
export function simulateTrajectory(startX, startY, angle, speed, radius, bricks, bounds, maxBounces = 5, maxDistance = 1200) {
    const points = [{ x: startX, y: startY, isBounce: false }];

    let x = startX;
    let y = startY;

    // Dirección normalizada
    let dirX = Math.cos(angle);
    let dirY = Math.sin(angle);

    // maxBounces = 0: la línea recorre todo el tramo hasta el primer
    // impacto y termina ahí, sin revelar hacia dónde rebota. isBounce
    // queda en false a propósito para no dibujar la marca de rebote.
    if (maxBounces <= 0) {
        const collision = findFirstCollision(
            x, y, dirX * maxDistance, dirY * maxDistance, radius, bricks, bounds
        );
        if (collision && collision.t <= 1) {
            points.push({ x: collision.hitX, y: collision.hitY, isBounce: false });
        } else {
            points.push({ x: x + dirX * maxDistance, y: y + dirY * maxDistance, isBounce: false });
        }
        return points;
    }

    let bounces = 0;
    let totalDistance = 0;

    // Número máximo de iteraciones para evitar bucles infinitos
    const maxIterations = 100;
    let iterations = 0;

    while (bounces < maxBounces && totalDistance < maxDistance && iterations < maxIterations) {
        iterations++;

        // Calcular la distancia restante que queremos simular
        const remainingDist = maxDistance - totalDistance;

        // Escalar la dirección para buscar colisiones en todo el tramo restante
        const searchVx = dirX * remainingDist;
        const searchVy = dirY * remainingDist;

        // Encontrar la primera colisión en este tramo
        const collision = findFirstCollision(x, y, searchVx, searchVy, radius, bricks, bounds);

        if (!collision || collision.t > 1) {
            // No hay colisión, extender la trayectoria hasta maxDistance
            const endX = x + dirX * remainingDist;
            const endY = y + dirY * remainingDist;

            points.push({ x: endX, y: endY, isBounce: false });
            break;
        }

        // Calcular la distancia real recorrida hasta la colisión
        const moveX = searchVx * collision.t;
        const moveY = searchVy * collision.t;
        const moveDist = Math.hypot(moveX, moveY);

        x = collision.hitX;
        y = collision.hitY;
        totalDistance += moveDist;

        points.push({ x: x, y: y, isBounce: true, side: collision.side });
        bounces++;

        // Reflejar la dirección usando la normal de la superficie
        // v' = v - 2(v·n)n
        const dot = dirX * collision.normalX + dirY * collision.normalY;
        dirX = dirX - 2 * dot * collision.normalX;
        dirY = dirY - 2 * dot * collision.normalY;

        // Renormalizar para evitar acumulación de errores
        const len = Math.hypot(dirX, dirY);
        if (len > EPSILON) {
            dirX /= len;
            dirY /= len;
        }

        // Pequeño empuje para evitar colisiones repetidas
        x += collision.normalX * 0.5;
        y += collision.normalY * 0.5;
    }

    // Si terminamos por iteraciones o rebotes, agregar punto final si el último es un rebote
    if (points.length > 0) {
        const lastPoint = points[points.length - 1];
        if (lastPoint.isBounce) {
            // Agregar extensión desde el último rebote
            const remainingDist = Math.min(100, maxDistance - totalDistance);
            if (remainingDist > 0) {
                points.push({
                    x: x + dirX * remainingDist,
                    y: y + dirY * remainingDist,
                    isBounce: false
                });
            }
        }
    }

    return points;
}

/**
 * Procesa un paso de física para una bola con CCD
 * Maneja múltiples colisiones en un solo frame si es necesario
 *
 * @param {Object} ball - Objeto de la bola
 * @param {number} radius - Radio de la bola
 * @param {Array} bricks - Array de bloques
 * @param {Object} bounds - Límites del juego
 * @param {Function} onBrickHit - Callback cuando golpea un bloque: (ball, brick, collision) => {shouldBounce, damage, passThrough}
 * @returns {{collisions: Array, newX: number, newY: number, newVx: number, newVy: number}}
 */
export function processPhysicsStep(ball, radius, bricks, bounds, onBrickHit) {
    const collisions = [];
    let x = ball.x;
    let y = ball.y;
    let vx = ball.vx;
    let vy = ball.vy;
    let remainingTime = 1.0;

    // Bloques que la bola está atravesando (para fireballs)
    const passThroughBricks = new Set();

    // Máximo de colisiones por frame para evitar bucles infinitos
    const maxCollisionsPerFrame = 10;
    let collisionCount = 0;

    while (remainingTime > EPSILON && collisionCount < maxCollisionsPerFrame) {
        // Escalar velocidad por tiempo restante
        const stepVx = vx * remainingTime;
        const stepVy = vy * remainingTime;

        const collision = findFirstCollision(x, y, stepVx, stepVy, radius, bricks, bounds, passThroughBricks);

        if (!collision || collision.t > 1 - EPSILON) {
            // No hay colisión, mover al destino final
            x += stepVx;
            y += stepVy;
            break;
        }

        let shouldBounce = true;
        let passThrough = false;

        // Si golpeó un bloque, notificar
        if (collision.brick) {
            const result = onBrickHit(ball, collision.brick, collision);
            shouldBounce = result.shouldBounce;
            passThrough = result.passThrough || false;
            collisions.push({
                brick: collision.brick,
                damage: result.damage,
                collision: collision
            });

            // Si la bola atraviesa este bloque, agregarlo a la lista de exclusión
            if (passThrough) {
                passThroughBricks.add(collision.brick);
            }
        } else {
            // Colisión con pared - siempre rebota
            collisions.push({
                brick: null,
                wall: collision.side,
                collision: collision
            });
        }

        // Si atraviesa, no actualizar posición ni consumir tiempo para esta colisión
        // La siguiente iteración encontrará la siguiente colisión (pared u otro bloque)
        if (passThrough) {
            collisionCount++;
            continue;
        }

        // Mover al punto de colisión
        x = collision.hitX;
        y = collision.hitY;

        // Consumir el tiempo usado
        remainingTime *= (1 - collision.t);

        // Aplicar rebote si corresponde
        if (shouldBounce) {
            const reflected = reflectVelocity(vx, vy, collision.normalX, collision.normalY);
            vx = reflected.vx;
            vy = reflected.vy;

            // Pequeño empuje para evitar quedarse atascado
            x += collision.normalX * 0.5;
            y += collision.normalY * 0.5;
        }

        collisionCount++;
    }

    return {
        collisions: collisions,
        newX: x,
        newY: y,
        newVx: vx,
        newVy: vy
    };
}

export default {
    sweepSphereRect,
    circleRectOverlap,
    reflectVelocity,
    findFirstCollision,
    simulateTrajectory,
    processPhysicsStep
};
