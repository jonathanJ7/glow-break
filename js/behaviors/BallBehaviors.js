/**
 * BallBehaviors - Comportamientos para tipos de bolas
 *
 * Cada tipo de bola define:
 * - render(ctx, ball, helpers): Cómo se dibuja
 * - onCollision(ball, brick, gameState, helpers): Qué pasa al colisionar
 * - createBall(x, y, vx, vy): Crea una instancia de la bola con sus propiedades
 * - getConfig(): Configuración del tipo
 * - aimScatter (opcional): { chance, maxDegrees } — cuánto se desvía del
 *   ángulo apuntado en las dificultades con `assists.aimScatter`. Si no
 *   se declara se usa DEFAULT_AIM_SCATTER (ver config.js).
 *
 * Principio Open/Closed: Para agregar un nuevo tipo de bola,
 * simplemente crea un nuevo behavior y regístralo.
 */

import { BallRegistry } from '../core/Registry.js';
import { circleRectOverlap } from '../systems/CollisionSystem.js';

// ============================================
// NORMAL BALL - Bola básica
// ============================================
const NormalBallBehavior = {
    type: 'normal',
    displayName: 'Bola normal',
    color: '#fff',
    glowColor: null,
    damage: 1,
    // La más liviana: es la que menos se desvía.
    aimScatter: { chance: 0.20, maxDegrees: 4 },

    describe() {
        return `Hace ${this.damage} de daño por golpe y rebota. Es la munición base: `
            + 'consigues más con los bonus verdes "+N" y con las recompensas de combo.';
    },

    render(ctx, ball, helpers) {
        const { getBallRadius } = helpers;
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(ball.x, ball.y, getBallRadius(), 0, Math.PI * 2);
        ctx.fill();
    },

    /**
     * Maneja la colisión con un bloque
     *
     * NOTA: El rebote físico (cambio de velocidad y posición) es manejado
     * por el sistema CCD (CollisionSystem). Este método solo debe:
     * - Indicar si debe rebotar (bounce: true/false)
     * - Indicar el daño
     * - Crear efectos visuales (partículas)
     *
     * @returns {object} { bounce: boolean, damage: number, continueChecking: boolean }
     */
    onCollision(ball, brick, gameState, helpers) {
        const { getBrickColor, createParticles, speedMultiplier } = helpers;

        // Crear partículas de impacto (solo en velocidad normal para rendimiento)
        if (speedMultiplier === 1) {
            createParticles(ball.x, ball.y, getBrickColor(brick.hp, brick.maxHp), 3);
        }

        return {
            bounce: true,
            damage: this.damage,
            continueChecking: false
        };
    },

    createBall(x, y, vx, vy) {
        return {
            x, y, vx, vy,
            active: true,
            hasGoneUp: false,
            ballType: 'normal',
            damage: this.damage,
            lifetime: 0,
            state: {},
        };
    },

    getConfig() {
        return {
            minTurn: 0,
            inventoryKey: 'normal',
            shootPriority: 10,
        };
    }
};

