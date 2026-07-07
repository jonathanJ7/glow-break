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
// GOLD BRICK - Poco HP, da +1 bola al destruirlo
// ============================================
const GoldBrickBehavior = {
    type: 'gold',
    emoji: '🪙',
    overlayColor: 'rgba(251, 191, 36, 0.45)',

    render(ctx, brick, helpers) {
        const { getFontSize, getScale } = helpers;

        // Overlay dorado con brillo
        ctx.shadowColor = '#fbbf24';
        ctx.shadowBlur = 8;
        ctx.fillStyle = this.overlayColor;
        ctx.beginPath();
        ctx.roundRect(brick.x + 2, brick.y + 2, brick.width, brick.height, 6);
        ctx.fill();
        ctx.shadowBlur = 0;

        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.font = `${getFontSize(12)}px Arial`;
        ctx.textAlign = 'center';
        ctx.fillText(this.emoji, brick.x + 2 + brick.width / 2, brick.y + 15 * getScale());
    },

    onDestroy(brick, gameState, helpers) {
        const { createParticles, addBallsToInventory, addFloatingText } = helpers;
        const cx = brick.x + brick.width / 2;
        const cy = brick.y + brick.height / 2;

        createParticles(cx, cy, '#fbbf24', 14);
        addBallsToInventory('normal', 1);
        addFloatingText(cx, cy, '+1 🔵', { color: '#fbbf24', size: 16 });

        return null;
    },

    getConfig() {
        return {
            minTurn: 4,
            category: 'helpful',
            baseChance: 0.05,
            hpFactor: 0.5, // La mitad de HP: es un premio, no un obstáculo
            difficultyMultiplier: { easy: 1.0, medium: 1.0, hard: 1.2 },
        };
    }
};

// ============================================
// MYSTERY BRICK - Premio aleatorio al destruirlo
// ============================================
const MysteryBrickBehavior = {
    type: 'mystery',
    emoji: '🎁',
    overlayColor: 'rgba(236, 72, 153, 0.35)',

    render(ctx, brick, helpers) {
        const { getFontSize, getScale } = helpers;

        ctx.fillStyle = this.overlayColor;
        ctx.beginPath();
        ctx.roundRect(brick.x + 2, brick.y + 2, brick.width, brick.height, 6);
        ctx.fill();

        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.font = `${getFontSize(12)}px Arial`;
        ctx.textAlign = 'center';
        ctx.fillText(this.emoji, brick.x + 2 + brick.width / 2, brick.y + 15 * getScale());
    },

    onDestroy(brick, gameState, helpers) {
        const { createParticles, addBallsToInventory, addFloatingText, fireHorizontalLaser } = helpers;
        const cx = brick.x + brick.width / 2;
        const cy = brick.y + brick.height / 2;

        createParticles(cx, cy, '#ec4899', 14);

        // Ruleta de premios
        const rewards = [
            { weight: 3, apply: () => { addBallsToInventory('normal', 2); addFloatingText(cx, cy, '🎁 +2 🔵', { color: '#4ecca3', size: 16 }); } },
            { weight: 2, apply: () => { addBallsToInventory('fireball', 1); addFloatingText(cx, cy, '🎁 +1 🔥', { color: '#ff6b6b', size: 16 }); } },
            { weight: 2, apply: () => { addBallsToInventory('strength', 1); addFloatingText(cx, cy, '🎁 +1 💪', { color: '#ff8c00', size: 16 }); } },
            { weight: 1, apply: () => { addBallsToInventory('splitter', 1); addFloatingText(cx, cy, '🎁 +1 💥', { color: '#f9ed69', size: 16 }); } },
            { weight: 1, apply: () => { addBallsToInventory('bomb', 1); addFloatingText(cx, cy, '🎁 +1 💣', { color: '#f87171', size: 16 }); } },
            { weight: 2, apply: () => { fireHorizontalLaser(cy); addFloatingText(cx, cy, '🎁 ⚡ ¡LÁSER!', { color: '#3b82f6', size: 16 }); } },
        ];

        const totalWeight = rewards.reduce((sum, r) => sum + r.weight, 0);
        let roll = Math.random() * totalWeight;
        for (const reward of rewards) {
            roll -= reward.weight;
            if (roll <= 0) {
                reward.apply();
                break;
            }
        }

        return null;
    },

    getConfig() {
        return {
            minTurn: 6,
            category: 'helpful',
            baseChance: 0.04,
            hpFactor: 0.75,
            difficultyMultiplier: { easy: 1.0, medium: 1.0, hard: 1.25 },
        };
    }
};

