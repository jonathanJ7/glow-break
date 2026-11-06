/**
 * BallInventory - Tope de bolas del inventario (v2.11.0)
 *
 * El inventario total (todas las bolas, de todos los tipos) no puede pasar
 * de MAX_BALL_INVENTORY. Antes el tope solo existía en la cola de disparo:
 * podías juntar 290 bolas pero salían 200, y las 90 restantes eran un
 * número que no hacía nada. Ahora el tope es del inventario:
 *
 *  - Con el inventario lleno, los bonuses de bolas NO se agarran: la bola
 *    pasa de largo y el bonus sigue en el tablero (se dibuja apagado).
 *    Si entran algunas pero no todas, se agarran las que entran y el bonus
 *    se queda con el resto.
 *  - El resto de las fuentes (combo, dorado, misterioso, jefe) suman solo
 *    lo que entra.
 *  - El jugador puede TIRAR bolas entre turnos (panel 🎒) para hacer lugar
 *    a otras, por ejemplo tirar normales para poder agarrar especiales.
 *
 * Todas las funciones reciben el objeto inventario ({tipo: cantidad}) y
 * solo cuentan los tipos registrados, igual que getTotalBalls.
 */

import { BallRegistry } from '../core/Registry.js';
import { MAX_BALL_INVENTORY } from '../../config.js';

/** Mínimo de bolas que siempre conservás (no podés tirar la última). */
export const MIN_BALLS_KEPT = 1;

export function getInventoryTotal(inventory) {
    let sum = 0;
    for (const type of BallRegistry.getTypes()) {
        sum += inventory[type] || 0;
    }
    return sum;
}

export function getFreeSpace(inventory) {
    return Math.max(0, MAX_BALL_INVENTORY - getInventoryTotal(inventory));
}

export function isInventoryFull(inventory) {
    return getFreeSpace(inventory) === 0;
}

/**
 * Suma hasta `count` bolas de `type`, sin pasar el tope.
 * @returns {number} cuántas entraron de verdad
 */
export function addToInventory(inventory, type, count) {
    const granted = Math.max(0, Math.min(count, getFreeSpace(inventory)));
    if (granted > 0) {
        inventory[type] = (inventory[type] || 0) + granted;
    }
    return granted;
}

/**
 * Tira hasta `count` bolas de `type`, siempre conservando MIN_BALLS_KEPT
 * en total.
 * @returns {number} cuántas se tiraron de verdad
 */
export function dropFromInventory(inventory, type, count) {
    const have = inventory[type] || 0;
    const droppableTotal = Math.max(0, getInventoryTotal(inventory) - MIN_BALLS_KEPT);
    const dropped = Math.max(0, Math.min(count, have, droppableTotal));
    if (dropped > 0) {
        inventory[type] = have - dropped;
    }
    return dropped;
}

/**
 * Recorta un inventario que excede el tope (guardados anteriores a
 * v2.11.0). Se descartan primero las normales, porque las especiales son
 * las valiosas — la misma prioridad que usaba la cola de disparo.
 * @returns {number} cuántas bolas se descartaron
 */
export function clampInventory(inventory) {
    let excess = getInventoryTotal(inventory) - MAX_BALL_INVENTORY;
    if (excess <= 0) return 0;
    const removedTotal = excess;

    const order = [BallRegistry.defaultType,
        ...BallRegistry.getTypes().filter(t => t !== BallRegistry.defaultType)];
    for (const type of order) {
        if (excess <= 0) break;
        const take = Math.min(excess, inventory[type] || 0);
        inventory[type] = (inventory[type] || 0) - take;
        excess -= take;
    }
    return removedTotal;
}
