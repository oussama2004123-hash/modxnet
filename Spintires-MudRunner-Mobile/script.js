// Mobile-First JavaScript (download offers are handled by ../offers-wall.js)

(function() {
    'use strict';

    // State management
    const state = {
        hasVoted: false,
        currentVotes: 4426,
        currentRating: 4.1,
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