// ============================================
// BOSS BRICK - Jefe de 3 columnas cada 15 turnos
// ============================================
const BossBrickBehavior = {
    type: 'boss',
    emoji: '👑',

    render(ctx, brick, helpers) {
        const { getFontSize, getScale } = helpers;

        // Aura pulsante
        const pulse = 0.5 + Math.sin(performance.now() * 0.004) * 0.3;
        ctx.shadowColor = '#e94560';
        ctx.shadowBlur = 18 * pulse;
        ctx.fillStyle = 'rgba(233, 69, 96, 0.35)';
        ctx.beginPath();
        ctx.roundRect(brick.x + 2, brick.y + 2, brick.width, brick.height, 6);
        ctx.fill();
        ctx.shadowBlur = 0;

        ctx.strokeStyle = `rgba(255, 215, 0, ${0.5 + pulse * 0.4})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(brick.x + 2, brick.y + 2, brick.width, brick.height, 6);
        ctx.stroke();

        // Corona
        ctx.fillStyle = 'rgba(255,255,255,0.95)';
        ctx.font = `${getFontSize(14)}px Arial`;
        ctx.textAlign = 'center';
        ctx.fillText(this.emoji, brick.x + 2 + brick.width / 2, brick.y + 15 * getScale());

        // Barra de vida sobre el jefe
        const barW = brick.width - 10;
        const barH = 4;
        const barX = brick.x + 7;
        const barY = brick.y - 4;
        const ratio = Math.max(0, brick.hp / brick.maxHp);
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(barX, barY, barW, barH);
        ctx.fillStyle = ratio > 0.5 ? '#4ecca3' : ratio > 0.25 ? '#f9ed69' : '#e94560';
        ctx.fillRect(barX, barY, barW * ratio, barH);
    },

    onDestroy(brick, gameState, helpers) {
        const { getCellSize, createParticles, addBallsToInventory, addShieldCharge, addFloatingText, addScreenShake } = helpers;
        const cellSize = getCellSize();
        const cx = brick.x + brick.width / 2;
        const cy = brick.y + brick.height / 2;

        // Fiesta de partículas + temblor
        createParticles(cx, cy, '#ffd700', 24);
        createParticles(cx, cy, '#e94560', 16);
        addScreenShake(10);

        // Botín: bolas, un escudo, y onda expansiva que daña a los vecinos
        addBallsToInventory('normal', 2);
        addShieldCharge();
        addFloatingText(cx, cy, '👑 ¡JEFE DERROTADO! +2🔵 +1🛡️', { color: '#ffd700', size: 20 });

        const shockRadius = cellSize * 3;
        const damagedBricks = [];
        for (const other of gameState.bricks) {
            if (other === brick) continue;
            const dist = Math.hypot(
                cx - (other.x + other.width / 2),
                cy - (other.y + other.height / 2)
            );
            if (dist < shockRadius) {
                damagedBricks.push({ brick: other, damage: Math.ceil(brick.maxHp * 0.3) });
            }
        }

        return { damagedBricks };
    },

    getConfig() {
        return {
            minTurn: 0,
            category: 'boss',
            baseChance: 0, // Nunca sale por azar: lo coloca generateNewRow en turnos de jefe
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
    .register('regenerator', RegeneratorBrickBehavior)
    .register('gold', GoldBrickBehavior)
    .register('mystery', MysteryBrickBehavior)
    .register('boss', BossBrickBehavior);

// Exportar para uso directo si es necesario
export {
    NormalBrickBehavior,
    ExplosiveBrickBehavior,
    ArmoredBrickBehavior,
    SpawnerBrickBehavior,
    RegeneratorBrickBehavior,
    GoldBrickBehavior,
    MysteryBrickBehavior,
    BossBrickBehavior
};

export default BrickRegistry;
