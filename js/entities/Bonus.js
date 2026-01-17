/**
 * Bonus Entity
 * Representa un bonus del juego (bolas extra)
 * Principio: Single Responsibility
 */

export class Bonus {
    constructor(x, y, radius, count) {
        this.x = x;
        this.y = y;
        this.radius = radius;
        this.count = count;
        this.collected = false;
    }

    /**
     * Marca el bonus como recolectado
     */
    collect() {
        this.collected = true;
    }

    /**
     * Verifica si el bonus está recolectado
     */
    isCollected() {
        return this.collected;
    }
}

export class Powerup {
    constructor(x, y, radius, type) {
        this.x = x;
        this.y = y;
        this.radius = radius;
        this.type = type; // 'laser' o 'fireball'
        this.collected = false;
    }

    /**
     * Marca el powerup como recolectado
     */
    collect() {
        this.collected = true;
    }

    /**
     * Verifica si el powerup está recolectado
     */
    isCollected() {
        return this.collected;
    }

    /**
     * Obtiene el emoji del powerup
     */
    getEmoji() {
        return this.type === 'laser' ? '⚡' : '🔥';
    }
}

export default Bonus;
