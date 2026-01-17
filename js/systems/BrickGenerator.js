/**
 * BrickGenerator System
 * Genera bloques, bonuses y powerups
 * Principio: Single Responsibility - Solo se encarga de la generación procedural
 *
 * FIX CRÍTICO: Corrige la lógica de generación de spawners para que funcionen en TODAS las dificultades
 */

import { GAME_CONSTANTS } from '../core/Constants.js';
import { Brick } from '../entities/Brick.js';
import { Bonus, Powerup } from '../entities/Bonus.js';

export class BrickGenerator {
    constructor(difficultyManager, canvasUtils) {
        this.difficultyManager = difficultyManager;
        this.canvasUtils = canvasUtils;
    }

    /**
     * Genera una nueva fila de bloques
     * FIX: La lógica de spawners ahora funciona correctamente en todas las dificultades
     */
    generateNewRow(turn, cols) {
        const config = this.difficultyManager.getConfig();
        const { cellSize, topOffset, leftBorder } = this.canvasUtils.getGridDimensions();

        const bricks = [];
        const bonuses = [];
        const powerups = [];

        // Calcula HP base con multiplicador de dificultad
        const baseHP = Math.floor(turn * (1 + Math.log(turn + 1) * 0.25) * config.hpMultiplier);

        // Densidad aumenta con los turnos
        const density = Math.min(config.densityBase + turn * config.densityGrowth, config.maxDensity);

        // Verifica si es fila reforzada (solo modo difícil)
        const isReinforcedRow = this.difficultyManager.shouldReinforceRow(turn);
        const rowHpMultiplier = isReinforcedRow ? 2.0 : 1.0;

        let bonusPlaced = false;
        let powerupPlaced = false;

        // Genera elementos de la fila
        for (let col = 0; col < cols; col++) {
            const rand = Math.random();

            if (rand < density) {
                // Crear bloque
                const brick = this._createBrick(col, cellSize, leftBorder, topOffset, baseHP, config, rowHpMultiplier, turn);
                bricks.push(brick);
            } else if (rand < density + config.bonusChance && !bonusPlaced) {
                // Crear bonus de bolas
                const bonus = this._createBonus(col, cellSize, leftBorder, topOffset, config, turn);
                bonuses.push(bonus);
                bonusPlaced = true;
            } else if (rand < density + config.bonusChance + config.powerupChance && !powerupPlaced && turn > 3) {
                // Crear powerup
                const powerup = this._createPowerup(col, cellSize, leftBorder, topOffset);
                powerups.push(powerup);
                powerupPlaced = true;
            }
        }

        // Garantiza al menos un bonus cada ciertos turnos
        if (!bonusPlaced) {
            const guaranteedBonusChance = this._getGuaranteedBonusChance();
            if (Math.random() < guaranteedBonusChance) {
                const emptyCol = this._findEmptyColumn(bricks, cols);
                if (emptyCol !== -1) {
                    const bonus = this._createBonus(emptyCol, cellSize, leftBorder, topOffset, config, turn);
                    bonuses.push(bonus);
                }
            }
        }

        return { bricks, bonuses, powerups };
    }

    /**
     * Crea un bloque con el tipo apropiado
     * FIX CRÍTICO: Corrige la lógica de asignación de tipos especiales
     */
    _createBrick(col, cellSize, leftBorder, topOffset, baseHP, config, rowHpMultiplier, turn) {
        const hpVariation = config.hpVariationMin + Math.random() * (config.hpVariationMax - config.hpVariationMin);
        const hp = Math.max(1, Math.floor(baseHP * hpVariation * rowHpMultiplier));

        // FIX: Lógica correcta de tipos especiales
        // La probabilidad se divide en rangos NO superpuestos
        const type = this._determineBrickType(config, turn);

        return new Brick(
            leftBorder + col * cellSize,
            topOffset,
            cellSize - 4,
            cellSize - 4,
            hp,
            col,
            type
        );
    }

    /**
     * Calcula las probabilidades de bloques especiales basadas en el turno
     * Las probabilidades aumentan progresivamente para hacer el juego más desafiante
     */
    _calculateSpecialProbabilities(config, turn) {
        const growthRate = config.specialGrowthRate || 0.003;

        // Calcula el incremento basado en el turno
        const turnBonus = Math.min(turn * growthRate, 0.25); // Max 25% adicional

        return {
            explosive: Math.min(config.explosiveChance + turnBonus, 0.35),      // Max 35%
            armored: Math.min(config.armoredChance + turnBonus, 0.45),          // Max 45%
            spawner: Math.min(config.poisonBrickChance + turnBonus * 0.8, 0.25) // Max 25%
        };
    }

