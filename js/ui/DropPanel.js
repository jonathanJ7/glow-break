/**
 * DropPanel - Tirar bolas del inventario (v2.11.0)
 *
 * Con el tope de inventario (MAX_BALL_INVENTORY) los bonuses de bolas no
 * se agarran si no hay lugar. Este panel deja hacer lugar: por ejemplo
 * tirar 10 normales para poder agarrar especiales.
 *
 * Coherencia de UI — cada dato se muestra en UN solo lugar:
 *  - Total y tope: solo en el HUD de arriba (🎒 N/200). El panel queda por
 *    debajo del HUD, así ese contador se sigue viendo y baja en vivo.
 *  - Cantidad por tipo: en las píldoras de abajo durante el juego; con el
 *    panel abierto, las píldoras quedan tapadas y la cantidad se ve en la
 *    fila de cada tipo, junto a sus botones.
 *
 * Solo se abre entre turnos (sin bolas en vuelo). Siempre queda al menos
 * MIN_BALLS_KEPT bola.
 */

import { gameState, updateUI, saveGame } from '../../game.js';
import { BallRegistry } from '../core/Registry.js';
import { MAX_BALL_INVENTORY } from '../../config.js';
import { dropFromInventory, getInventoryTotal, MIN_BALLS_KEPT } from '../systems/BallInventory.js';

const DROP_STEPS = [1, 10];

function canOpen() {
    return gameState.gameStarted && !gameState.gameOver && !gameState.isShooting;
}

export function isDropPanelOpen() {
    const panel = document.getElementById('dropPanel');
    return !!panel && !panel.classList.contains('hidden');
}

export function openDropPanel() {
    if (!canOpen()) return false;
    renderDropList();
    document.getElementById('dropPanel').classList.remove('hidden');
    return true;
}

export function closeDropPanel() {
    document.getElementById('dropPanel')?.classList.add('hidden');
}

function iconHtml(behavior) {
    if (behavior.icon) return behavior.icon;
    // La normal no tiene emoji: un punto de su color, como en la guía
    return `<span class="drop-dot" style="background:${behavior.color || '#fff'}"></span>`;
}

function renderDropList() {
    const inv = gameState.ballInventory;
    const total = getInventoryTotal(inv);
    const droppable = Math.max(0, total - MIN_BALLS_KEPT);

    document.getElementById('dropHint').textContent =
        `Con ${MAX_BALL_INVENTORY} bolas el inventario se llena y los bonus de bolas no se agarran. `
        + 'Tirá las que no quieras para hacer lugar. Siempre te queda al menos '
        + `${MIN_BALLS_KEPT} bola.`;

    let html = '';
    for (const [type, behavior] of BallRegistry.getAll()) {
        const count = inv[type] || 0;
        if (count <= 0) continue;
        const maxDrop = Math.min(count, droppable);

        const buttons = DROP_STEPS.map(step =>
            `<button class="drop-btn" data-type="${type}" data-count="${step}" ${maxDrop < step ? 'disabled' : ''}>−${step}</button>`
        ).join('');
        const allBtn = `<button class="drop-btn" data-type="${type}" data-count="all" ${maxDrop < 1 ? 'disabled' : ''}>Todas</button>`;

        html += `<div class="drop-row" data-type="${type}">
            <span class="drop-icon">${iconHtml(behavior)}</span>
            <span class="drop-name">${behavior.displayName || type}</span>
            <b class="drop-count">${count}</b>
            <span class="drop-actions">${buttons}${allBtn}</span>
        </div>`;
    }
    document.getElementById('dropList').innerHTML = html;
}

function handleDropClick(e) {
    const btn = e.target.closest('.drop-btn');
    if (!btn || btn.disabled) return;
    if (!canOpen()) { closeDropPanel(); return; }

    const type = btn.dataset.type;
    const count = btn.dataset.count === 'all'
        ? (gameState.ballInventory[type] || 0)
        : Number(btn.dataset.count);

    if (dropFromInventory(gameState.ballInventory, type, count) > 0) {
        updateUI();
        saveGame();
        renderDropList();
    }
}

export function setupDropPanel() {
    const panel = document.getElementById('dropPanel');
    if (!panel) return;

    document.getElementById('ballsHud').addEventListener('click', openDropPanel);
    document.getElementById('ballInventory').addEventListener('click', openDropPanel);
    document.getElementById('dropCloseBtn').addEventListener('click', closeDropPanel);
    document.getElementById('dropList').addEventListener('click', handleDropClick);

    // Tocar fuera de la tarjeta también cierra
    panel.addEventListener('click', (e) => {
        if (e.target === panel) closeDropPanel();
    });
}
