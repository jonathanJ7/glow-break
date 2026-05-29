/**
 * BrickBehaviors - Comportamientos para tipos de bloques
 *
 * Cada tipo de bloque define:
 * - render(ctx, brick, helpers): Cómo se dibuja
 * - onDestroy(brick, gameState, helpers): Qué pasa al destruirse
 * - onDamage(brick, damage, gameState): Modificador de daño recibido
 * - onTurnEnd(brick, gameState): Qué pasa al final del turno
 * - getConfig(): Configuración del tipo (turno mínimo, probabilidad, etc.)
 *
 * Principio Open/Closed: Para agregar un nuevo tipo de bloque,
 * simplemente crea un nuevo behavior y regístralo. No necesitas
 * modificar rendering.js, physics.js ni game.js.
 */

import { BrickRegistry } from '../core/Registry.js';

// ============================================
// BASE BEHAVIOR - Comportamiento por defecto
// ============================================
const NormalBrickBehavior = {
    type: 'normal',

    /**
     * Renderiza el bloque en el canvas
     */
    render(ctx, brick, helpers) {
        // Los bloques normales no tienen indicador especial
        // Solo se dibuja el bloque base (hecho en el renderer principal)
    },

    /**
     * Llamado cuando el bloque es destruido
     * @returns {object|null} Acciones a ejecutar (ej: { particles: [...], spawnBricks: [...] })
     */
    onDestroy(brick, gameState, helpers) {
        return null; // Sin efecto especial
    },

    /**
     * Modifica el daño recibido
     * @returns {number} Daño modificado
     */
    onDamage(brick, damage, gameState) {
        return damage; // Sin modificación
    },

    /**
     * Llamado al final de cada turno
     */
    onTurnEnd(brick, gameState) {
        // Sin efecto
    },

    /**
     * Configuración del tipo
     */
    getConfig() {
        return {
            minTurn: 0,
            category: 'normal',
            configKey: null
        };
    }
};

// ============================================
// EXPLOSIVE BRICK - Explota y daña adyacentes
// ============================================
const ExplosiveBrickBehavior = {
    type: 'explosive',
    emoji: '💥',
    overlayColor: 'rgba(255,100,100,0.3)',

    render(ctx, brick, helpers) {
        const { getFontSize, getScale } = helpers;

        // Overlay rojo
        ctx.fillStyle = this.overlayColor;
        ctx.beginPath();
        ctx.roundRect(brick.x + 2, brick.y + 2, brick.width, brick.height, 6);
        ctx.fill();

        // Emoji
        ctx.fillStyle = 'rgba(255,255,255,0.8)';
        ctx.font = `${getFontSize(12)}px Arial`;
        ctx.textAlign = 'center';
        ctx.fillText(this.emoji, brick.x + 2 + brick.width / 2, brick.y + 15 * getScale());
    },

    onDestroy(brick, gameState, helpers) {
        const { getCellSize, createParticles } = helpers;
        const cellSize = getCellSize();
        const centerX = brick.x + brick.width / 2;
        const centerY = brick.y + brick.height / 2;

        // Crear partículas de explosión
        createParticles(centerX, centerY, '#ff6b6b', 16);

        // Dañar bloques adyacentes
        const explosionRadius = cellSize * 1.5;
        const damagedBricks = [];

        for (const other of gameState.bricks) {
            if (other === brick) continue;
            const otherCenterX = other.x + other.width / 2;
            const otherCenterY = other.y + other.height / 2;
            const dist = Math.hypot(centerX - otherCenterX, centerY - otherCenterY);

            if (dist < explosionRadius) {
                const damage = brick.maxHp;
                damagedBricks.push({ brick: other, damage });
            }
        }

        return { damagedBricks };
    },

    onDamage(brick, damage, gameState) {
        return damage;
    },

    onTurnEnd(brick, gameState) {
        // Sin efecto
    },

    getConfig() {
        return {
            minTurn: 3,
            category: 'helpful',
            baseChance: 0.06,
            difficultyMultiplier: { easy: 1.0, medium: 1.3333, hard: 0.6667 },
        };
    }
};

// ============================================
// ARMORED BRICK - Recibe 50% menos daño
// ============================================
const ArmoredBrickBehavior = {
    type: 'armored',
    damageReduction: 0.5,

    render(ctx, brick, helpers) {
        // Borde interno grueso
        ctx.strokeStyle = 'rgba(255,255,255,0.5)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.roundRect(brick.x + 5, brick.y + 5, brick.width - 6, brick.height - 6, 4);
        ctx.stroke();
    },

    onDestroy(brick, gameState, helpers) {
        return null;
    },

    onDamage(brick, damage, gameState) {
        return damage * this.damageReduction;
    },

    onTurnEnd(brick, gameState) {
        // Sin efecto
    },

    getConfig() {
        return {
            minTurn: 5,
            category: 'challenging',
            baseChance: 0.015,
            difficultyMultiplier: { easy: 1.0, medium: 3.3333, hard: 6.6667 },
        };
    }
};

