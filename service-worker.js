// Version: Update this when deploying new versions
const APP_VERSION = '2.3.4';
const CACHE_NAME = `ballz-${APP_VERSION}`;

const urlsToCache = [
  './',
  './index.html',
  './manifest.json',
  './main.js',
  './game.js',
  './input.js',
  './physics.js',
  './rendering.js',
  './config.js',
  './styles.css',
  // Core modules
  './js/core/Constants.js',
  './js/core/Config.js',
  './js/core/Registry.js',
  // Behaviors (Strategy Pattern)
  './js/behaviors/index.js',
  './js/behaviors/BrickBehaviors.js',
  './js/behaviors/BallBehaviors.js',
  './js/behaviors/BonusBehaviors.js',
  // Systems
  './js/systems/BrickGenerator.js',
  './js/systems/CollisionSystem.js',
  // Utils
  './js/utils/CanvasUtils.js',
  './js/utils/MathUtils.js',
  // Entities
  './js/entities/Particle.js',
  './js/entities/Ball.js',
  './js/entities/Bonus.js',
  './js/entities/Brick.js',
  // Assets
  './icon-192.png',
  './icon-512.png'
];

// Install: cache all files
self.addEventListener('install', event => {
  console.log(`[SW] Installing version ${APP_VERSION}`);
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
      .then(() => {
        console.log(`[SW] Version ${APP_VERSION} installed`);
        self.skipWaiting();
      })
  );
});

// Activate: clean old caches and notify clients
self.addEventListener('activate', event => {
  console.log(`[SW] Activating version ${APP_VERSION}`);
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames
          .filter(name => name.startsWith('ballz-') && name !== CACHE_NAME)
          .map(name => {
            console.log(`[SW] Deleting old cache: ${name}`);
            return caches.delete(name);
          })
      );
    }).then(() => {
      // Notify all clients about the update
      return self.clients.matchAll().then(clients => {
        clients.forEach(client => {
          client.postMessage({
            type: 'SW_UPDATED',
            version: APP_VERSION
          });
        });
      });
    }).then(() => self.clients.claim())
  );
});

// Fetch: Network-first for HTML, Cache-first for assets
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Network-first for HTML (to get updates faster)
  if (event.request.mode === 'navigate' || url.pathname.endsWith('.html') || url.pathname === '/' || url.pathname.endsWith('/')) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          // Clone and cache the new response
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseClone);
          });
          return response;
        })
        .catch(() => {
          // Fallback to cache if offline
          return caches.match(event.request);
        })
    );
    return;
  }

  // Stale-while-revalidate for JS/CSS (serve from cache, update in background)
  if (url.pathname.endsWith('.js') || url.pathname.endsWith('.css')) {
    event.respondWith(
      caches.open(CACHE_NAME).then(cache => {
        return cache.match(event.request).then(cachedResponse => {
          const fetchPromise = fetch(event.request).then(networkResponse => {
            cache.put(event.request, networkResponse.clone());
            return networkResponse;
          }).catch(() => cachedResponse);

          return cachedResponse || fetchPromise;
        });
      })
    );
    return;
  }

  // Cache-first for other assets (images, etc.)
  event.respondWith(
    caches.match(event.request)
      .then(response => response || fetch(event.request))
  );
});

// Handle messages from clients
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'GET_VERSION') {
    event.ports[0].postMessage({ version: APP_VERSION });
  }

  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
