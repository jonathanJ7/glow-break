/**
 * WeakSpots - Zona débil de los bloques.
 *
 * Todos los bloques (jefes incluidos) tienen una cara débil, `brick.weakSide`
 * ('left' | 'right' | 'top' | 'bottom'), elegida al azar al nacer con los
 * pesos de WEAK_SPOT.sideWeights. Un golpe de BOLA que toque esa cara (una
 * esquina cuenta para sus dos caras) hace ×WEAK_SPOT.multiplier de daño; el
 * daño de área (bomba, explosión, láser) nunca.
 *
 * Es una mecánica del motor, no un tipo de bloque: la aplica
 * physics.damageBrick (después del onDamage del tipo) y la dibuja
 * rendering.drawBrick. Los tipos no necesitan saber nada.
 */

import { WEAK_SPOT } from '../../config.js';

export const WEAK_FACES = ['left', 'right', 'top', 'bottom'];

/** Cara débil al azar según los pesos. */
export function rollWeakSide(random = Math.random) {
    const entries = Object.entries(WEAK_SPOT.sideWeights);
    const total = entries.reduce((sum, [, w]) => sum + w, 0);
    let roll = random() * total;
    for (const [side, w] of entries) {
        roll -= w;
        if (roll < 0) return side;
    }
    return entries[entries.length - 1][0];
}

/** Asigna cara débil si el bloque no tiene una válida (bloques nuevos, guardados viejos). */
export function ensureWeakSide(brick) {
    if (!WEAK_FACES.includes(brick.weakSide)) brick.weakSide = rollWeakSide();
    return brick;
}

/** ¿Este golpe le da a la zona débil? */
export function hitsWeakSpot(brick, source, hitFaces) {
    return source === 'ball'
        && !!brick.weakSide
        && Array.isArray(hitFaces)
        && hitFaces.includes(brick.weakSide);
}

/**
 * Aplica el multiplicador de zona débil. Con helpers, muestra el feedback
 * (partículas + "🎯×3") sobre la cara golpeada.
 */
export function applyWeakSpot(brick, damage, source, hitFaces, helpers) {
    if (!hitsWeakSpot(brick, source, hitFaces)) return damage;
    if (helpers) {
        const cx = brick.x + brick.width / 2;
        const cy = brick.y + brick.height / 2;
        const side = brick.weakSide;
        const fx = cx + (side === 'left' ? -brick.width / 2 : side === 'right' ? brick.width / 2 : 0);
        const fy = cy + (side === 'top' ? -brick.height / 2 : side === 'bottom' ? brick.height / 2 : 0);
        helpers.createParticles(fx, fy, WEAK_SPOT.color, 4);
        helpers.addFloatingText(fx, fy, `🎯×${WEAK_SPOT.multiplier}`, { color: WEAK_SPOT.color, size: 13 });
    }
    return damage * WEAK_SPOT.multiplier;
}

/**
 * Dibuja la barra celeste sobre la cara débil. Si un vecino tapa esa cara
 * (rect.exposed), la barra se ve apagada.
 */
export function drawWeakSpot(ctx, brick, rect, scale) {
    const side = brick.weakSide;
    if (!side) return;
    const exposed = rect.exposed ? rect.exposed[side] !== false : true;

    const thick = Math.max(3, 4 * scale);
    const inset = 2;
    const horizontal = side === 'top' || side === 'bottom';
    // En bloques anchos (jefe) la barra no ocupa todo el largo
    const span = Math.min((horizontal ? rect.width : rect.height) * 0.7, rect.height * 0.7 * (horizontal ? 2 : 1));
    let x, y, w, h;
    if (horizontal) {
        w = span;
        h = thick;
        x = rect.centerX - span / 2;
        y = side === 'top' ? rect.y + inset : rect.y + rect.height - inset - thick;
    } else {
        w = thick;
        h = span;
        y = rect.centerY - span / 2;
        x = side === 'left' ? rect.x + inset : rect.x + rect.width - inset - thick;
    }

    ctx.save();
    ctx.globalAlpha = exposed ? 1 : 0.3;
    if (exposed) {
        ctx.shadowColor = WEAK_SPOT.color;
        ctx.shadowBlur = 8;
    }
    ctx.fillStyle = WEAK_SPOT.color;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, thick / 2);
    ctx.fill();
    ctx.restore();
}

/** Texto para la guía, con los números exactos de config. */
export function describeWeakSpot() {
    const names = { left: 'izquierda', right: 'derecha', top: 'de arriba', bottom: 'de abajo' };
    const entries = Object.entries(WEAK_SPOT.sideWeights);
    const total = entries.reduce((a, [, w]) => a + w, 0);
    const odds = entries.map(([s, w]) => `${names[s]} ${Math.round((w / total) * 100)}%`).join(', ');
    return `Todos los bloques (jefes incluidos) tienen una cara débil marcada con una barra celeste. `
        + `Cada golpe de bola en esa cara hace ×${WEAK_SPOT.multiplier} de daño (un golpe en una esquina `
        + `cuenta para sus dos caras). Las otras caras y el daño de área (bombas, explosiones, láser) `
        + `hacen el daño normal. La cara se elige al azar al nacer (${odds}); si un vecino la tapa, `
        + `la barra se ve apagada y hay que romper al vecino primero. La niebla también la oculta.`;
}