// ============================================
// SPAWNER BRICK - Genera bloques al destruirse
// ============================================
const SpawnerBrickBehavior = {
    type: 'spawner',
    emoji: '👾',
    overlayColor: 'rgba(168, 85, 247, 0.3)',

    render(ctx, brick, helpers) {
        const { getFontSize, getScale } = helpers;

        // Overlay morado
        ctx.fillStyle = this.overlayColor;
        ctx.beginPath();
        ctx.roundRect(brick.x + 2, brick.y + 2, brick.width, brick.height, 6);
        ctx.fill();

        // Emoji
        ctx.fillStyle = 'rgba(255,255,255,0.8)';
        ctx.font = `${getFontSize(12)}px Arial`;
        ctx.textAlign = 'center';
        ctx.fillText(this.emoji, brick.x + 2 + brick.width / 2, brick.y + 15 * getScale());
    },

    onDestroy(brick, gameState, helpers) {
        const { getCellSize, getLeftBorder, COLS, createParticles } = helpers;
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
                    nearbyPositions.push({ col: newCol, x: newX, y: newY });
                }
            }
        }

        const spawnedBricks = [];
        for (let i = 0; i < Math.min(spawnCount, nearbyPositions.length); i++) {
            const idx = Math.floor(Math.random() * nearbyPositions.length);
            const pos = nearbyPositions[idx];
            nearbyPositions.splice(idx, 1);

            const hp = Math.floor(brick.maxHp * 0.5);
            spawnedBricks.push({
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

        return { spawnedBricks };
    },

    onDamage(brick, damage, gameState) {
        return damage;
    },

    onTurnEnd(brick, gameState) {
        // Sin efecto
    },

    getConfig() {
        return {
            minTurn: 8,
            category: 'challenging',
            baseChance: 0.08,
            difficultyMultiplier: { easy: 1.0, medium: 1.25, hard: 1.5 },
        };
    }
};

// ============================================
// REGENERATOR BRICK - Se regenera cada turno
// ============================================
const RegeneratorBrickBehavior = {
    type: 'regenerator',
    emoji: '💚',
    overlayColor: 'rgba(34, 197, 94, 0.3)',
    healRatio: 0.9,

    render(ctx, brick, helpers) {
        const { getFontSize, getScale } = helpers;

        // Overlay verde
        ctx.fillStyle = this.overlayColor;
        ctx.beginPath();
        ctx.roundRect(brick.x + 2, brick.y + 2, brick.width, brick.height, 6);
        ctx.fill();

        // Emoji
        ctx.fillStyle = 'rgba(255,255,255,0.8)';
        ctx.font = `${getFontSize(12)}px Arial`;
        ctx.textAlign = 'center';
        ctx.fillText(this.emoji, brick.x + 2 + brick.width / 2, brick.y + 15 * getScale());
    },

    onDestroy(brick, gameState, helpers) {
        return null;
    },

    onDamage(brick, damage, gameState) {
        return damage;
    },

    onTurnStart(brick, gameState) {
        // Guardar HP al inicio del turno para regeneración
        brick.turnStartHp = brick.hp;
    },

    onTurnEnd(brick, gameState) {
        // Curar al 90% del HP que tenía al inicio del turno
        if (brick.hp > 0 && brick.turnStartHp) {
            const healTarget = Math.floor(brick.turnStartHp * this.healRatio);
            if (brick.hp < healTarget) {
                brick.hp = healTarget;
            }
        }
    },

    getConfig() {
        return {
            minTurn: 6,
            category: 'challenging',
            baseChance: 0.06,
            difficultyMultiplier: { easy: 1.0, medium: 1.6667, hard: 2.6667 },
        };
    }
};

// ============================================
// REGISTRO DE TODOS LOS TIPOS
// ============================================
BrickRegistry
    .setDefault('normal')
    .register('normal', NormalBrickBehavior)
    .register('explosive', ExplosiveBrickBehavior)
    .register('armored', ArmoredBrickBehavior)
    .register('spawner', SpawnerBrickBehavior)
    .register('regenerator', RegeneratorBrickBehavior);

// Exportar para uso directo si es necesario
export {
    NormalBrickBehavior,
    ExplosiveBrickBehavior,
    ArmoredBrickBehavior,
    SpawnerBrickBehavior,
    RegeneratorBrickBehavior,
    MovingBrickBehavior
};

export default BrickRegistry;
