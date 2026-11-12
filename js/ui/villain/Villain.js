/**
 * Villano del espacio libre — controlador de presentación.
 *
 * Conecta tres piezas sin que el motor del juego sepa nada del villano:
 *  - Eventos: el juego emite `gameStarted`, `shootingStarted`,
 *    `bricksDestroyed`, `shieldUsed`, `turnEnded` y `gameOver` por su
 *    emisor `events`; acá se traducen a poses (VillainDirector, puro).
 *  - Sprite: el Arquitecto se dibuja con primitivas neón caras, así que
 *    cada cuadro se pre-dibuja una vez (VillainSpriteCache) y se pre-calienta
 *    en momentos ociosos (requestIdleCallback).
 *  - Layout: solo aparece si arriba del tablero sobra al menos
 *    VILLAIN.minSpace px; en la vista dividida no hay espacio y no cuesta
 *    nada (ni siquiera se dibuja).
 *
 * Accesibilidad: con `prefers-reduced-motion: reduce` las poses cambian
 * pero quedan quietas (cuadro 0), no cae el bloque y la fila nueva aparece
 * al instante. Ninguna animación alterna destellos.
 */
import { VILLAIN } from '../../../config.js';
import {
    createVillainDirector, handleVillainEvent, getVillainPose, isRowPending, LANZA_LAND_AT,
} from '../../systems/VillainDirector.js';
import {
    drawArquitecto, drawThrownBrick, POSE_FRAMES, SPRITE_MARGIN, SPRITE_UNITS, THROW_ORIGIN,
} from './ArquitectoSprite.js';
import { VillainSpriteCache } from './VillainSpriteCache.js';

export const VILLAIN_EVENTS = ['gameStarted', 'shootingStarted', 'bricksDestroyed', 'shieldUsed', 'turnEnded', 'gameOver'];

const director = createVillainDirector();
const cache = new VillainSpriteCache(VILLAIN.cacheMaxFrames);
let reducedMotion = false;
let visible = false;
let layout = null;
let pixelSize = 0;
let gridCache = null;
let warmupScheduled = false;
let initialized = false;

/**
 * Suscribe el villano a los eventos del juego. Recibe el emisor por
 * parámetro para no acoplarse a game.js.
 * @param {{on: Function}} events
 */
export function setupVillain(events) {
    if (initialized) return;
    initialized = true;
    const mq = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
    if (mq) {
        reducedMotion = mq.matches;
        mq.addEventListener?.('change', e => { reducedMotion = e.matches; });
    }
    for (const type of VILLAIN_EVENTS) {
        events.on(type, payload => {
            handleVillainEvent(director, type, payload, performance.now());
            // Sin villano a la vista (o sin animaciones) nada demora la fila nueva
            if (type === 'turnEnded' && (!visible || reducedMotion)) director.rowRevealAt = 0;
        });
    }
}

/**
 * Dónde va el sprite dentro de la franja libre, o null si no entra.
 * @param {{width: number, top: number, bottom: number}} area  px CSS
 */
export function getVillainLayout(area) {
    const free = area.bottom - area.top;
    if (free < VILLAIN.minSpace) return null;
    const size = Math.min(VILLAIN.maxSize, free * 1.05, area.width * 0.9);
    // Los pies del sprite están al 85% de su caja: se apoyan sobre el tablero
    return { size, x: (area.width - size) / 2, y: area.bottom - size + size * 0.1 };
}

/** Cuadro de la caché que corresponde a una pose en `now`. */
function frameFor({ pose, progress }, now) {
    const spec = POSE_FRAMES[pose] || POSE_FRAMES.idle;
    let index = 0;
    if (!reducedMotion) {
        index = spec.byProgress
            ? Math.min(spec.frames - 1, Math.floor(progress * spec.frames))
            : Math.floor((now % spec.loopMs) / spec.loopMs * spec.frames);
    }
    const t = spec.byProgress ? 0 : index / spec.frames;
    const opts = pose === 'prepara' ? { p: (index + 1) / spec.frames } : {};
    return { key: `${pose}:${index}`, pose, t, opts };
}

function paintFrame(frame) {
    return (c) => {
        const u = pixelSize / SPRITE_UNITS;
        c.translate(SPRITE_MARGIN * u, SPRITE_MARGIN * u);
        drawArquitecto(c, u, frame.pose, frame.t, frame.opts);
    };
}

/** Pre-dibuja en momentos ociosos los cuadros del bucle de espera. */
function scheduleWarmup() {
    if (warmupScheduled || reducedMotion) return;
    const idle = window.requestIdleCallback || (fn => setTimeout(() => fn({ timeRemaining: () => 8 }), 50));
    warmupScheduled = true;
    idle((deadline) => {
        warmupScheduled = false;
        if (!visible) return;
        const order = ['idle', 'mira', 'prepara', 'lanza'];
        for (const pose of order) {
            const spec = POSE_FRAMES[pose];
            for (let i = 0; i < spec.frames; i++) {
                const key = `${pose}:${i}`;
                if (cache.frames.has(key)) continue;
                if (deadline.timeRemaining() < 6) { scheduleWarmup(); return; }
                const t = spec.byProgress ? 0 : i / spec.frames;
                const opts = pose === 'prepara' ? { p: (i + 1) / spec.frames } : {};
                cache.get(key, pixelSize, paintFrame({ pose, t, opts }), true);
            }
        }
    });
}

