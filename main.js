import { initCanvas, resizeCanvas, handleResize, draw } from './rendering.js';
import { setupEventListeners } from './input.js';
import { createMenuBalls, gameLoop } from './game.js';

// Initialize canvas
initCanvas();
resizeCanvas();

// Setup resize handler
window.addEventListener('resize', handleResize);

// Setup event listeners
setupEventListeners();

// Game loop
function animate() {
    gameLoop();
    draw();
    requestAnimationFrame(animate);
}

// Start
createMenuBalls();
animate();

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
                reg.update();
            }, 5 * 60 * 1000);

            // Check for updates on page load
            reg.update();

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
