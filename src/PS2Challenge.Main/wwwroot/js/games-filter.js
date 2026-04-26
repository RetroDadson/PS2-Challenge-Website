// Client-side filtering for Games page (works offline)
globalThis.gamesFilter = {
    isActive: false,
    searchHandler: null,
    ownedHandler: null,
    excludedHandler: null,

    // Check if Blazor is connected
    isBlazorConnected: function() {
        try {
                 return globalThis.Blazor?._internal?.navigationManager &&
                   navigator.onLine;
        } catch {
            return false;
        }
    },

    // Initialize the filter system
    init: function() {
        if (this.isBlazorConnected()) return;

        console.log('JavaScript filters activated');
        this.isActive = true;

        const searchInput = document.querySelector('.search-input');
        const showOwnedCheckbox = document.querySelector('input[type="checkbox"][id="showOwnedOnly"]');
        const showExcludedCheckbox = document.querySelector('input[type="checkbox"][id="showExcludedGames"]');

        if (searchInput) {
            const newSearch = searchInput.cloneNode(true);
            searchInput.parentNode.replaceChild(newSearch, searchInput);
            this.searchHandler = () => this.applyFilters();
            newSearch.addEventListener('input', this.searchHandler);
            newSearch.addEventListener('keyup', this.searchHandler);
        }

        if (showOwnedCheckbox) {
            const newOwned = showOwnedCheckbox.cloneNode(true);
            showOwnedCheckbox.parentNode.replaceChild(newOwned, showOwnedCheckbox);

            const savedOwned = localStorage.getItem('showOwnedOnly');
            if (savedOwned !== null) {
                newOwned.checked = savedOwned === 'true';
            }

            this.ownedHandler = (e) => {
                localStorage.setItem('showOwnedOnly', e.target.checked);
                this.applyFilters();
            };
            newOwned.addEventListener('change', this.ownedHandler);
            newOwned.addEventListener('click', this.ownedHandler);
        }

        if (showExcludedCheckbox) {
            const newExcluded = showExcludedCheckbox.cloneNode(true);
            showExcludedCheckbox.parentNode.replaceChild(newExcluded, showExcludedCheckbox);

            const savedExcluded = localStorage.getItem('showExcludedGames');
            if (savedExcluded !== null) {
                newExcluded.checked = savedExcluded === 'true';
            }

            this.excludedHandler = (e) => {
                localStorage.setItem('showExcludedGames', e.target.checked);
                this.applyFilters();
            };
            newExcluded.addEventListener('change', this.excludedHandler);
            newExcluded.addEventListener('click', this.excludedHandler);
        }

        setTimeout(() => this.applyFilters(), 100);
    },

    // Apply all active filters
    applyFilters: function() {
        if (!this.isActive) return;

        const searchInput = document.querySelector('.search-input');
        const showOwnedCheckbox = document.querySelector('input[type="checkbox"][id="showOwnedOnly"]');
        const showExcludedCheckbox = document.querySelector('input[type="checkbox"][id="showExcludedGames"]');
        const rows = document.querySelectorAll('.games-table tbody tr');

        const searchQuery = searchInput ? searchInput.value.toLowerCase().trim() : '';
        const showOwnedOnly = showOwnedCheckbox ? showOwnedCheckbox.checked : false;
        const showExcludedGames = showExcludedCheckbox ? showExcludedCheckbox.checked : false;

        let visibleCount = 0;

        rows.forEach(row => {
            let visible = true;

            if (searchQuery) {
                const text = row.textContent.toLowerCase();
                if (!text.includes(searchQuery)) {
                    visible = false;
                }
            }

            if (showOwnedOnly && visible) {
                const ownedBadge = row.querySelector('.owned-badge');
                if (!ownedBadge) {
                    visible = false;
                }
            }

            if (!showExcludedGames && visible) {
                if (row.classList.contains('excluded-row')) {
                    visible = false;
                }
            }

            if (visible) {
                row.style.display = '';
                row.style.visibility = 'visible';
                visibleCount++;
            } else {
                row.style.display = 'none';
                row.style.visibility = 'hidden';
            }
        });

        this.updateResultsCount(visibleCount, rows.length);
    },

    // Update the results count display
    updateResultsCount: function(visible, total) {
        const resultsCount = document.querySelector('.results-count p');
        if (resultsCount) {
            const parts = resultsCount.textContent.split('|');
            if (parts.length > 0) {
                parts[0] = `Showing ${visible} of ${total} games `;
                resultsCount.textContent = parts.join('|');
            }
        }
    },

    // Activate when Blazor disconnects
    activateOnDisconnect: function() {
        let disconnectDetected = false;

        const checkInterval = setInterval(() => {
            if (!this.isBlazorConnected() && !this.isActive && !disconnectDetected) {
                disconnectDetected = true;
                clearInterval(checkInterval);
                setTimeout(() => this.init(), 500);
            }
        }, 1000);

        globalThis.addEventListener('offline', () => {
            if (!this.isActive && !disconnectDetected) {
                disconnectDetected = true;
                clearInterval(checkInterval);
                setTimeout(() => this.init(), 1000);
            }
        });

        globalThis.addEventListener('online', () => {
            setTimeout(() => globalThis.location.reload(), 1000);
        });
    }
};

// Start monitoring for Blazor disconnect
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        setTimeout(() => globalThis.gamesFilter.activateOnDisconnect(), 500);
    });
} else {
    setTimeout(() => globalThis.gamesFilter.activateOnDisconnect(), 500);
}

// Helper for Blazor incremental table loading
globalThis.gamesScroll = {
    shouldLoadMore: function(container, thresholdPx = 220) {
        if (!container) {
            return false;
        }

        return (container.scrollTop + container.clientHeight) >= (container.scrollHeight - thresholdPx);
    }
};

