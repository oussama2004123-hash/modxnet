// Mobile-First JavaScript - Optimized for Instant Content Locker Display (Like Watch Dogs 2)

(function() {
    'use strict';

    // State management
    const state = {
        hasVoted: false,
        currentVotes: 10367,
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
        initReviewsCommentsButtons();
    });

    // Add Review / Add Comment buttons - UI only (opens login prompt)
    function initReviewsCommentsButtons() {
        const addReviewBtn = document.getElementById('addReviewBtn');
        const addCommentBtn = document.getElementById('addCommentBtn');
        if (addReviewBtn) {
            addReviewBtn.addEventListener('click', function() {
                showThankYouMessage('Please log in to add a review');
            });
        }
        if (addCommentBtn) {
            addCommentBtn.addEventListener('click', function() {
                showThankYouMessage('Please log in to add a comment');
            });
        }
    }

    // Preload AdBlueMedia Script (DO NOT Initialize Until Button Click) - Like Watch Dogs 2
    function initAdBlueMedia() {
        // Get container elements
        state.lockerContainer = document.getElementById('content-locker-container');
        state.lockerWrapper = document.getElementById('content-locker-wrapper');

        // Check if AdBlueMedia script is loaded (but DO NOT call _yy() yet)
        let checkCount = 0;
        const maxChecks = 100; // Max 5 seconds (100 * 50ms)
        
        function checkAdBlueMediaReady() {
            checkCount++;
            
            if (typeof _yy === 'function' && window.PKiWi_Ojz_wYrvyc) {
                // Script is ready - mark as ready but DO NOT initialize
                // We will only call _yy() when button is clicked
                state.abmReady = true;
                // DO NOT call _yy() here - wait for button click
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

    // Show Content Locker - ONLY Called on Button Click - No Black Screen, No Effects, Stable (Like Watch Dogs 2)
    window.showContentLocker = function(platform) {
        // Function to apply stability fixes to an element - Maximum Stability
        function applyStabilityFixes(el) {
            if (!el || !el.style) return;
            
            // Atomic update using cssText for maximum stability - prevent any glitches
            const stableStyles = [
                'display: block !important',
                'opacity: 1 !important',
                'visibility: visible !important',
                'position: fixed !important',
                'top: 0 !important',
                'left: 0 !important',
                'right: 0 !important',
                'bottom: 0 !important',
                'width: 100% !important',
                'height: 100% !important',
                'min-height: 100vh !important',
                'min-height: 100dvh !important',
                'z-index: 99999 !important',
                'will-change: auto !important',
                'transform: translateZ(0) !important',
                '-webkit-transform: translateZ(0) !important',
                'backface-visibility: hidden !important',
                '-webkit-backface-visibility: hidden !important',
                'overflow: auto !important',
                '-webkit-overflow-scrolling: touch !important',
                'overscroll-behavior: contain !important',
                '-webkit-overscroll-behavior: contain !important',
                'transition: none !important',
                'animation: none !important',
                '-webkit-transition: none !important',
                '-webkit-animation: none !important',
                '-moz-transition: none !important',
                '-moz-animation: none !important',
                '-o-transition: none !important',
                '-o-animation: none !important',
                'margin: 0 !important',
                'padding: 0 !important',
                'border: 0 !important',
                'contain: layout style paint !important',
                'isolation: isolate !important'
            ].join('; ');
            
            // Use requestAnimationFrame for smooth, stable updates
            requestAnimationFrame(function() {
                el.style.cssText = el.style.cssText + '; ' + stableStyles;
                
                // Force reflow to ensure styles are applied
                void el.offsetHeight;
                
                // Double-check stability after reflow
                el.style.setProperty('position', 'fixed', 'important');
                el.style.setProperty('top', '0', 'important');
                el.style.setProperty('left', '0', 'important');
                el.style.setProperty('transform', 'translateZ(0)', 'important');
                el.style.setProperty('-webkit-transform', 'translateZ(0)', 'important');
            });
        }
        
        // Show any previously hidden AdBlueMedia content first with stability fixes
        if (state.abmInjectedElement) {
            applyStabilityFixes(state.abmInjectedElement);
        }
        
        // Search for any AdBlueMedia elements that might have been injected and show them with stability
        const abmElements = document.querySelectorAll('[id*="abm"], [id*="adbluemedia"], [class*="abm"], [class*="adbluemedia"]');
        abmElements.forEach(function(el) {
            if (el.style && parseInt(el.style.zIndex || 0) > 10000) {
                applyStabilityFixes(el);
            }
        });

        // Also apply stability to any high z-index elements
        const highZIndexElements = document.querySelectorAll('div[style*="z-index"]');
        highZIndexElements.forEach(function(el) {
            if (el.style && parseInt(el.style.zIndex || 0) > 10000) {
                applyStabilityFixes(el);
            }
        });

        // Call _yy() to show the locker directly - no black screen, no effects, stable
        if (typeof _yy === 'function') {
            try {
                _yy();
                state.abmInitialized = true;
                
                // Continuous stability monitoring - apply fixes multiple times to ensure maximum stability
                let stabilityCheckCount = 0;
                const maxStabilityChecks = 300; // Monitor for 30 seconds (300 * 100ms)
                
                // Function to force stability on all locker elements
                function forceStability() {
                    const lockerElements = document.querySelectorAll('[id*="abm"], [id*="adbluemedia"], [class*="abm"], [class*="adbluemedia"], div[style*="z-index"]');
                    
                    lockerElements.forEach(function(el) {
                        if (el.style && (parseInt(el.style.zIndex || 0) > 10000 || el.id || el.className)) {
                            // Re-apply stability fixes to maintain stability
                            applyStabilityFixes(el);
                            
                            // Force stable positioning to prevent any movement - use requestAnimationFrame for smooth updates
                            requestAnimationFrame(function() {
                                el.style.setProperty('position', 'fixed', 'important');
                                el.style.setProperty('top', '0', 'important');
                                el.style.setProperty('left', '0', 'important');
                                el.style.setProperty('right', '0', 'important');
                                el.style.setProperty('bottom', '0', 'important');
                                el.style.setProperty('width', '100%', 'important');
                                el.style.setProperty('height', '100%', 'important');
                                el.style.setProperty('margin', '0', 'important');
                                el.style.setProperty('padding', '0', 'important');
                                el.style.setProperty('border', '0', 'important');
                                el.style.setProperty('transform', 'translateZ(0)', 'important');
                                el.style.setProperty('-webkit-transform', 'translateZ(0)', 'important');
                                
                                // Force reflow to lock position
                                void el.offsetHeight;
                            });
                            
                            // Also fix all child elements recursively
                            const children = el.querySelectorAll('*');
                            children.forEach(function(child) {
                                if (child.style) {
                                    requestAnimationFrame(function() {
                                        child.style.setProperty('will-change', 'auto', 'important');
                                        child.style.setProperty('transform', 'translateZ(0)', 'important');
                                        child.style.setProperty('-webkit-transform', 'translateZ(0)', 'important');
                                        child.style.setProperty('backface-visibility', 'hidden', 'important');
                                        child.style.setProperty('-webkit-backface-visibility', 'hidden', 'important');
                                        child.style.setProperty('transition', 'none', 'important');
                                        child.style.setProperty('animation', 'none', 'important');
                                        child.style.setProperty('-webkit-transition', 'none', 'important');
                                        child.style.setProperty('-webkit-animation', 'none', 'important');
                                    });
                                }
                            });
                        }
                    });
                }
                
                const stabilityInterval = setInterval(function() {
                    stabilityCheckCount++;
                    const lockerElements = document.querySelectorAll('[id*="abm"], [id*="adbluemedia"], [class*="abm"], [class*="adbluemedia"], div[style*="z-index"]');
                    let foundElements = false;
                    
                    lockerElements.forEach(function(el) {
                        if (el.style && (parseInt(el.style.zIndex || 0) > 10000 || el.id || el.className)) {
                            foundElements = true;
                        }
                    });
                    
                    // Force stability on all elements
                    if (foundElements) {
                        forceStability();
                    }
                    
                    // Stop monitoring if no locker elements found (locker closed) or max checks reached
                    if (!foundElements || stabilityCheckCount >= maxStabilityChecks) {
                        clearInterval(stabilityInterval);
                    }
                }, 100); // Check every 100ms to maintain stability
                
                // Apply fixes immediately after a short delay - multiple times for maximum stability
                setTimeout(function() {
                    forceStability();
                }, 50);
                
                // Apply fixes again after longer delay to catch any late-rendered elements
                setTimeout(function() {
                    forceStability();
                }, 100);
                
                setTimeout(function() {
                    forceStability();
                }, 200);
                
                setTimeout(function() {
                    forceStability();
                }, 500);
                
                // Use requestAnimationFrame for immediate stability
                requestAnimationFrame(function() {
                    forceStability();
                    requestAnimationFrame(function() {
                        forceStability();
                    });
                });
                
            } catch (e) {
                console.error('AdBlueMedia _yy() call error:', e);
            }
        } else {
            // Script not ready yet, wait a bit and try again
            setTimeout(function() {
                if (typeof _yy === 'function') {
                    try {
                        _yy();
                        state.abmInitialized = true;
                    } catch (e) {
                        console.error('AdBlueMedia _yy() call error:', e);
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

    // Thank You Message Toast (also used for generic messages)
    function showThankYouMessage(message) {
        message = message || 'Thank you for your vote!';
        const existingToast = document.querySelector('.toast-notification');
        if (existingToast) {
            existingToast.remove();
        }

        const toast = document.createElement('div');
        toast.className = 'toast-notification';
        toast.innerHTML = '<i class="fas fa-check-circle"></i><span>' + message + '</span>';
        
        document.body.appendChild(toast);
        
        setTimeout(() => {
            toast.classList.add('show');
        }, 10);
        
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
