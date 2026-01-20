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

// Register Service Worker for PWA
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('service-worker.js')
        .then(reg => console.log('Service Worker registrado'))
        .catch(err => console.log('Error registrando SW:', err));
}
