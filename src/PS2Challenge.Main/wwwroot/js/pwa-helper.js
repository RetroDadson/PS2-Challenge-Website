// PWA Helper - Register service worker and manage offline functionality
window.pwaHelper = {
    // Register the service worker
    registerServiceWorker: async function() {
        if ('serviceWorker' in navigator) {
            try {
                const registration = await navigator.serviceWorker.register('/service-worker.js', {
                    scope: '/'
                });
                
                console.log('Service Worker registered successfully:', registration.scope);
                
                // Check for updates periodically
                setInterval(() => {
                    registration.update();
                }, 60000); // Check every minute
                
                // Handle service worker updates
                registration.addEventListener('updatefound', () => {
                    const newWorker = registration.installing;
                    newWorker.addEventListener('statechange', () => {
                        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                            console.log('New service worker available. Reload to update.');
                            // Optionally show a notification to the user
                            if (window.confirm('A new version is available. Reload to update?')) {
                                window.location.reload();
                            }
                        }
                    });
                });
                
                return true;
            } catch (error) {
                console.error('Service Worker registration failed:', error);
                return false;
            }
        } else {
            console.log('Service Workers are not supported in this browser.');
            return false;
        }
    },

    // Check if the app is currently offline
    isOffline: function() {
        return !navigator.onLine;
    },

    // Cache games data for offline use
    cacheGamesData: function(gamesData, ownedTypes, exclusionReasons, completionStatus) {
        if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
            const dataToCache = {
                games: gamesData,
                ownedTypes: ownedTypes,
                exclusionReasons: exclusionReasons,
                completionStatus: completionStatus,
                cachedAt: new Date().toISOString()
            };

            // Send data to service worker for caching
            navigator.serviceWorker.controller.postMessage({
                type: 'CACHE_GAMES_DATA',
                data: dataToCache
            });

            // Also store in localStorage as backup
            try {
                localStorage.setItem('gamesDataCache', JSON.stringify(dataToCache));
                console.log('Games data cached successfully');
            } catch (e) {
                console.error('Failed to cache games data in localStorage:', e);
            }
        } else {
            // Fallback to just localStorage if service worker not available
            try {
                const dataToCache = {
                    games: gamesData,
                    ownedTypes: ownedTypes,
                    exclusionReasons: exclusionReasons,
                    completionStatus: completionStatus,
                    cachedAt: new Date().toISOString()
                };
                localStorage.setItem('gamesDataCache', JSON.stringify(dataToCache));
                console.log('Games data cached in localStorage (service worker not available)');
            } catch (e) {
                console.error('Failed to cache games data in localStorage:', e);
            }
        }
    },

    // Get cached games data
    getCachedGamesData: function() {
        try {
            const cached = localStorage.getItem('gamesDataCache');
            if (cached) {
                return JSON.parse(cached);
            }
        } catch (e) {
            console.error('Failed to retrieve cached games data:', e);
        }
        return null;
    },

    // Listen for online/offline events
    setupOnlineOfflineListeners: function(dotNetHelper) {
        window.addEventListener('online', () => {
            console.log('App is now online');
            // Reload to reconnect to Blazor Server
            if (window.location.pathname.includes('offline-games')) {
                window.location.href = '/games';
            } else if (dotNetHelper) {
                dotNetHelper.invokeMethodAsync('OnNetworkStatusChanged', true).catch(() => {
                    // If we can't invoke the method, we're still disconnected
                    console.log('Blazor still disconnected, reloading...');
                    window.location.reload();
                });
            }
        });

        window.addEventListener('offline', () => {
            console.log('App is now offline');
            if (dotNetHelper) {
                dotNetHelper.invokeMethodAsync('OnNetworkStatusChanged', false).catch(() => {
                    // Method invocation failed, likely already disconnected
                    console.log('Blazor disconnected');
                });
            }
        });
    },

    // Redirect to offline page if needed
    redirectToOfflineIfNeeded: function() {
        if (!navigator.onLine && window.location.pathname === '/games') {
            window.location.href = '/offline-games.html';
        }
    }
};

// Auto-register service worker on page load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.pwaHelper.registerServiceWorker();
        
        // Check if we should redirect to offline page
        setTimeout(() => {
            window.pwaHelper.redirectToOfflineIfNeeded();
        }, 1000);
    });
} else {
    window.pwaHelper.registerServiceWorker();
    
    // Check if we should redirect to offline page
    setTimeout(() => {
        window.pwaHelper.redirectToOfflineIfNeeded();
    }, 1000);
}
