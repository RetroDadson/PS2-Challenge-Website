// Cover hover effect that follows the mouse cursor
globalThis.coverHoverHelper = {
    initialize: function() {
        document.addEventListener('mouseover', function(e) {
            const coverWrapper = e.target.closest('.cover-wrapper');
            if (coverWrapper) {
                const img = coverWrapper.querySelector('.game-cover');
                if (img) {
                    img.dataset.following = 'true';
                    coverHoverHelper.updatePosition(e, img);
                }
            }
        });

        document.addEventListener('mousemove', function(e) {
            const coverWrapper = e.target.closest('.cover-wrapper');
            if (coverWrapper) {
                const img = coverWrapper.querySelector('.game-cover');
                if (img?.dataset.following === 'true') {
                    coverHoverHelper.updatePosition(e, img);
                }
            }
        });

        document.addEventListener('mouseout', function(e) {
            const coverWrapper = e.target.closest('.cover-wrapper');
            if (coverWrapper) {
                const img = coverWrapper.querySelector('.game-cover');
                if (img) {
                    img.dataset.following = 'false';
                    img.style.removeProperty('--mouse-x');
                    img.style.removeProperty('--mouse-y');
                }
            }
        });
    },

    updatePosition: function(event, img) {
        // Use clientX/clientY which are relative to the viewport
        // This works correctly even when the table is scrolled because
        // position: fixed is relative to the viewport
        img.style.setProperty('--mouse-x', event.clientX + 'px');
        img.style.setProperty('--mouse-y', event.clientY + 'px');
    }
};

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
        globalThis.coverHoverHelper.initialize();
    });
} else {
    globalThis.coverHoverHelper.initialize();
}
