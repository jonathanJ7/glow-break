import { initCanvas, resizeCanvas, handleResize, draw } from './rendering.js';
import { setupEventListeners } from './input.js';
import { gameLoop, events } from './game.js';
import { setupVillain } from './js/ui/villain/Villain.js';
import { setupGuide } from './js/ui/Guide.js';
import { setupDropPanel } from './js/ui/DropPanel.js';
import { setupThreatPanel } from './js/ui/ThreatPanel.js';
import { LOGIC_STEP_MS, MAX_CATCHUP_STEPS } from './config.js';

// Initialize canvas
initCanvas();
resizeCanvas();

// Setup resize handler. El tamaño del contenedor se cachea (ver
// resizeCanvas), así que también escuchamos cambios del propio contenedor.
window.addEventListener('resize', handleResize);
if (typeof ResizeObserver !== 'undefined') {
    const container = document.getElementById('gameContainer');
    let lastW = container.clientWidth;
    let lastH = container.clientHeight;
    new ResizeObserver(() => {
        if (container.clientWidth === lastW && container.clientHeight === lastH) return;
        lastW = container.clientWidth;
        lastH = container.clientHeight;
        handleResize();
    }).observe(container);
}

// Setup event listeners
setupEventListeners();

// Guía del juego (botón en el menú principal)
setupGuide();

// Panel para tirar bolas (se abre tocando 🎒 en el HUD)
setupDropPanel();

// Panel de amenazas de la era (se abre tocando el chip de amenazas del HUD)
setupThreatPanel();

// Villano del espacio libre: reacciona a los eventos del juego
setupVillain(events);

// Game loop. La lógica avanza por pasos fijos del cuadro de 60 Hz: si un
// cuadro se atrasa (celular ocupado, ahorro de batería), se dan pasos extra
// para no ir en cámara lenta. Nunca menos de 1 paso por cuadro, así en
// pantallas rápidas el juego se comporta como siempre.
let lastFrameTime = null;
let stepDebt = 0;

function animate(now) {
    if (lastFrameTime === null) lastFrameTime = now;
    // Tope de 250 ms: al volver de segundo plano no se intenta recuperar todo
    stepDebt += Math.min(now - lastFrameTime, 250);
    lastFrameTime = now;

    const steps = Math.min(MAX_CATCHUP_STEPS, Math.max(1, Math.floor(stepDebt / LOGIC_STEP_MS)));
    stepDebt = Math.max(0, stepDebt - steps * LOGIC_STEP_MS);
    // Lo que no se alcanzó a recuperar se descarta: mejor un tirón que una
    // espiral de cuadros cada vez más lentos.
    if (stepDebt > LOGIC_STEP_MS) stepDebt = 0;

    for (let i = 0; i < steps; i++) gameLoop();
    draw();
    requestAnimationFrame(animate);
}

// Start
requestAnimationFrame(animate);

// Register Service Worker for PWA with update detection
if ('serviceWorker' in navigator) {
    let refreshing = false;
    let swRegistration = null;

    // Snapshot whether the page was already SW-controlled at load time.
    // The SW calls clients.claim() on first activation, which fires
    // controllerchange on a brand-new (uncontrolled) page. Reloading there
    // would cause a flicker for first-time users and races mid-test.
    // We only want to reload when an *updated* SW takes over a page that
    // was already controlled — the real "new version is live" case.
    const hadControllerOnLoad = !!navigator.serviceWorker.controller;

    // Listen for controller changes (new SW activated)
    navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!hadControllerOnLoad) return;
        if (!refreshing) {
            refreshing = true;
            window.location.reload();
        }
    });

    // Listen for messages from SW
    navigator.serviceWorker.addEventListener('message', event => {
        if (event.data && event.data.type === 'SW_UPDATED') {
            console.log(`[App] SW updated to version ${event.data.version}`);
            showUpdateBanner();
        }
    });

    navigator.serviceWorker.register('service-worker.js')
        .then(reg => {
            swRegistration = reg;
            console.log('Service Worker registrado');

            // Check for updates periodically (every 5 minutes)
            setInterval(() => {
                reg.update().catch(() => {}); // sin conexión: se reintenta después
            }, 5 * 60 * 1000);

            // Check for updates on page load
            reg.update().catch(() => {});

            // Handle waiting service worker
            if (reg.waiting) {
                showUpdateBanner();
            }

            // Detect when a new SW is waiting
            reg.addEventListener('updatefound', () => {
                const newWorker = reg.installing;
                newWorker.addEventListener('statechange', () => {
                    if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                        // New version available
                        showUpdateBanner();
                    }
                });
            });
        })
        .catch(err => console.log('Error registrando SW:', err));

    // Show update banner
    function showUpdateBanner() {
        const banner = document.getElementById('updateBanner');
        if (banner) {
            banner.classList.remove('hidden');
        }
    }

    // Update button click handler
    document.addEventListener('DOMContentLoaded', () => {
        const updateBtn = document.getElementById('updateBtn');
        if (updateBtn) {
            updateBtn.addEventListener('click', () => {
                // Send SKIP_WAITING to the waiting SW (not the current controller)
                if (swRegistration && swRegistration.waiting) {
                    swRegistration.waiting.postMessage({ type: 'SKIP_WAITING' });
                    // The 'controllerchange' listener will handle the reload
                } else {
                    // Fallback: force reload to get latest version
                    window.location.reload(true);
                }
            });
        }
    });
}
