/**
 * Brick Entity
 * Representa un bloque del juego
 * Principio: Single Responsibility - Solo maneja la lógica de un bloque
 */

import { GAME_CONSTANTS } from '../core/Constants.js';

export class Brick {
    constructor(x, y, width, height, hp, col, type = 'normal') {
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
        this.hp = hp;
        this.maxHp = hp;
        this.col = col;
        this.type = type;
        this.laserY = 0; // Para el efecto láser
    }

    /**
     * Aplica daño al bloque
     * @returns {boolean} true si el bloque fue destruido
     */
    takeDamage(damage) {
        this.hp -= damage;
        return this.hp <= 0;
    }

    /**
     * Verifica si el bloque está destruido
     */
    isDestroyed() {
        return this.hp <= 0;
    }

    /**
     * Obtiene el color del bloque basado en su HP
     */
    getColor() {
        const hpRatio = this.hp / this.maxHp;
        const { COLORS } = GAME_CONSTANTS;

        if (hpRatio > 0.875) return COLORS.BRICK_TIER_8;
        if (hpRatio > 0.75) return COLORS.BRICK_TIER_7;
        if (hpRatio > 0.625) return COLORS.BRICK_TIER_6;
        if (hpRatio > 0.5) return COLORS.BRICK_TIER_5;
        if (hpRatio > 0.375) return COLORS.BRICK_TIER_4;
        if (hpRatio > 0.25) return COLORS.BRICK_TIER_3;
        if (hpRatio > 0.125) return COLORS.BRICK_TIER_2;
        return COLORS.BRICK_TIER_1;
    }

    /**
     * Verifica si el bloque es especial
     */
    isSpecialType() {
        return this.type !== GAME_CONSTANTS.BRICK_TYPES.NORMAL;
    }

    /**
     * Obtiene el emoji para el tipo de bloque
     */
    getEmoji() {
        switch (this.type) {
            case GAME_CONSTANTS.BRICK_TYPES.EXPLOSIVE:
                return '💥';
            case GAME_CONSTANTS.BRICK_TYPES.ARMORED:
                return '🛡️';
            case GAME_CONSTANTS.BRICK_TYPES.SPAWNER:
                return '👾';
            default:
                return '';
        }
    }

    /**
     * Mueve el bloque hacia abajo
     */
    moveDown(distance) {
        this.y += distance;
    }
}

export default Brick;
