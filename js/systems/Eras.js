/**
 * Eras - Qué amenazas están activas (y a qué nivel) en cada turno.
 *
 * Funciones PURAS: todo se deriva de (turno, dificultad), sin estado. Así
 * empezar en el turno N, reanudar un guardado o jugar desde el turno 1 dan
 * exactamente las mismas amenazas.
 *
 * Reglas (con interval = ERA_SETTINGS[d].interval y N amenazas registradas):
 *   - Era I: turnos 1..interval-1, sin amenazas.
 *   - Era k (k = 2..N+1): se suma la amenaza de `order` k-1 al nivel
 *     ERA_SETTINGS[d].startLevel.
 *   - Era N+2 en adelante: cada era sube +1 nivel a la siguiente amenaza (en
 *     orden, salteando las que ya están al máximo). Con todas al máximo, las
 *     eras siguen contando pero ya no cambian nada.
 */

import { ERA_SETTINGS } from '../../config.js';
import { ThreatRegistry } from '../behaviors/index.js';

function settingsFor(difficulty) {
    return ERA_SETTINGS[difficulty] || ERA_SETTINGS.medium;
}

/** Número de era (1 = Era I) del turno dado. */
export function getEra(turn, difficulty) {
    const { interval } = settingsFor(difficulty);
    return Math.floor(Math.max(1, turn) / interval) + 1;
}

/** Primer turno de una era (Era I empieza en el turno 1). */
export function getEraStartTurn(era, difficulty) {
    const { interval } = settingsFor(difficulty);
    return Math.max(1, (era - 1) * interval);
}

/** Tipos de amenaza en el orden en que se desbloquean. */
export function getThreatOrder() {
    return ThreatRegistry.getTypes()
        .slice()
        .sort((a, b) => ThreatRegistry.get(a).order - ThreatRegistry.get(b).order);
}

export function getMaxLevel(type) {
    return ThreatRegistry.get(type).levels.length;
}

/**
 * Niveles de las amenazas activas en un turno.
 * @returns {Object<string, number>} tipo → nivel (1..max). Las inactivas no aparecen.
 */
export function getThreatLevels(turn, difficulty) {
    const era = getEra(turn, difficulty);
    const { startLevel } = settingsFor(difficulty);
    const order = getThreatOrder();
    const levels = {};

    order.forEach((type, i) => {
        if (era >= i + 2) levels[type] = Math.min(startLevel, getMaxLevel(type));
    });

    let upgrades = Math.max(0, era - (order.length + 1));
    let idx = 0;
    while (upgrades > 0 && order.some(t => levels[t] < getMaxLevel(t))) {
        const type = order[idx % order.length];
        if (levels[type] < getMaxLevel(type)) {
            levels[type]++;
            upgrades--;
        }
        idx++;
    }
    return levels;
}

/**
 * Qué cambió al pasar de un turno al siguiente: era nueva, amenaza nueva o
 * amenaza que subió de nivel. null si no cambió de era.
 */
export function getEraChange(prevTurn, turn, difficulty) {
    const prevEra = getEra(prevTurn, difficulty);
    const era = getEra(turn, difficulty);
    if (era === prevEra) return null;

    const before = getThreatLevels(prevTurn, difficulty);
    const after = getThreatLevels(turn, difficulty);
    const added = [];
    const upgraded = [];
    for (const [type, level] of Object.entries(after)) {
        if (!(type in before)) added.push({ type, level });
        else if (level > before[type]) upgraded.push({ type, level });
    }
    return { era, added, upgraded };
}

const ROMAN = [[100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];

export function toRoman(n) {
    let out = '';
    for (const [value, sym] of ROMAN) {
        while (n >= value) { out += sym; n -= value; }
    }
    return out;
}
