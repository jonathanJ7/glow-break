/**
 * VillainDirector — máquina de estados PURA de la animación del villano.
 *
 * El motor del juego no conoce al villano: solo emite eventos
 * (`turnEnded`, `shieldUsed`, ...) y este módulo decide qué pose mostrar.
 * No toca el DOM ni el canvas y recibe el tiempo (`now`, en ms) como
 * parámetro, así se puede testear sin reloj ni render.
 *
 * Modelo:
 *  - Una pose BASE en bucle (`idle` entre turnos, `mira` con bolas en vuelo).
 *  - Una pose ACTUAL con duración, más una COLA de poses que siguen.
 *  - Prioridades: una secuencia nueva interrumpe a la actual solo si su
 *    primera pose tiene prioridad >= la actual; si no, se encola.
 */
import { VILLAIN } from '../../config.js';

export const VILLAIN_ACTIONS = {
    idle:    { priority: 0, loop: true },
    mira:    { priority: 0, loop: true },
    prepara: { priority: 2, duration: 350 },
    lanza:   { priority: 2, duration: 450 },
    golpe:   { priority: 3, duration: 800 },
    burla:   { priority: 3, duration: 1500 },
    furia:   { priority: 4, duration: 1700 },
};

/** Fracción de `lanza` en la que el bloque arrojado toca el tablero. */
export const LANZA_LAND_AT = 0.75;

export function createVillainDirector() {
    return {
        base: 'idle',
        current: null,      // { pose, startedAt, duration }
        queue: [],
        killsThisTurn: 0,
        reactedThisTurn: false,
        shieldUsed: false,
        rowRevealAt: 0,     // hasta cuándo la fila nueva "todavía no llegó"
    };
}

function start(d, pose, now) {
    d.current = { pose, startedAt: now, duration: VILLAIN_ACTIONS[pose].duration };
}

/** Reproduce una secuencia respetando prioridades. */
function play(d, seq, now) {
    const incoming = VILLAIN_ACTIONS[seq[0]].priority;
    const running = d.current ? VILLAIN_ACTIONS[d.current.pose].priority : -1;
    if (incoming >= running) {
        start(d, seq[0], now);
        d.queue = seq.slice(1);
    } else {
        d.queue.push(...seq);
    }
}

/**
 * Aplica un evento del juego.
 * @param {ReturnType<typeof createVillainDirector>} d
 * @param {string} type
 * @param {object} payload
 * @param {number} now  ms
 */
export function handleVillainEvent(d, type, payload = {}, now = 0) {
    switch (type) {
        case 'gameStarted':
            Object.assign(d, createVillainDirector());
            break;
        case 'shootingStarted':
            d.base = 'mira';
            d.killsThisTurn = 0;
            d.reactedThisTurn = false;
            break;
        case 'bricksDestroyed':
            d.killsThisTurn += payload.count || 0;
            if (!d.reactedThisTurn && d.killsThisTurn >= VILLAIN.golpeKills) {
                d.reactedThisTurn = true;
                play(d, ['golpe'], now);
            }
            break;
        case 'shieldUsed':
            d.shieldUsed = true;
            break;
        case 'turnEnded': {
            // El lanzamiento ES el comienzo del turno: corta lo que haya.
            d.base = 'idle';
            const seq = ['prepara', 'lanza'];
            if (payload.eraChanged) seq.push('furia');
            else if (d.shieldUsed) seq.push('burla');
            d.shieldUsed = false;
            start(d, seq[0], now);
            d.queue = seq.slice(1);
            d.rowRevealAt = now + VILLAIN_ACTIONS.prepara.duration
                + VILLAIN_ACTIONS.lanza.duration * LANZA_LAND_AT;
            break;
        }
        case 'gameOver':
            d.base = 'burla';
            d.current = null;
            d.queue = [];
            d.rowRevealAt = 0;
            break;
    }
}

/**
 * Pose a mostrar en `now`. Avanza la cola por las poses ya vencidas (si la
 * pestaña estuvo en segundo plano, salta directo a la que corresponde).
 * @returns {{pose: string, progress: number, loop: boolean}}
 */
export function getVillainPose(d, now) {
    while (d.current && now - d.current.startedAt >= d.current.duration) {
        const endedAt = d.current.startedAt + d.current.duration;
        const next = d.queue.shift();
        if (next) start(d, next, endedAt);
        else d.current = null;
    }
    if (!d.current) return { pose: d.base, progress: 0, loop: true };
    return {
        pose: d.current.pose,
        progress: Math.min(1, Math.max(0, (now - d.current.startedAt) / d.current.duration)),
        loop: false,
    };
}

/** ¿La fila nueva sigue "en el aire" (el villano todavía no la tiró)? */
export function isRowPending(d, now) {
    return now < d.rowRevealAt;
}
