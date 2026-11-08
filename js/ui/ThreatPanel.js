/**
 * ThreatPanel - Detalle de las amenazas activas de la era.
 *
 * Se abre tocando el chip de amenazas del HUD (#threatHud). El contenido
 * lo genera game.js (getThreatPanelHtml) desde los behaviors registrados,
 * así que muestra exactamente el nivel y los números vigentes.
 */

import { gameState, getThreatPanelHtml } from '../../game.js';

export function openThreatPanel() {
    if (!gameState.gameStarted || gameState.gameOver) return false;
    document.getElementById('threatPanelBody').innerHTML = getThreatPanelHtml();
    document.getElementById('threatPanel').classList.remove('hidden');
    return true;
}

export function closeThreatPanel() {
    document.getElementById('threatPanel')?.classList.add('hidden');
}

export function setupThreatPanel() {
    document.getElementById('threatHud')?.addEventListener('click', openThreatPanel);
    document.getElementById('threatCloseBtn')?.addEventListener('click', closeThreatPanel);
    // Tocar fuera de la tarjeta también cierra
    document.getElementById('threatPanel')?.addEventListener('click', (e) => {
        if (e.target.id === 'threatPanel') closeThreatPanel();
    });
}
