/**
 * Particle Entity
 * Representa una partícula visual del juego
 * Principio: Single Responsibility
 */

export class Particle {
    constructor(x, y, vx, vy, color, size, life) {
        this.x = x;
        this.y = y;
        this.vx = vx;
        this.vy = vy;
        this.color = color;
        this.size = size;
        this.life = life;
        this.maxLife = life;
    }

    /**
     * Actualiza la partícula
     * @returns {boolean} true si la partícula sigue viva
     */
    update() {
        this.x += this.vx;
        this.y += this.vy;
        this.vy += 0.3; // Gravedad
        this.life--;
        return this.life > 0;
    }

    /**
     * Obtiene la opacidad basada en la vida restante
     */
    getOpacity() {
        return this.life / this.maxLife;
    }

    /**
     * Verifica si la partícula está viva
     */
    isAlive() {
        return this.life > 0;
    }
}

export default Particle;
