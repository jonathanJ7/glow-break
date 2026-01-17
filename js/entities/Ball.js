/**
 * Ball Entity
 * Representa una bola del juego
 * Principio: Single Responsibility - Solo maneja el estado de una bola
 */

export class Ball {
    constructor(x, y, vx, vy, radius) {
        this.x = x;
        this.y = y;
        this.vx = vx;
        this.vy = vy;
        this.radius = radius;
        this.landed = false;
        this.stuck = false;
        this.stuckCounter = 0;
        this.isFireball = false;
        this.lastHitBrickCol = null; // Para fireball tracking
        this.lastHitBrickRow = null;
    }

    /**
     * Actualiza la posición de la bola
     */
    updatePosition(speedMultiplier = 1) {
        this.x += this.vx * speedMultiplier;
        this.y += this.vy * speedMultiplier;
    }

    /**
     * Invierte la velocidad horizontal
     */
    reverseX() {
        this.vx = -this.vx;
    }

    /**
     * Invierte la velocidad vertical
     */
    reverseY() {
        this.vy = -this.vy;
    }

    /**
     * Marca la bola como aterrizada
     */
    land(x) {
        this.landed = true;
        this.x = x;
    }

    /**
     * Verifica si la bola está en movimiento
     */
    isMoving() {
        return !this.landed;
    }

    /**
     * Activa el modo fireball
     */
    setFireball(enabled) {
        this.isFireball = enabled;
        if (!enabled) {
            this.lastHitBrickCol = null;
            this.lastHitBrickRow = null;
        }
    }

    /**
     * Reinicia el estado de la bola
     */
    reset(x, y) {
        this.x = x;
        this.y = y;
        this.vx = 0;
        this.vy = 0;
        this.landed = false;
        this.stuck = false;
        this.stuckCounter = 0;
        this.isFireball = false;
        this.lastHitBrickCol = null;
        this.lastHitBrickRow = null;
    }
}

export default Ball;