// ============================================
// FIREBALL - Atraviesa bloques
// ============================================
const FireballBehavior = {
    type: 'fireball',
    displayName: 'Bola de fuego',
    color: '#ff6b6b',
    glowColor: '#ff6b6b',
    damage: 1,
    aimScatter: { chance: 0.25, maxDegrees: 5 },
    icon: '🔥',
    bgColor: 'rgba(255, 107, 107, 0.8)',
    textColor: 'white',
    showInInventoryHud: true,

    describe() {
        return `Atraviesa los bloques en lugar de rebotar, haciendo ${this.damage} de daño a cada uno. `
            + 'Daña cada bloque una sola vez mientras lo cruza; si sale y vuelve a entrar '
            + '(por rebote en una pared), lo daña de nuevo. Solo rebota contra paredes y techo.';
    },

    render(ctx, ball, helpers) {
        const { getBallRadius } = helpers;

        ctx.shadowColor = this.glowColor;
        ctx.shadowBlur = 8;
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(ball.x, ball.y, getBallRadius(), 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
    },

    onCollision(ball, brick, gameState, helpers) {
        const { getBrickColor, createParticles, speedMultiplier } = helpers;
        const brickId = `${brick.x},${brick.y}`;

        // Fireball atraviesa: nunca rebota, daña una sola vez por brick.
        if (!ball.state.hitBricks.has(brickId)) {
            ball.state.hitBricks.add(brickId);

            if (speedMultiplier === 1) {
                createParticles(ball.x, ball.y, getBrickColor(brick.hp, brick.maxHp), 3);
            }

            return {
                bounce: false,
                damage: this.damage,
                continueChecking: true,
                passThrough: true,
            };
        }

        return {
            bounce: false,
            damage: 0,
            continueChecking: true,
            passThrough: true,
        };
    },

    // Cleanup post-step: olvidar bricks que la bola dejo de tocar.
    // Antes esta logica vivia en physics.js como un caso especial.
    onPostStep(ball, gameState, helpers) {
        const { getBallRadius } = helpers;
        const radius = getBallRadius();
        for (const brickId of ball.state.hitBricks) {
            const [bx, by] = brickId.split(',').map(Number);
            const brick = gameState.bricks.find(b => b.x === bx && b.y === by);
            if (brick && !circleRectOverlap(
                ball.x, ball.y, radius,
                brick.x + 2, brick.y + 2, brick.width, brick.height
            )) {
                ball.state.hitBricks.delete(brickId);
            }
        }
    },

    createBall(x, y, vx, vy) {
        return {
            x, y, vx, vy,
            active: true,
            hasGoneUp: false,
            ballType: 'fireball',
            damage: this.damage,
            lifetime: 0,
            state: { hitBricks: new Set() },
        };
    },

    getConfig() {
        return {
            minTurn: 8,
            inventoryKey: 'fireball',
            bonusType: 'fireballBall',
            shootPriority: 20,
            startingShare: 0.15,
        };
    }
};

// ============================================
// SPLITTER - Se divide en 2 bolas al 5to impacto
// ============================================
const SplitterBehavior = {
    type: 'splitter',
    displayName: 'Bola divisora',
    color: '#f9ed69',
    glowColor: '#f9ed69',
    damage: 1,
    splitCount: 2,
    hitsToSplit: 5,
    splitAngles: [-Math.PI / 6, Math.PI / 6],
    // Inestable de fábrica: se va de mano más seguido.
    aimScatter: { chance: 0.30, maxDegrees: 6 },
    icon: '💥',
    bgColor: 'rgba(249, 237, 105, 0.8)',
    textColor: '#333',
    showInInventoryHud: true,

    describe() {
        const deg = Math.round(this.splitAngles[1] * 180 / Math.PI);
        return `Rebota haciendo ${this.damage} de daño. En su impacto número ${this.hitsToSplit} `
            + `contra un bloque desaparece y se divide en ${this.splitAngles.length} bolas divisoras `
            + `(a ±${deg}° de su dirección), cada una con el contador de impactos en 0 — `
            + 'así que cada hija también puede dividirse. En un buen turno una sola divisora se multiplica varias veces.';
    },

    render(ctx, ball, helpers) {
        const { getBallRadius } = helpers;

        ctx.shadowColor = this.glowColor;
        ctx.shadowBlur = 8;
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(ball.x, ball.y, getBallRadius(), 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
    },

    onCollision(ball, brick, gameState, helpers) {
        const { createParticles, getBrickColor, speedMultiplier } = helpers;

        // Incrementar contador de impactos
        ball.state.hitCount += 1;

        if (ball.state.hitCount >= this.hitsToSplit) {
            // Dividirse en 2 bolas splitter
            ball.active = false;

            const speed = Math.hypot(ball.vx, ball.vy);
            const currentAngle = Math.atan2(ball.vy, ball.vx);

            const newBalls = this.splitAngles.map(offset => {
                const newAngle = currentAngle + offset;
                return SplitterBehavior.createBall(
                    ball.x,
                    ball.y,
                    Math.cos(newAngle) * speed,
                    Math.sin(newAngle) * speed
                );
            });

            // Heredar hasGoneUp
            newBalls.forEach(b => b.hasGoneUp = ball.hasGoneUp);

            createParticles(ball.x, ball.y, this.color, 12);

            return {
                bounce: false,
                damage: this.damage,
                continueChecking: false,
                spawnBalls: newBalls,
                ballLanded: true
            };
        }

        // Antes del 5to impacto, comportarse como bola normal (rebota)
        if (speedMultiplier === 1) {
            createParticles(ball.x, ball.y, getBrickColor(brick.hp, brick.maxHp), 3);
        }

        return {
            bounce: true,
            damage: this.damage,
            continueChecking: false
        };
    },

    createBall(x, y, vx, vy) {
        return {
            x, y, vx, vy,
            active: true,
            hasGoneUp: false,
            ballType: 'splitter',
            damage: this.damage,
            lifetime: 0,
            state: { hitCount: 0 },
        };
    },

    getConfig() {
        return {
            minTurn: 15,
            inventoryKey: 'splitter',
            bonusType: 'splitterBall',
            shootPriority: 30,
            startingShare: 0.10,
        };
    }
};

// ============================================
// STRENGTH - Daño aumentado (+2)
// ============================================
const StrengthBallBehavior = {
    type: 'strength',
    displayName: 'Bola de fuerza',
    color: '#ff8c00',
    glowColor: '#ff8c00',
    damage: 3,
    // Pesada: cuesta más mantenerla en línea.
    aimScatter: { chance: 0.30, maxDegrees: 6 },
    icon: '💪',
    bgColor: 'rgba(255, 140, 0, 0.8)',
    textColor: 'white',
    showInInventoryHud: true,

    describe() {
        return `Igual que la bola normal pero hace ${this.damage} de daño por golpe.`;
    },

    render(ctx, ball, helpers) {
        const { getBallRadius } = helpers;

        ctx.shadowColor = this.glowColor;
        ctx.shadowBlur = 8;
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(ball.x, ball.y, getBallRadius(), 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
    },

    onCollision(ball, brick, gameState, helpers) {
        // Usa la lógica de rebote normal pero con más daño
        const result = NormalBallBehavior.onCollision(ball, brick, gameState, helpers);
        result.damage = this.damage;
        return result;
    },

    createBall(x, y, vx, vy) {
        return {
            x, y, vx, vy,
            active: true,
            hasGoneUp: false,
            ballType: 'strength',
            damage: this.damage,
            lifetime: 0,
            state: {},
        };
    },

    getConfig() {
        return {
            minTurn: 0,
            inventoryKey: 'strength',
            bonusType: 'strength',
            shootPriority: 40,
        };
    }
};

// ============================================
// BOMB - Daño en área cada vez que recarga la mecha
// ============================================
const BombBallBehavior = {
    type: 'bomb',
    displayName: 'Bola bomba',
    color: '#f87171',
    glowColor: '#fb923c',
    damage: 2,
    aoeRadiusCells: 1.5,
    aoeMaxHpRatio: 0.15,
    hitsPerFuse: 3,
    fuseWear: 1,
    // La más pesada de todas: la que peor puntería tiene.
    aimScatter: { chance: 0.35, maxDegrees: 7 },
    icon: '💣',
    bgColor: 'rgba(248, 113, 113, 0.8)',
    textColor: 'white',
    showInInventoryHud: true,

    describe() {
        return `Hace ${this.damage} de daño al bloque golpeado y rebota. Tiene una mecha que se desgasta: `
            + `la primera onda necesita ${this.hitsPerFuse} impactos, y cada detonación encarece la siguiente `
            + `mecha en ${this.fuseWear} impacto más (${this.hitsPerFuse}, ${this.hitsPerFuse + this.fuseWear}, `
            + `${this.hitsPerFuse + this.fuseWear * 2}…). La onda daña a todos los bloques a menos de `
            + `${this.aoeRadiusCells} celdas con el ${Math.round(this.aoeMaxHpRatio * 100)}% del HP máximo del `
            + 'bloque golpeado (mínimo 1). Así no explota en cada rebote, aunque tengas varias en pantalla a la vez. '
            + 'El daño de la onda escala con el HP de los bloques, así que sigue siendo útil en turnos altos.';
    },

    render(ctx, ball, helpers) {
        const { getBallRadius } = helpers;

        ctx.shadowColor = this.glowColor;
        ctx.shadowBlur = 10;
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(ball.x, ball.y, getBallRadius(), 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        // Mecha: parpadea más rápido cuanto más cerca está de detonar
        const fuseCost = ball.state.fuseCost || this.hitsPerFuse;
        const fuseProgress = (ball.state.hitsSinceFuse || 0) / fuseCost;
        const blinkSpeed = 0.015 + fuseProgress * 0.05;
        const spark = Math.sin(performance.now() * blinkSpeed) > 0;
        if (spark) {
            ctx.fillStyle = '#fbbf24';
            ctx.beginPath();
            ctx.arc(ball.x, ball.y - getBallRadius() * 0.7, getBallRadius() * 0.3, 0, Math.PI * 2);
            ctx.fill();
        }
    },

    onCollision(ball, brick, gameState, helpers) {
        const { getCellSize, createParticles, addScreenShake, addFloatingText, speedMultiplier } = helpers;
        const cx = brick.x + brick.width / 2;
        const cy = brick.y + brick.height / 2;

        // La onda expansiva solo detona cuando la mecha termina de recargar,
        // no en cada rebote — así varias bombas en pantalla no acumulan
        // ondas sin límite. Además la mecha se desgasta: cada detonación
        // encarece la siguiente en fuseWear impactos (3, 4, 5…).
        const fuseCost = ball.state.fuseCost || this.hitsPerFuse;
        ball.state.hitsSinceFuse = (ball.state.hitsSinceFuse || 0) + 1;
        const damagedBricks = [];
        const detonates = ball.state.hitsSinceFuse >= fuseCost;

        if (detonates) {
            ball.state.hitsSinceFuse = 0;
            ball.state.fuseCost = fuseCost + this.fuseWear;

            const cellSize = getCellSize();
            const aoeDamage = Math.max(1, Math.ceil(brick.maxHp * this.aoeMaxHpRatio));
            const aoeRadius = cellSize * this.aoeRadiusCells;

            for (const other of gameState.bricks) {
                if (other === brick) continue;
                const dist = Math.hypot(
                    cx - (other.x + other.width / 2),
                    cy - (other.y + other.height / 2)
                );
                if (dist < aoeRadius) {
                    damagedBricks.push({ brick: other, damage: aoeDamage });
                }
            }

            if (speedMultiplier === 1) {
                createParticles(cx, cy, '#fbbf24', 24);
                createParticles(cx, cy, '#f87171', 12);
                addScreenShake(5);
                addFloatingText(cx, cy, '💥', { color: '#fbbf24', size: 20 });
            }
        } else if (speedMultiplier === 1) {
            // Impacto sin detonar: solo unas chispas tenues de la mecha,
            // bien distintas de la explosión real.
            createParticles(cx, cy, '#9ca3af', 3);
        }

        return {
            bounce: true,
            damage: this.damage,
            continueChecking: false,
            damagedBricks
        };
    },

    createBall(x, y, vx, vy) {
        return {
            x, y, vx, vy,
            active: true,
            hasGoneUp: false,
            ballType: 'bomb',
            damage: this.damage,
            lifetime: 0,
            state: { hitsSinceFuse: 0, fuseCost: this.hitsPerFuse },
        };
    },

    getConfig() {
        return {
            minTurn: 12,
            inventoryKey: 'bomb',
            bonusType: 'bombBall',
            shootPriority: 25,
        };
    }
};

// ============================================
// REGISTRO DE TODOS LOS TIPOS
// ============================================
BallRegistry
    .setDefault('normal')
    .register('normal', NormalBallBehavior)
    .register('fireball', FireballBehavior)
    .register('splitter', SplitterBehavior)
    .register('strength', StrengthBallBehavior)
    .register('bomb', BombBallBehavior);

// Exportar para uso directo
export {
    NormalBallBehavior,
    FireballBehavior,
    SplitterBehavior,
    StrengthBallBehavior,
    BombBallBehavior
};

export default BallRegistry;
