/**
 * ThreatSystem - Ejecuta los hooks de las amenazas activas.
 *
 * El motor (game.js, physics.js, rendering.js) nunca conoce amenazas
 * concretas: solo llama a estas funciones, que recorren las amenazas
 * activas según `levels` (tipo → nivel, ver Eras.getThreatLevels) y
 * delegan en sus behaviors. Agregar una amenaza = registrar un behavior en
 * ThreatRegistry; no hace falta tocar el motor (Open/Closed).
 *
 * Cada hook recibe un `ctx`:
 *   { level, params, turn, gameState, helpers, grid }
 *   - params: levels[level - 1] del behavior (los números de ese nivel)
 *   - grid:   índice de celdas ocupadas (ver buildGrid), creado al pedirlo
 */

import { ThreatRegistry } from '../behaviors/index.js';

/** Fuentes de daño que el motor reporta a modifyDamage. */
export const DAMAGE_SOURCES = Object.freeze({
    BALL: 'ball',           // impacto directo de una bola
    BOMB: 'bomb',           // área de la bola bomba
    EXPLOSION: 'explosion', // onDestroy de bloques (explosivo, onda del jefe)
    LASER: 'laser',         // láser horizontal
});

const NEIGHBOR_OFFSETS_4 = [[0, -1], [0, 1], [-1, 0], [1, 0]];
const NEIGHBOR_OFFSETS_8 = [...NEIGHBOR_OFFSETS_4, [-1, -1], [1, -1], [-1, 1], [1, 1]];

/**
 * Índice de la grilla: qué bloque ocupa cada celda (col, row). Un bloque
 * ancho (jefe) ocupa varias celdas. row 0 = fila de arriba.
 */
export function buildGrid(bricks, cellSize, topOffset) {
    const cells = new Map();
    const rowOf = (b) => Math.round((b.y - topOffset) / cellSize);
    const spanOf = (b) => Math.max(1, Math.round((b.width + 4) / cellSize));
    for (const b of bricks) {
        if (b.hp <= 0) continue;
        const row = rowOf(b);
        for (let c = b.col; c < b.col + spanOf(b); c++) {
            cells.set(`${c},${row}`, b);
        }
    }
    return {
        rowOf,
        spanOf,
        get: (col, row) => cells.get(`${col},${row}`) || null,
        move(brick, fromRow, toRow) {
            for (let c = brick.col; c < brick.col + spanOf(brick); c++) {
                cells.delete(`${c},${fromRow}`);
                cells.set(`${c},${toRow}`, brick);
            }
        },
        /**
         * Vecinos pegados (sin repetir; un jefe cuenta una vez). Por defecto
         * solo ortogonales; con { diagonal: true } también las diagonales.
         */
        neighbors(brick, { diagonal = false } = {}) {
            const row = rowOf(brick);
            const out = new Set();
            const offsets = diagonal ? NEIGHBOR_OFFSETS_8 : NEIGHBOR_OFFSETS_4;
            for (let c = brick.col; c < brick.col + spanOf(brick); c++) {
                for (const [dc, dr] of offsets) {
                    const n = cells.get(`${c + dc},${row + dr}`);
                    if (n && n !== brick) out.add(n);
                }
            }
            return [...out];
        },
    };
}

/** Amenazas activas, en orden de desbloqueo. */
export function getActiveThreats(levels) {
    const out = [];
    for (const [type, level] of Object.entries(levels || {})) {
        if (!ThreatRegistry.has(type) || !(level > 0)) continue;
        const behavior = ThreatRegistry.get(type);
        const lvl = Math.min(level, behavior.levels.length);
        out.push({ type, behavior, level: lvl, params: behavior.levels[lvl - 1] });
    }
    return out.sort((a, b) => a.behavior.order - b.behavior.order);
}

function makeContext(threat, gameState, turn, helpers) {
    let grid = null;
    return {
        level: threat.level,
        params: threat.params,
        turn,
        gameState,
        helpers,
        get grid() {
            if (!grid) grid = buildGrid(gameState.bricks, helpers.getCellSize(), helpers.getTopOffset());
            return grid;
        },
    };
}

/** Una fila nueva acaba de generarse (newBricks son solo los de esa fila). */
export function runRowGenerated(levels, gameState, newBricks, turn, helpers) {
    for (const t of getActiveThreats(levels)) {
        t.behavior.onRowGenerated(newBricks, makeContext(t, gameState, turn, helpers));
    }
}

/** Fin de turno, ANTES de que bajen los bloques. `turn` = el turno que termina. */
export function runTurnEnd(levels, gameState, turn, helpers) {
    for (const t of getActiveThreats(levels)) {
        t.behavior.onTurnEnd(makeContext(t, gameState, turn, helpers));
    }
}

/** Filas EXTRA que avanza el tablero al terminar `turn` (además de la normal). */
export function getExtraAdvance(levels, gameState, turn, helpers) {
    let extra = 0;
    for (const t of getActiveThreats(levels)) {
        extra += t.behavior.getExtraAdvance(makeContext(t, gameState, turn, helpers)) || 0;
    }
    return extra;
}

/** Daño final que recibe un bloque después de los modificadores de amenazas. */
export function modifyDamage(levels, gameState, brick, damage, source, helpers) {
    let result = damage;
    for (const t of getActiveThreats(levels)) {
        result = t.behavior.modifyDamage(brick, result, source, makeContext(t, gameState, gameState.turn, helpers));
    }
    return result;
}

/** ¿Alguna amenaza oculta la información de este bloque (HP, tipo)? */
export function isBrickHidden(levels, gameState, brick, helpers) {
    for (const t of getActiveThreats(levels)) {
        if (t.behavior.hidesBrick(brick, makeContext(t, gameState, gameState.turn, helpers))) return true;
    }
    return false;
}

export function renderBrickOverlays(levels, ctx2d, gameState, brick, rect, helpers) {
    for (const t of getActiveThreats(levels)) {
        t.behavior.renderBrick(ctx2d, brick, rect, makeContext(t, gameState, gameState.turn, helpers));
    }
}

export function renderBoardOverlays(levels, ctx2d, gameState, helpers) {
    for (const t of getActiveThreats(levels)) {
        t.behavior.renderBoard(ctx2d, makeContext(t, gameState, gameState.turn, helpers));
    }
}

/** Datos para el HUD: [{ type, icon, level, maxLevel, hint }] */
export function getHudThreats(levels, gameState, helpers) {
    return getActiveThreats(levels).map(t => ({
        type: t.type,
        icon: t.behavior.icon,
        displayName: t.behavior.displayName,
        level: t.level,
        maxLevel: t.behavior.levels.length,
        hint: t.behavior.getHudHint(makeContext(t, gameState, gameState.turn, helpers)) || '',
        description: t.behavior.describe(t.level),
    }));
}
