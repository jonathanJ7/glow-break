/**
 * BrickSurfaces - Fusión de bloques adyacentes en superficies continuas
 *
 * Problema que resuelve: cada bloque se dibujaba y colisionaba como un
 * rectángulo independiente con 2px de margen por lado. Dos bloques vecinos
 * dejaban una ranura de 4px entre sus superficies, y además cada uno
 * aportaba sus propias caras y esquinas redondeadas INTERNAS. Una bola que
 * rozaba una pared de bloques podía golpear una de esas esquinas interiores
 * y salir rebotada en una dirección que el jugador no podía prever.
 *
 * Solución: los bloques adyacentes se fusionan en una única superficie.
 * Para cada bloque calculamos:
 *   - Un rect "fusionado": el bloque ocupa su celda completa, así dos vecinos
 *     comparten la MISMA arista, no queda ranura y el contorno de un grupo
 *     nunca tiene escalones.
 *   - Qué caras están expuestas: las caras internas (cubiertas por un vecino)
 *     no se testean en colisión.
 *   - Qué esquinas están expuestas: solo las esquinas realmente convexas
 *     generan la esquina redondeada del Minkowski sum.
 *
 * El MISMO cálculo alimenta la física y el renderizado (rendering.js dibuja
 * exactamente este rect, con radio 0 en las esquinas fusionadas), así que lo
 * que se ve es literalmente la superficie de colisión.
 *
 * Todos los bloques están alineados a la grilla: brick.x/brick.y son el
 * origen de la celda y width = cellSize * columnas - BRICK_CELL_GAP. Eso
 * permite derivar índices de celda desde las coordenadas sin depender de
 * rendering.js.
 */

// Hueco que el modelo de datos ya lleva incorporado en brick.width/height:
// width = cellSize * columnas - BRICK_CELL_GAP. Sirve para deducir el tamaño
// de celda y cuántas columnas ocupa un bloque.
export const BRICK_CELL_GAP = 4;

// Cuánto se retira la superficie del borde de la celda en los lados SIN
// vecino.
//
// Vale 0 a propósito: la superficie de un bloque es su celda completa. Con un
// margen > 0 aparecían escalones donde dos bloques de la misma fila no
// coincidían en tener vecino abajo (uno terminaba 2px más arriba que el otro),
// y ese escalón se veía como un pico y devolvía la bola contra un canto que
// el jugador no podía prever. Con la celda completa, un grupo de bloques
// adyacentes tiene SIEMPRE un contorno continuo.
export const BRICK_INSET = 0;

// Radio de las esquinas expuestas (las fusionadas van a 0).
export const BRICK_CORNER_RADIUS = 6;

const KEY_OFFSET = 512;
const KEY_STRIDE = 1024;

function cellKey(col, row) {
    return (col + KEY_OFFSET) * KEY_STRIDE + (row + KEY_OFFSET);
}

/**
 * Deriva el tamaño de celda a partir de un bloque vivo.
 * Todos los bloques miden cellSize - 2 * INSET de alto.
 */
function deriveCellSize(bricks) {
    for (const brick of bricks) {
        if (brick.hp > 0) return brick.height + BRICK_CELL_GAP;
    }
    return 0;
}

/**
 * Índices de celda de un bloque. El offset constante de leftBorder/topOffset
 * se cancela al redondear, así que los índices son consistentes entre bloques
 * aunque no sean el col/row "real" de la grilla.
 */
function cellsOf(brick, cellSize) {
    return {
        col: Math.round(brick.x / cellSize),
        row: Math.round(brick.y / cellSize),
        span: Math.max(1, Math.round((brick.width + BRICK_CELL_GAP) / cellSize))
    };
}

/**
 * Divide un lado horizontal (superior o inferior) en tramos expuestos y
 * tramos cubiertos por un vecino. Un jefe ocupa 3 celdas y puede tener solo
 * parte de su lado cubierto, así que no alcanza con un booleano.
 */
function splitSide(col, span, neighborRow, occupied, cellLeft, cellSize, x0, x1) {
    const exposed = [];
    const covered = [];

    let runStart = 0;
    let runFree = !occupied.has(cellKey(col, neighborRow));

    const pushRun = (from, to, free) => {
        const a = Math.max(x0, cellLeft + from * cellSize);
        const b = Math.min(x1, cellLeft + to * cellSize);
        if (b - a > 1e-6) (free ? exposed : covered).push([a, b]);
    };

    for (let i = 1; i < span; i++) {
        const free = !occupied.has(cellKey(col + i, neighborRow));
        if (free !== runFree) {
            pushRun(runStart, i, runFree);
            runStart = i;
            runFree = free;
        }
    }
    pushRun(runStart, span, runFree);

    return { exposed, covered };
}

/**
 * Construye la superficie fusionada de cada bloque vivo.
 *
 * @param {Array} bricks - Bloques del juego
 * @param {number} [cellSize] - Tamaño de celda (se deriva si no se pasa)
 * @returns {Map<Object, Object>} brick -> surface
 */
