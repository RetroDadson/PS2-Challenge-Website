// Service Worker for PS2 Challenge PWA
const CACHE_NAME = 'ps2-challenge-v1';
const GAMES_DATA_CACHE = 'ps2-games-data-v1';

// Assets to cache on install
const ASSETS_TO_CACHE = [
    '/',
    '/games',
    '/css/app.css',
    '/css/navmenu.css',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css'
];

// Install event - cache essential assets
self.addEventListener('install', (event) => {
    console.log('[Service Worker] Installing...');
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('[Service Worker] Caching app shell');
                return cache.addAll(ASSETS_TO_CACHE.map(url => new Request(url, {cache: 'reload'})));
            })
            .catch((error) => {
                console.error('[Service Worker] Cache failed:', error);
            })
    );
    self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
    console.log('[Service Worker] Activating...');
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME && cacheName !== GAMES_DATA_CACHE) {
                        console.log('[Service Worker] Deleting old cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
    self.clients.claim();
});

// Fetch event - serve from cache when offline
self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    // Handle API calls for games data with network-first strategy
    if (url.pathname.includes('/api/games') && !url.pathname.includes('/api/games/progress')) {
        event.respondWith(
            fetch(request)
                .then((response) => {
                    // Clone the response before caching
                    const responseToCache = response.clone();
                    
                    caches.open(GAMES_DATA_CACHE).then((cache) => {
                        cache.put(request, responseToCache);
                    });
                    
                    return response;
                })
                .catch(() => {
                    // If network fails, try to serve from cache
                    return caches.match(request).then((cachedResponse) => {
                        if (cachedResponse) {
                            console.log('[Service Worker] Serving games data from cache');
                            return cachedResponse;
                        }
                        
                        // Return offline response if no cache available
                        return new Response(
                            JSON.stringify({ 
                                error: 'Offline', 
                                message: 'No cached data available',
                                offline: true 
                            }),
                            {
                                headers: { 'Content-Type': 'application/json' },
                                status: 503
                            }
                        );
                    });
                })
        );
        return;
    }

    // For all other requests, use cache-first strategy for static assets
    event.respondWith(
        caches.match(request).then((cachedResponse) => {
            if (cachedResponse) {
                return cachedResponse;
            }

            return fetch(request).then((response) => {
                // Don't cache non-successful responses or non-GET requests
                if (!response || response.status !== 200 || request.method !== 'GET') {
                    return response;
                }

                // Clone the response
                const responseToCache = response.clone();

                caches.open(CACHE_NAME).then((cache) => {
                    cache.put(request, responseToCache);
                });

                return response;
            }).catch(() => {
                // Offline fallback for navigation requests
                if (request.mode === 'navigate') {
                    return caches.match('/');
                }
            });
        })
    );
});

// Listen for messages from the client
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
    
    if (event.data && event.data.type === 'CACHE_GAMES_DATA') {
        // Cache games data sent from the client
        const gamesData = event.data.data;
        caches.open(GAMES_DATA_CACHE).then((cache) => {
            const response = new Response(JSON.stringify(gamesData), {
                headers: { 'Content-Type': 'application/json' }
            });
            cache.put('/api/games', response);
            console.log('[Service Worker] Games data cached');
        });
    }
});
