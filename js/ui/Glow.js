/**
 * Glow - Halos neón pre-dibujados
 *
 * `shadowBlur` es de lo más caro que tiene el canvas 2D, sobre todo en
 * celulares: cada figura con sombra se desenfoca de nuevo en cada cuadro.
 * Con decenas de bolas especiales, bonuses y zonas débiles (todo eso crece
 * con los turnos) el juego se ponía lento a los pocos niveles.
 *
 * Acá cada figura con brillo se dibuja UNA vez (con su shadowBlur) en un
 * canvas fuera de pantalla y después se copia con drawImage, que es barato.
 * La caché es por forma + tamaño + colores, con tope de entradas (LRU).
 *
 * Regla para código nuevo: no uses `ctx.shadowBlur` en algo que se dibuja
 * por entidad y por cuadro (bolas, bloques, bonuses). Usá estas funciones.
 */

const MAX_SPRITES = 128;
const sprites = new Map();

// Misma resolución que el canvas principal (ver getCanvasDpr en
// rendering.js). shadowBlur se mide en píxeles del dispositivo y no lo
// afecta la transformación, así que con la misma resolución el halo se ve
// igual que dibujado en vivo.
const MAX_RES = 2;

function resolution() {
    return Math.min((typeof window !== 'undefined' && window.devicePixelRatio) || 1, MAX_RES);
}

function getSprite(key, width, height, blur, paint) {
    const res = resolution();
    const fullKey = `${key}|${res}`;
    let sprite = sprites.get(fullKey);
    if (sprite) {
        // LRU: al usarla pasa al final del orden de inserción
        sprites.delete(fullKey);
        sprites.set(fullKey, sprite);
        return sprite;
    }

    const pad = Math.ceil(blur) + 2;
    const w = width + pad * 2;
    const h = height + pad * 2;
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.ceil(w * res));
    canvas.height = Math.max(1, Math.ceil(h * res));
    const g = canvas.getContext('2d');
    g.scale(res, res);
    g.translate(pad, pad);
    paint(g);

    sprite = { canvas, pad, w, h };
    sprites.set(fullKey, sprite);
    if (sprites.size > MAX_SPRITES) {
        sprites.delete(sprites.keys().next().value);
    }
    return sprite;
}

const q = v => Math.round(v * 4) / 4;

/**
 * Círculo (relleno o anillo) con brillo. Equivale a dibujarlo con
 * `shadowColor = glowColor; shadowBlur = blur`.
 *
 * @param {object} opts
 * @param {string} opts.color - relleno (o trazo si lineWidth)
 * @param {string} [opts.glowColor=color]
 * @param {number} opts.blur
 * @param {number} [opts.lineWidth] - si viene, dibuja un anillo
 */
export function drawGlowCircle(ctx, x, y, radius, { color, glowColor = color, blur, lineWidth = 0 }) {
    const r = q(radius);
    const half = lineWidth / 2;
    const size = (r + half) * 2;
    const key = `c|${r}|${lineWidth}|${color}|${glowColor}|${blur}`;
    const sprite = getSprite(key, size, size, blur, g => {
        g.shadowColor = glowColor;
        g.shadowBlur = blur;
        g.beginPath();
        g.arc(r + half, r + half, r, 0, Math.PI * 2);
        if (lineWidth > 0) {
            g.strokeStyle = color;
            g.lineWidth = lineWidth;
            g.stroke();
        } else {
            g.fillStyle = color;
            g.fill();
        }
    });
    ctx.drawImage(sprite.canvas, x - r - half - sprite.pad, y - r - half - sprite.pad, sprite.w, sprite.h);
}

/**
 * Rectángulo redondeado relleno con brillo. Equivale a rellenarlo con
 * `fillStyle = color; shadowColor = glowColor; shadowBlur = blur`.
 *
 * @param {number|number[]} radii - como en ctx.roundRect
 */
export function drawGlowRoundRect(ctx, x, y, width, height, radii, { color, glowColor = color, blur }) {
    const w = q(width);
    const h = q(height);
    const rs = Array.isArray(radii) ? radii.map(q) : [q(radii)];
    const key = `r|${w}|${h}|${rs.join(',')}|${color}|${glowColor}|${blur}`;
    const sprite = getSprite(key, w, h, blur, g => {
        g.shadowColor = glowColor;
        g.shadowBlur = blur;
        g.fillStyle = color;
        g.beginPath();
        g.roundRect(0, 0, w, h, rs.length === 1 ? rs[0] : rs);
        g.fill();
    });
    ctx.drawImage(sprite.canvas, x - sprite.pad, y - sprite.pad, sprite.w, sprite.h);
}

/** Para tests y para invalidar tras un cambio de DPR. */
export function clearGlowCache() {
    sprites.clear();
}

export function getGlowCacheSize() {
    return sprites.size;
}
