/**
 * Caché de cuadros pre-dibujados (LRU con tope).
 *
 * Dibujar un cuadro del villano cuesta decenas de `shadowBlur`, demasiado
 * para cada frame en un celular. Cada cuadro se dibuja UNA vez en un
 * canvas fuera de pantalla, ajustado al sprite, y después se copia con
 * `drawImage`. El tope de cuadros acota la memoria (~0,6 MB por cuadro
 * a 300 px × 1,5x); al cambiar el tamaño se descarta todo.
 */
export class VillainSpriteCache {
    /**
     * @param {number} maxFrames
     */
    constructor(maxFrames) {
        this.maxFrames = maxFrames;
        this.frames = new Map();
        this.sizeKey = '';
        this.lastFrame = null;
    }

    /** Descarta todo si cambió el tamaño en px del sprite. */
    resize(pixelSize) {
        const key = String(pixelSize);
        if (key === this.sizeKey) return;
        this.sizeKey = key;
        this.frames.clear();
        this.lastFrame = null;
    }

    /**
     * Devuelve el cuadro `key`; si no existe y `allowRender`, lo dibuja con
     * `paint(ctx)` en un canvas de `pixelSize`. Si no se permite dibujar
     * (presupuesto del frame agotado), devuelve el último cuadro usado.
     */
    get(key, pixelSize, paint, allowRender) {
        let canvas = this.frames.get(key);
        if (canvas) {
            // Refrescar posición LRU
            this.frames.delete(key);
            this.frames.set(key, canvas);
        } else if (allowRender) {
            canvas = createCanvas(pixelSize);
            paint(canvas.getContext('2d'));
            this.frames.set(key, canvas);
            while (this.frames.size > this.maxFrames) {
                this.frames.delete(this.frames.keys().next().value);
            }
        } else {
            return this.lastFrame;
        }
        this.lastFrame = canvas;
        return canvas;
    }

    get size() {
        return this.frames.size;
    }
}

function createCanvas(size) {
    if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(size, size);
    const c = document.createElement('canvas');
    c.width = c.height = size;
    return c;
}
