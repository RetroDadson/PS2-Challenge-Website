// Client-side filtering for Games page (works offline)
window.gamesFilter = {
    isActive: false,
    searchHandler: null,
    ownedHandler: null,
    excludedHandler: null,
    
    // Check if Blazor is connected
    isBlazorConnected: function() {
        try {
            // Check if Blazor exists and has an active circuit
            return window.Blazor && 
                   window.Blazor._internal && 
                   window.Blazor._internal.navigationManager &&
                   navigator.onLine;
        } catch {
            return false;
        }
    },
    
    // Initialize the filter system
    init: function() {
        // Don't activate if Blazor is connected
        if (this.isBlazorConnected()) {
            console.log('Blazor is connected, filters handled by Blazor');
            return;
        }
        
        console.log('? Blazor disconnected, activating JavaScript filters');
        this.isActive = true;
        
        const searchInput = document.querySelector('.search-input');
        const showOwnedCheckbox = document.querySelector('input[type="checkbox"][id="showOwnedOnly"]');
        const showExcludedCheckbox = document.querySelector('input[type="checkbox"][id="showExcludedGames"]');
        
        // IMPORTANT: Clone and replace inputs to remove Blazor's event handlers
        if (searchInput) {
            const newSearch = searchInput.cloneNode(true);
            searchInput.parentNode.replaceChild(newSearch, searchInput);
            
            this.searchHandler = () => this.applyFilters();
            newSearch.addEventListener('input', this.searchHandler);
            newSearch.addEventListener('keyup', this.searchHandler);
            console.log('? Search input activated');
        }
        
        if (showOwnedCheckbox) {
            const newOwned = showOwnedCheckbox.cloneNode(true);
            showOwnedCheckbox.parentNode.replaceChild(newOwned, showOwnedCheckbox);
            
            // Load saved preference
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
            console.log('? Show Owned checkbox activated');
        }
        
        if (showExcludedCheckbox) {
            const newExcluded = showExcludedCheckbox.cloneNode(true);
            showExcludedCheckbox.parentNode.replaceChild(newExcluded, showExcludedCheckbox);
            
            // Load saved preference
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
            console.log('? Show Excluded checkbox activated');
        }
        
        // Apply filters immediately
        setTimeout(() => this.applyFilters(), 100);
        
        console.log('?? JavaScript filters are now active!');
    },
    
    // Apply all active filters
    applyFilters: function() {
        if (!this.isActive) {
            console.log('Filters not active, skipping');
            return;
        }
        
        const searchInput = document.querySelector('.search-input');
        const showOwnedCheckbox = document.querySelector('input[type="checkbox"][id="showOwnedOnly"]');
        const showExcludedCheckbox = document.querySelector('input[type="checkbox"][id="showExcludedGames"]');
        const rows = document.querySelectorAll('.games-table tbody tr');
        
        const searchQuery = searchInput ? searchInput.value.toLowerCase().trim() : '';
        const showOwnedOnly = showOwnedCheckbox ? showOwnedCheckbox.checked : false;
        const showExcludedGames = showExcludedCheckbox ? showExcludedCheckbox.checked : false;
        
        console.log(`Filtering: search="${searchQuery}", ownedOnly=${showOwnedOnly}, showExcluded=${showExcludedGames}`);
        
        let visibleCount = 0;
        
        rows.forEach(row => {
            let visible = true;
            
            // Search filter
            if (searchQuery) {
                const text = row.textContent.toLowerCase();
                if (!text.includes(searchQuery)) {
                    visible = false;
                }
            }
            
            // Owned filter
            if (showOwnedOnly && visible) {
                const ownedBadge = row.querySelector('.owned-badge');
                if (!ownedBadge) {
                    visible = false;
                }
            }
            
            // Excluded filter
            if (!showExcludedGames && visible) {
                if (row.classList.contains('excluded-row')) {
                    visible = false;
                }
            }
            
            // Apply visibility
            if (visible) {
                row.style.display = '';
                row.style.visibility = 'visible';
                visibleCount++;
            } else {
                row.style.display = 'none';
                row.style.visibility = 'hidden';
            }
        });
        
        // Update count
        this.updateResultsCount(visibleCount, rows.length);
        
        console.log(`? Filtered: ${visibleCount} of ${rows.length} games visible`);
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
        console.log('?? Monitoring for Blazor disconnect...');
        
        let disconnectDetected = false;
        
        // Check periodically if Blazor has disconnected
        const checkInterval = setInterval(() => {
            if (!this.isBlazorConnected() && !this.isActive && !disconnectDetected) {
                console.log('? Blazor disconnect detected');
                disconnectDetected = true;
                clearInterval(checkInterval);
                setTimeout(() => this.init(), 500);
            }
        }, 1000);
        
        // Also listen for offline event
        window.addEventListener('offline', () => {
            console.log('?? Browser went offline');
            if (!this.isActive && !disconnectDetected) {
                disconnectDetected = true;
                clearInterval(checkInterval);
                setTimeout(() => this.init(), 1000);
            }
        });
        
        // Listen for online event to reload
        window.addEventListener('online', () => {
            console.log('? Browser back online - reloading page');
            setTimeout(() => window.location.reload(), 1000);
        });
    }
};

// Start monitoring for Blazor disconnect
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        setTimeout(() => window.gamesFilter.activateOnDisconnect(), 500);
    });
} else {
    setTimeout(() => window.gamesFilter.activateOnDisconnect(), 500);
}
