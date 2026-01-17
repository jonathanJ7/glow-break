/**
 * Math Utilities
 * Funciones matemáticas reutilizables
 * Principio: DRY - No repetir cálculos matemáticos
 */

export class MathUtils {
    /**
     * Normaliza un vector (lo convierte a longitud 1)
     */
    static normalize(vx, vy) {
        const mag = Math.sqrt(vx * vx + vy * vy);
        if (mag === 0) return { vx: 0, vy: 0 };
        return { vx: vx / mag, vy: vy / mag };
    }

    /**
     * Calcula la distancia entre dos puntos
     */
    static distance(x1, y1, x2, y2) {
        const dx = x2 - x1;
        const dy = y2 - y1;
        return Math.sqrt(dx * dx + dy * dy);
    }

    /**
     * Verifica colisión entre círculo y rectángulo
     */
    static circleRectCollision(cx, cy, radius, rx, ry, rw, rh) {
        // Encuentra el punto más cercano del rectángulo al círculo
        const closestX = Math.max(rx, Math.min(cx, rx + rw));
        const closestY = Math.max(ry, Math.min(cy, ry + rh));

        // Calcula la distancia
        const distX = cx - closestX;
        const distY = cy - closestY;
        const distSquared = distX * distX + distY * distY;

        return distSquared < (radius * radius);
    }

    /**
     * Verifica colisión entre dos círculos
     */
    static circleCircleCollision(x1, y1, r1, x2, y2, r2) {
        const dx = x2 - x1;
        const dy = y2 - y1;
        const distance = Math.sqrt(dx * dx + dy * dy);
        return distance < (r1 + r2);
    }

    /**
     * Calcula el lado del rectángulo que fue golpeado
     */
    static getCollisionSide(cx, cy, vx, vy, rx, ry, rw, rh) {
        const prevCx = cx - vx;
        const prevCy = cy - vy;

        const dx = Math.abs(prevCx - (rx + rw / 2));
        const dy = Math.abs(prevCy - (ry + rh / 2));

        if (dx > dy) {
            return prevCx < rx + rw / 2 ? 'left' : 'right';
        } else {
            return prevCy < ry + rh / 2 ? 'top' : 'bottom';
        }
    }

    /**
     * Clamp - limita un valor entre min y max
     */
    static clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    /**
     * Interpolación lineal
     */
    static lerp(a, b, t) {
        return a + (b - a) * t;
    }

    /**
     * Genera un número aleatorio entre min y max
     */
    static random(min, max) {
        return min + Math.random() * (max - min);
    }

    /**
     * Genera un entero aleatorio entre min y max (inclusive)
     */
    static randomInt(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }
}

export default MathUtils;