export function buildBrickSurfaces(bricks, cellSize) {
    const surfaces = new Map();
    if (!bricks || bricks.length === 0) return surfaces;

    const cell = cellSize || deriveCellSize(bricks);
    if (!cell || !isFinite(cell) || cell <= 0) return surfaces;

    // Mapa de ocupación de la grilla (solo bloques vivos)
    const occupied = new Set();
    const placed = [];

    for (const brick of bricks) {
        if (brick.hp <= 0) continue;
        const { col, row, span } = cellsOf(brick, cell);
        placed.push({ brick, col, row, span });
        for (let i = 0; i < span; i++) occupied.add(cellKey(col + i, row));
    }

    for (const { brick, col, row, span } of placed) {
        const cellLeft = brick.x;
        const cellRight = brick.x + span * cell;
        const cellTop = brick.y;
        const cellBottom = brick.y + cell;

        const hasLeft = occupied.has(cellKey(col - 1, row));
        const hasRight = occupied.has(cellKey(col + span, row));

        let hasTop = false;
        let hasBottom = false;
        for (let i = 0; i < span; i++) {
            if (occupied.has(cellKey(col + i, row - 1))) hasTop = true;
            if (occupied.has(cellKey(col + i, row + 1))) hasBottom = true;
        }

        // La superficie es la celda completa (BRICK_INSET = 0): dos bloques
        // adyacentes comparten la arista y el contorno del grupo es continuo.
        const x0 = hasLeft ? cellLeft : cellLeft + BRICK_INSET;
        const x1 = hasRight ? cellRight : cellRight - BRICK_INSET;
        const y0 = hasTop ? cellTop : cellTop + BRICK_INSET;
        const y1 = hasBottom ? cellBottom : cellBottom - BRICK_INSET;

        const top = splitSide(col, span, row - 1, occupied, cellLeft, cell, x0, x1);
        const bottom = splitSide(col, span, row + 1, occupied, cellLeft, cell, x0, x1);

        surfaces.set(brick, {
            x0, y0, x1, y1,
            hasLeft, hasRight, hasTop, hasBottom,
            leftExposed: !hasLeft,
            rightExposed: !hasRight,
            topSegments: top.exposed,
            bottomSegments: bottom.exposed,
            // Tramos internos (para dibujar la costura fina entre vecinos)
            topSeams: top.covered,
            bottomSeams: bottom.covered,
            // Una esquina solo existe si sus DOS caras están expuestas ahí.
            // Si no, es una arista recta (o un rincón cóncavo) y una esquina
            // redondeada ahí produciría el rebote fantasma que queremos matar.
            corners: {
                tl: !hasLeft && !occupied.has(cellKey(col, row - 1)),
                tr: !hasRight && !occupied.has(cellKey(col + span - 1, row - 1)),
                bl: !hasLeft && !occupied.has(cellKey(col, row + 1)),
                br: !hasRight && !occupied.has(cellKey(col + span - 1, row + 1))
            }
        });
    }

    return surfaces;
}

// ====================================
// CACHÉ
// ====================================
// buildBrickSurfaces se llama muchas veces por frame (una por bola y por
// paso de colisión, más el renderizado y la línea de puntería). La firma es
// aritmética simple sobre las posiciones: mucho más barata que reconstruir
// el mapa de ocupación.

let cachedBricks = null;
let cachedSignature = NaN;
let cachedCellSize = 0;
let cachedSurfaces = null;

function signatureOf(bricks) {
    let sig = bricks.length;
    for (let i = 0; i < bricks.length; i++) {
        const b = bricks[i];
        if (b.hp <= 0) continue;
        sig += (i + 1) * (b.x * 0.9173 + b.y * 2.7183 + b.width * 5.3311);
    }
    return sig;
}

/**
 * Superficies fusionadas con caché. Se reconstruyen cuando cambia el
 * conjunto de bloques (nuevos, destruidos, fila que baja o resize).
 */
export function getBrickSurfaces(bricks, cellSize) {
    if (!bricks || bricks.length === 0) return new Map();

    const cell = cellSize || deriveCellSize(bricks);
    const sig = signatureOf(bricks);

    if (cachedSurfaces && cachedBricks === bricks && cachedSignature === sig && cachedCellSize === cell) {
        return cachedSurfaces;
    }

    cachedSurfaces = buildBrickSurfaces(bricks, cell);
    cachedBricks = bricks;
    cachedSignature = sig;
    cachedCellSize = cell;

    return cachedSurfaces;
}

export function invalidateBrickSurfaces() {
    cachedSurfaces = null;
    cachedBricks = null;
    cachedSignature = NaN;
    cachedCellSize = 0;
}

/**
 * Rect dibujable/colisionable de un bloque a partir de su superficie.
 * Es la MISMA geometría que usa la física, con radio 0 en las esquinas
 * fusionadas para que los vecinos se vean como una sola pieza.
 *
 * @returns {{x, y, width, height, radii: number[], centerX, centerY}}
 */
export function brickRectFromSurface(brick, surface) {
    if (!surface) {
        // Fallback: bloque sin superficie calculada (no debería pasar en
        // juego, pero mantiene el render a salvo).
        const r = BRICK_CORNER_RADIUS;
        const margin = BRICK_CELL_GAP / 2;
        return {
            x: brick.x + margin,
            y: brick.y + margin,
            width: brick.width,
            height: brick.height,
            radii: [r, r, r, r],
            centerX: brick.x + margin + brick.width / 2,
            centerY: brick.y + margin + brick.height / 2
        };
    }

    const r = BRICK_CORNER_RADIUS;
    const c = surface.corners;

    return {
        x: surface.x0,
        y: surface.y0,
        width: surface.x1 - surface.x0,
        height: surface.y1 - surface.y0,
        // roundRect: [top-left, top-right, bottom-right, bottom-left]
        radii: [c.tl ? r : 0, c.tr ? r : 0, c.br ? r : 0, c.bl ? r : 0],
        centerX: (surface.x0 + surface.x1) / 2,
        centerY: (surface.y0 + surface.y1) / 2
    };
}

export default {
    BRICK_INSET,
    BRICK_CELL_GAP,
    BRICK_CORNER_RADIUS,
    buildBrickSurfaces,
    getBrickSurfaces,
    invalidateBrickSurfaces,
    brickRectFromSurface
};
