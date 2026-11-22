// Version: Update this when deploying new versions
const APP_VERSION = '2.15.0';
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
  './js/core/Registry.js',
  // Behaviors (Strategy Pattern)
  './js/behaviors/index.js',
  './js/behaviors/BrickBehaviors.js',
  './js/behaviors/BallBehaviors.js',
  './js/behaviors/BonusBehaviors.js',
  './js/behaviors/ThreatBehaviors.js',
  // Systems
  './js/systems/CollisionSystem.js',
  './js/systems/BrickSurfaces.js',
  './js/systems/BallInventory.js',
  './js/systems/Eras.js',
  './js/systems/ThreatSystem.js',
  './js/systems/WeakSpots.js',
  './js/systems/VillainDirector.js',
  // UI
  './js/ui/Guide.js',
  './js/ui/DropPanel.js',
  './js/ui/ThreatPanel.js',
  './js/ui/villain/Villain.js',
  './js/ui/villain/ArquitectoSprite.js',
  './js/ui/villain/NeonPainter.js',
  './js/ui/villain/VillainSpriteCache.js',
  // Assets
  './icon-192.png',
  './icon-512.png'
];

// Install: cache all files.
// `cache: 'reload'` saltea la caché HTTP del navegador: sin esto, addAll
// podía guardar archivos de una versión anterior y, sin conexión, el juego
// corría con módulos de versiones mezcladas.
self.addEventListener('install', event => {
  console.log(`[SW] Installing version ${APP_VERSION}`);
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache.map(url => new Request(url, { cache: 'reload' }))))
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

// ====================================
// FETCH — el juego tiene que andar sin conexión (modo avión)
// ====================================

// Con señal mala la red puede tardar muchísimo sin fallar nunca; pasado este
// tiempo se sirve la copia en caché (si existe) en vez de dejar la pantalla
// en blanco.
const NETWORK_TIMEOUT_MS = 3000;

/** Guarda la respuesta solo si es buena: un 404/500 nunca pisa la copia que funciona. */
function cacheIfOk(request, response) {
  if (response && response.ok && response.type !== 'opaque') {
    const clone = response.clone();
    caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
  }
  return response;
}

/** Copia en caché: exacta, después ignorando la query (?source=pwa, ?v=...). */
async function fromCache(request) {
  return (await caches.match(request)) || (await caches.match(request, { ignoreSearch: true }));
}

/** Página del juego en caché para cualquier navegación, tenga la URL que tenga. */
async function cachedPage(request) {
  return (await fromCache(request))
    || (await caches.match('./index.html'))
    || (await caches.match('./'));
}

/**
 * Network-first con red de seguridad: intenta la red (para recibir
 * actualizaciones rápido), pero si falla, devuelve un error HTTP o tarda más
 * de NETWORK_TIMEOUT_MS y hay copia en caché, usa la copia.
 */
function networkFirst(request, networkRequest, fallback) {
  return new Promise(resolve => {
    let settled = false;
    const finish = response => {
      if (!settled && response) {
        settled = true;
        resolve(response);
      }
    };
    const useFallback = () => fallback().then(cached => {
      if (cached) finish(cached);
      return cached;
    });

    const timer = setTimeout(useFallback, NETWORK_TIMEOUT_MS);

    fetch(networkRequest)
      .then(response => {
        clearTimeout(timer);
        cacheIfOk(request, response);
        if (response.ok) {
          finish(response);
        } else {
          // Error del servidor: preferir la copia buena si la hay
          useFallback().then(cached => finish(cached || response));
        }
      })
      .catch(() => {
        clearTimeout(timer);
        useFallback().then(cached => finish(cached || Response.error()));
      });
  });
}

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  // HTML / navegación
  if (event.request.mode === 'navigate' || url.pathname.endsWith('.html') || url.pathname.endsWith('/')) {
    event.respondWith(networkFirst(event.request, event.request, () => cachedPage(event.request)));
    return;
  }

  // JS/CSS: network-first con cache busting (param de versión para saltear
  // la caché HTTP del navegador); la copia se guarda con la URL original
  if (url.pathname.endsWith('.js') || url.pathname.endsWith('.css')) {
    const bustUrl = new URL(event.request.url);
    bustUrl.searchParams.set('v', APP_VERSION);
    const networkRequest = new Request(bustUrl.toString(), {
      cache: 'no-cache',
      headers: event.request.headers
    });
    event.respondWith(networkFirst(event.request, networkRequest, () => fromCache(event.request)));
    return;
  }

  // Resto (imágenes, manifest...): cache-first
  event.respondWith(
    fromCache(event.request).then(cached => cached || fetch(event.request).then(r => cacheIfOk(event.request, r)))
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