    /**
     * Determina el tipo de bloque basado en probabilidades
     * NUEVO: Las probabilidades de bloques especiales aumentan con los turnos
     *
     * Cómo funciona:
     * - Las probabilidades BASE están en Config.js (reducidas)
     * - Con cada turno, las probabilidades aumentan según specialGrowthRate
     * - Esto hace que la dificultad aumente por más bloques especiales, no por más densidad
     */
    _determineBrickType(config, turn) {
        const { BRICK_TYPES, BRICK_GENERATION_TURNS } = GAME_CONSTANTS;
        const specialRoll = Math.random();

        // Calcula probabilidades dinámicas basadas en el turno
        const probabilities = this._calculateSpecialProbabilities(config, turn);

        let cumulativeProbability = 0;

        // Explosive: [0, explosiveChance)
        if (turn > BRICK_GENERATION_TURNS.EXPLOSIVE_MIN_TURN) {
            const explosiveThreshold = cumulativeProbability + probabilities.explosive;
            if (specialRoll >= cumulativeProbability && specialRoll < explosiveThreshold) {
                return BRICK_TYPES.EXPLOSIVE;
            }
            cumulativeProbability = explosiveThreshold;
        }

        // Armored: [explosiveChance, explosiveChance + armoredChance)
        if (turn > BRICK_GENERATION_TURNS.ARMORED_MIN_TURN) {
            const armoredThreshold = cumulativeProbability + probabilities.armored;
            if (specialRoll >= cumulativeProbability && specialRoll < armoredThreshold) {
                return BRICK_TYPES.ARMORED;
            }
            cumulativeProbability = armoredThreshold;
        }

        // Spawner: [explosiveChance + armoredChance, explosiveChance + armoredChance + spawnerChance)
        if (config.poisonBrickChance && turn > BRICK_GENERATION_TURNS.SPAWNER_MIN_TURN) {
            const spawnerThreshold = cumulativeProbability + probabilities.spawner;
            if (specialRoll >= cumulativeProbability && specialRoll < spawnerThreshold) {
                return BRICK_TYPES.SPAWNER;
            }
        }

        return BRICK_TYPES.NORMAL;
    }

    /**
     * Crea un bonus de bolas
     */
    _createBonus(col, cellSize, leftBorder, topOffset, config, turn) {
        const bonusCount = Math.random() < config.multiBallChance && turn > 10 ? 2 : 1;
        const radius = Math.max(8, 12 * this.canvasUtils.getScale());

        return new Bonus(
            leftBorder + col * cellSize + cellSize / 2,
            topOffset + cellSize / 2,
            radius,
            bonusCount
        );
    }

    /**
     * Crea un powerup
     */
    _createPowerup(col, cellSize, leftBorder, topOffset) {
        const powerupTypes = ['fireball', 'laser', 'fireball'];
        const ptype = powerupTypes[Math.floor(Math.random() * powerupTypes.length)];
        const radius = Math.max(10, 14 * this.canvasUtils.getScale());

        return new Powerup(
            leftBorder + col * cellSize + cellSize / 2,
            topOffset + cellSize / 2,
            radius,
            ptype
        );
    }

    /**
     * Encuentra una columna vacía
     */
    _findEmptyColumn(bricks, cols) {
        const occupiedCols = new Set(bricks.map(b => b.col));
        const availableCols = [];

        for (let col = 0; col < cols; col++) {
            if (!occupiedCols.has(col)) {
                availableCols.push(col);
            }
        }

        if (availableCols.length === 0) return -1;
        return availableCols[Math.floor(Math.random() * availableCols.length)];
    }

    /**
     * Obtiene la probabilidad de bonus garantizado según dificultad
     */
    _getGuaranteedBonusChance() {
        const difficulty = this.difficultyManager.currentDifficulty;
        if (difficulty === 'easy') return 0.9;
        if (difficulty === 'medium') return 0.6;
        return 0.35;
    }

    /**
     * Genera bloques spawner cuando un bloque spawner es destruido
     * Recursivamente genera 1-2 bloques spawner en columnas adyacentes
     */
    generateSpawnerBricks(brick, cols) {
        const { cellSize, leftBorder } = this.canvasUtils.getGridDimensions();
        const newBricks = [];
        const numSpawns = Math.random() < 0.5 ? 1 : 2;

        for (let i = 0; i < numSpawns; i++) {
            const colOffset = [-1, 0, 1][Math.floor(Math.random() * 3)];
            const newCol = brick.col + colOffset;

            if (newCol >= 0 && newCol < cols) {
                const newHP = Math.max(1, Math.floor(brick.hp / 2));
                const newBrick = new Brick(
                    leftBorder + newCol * cellSize,
                    brick.y,
                    cellSize - 4,
                    cellSize - 4,
                    newHP,
                    newCol,
                    GAME_CONSTANTS.BRICK_TYPES.SPAWNER
                );
                newBricks.push(newBrick);
            }
        }

        return newBricks;
    }

    /**
     * Genera bloques explosivos cuando un bloque explosivo es destruido
     */
    getExplosionRadius() {
        return 1; // Radio de explosión (1 = adyacentes)
    }
}

export default BrickGenerator;