/** Grilla en perspectiva del fondo: estática, se dibuja una vez por tamaño. */
function getGrid(area, dpr) {
    const key = `${area.width}|${area.top}|${area.bottom}|${dpr}`;
    if (gridCache?.key === key) return gridCache.canvas;
    const w = Math.round(area.width * dpr), h = Math.round((area.bottom - area.top) * dpr);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, w); canvas.height = Math.max(1, h);
    const c = canvas.getContext('2d');
    c.scale(dpr, dpr);
    const W = area.width, H = area.bottom - area.top;
    const horizon = H * 0.45, vx = W / 2;
    c.strokeStyle = 'rgba(62,224,255,0.22)';
    c.lineWidth = 1;
    c.shadowColor = '#3ee0ff';
    c.shadowBlur = 4;
    c.beginPath(); c.moveTo(14, horizon); c.lineTo(W - 14, horizon); c.stroke();
    c.beginPath(); c.rect(14, horizon, W - 28, H - horizon); c.clip();
    for (let i = 1; i <= 7; i++) {
        const y = horizon + (H - horizon) * Math.pow(i / 7, 1.8);
        c.beginPath(); c.moveTo(14, y); c.lineTo(W - 14, y); c.stroke();
    }
    for (let i = -9; i <= 9; i++) {
        c.beginPath(); c.moveTo(vx, horizon); c.lineTo(vx + i * 60, H + 30); c.stroke();
    }
    gridCache = { key, canvas };
    return canvas;
}

/**
 * Capa de fondo: grilla + villano. Va antes del tablero.
 * @param {CanvasRenderingContext2D} ctx  contexto del juego (ya escalado a DPR)
 * @param {{width: number, top: number, bottom: number}} area
 * @param {number} now
 * @param {number} dpr
 */
export function drawVillainBackdrop(ctx, area, now, dpr) {
    layout = getVillainLayout(area);
    visible = !!layout;
    if (!visible) return;

    ctx.drawImage(getGrid(area, dpr), 0, area.top, area.width, area.bottom - area.top);

    pixelSize = Math.round(layout.size * Math.min(dpr, VILLAIN.cacheScaleMax));
    cache.resize(pixelSize);
    const frame = frameFor(getVillainPose(director, now), now);
    const image = cache.get(frame.key, pixelSize, paintFrame(frame), true);
    if (image) ctx.drawImage(image, layout.x, layout.y, layout.size, layout.size);
    scheduleWarmup();
}

/**
 * Capa de frente: el bloque arrojado cayendo hasta la fila de arriba y el
 * destello del impacto. Va después de los bloques.
 * @param {number} landingY  centro de la fila superior del tablero (px CSS)
 */
export function drawVillainForeground(ctx, landingY, now) {
    if (!visible || reducedMotion) return;
    const pose = getVillainPose(director, now);
    if (pose.pose !== 'lanza') return;

    const unit = layout.size / SPRITE_UNITS;
    const x = layout.x + (SPRITE_MARGIN + THROW_ORIGIN.x) * unit;
    const y0 = layout.y + (SPRITE_MARGIN + THROW_ORIGIN.y) * unit;
    const fall = Math.min(1, pose.progress / LANZA_LAND_AT);

    if (fall < 1) {
        const ease = fall * fall;   // acelera al caer
        const y = y0 + (landingY - y0) * ease;
        const brick = cache.get('thrown-brick', pixelSize, (c) => {
            const u = pixelSize / SPRITE_UNITS;
            c.translate(SPRITE_MARGIN * u, SPRITE_MARGIN * u);
            drawThrownBrick(c, u);
        }, true);
        ctx.drawImage(brick, x - layout.size / 2, y - layout.size / 2, layout.size, layout.size);
    } else {
        // Impacto: anillo que se expande y se apaga (sin shadowBlur)
        const k = (pose.progress - LANZA_LAND_AT) / (1 - LANZA_LAND_AT);
        ctx.save();
        ctx.strokeStyle = `rgba(62,224,255,${0.8 * (1 - k)})`;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.ellipse(x, landingY, 12 + 40 * k, 4 + 10 * k, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
    }
}

/** ¿La fila nueva todavía no "llegó" (el bloque sigue en el aire)? */
export function isNewRowHidden(now) {
    return visible && !reducedMotion && isRowPending(director, now);
}

/** Estado para tests y depuración. */
export function getVillainDebugState(now = performance.now()) {
    return {
        visible,
        reducedMotion,
        pose: getVillainPose(director, now).pose,
        cachedFrames: cache.size,
        layout,
    };
}
