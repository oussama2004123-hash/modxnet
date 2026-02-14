// Mobile-First JavaScript - Optimized for Instant Content Locker Display

(function() {
    'use strict';

    // State management
    const state = {
        hasVoted: false,
        currentVotes: 10434,
        currentRating: 4.5,
        isScrolling: false,
        scrollTimer: null,
        abmInitialized: false,
        abmReady: false,
        lockerContainer: null,
        lockerWrapper: null,
        abmInjectedElement: null
    };

    // Initialize when DOM is ready
    document.addEventListener('DOMContentLoaded', function() {
        initAdBlueMedia();
        initRatingSystem();
        initScrollPrevention();
        initScreenshotSwipe();
        updateGetItOn();
    });

    // Preload AdBlueMedia Script (DO NOT Initialize Until Button Click)
    function initAdBlueMedia() {
        // Get container elements (not used for display, just for reference)
        state.lockerContainer = document.getElementById('abm-locker-container');
        state.lockerWrapper = document.getElementById('abm-locker-wrapper');

        // Check if AdBlueMedia script is loaded (but DO NOT call _MS() yet)
        let checkCount = 0;
        const maxChecks = 100; // Max 5 seconds (100 * 50ms)
        
        function checkAdBlueMediaReady() {
            checkCount++;
            
            if (typeof _MS === 'function' && window.LSggc_lIq_uBTErc) {
                // Script is ready - mark as ready but DO NOT initialize
                // We will only call _MS() when button is clicked
                state.abmReady = true;
                // DO NOT call _MS() here - wait for button click
            } else if (checkCount < maxChecks) {
                // Script not ready yet, check again
                setTimeout(checkAdBlueMediaReady, 50);
            } else {
                // Timeout - mark as ready anyway (script might load later)
                state.abmReady = true;
            }
        }

        // Start checking for script readiness immediately
        checkAdBlueMediaReady();
        
        // Monitor for AdBlueMedia content injection and HIDE it if it appears automatically
        const observer = new MutationObserver(function(mutations) {
            mutations.forEach(function(mutation) {
                mutation.addedNodes.forEach(function(node) {
                    if (node.nodeType === 1) { // Element node
                        // Check if this is AdBlueMedia content
                        const isABMContent = node.id && (
                            node.id.includes('abm') || 
                            node.id.includes('adbluemedia') ||
                            node.className && (
                                node.className.includes('abm') ||
                                node.className.includes('adbluemedia')
                            )
                        );
                        
                        // Also check for common AdBlueMedia patterns (high z-index overlays)
                        const hasHighZIndex = node.style && node.style.zIndex && parseInt(node.style.zIndex) > 10000;
                        
                        if (isABMContent || hasHighZIndex) {
                            // This is AdBlueMedia content - HIDE it until button is clicked
                            if (node.style) {
                                node.style.setProperty('display', 'none', 'important');
                                node.style.setProperty('opacity', '0', 'important');
                                node.style.setProperty('visibility', 'hidden', 'important');
                                node.style.transition = 'none';
                                node.style.animation = 'none';
                            }
                            
                            // Store reference for later use
                            if (!state.abmInjectedElement) {
                                state.abmInjectedElement = node;
                            }
                        }
                    }
                });
            });
        });
        
        // Observe body for AdBlueMedia injections
        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    // Show Content Locker - ONLY Called on Button Click - No Black Screen
    window.showContentLocker = function(platform) {
        // Show any previously hidden AdBlueMedia content first
        if (state.abmInjectedElement && state.abmInjectedElement.style) {
            state.abmInjectedElement.style.setProperty('display', 'block', 'important');
            state.abmInjectedElement.style.setProperty('opacity', '1', 'important');
            state.abmInjectedElement.style.setProperty('visibility', 'visible', 'important');
        }
        
        // Search for any AdBlueMedia elements that might have been injected and show them
        const abmElements = document.querySelectorAll('[id*="abm"], [id*="adbluemedia"], [class*="abm"], [class*="adbluemedia"]');
        abmElements.forEach(function(el) {
            if (el.style && parseInt(el.style.zIndex || 0) > 10000) {
                el.style.setProperty('display', 'block', 'important');
                el.style.setProperty('opacity', '1', 'important');
                el.style.setProperty('visibility', 'visible', 'important');
            }
        });

        // Call _MS() to show the locker directly - no black screen, no effects
        if (typeof _MS === 'function') {
            try {
                _MS();
                state.abmInitialized = true;
            } catch (e) {
                console.error('AdBlueMedia _MS() call error:', e);
            }
        } else {
            // Script not ready yet, wait a bit and try again
            setTimeout(function() {
                if (typeof _MS === 'function') {
                    try {
                        _MS();
                        state.abmInitialized = true;
                    } catch (e) {
                        console.error('AdBlueMedia _MS() call error:', e);
                    }
                }
            }, 100);
        }
    };

    // Rating System
    function initRatingSystem() {
        const starsContainer = document.getElementById('starsContainer');
        const votesCountElement = document.getElementById('votesCount');
        
        if (!starsContainer || !votesCountElement) return;

        // Format number with commas
        function formatNumber(num) {
            return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
        }

        // Update votes display
        function updateVotesDisplay() {
            votesCountElement.textContent = formatNumber(state.currentVotes) + ' votes';
        }

        // Handle star click
        function handleStarClick(e) {
            // Prevent action if scrolling or already voted
            if (state.isScrolling || state.hasVoted) {
                e.preventDefault();
                e.stopPropagation();
                return false;
            }

            const star = e.currentTarget;
            const rating = parseInt(star.getAttribute('data-rating'));
            
            // Only allow voting if not already voted
            if (!state.hasVoted) {
                state.hasVoted = true;
                state.currentVotes += 1;
                updateVotesDisplay();
                
                // Visual feedback
                star.style.transform = 'scale(1.3)';
                setTimeout(() => {
                    star.style.transform = 'scale(1)';
                }, 200);
                
                // Show thank you message
                showThankYouMessage();
                
                // Store in sessionStorage to prevent multiple votes
                try {
                    sessionStorage.setItem('carx_voted', 'true');
                } catch (e) {
                    // Ignore storage errors
                }
            }
        }

        // Add click listeners to stars
        const stars = starsContainer.querySelectorAll('.star-icon');
        stars.forEach(star => {
            star.addEventListener('click', handleStarClick, { passive: false });
            star.addEventListener('touchend', function(e) {
                // Small delay to ensure scroll didn't happen
                setTimeout(() => {
                    if (!state.isScrolling) {
                        handleStarClick(e);
                    }
                }, 100);
            }, { passive: false });
        });

        // Check if user already voted in this session
        try {
            if (sessionStorage.getItem('carx_voted') === 'true') {
                state.hasVoted = true;
            }
        } catch (e) {
            // Ignore storage errors
        }

        // Initialize display
        updateVotesDisplay();
    }

    // Scroll Prevention - Prevent accidental clicks during scroll
    function initScrollPrevention() {
        let touchStartY = 0;
        let touchStartX = 0;
        let touchEndY = 0;
        let touchEndX = 0;

        // Detect scroll start
        document.addEventListener('touchstart', function(e) {
            touchStartY = e.touches[0].clientY;
            touchStartX = e.touches[0].clientX;
            state.isScrolling = false;
        }, { passive: true });

        // Detect scroll movement
        document.addEventListener('touchmove', function(e) {
            touchEndY = e.touches[0].clientY;
            touchEndX = e.touches[0].clientX;
            
            const deltaY = Math.abs(touchEndY - touchStartY);
            const deltaX = Math.abs(touchEndX - touchStartX);
            
            // If significant movement, user is scrolling
            if (deltaY > 10 || deltaX > 10) {
                state.isScrolling = true;
                
                // Clear any existing timer
                if (state.scrollTimer) {
                    clearTimeout(state.scrollTimer);
                }
                
                // Reset scrolling flag after scroll ends
                state.scrollTimer = setTimeout(() => {
                    state.isScrolling = false;
                }, 150);
            }
        }, { passive: true });

        // Reset on touch end
        document.addEventListener('touchend', function() {
            // Small delay before allowing clicks again
            setTimeout(() => {
                state.isScrolling = false;
            }, 100);
        }, { passive: true });

        // Also handle mouse/wheel scrolling
        let wheelTimer = null;
        document.addEventListener('wheel', function() {
            state.isScrolling = true;
            
            if (wheelTimer) {
                clearTimeout(wheelTimer);
            }
            
            wheelTimer = setTimeout(() => {
                state.isScrolling = false;
            }, 150);
        }, { passive: true });
    }

    // Screenshot Swipe (Touch-friendly)
    function initScreenshotSwipe() {
        const screenshotGrid = document.querySelector('.screenshot-grid');
        if (!screenshotGrid) return;

        let isDown = false;
        let startX = 0;
        let scrollLeft = 0;

        // Mouse events (for desktop)
        screenshotGrid.addEventListener('mousedown', (e) => {
            isDown = true;
            screenshotGrid.style.cursor = 'grabbing';
            startX = e.pageX - screenshotGrid.offsetLeft;
            scrollLeft = screenshotGrid.scrollLeft;
        }, { passive: false });

        screenshotGrid.addEventListener('mouseleave', () => {
            isDown = false;
            screenshotGrid.style.cursor = 'grab';
        }, { passive: true });

        screenshotGrid.addEventListener('mouseup', () => {
            isDown = false;
            screenshotGrid.style.cursor = 'grab';
        }, { passive: true });

        screenshotGrid.addEventListener('mousemove', (e) => {
            if (!isDown) return;
            e.preventDefault();
            const x = e.pageX - screenshotGrid.offsetLeft;
            const walk = (x - startX) * 2;
            screenshotGrid.scrollLeft = scrollLeft - walk;
        }, { passive: false });

        // Touch events (for mobile)
        let touchStartX = 0;
        let touchScrollLeft = 0;

        screenshotGrid.addEventListener('touchstart', (e) => {
            touchStartX = e.touches[0].pageX - screenshotGrid.offsetLeft;
            touchScrollLeft = screenshotGrid.scrollLeft;
        }, { passive: true });

        screenshotGrid.addEventListener('touchmove', (e) => {
            const x = e.touches[0].pageX - screenshotGrid.offsetLeft;
            const walk = (x - touchStartX) * 1.5;
            screenshotGrid.scrollLeft = touchScrollLeft - walk;
        }, { passive: true });
    }

    // Conditional "Get it on" logic
    function updateGetItOn() {
        const getItOnElement = document.getElementById('getItOn');
        if (!getItOnElement) return;

        // Set to false if app is not on Google Play, true if it is
        const isOnGooglePlay = false; // Change this based on your app availability
        
        if (isOnGooglePlay) {
            getItOnElement.textContent = 'Get it on Google Play';
        } else {
            getItOnElement.textContent = 'ModXNet';
        }
    }

    // Thank You Message Toast
    function showThankYouMessage() {
        // Remove existing toast if any
        const existingToast = document.querySelector('.toast-notification');
        if (existingToast) {
            existingToast.remove();
        }

        // Create toast element
        const toast = document.createElement('div');
        toast.className = 'toast-notification';
        toast.innerHTML = '<i class="fas fa-check-circle"></i><span>Thank you for your vote!</span>';
        
        // Add to body
        document.body.appendChild(toast);
        
        // Trigger animation
        setTimeout(() => {
            toast.classList.add('show');
        }, 10);
        
        // Remove after 3 seconds
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => {
                if (toast.parentNode) {
                    toast.parentNode.removeChild(toast);
                }
            }, 300);
        }, 3000);
    }

})();
