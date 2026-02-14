    // Hero Banner Slider — Crossfade with progress bar
    (function() {
      var slides = document.querySelectorAll('.hero-slide');
      var dots = document.querySelectorAll('.hero-dot');
      var progressBar = document.getElementById('heroProgressBar');
      if (slides.length < 2) return;

      var current = 0;
      var INTERVAL_MS = 4500;
      var timer = null;
      var isTransitioning = false;

      function startProgress() {
        if (!progressBar) return;
        // Reset instantly then animate to full
        progressBar.className = 'hero-progress-bar reset';
        void progressBar.offsetWidth; // force reflow
        progressBar.className = 'hero-progress-bar running';
      }

      function goTo(index) {
        if (index === current || isTransitioning) return;
        isTransitioning = true;

        // Remove active from current
        slides[current].classList.remove('active');
        dots[current].classList.remove('active');

        // Activate new slide
        current = index;
        slides[current].classList.add('active');
        dots[current].classList.add('active');

        // Reset the Ken Burns scale on new slide image
        var img = slides[current].querySelector('.hero-banner');
        if (img) {
          img.style.transition = 'none';
          img.style.transform = 'scale(1)';
          void img.offsetWidth;
          img.style.transition = '';
          img.style.transform = '';
        }

        startProgress();

        // Allow next transition after crossfade completes
        setTimeout(function() { isTransitioning = false; }, 950);
      }

      function nextSlide() {
        goTo((current + 1) % slides.length);
      }

      function resetTimer() {
        clearInterval(timer);
        timer = setInterval(nextSlide, INTERVAL_MS);
        startProgress();
      }

      // Dot click
      dots.forEach(function(dot) {
        dot.addEventListener('click', function() {
          var idx = parseInt(this.getAttribute('data-slide'));
          if (idx === current) return;
          goTo(idx);
          resetTimer();
        });
      });

      // Swipe support for mobile
      var slider = document.getElementById('heroSlider');
      var swipeStartX = 0;
      if (slider) {
        slider.addEventListener('touchstart', function(e) {
          swipeStartX = e.touches[0].clientX;
        }, { passive: true });
        slider.addEventListener('touchend', function(e) {
          var diff = swipeStartX - e.changedTouches[0].clientX;
          if (Math.abs(diff) > 50) {
            if (diff > 0) goTo((current + 1) % slides.length);
            else goTo((current - 1 + slides.length) % slides.length);
            resetTimer();
          }
        });
      }

      // Pause on hover (desktop)
      if (slider) {
        slider.addEventListener('mouseenter', function() { clearInterval(timer); });
        slider.addEventListener('mouseleave', function() { resetTimer(); });
      }

      // Pause when tab is hidden to avoid queued transitions
      document.addEventListener('visibilitychange', function() {
        if (document.hidden) {
          clearInterval(timer);
        } else {
          resetTimer();
        }
      });

      // Start
      startProgress();
      timer = setInterval(nextSlide, INTERVAL_MS);
    })();

    // DOM Elements
    const googleLoginBtn = document.getElementById('googleLoginBtn');
    const mobileMenu = document.getElementById('mobileMenu');
    const helpButton = document.getElementById('helpButton');
    const helpModal = document.getElementById('helpModal');
    const closeHelpModal = document.getElementById('closeHelpModal');
    const closeHelpBtn = document.getElementById('closeHelpBtn');
    const loginBtn = document.getElementById('loginBtn');
    const registerBtn = document.getElementById('registerBtn');
    const mobileLoginBtn = document.getElementById('mobileLoginBtn');
    const mobileRegisterBtn = document.getElementById('mobileRegisterBtn');
    const loginModal = document.getElementById('loginModal');
    const registerModal = document.getElementById('registerModal');
    const closeLoginModal = document.getElementById('closeLoginModal');
    const closeRegisterModal = document.getElementById('closeRegisterModal');
    const switchToRegister = document.getElementById('switchToRegister');
    const switchToLogin = document.getElementById('switchToLogin');
    const toast = document.getElementById('toast');
    const toastMessage = document.getElementById('toastMessage');
    const contactForm = document.getElementById('form');
    const gameDetailModal = document.getElementById('gameDetailModal');
    const closeGameDetailModal = document.getElementById('closeGameDetailModal');
    const gamesSearchInput = document.getElementById('gamesSearchInput');
    const gamesList = document.getElementById('gamesList');
    const gameCards = document.querySelectorAll('.game-card');
    const downloadGameBtn = document.getElementById('downloadGameBtn');
    
    // ===== DYNAMIC GAME CARDS LOADER =====
    (function() {
      var container = document.querySelector('.games-container');
      if (!container) return;
      fetch('/api/games')
        .then(function(r) { return r.json(); })
        .then(function(games) {
          if (!games || !games.length) return; // keep static HTML
          container.innerHTML = '';
          games.forEach(function(g) {
            var stars = '';
            var fullStars = Math.floor(g.rating);
            var halfStar = (g.rating % 1) >= 0.25 && (g.rating % 1) < 0.75;
            var fullStar5 = (g.rating % 1) >= 0.75;
            if (fullStar5) fullStars++;
            for (var i = 0; i < fullStars; i++) stars += '<i class="fas fa-star"></i>';
            if (halfStar) stars += '<i class="fas fa-star-half-alt"></i>';
            for (var j = fullStars + (halfStar ? 1 : 0); j < 5; j++) stars += '<i class="far fa-star"></i>';
            var card = document.createElement('div');
            card.className = 'game-card';
            card.setAttribute('data-game', g.data_game);
            card.setAttribute('data-link', g.link);
            card.setAttribute('data-category', g.category);
            card.innerHTML =
              '<img src="' + g.image_url + '" alt="' + g.title + '" class="game-icon" loading="lazy">' +
              '<div class="game-info">' +
                '<div class="game-title">' + g.title + '</div>' +
                '<div class="game-meta"><span>' + g.version + '</span><span class="meta-dot">&middot;</span><span>' + g.release_date + '</span></div>' +
                '<div class="game-rating">' + stars + '<span class="rating-num">' + g.rating.toFixed(1) + '</span></div>' +
              '</div>' +
              '<i class="fas fa-chevron-right game-arrow"></i>';
            container.appendChild(card);
          });
          // Dispatch event so other systems know cards are ready
          document.dispatchEvent(new Event('gameCardsLoaded'));
        })
        .catch(function() { /* keep static HTML on error */ });
    })();

    // Track last touch time to suppress synthetic clicks on mobile
    let lastTouchTime = 0;
    
    // ===== AUTH STATE MANAGEMENT =====
    var currentUser = null;

    // Inject user profile & logout modal styles
    var authStyles = document.createElement('style');
    authStyles.textContent = [
      '.user-profile-btn { display:flex; align-items:center; gap:8px; padding:5px 12px 5px 5px;',
      '  background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.1);',
      '  border-radius:50px; cursor:pointer; transition:all 0.25s ease;',
      '  font-family:"Exo 2",sans-serif; color:#e0e0e0; font-size:0.85rem; font-weight:600; }',
      '.user-profile-btn:hover { background:rgba(0,255,204,0.08); border-color:rgba(0,255,204,0.25); }',
      '.user-avatar { width:32px; height:32px; border-radius:50%; object-fit:cover;',
      '  border:2px solid rgba(0,255,204,0.3); flex-shrink:0; }',
      '.user-avatar-placeholder { width:32px; height:32px; border-radius:50%; flex-shrink:0;',
      '  background:linear-gradient(135deg,#00ffcc,#00d4aa); display:flex; align-items:center;',
      '  justify-content:center; font-size:14px; font-weight:700; color:#0a0a0a; }',
      '.user-name { max-width:100px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }',
      '',
      '.logout-overlay { position:fixed; inset:0; z-index:99995;',
      '  background:rgba(0,0,0,0.7); backdrop-filter:blur(8px);',
      '  display:flex; align-items:center; justify-content:center; padding:20px; }',
      '.logout-modal { background:linear-gradient(145deg,#1a1a2e,#16213e);',
      '  border:1px solid rgba(0,255,204,0.12); border-radius:20px;',
      '  max-width:380px; width:100%; padding:32px 24px 24px; text-align:center;',
      '  font-family:"Exo 2",sans-serif;',
      '  box-shadow:0 16px 50px rgba(0,0,0,0.5),0 0 30px rgba(0,255,204,0.04); }',
      '.logout-avatar-wrap { margin:0 auto 16px; }',
      '.logout-avatar-large { width:72px; height:72px; border-radius:50%; object-fit:cover;',
      '  border:3px solid rgba(0,255,204,0.3); }',
      '.logout-avatar-large-ph { width:72px; height:72px; border-radius:50%;',
      '  background:linear-gradient(135deg,#00ffcc,#00d4aa); display:flex; align-items:center;',
      '  justify-content:center; font-size:28px; font-weight:700; color:#0a0a0a; margin:0 auto; }',
      '.logout-modal h3 { font-size:1.15rem; font-weight:700; color:#fff; margin:0 0 4px; }',
      '.logout-modal .logout-email { font-size:0.82rem; color:#888; margin:0 0 20px; }',
      '.logout-modal .logout-divider { height:1px; background:rgba(255,255,255,0.06); margin:0 0 20px; }',
      '.logout-actions { display:flex; flex-direction:column; gap:10px; }',
      '.logout-btn { display:flex; align-items:center; justify-content:center; gap:8px;',
      '  padding:12px 20px; border:none; border-radius:12px;',
      '  background:linear-gradient(135deg,#ff4757,#ff3344); color:#fff;',
      '  font-family:"Exo 2",sans-serif; font-size:0.92rem; font-weight:700;',
      '  cursor:pointer; transition:all 0.2s; }',
      '.logout-btn:hover { transform:translateY(-1px); box-shadow:0 4px 15px rgba(255,71,87,0.3); }',
      '.logout-cancel { padding:10px 20px; border:1px solid rgba(255,255,255,0.1);',
      '  border-radius:10px; background:transparent; color:#999;',
      '  font-family:"Exo 2",sans-serif; font-size:0.85rem; cursor:pointer; transition:all 0.2s; }',
      '.logout-cancel:hover { background:rgba(255,255,255,0.05); color:#ccc; }',
      '.logout-profile-btn { display:flex; align-items:center; justify-content:center; gap:8px;',
      '  padding:12px 20px; border:1px solid rgba(0,255,204,0.3); border-radius:12px;',
      '  background:rgba(0,255,204,0.08); color:#00ffcc;',
      '  font-family:"Exo 2",sans-serif; font-size:0.92rem; font-weight:600;',
      '  cursor:pointer; transition:all 0.2s; }',
      '.logout-profile-btn:hover { background:rgba(0,255,204,0.15); transform:translateY(-1px); box-shadow:0 4px 15px rgba(0,255,204,0.15); }',
      '.logout-member-since { margin-top:16px; font-size:0.72rem; color:#555; }',
      '.logout-member-since i { margin-right:4px; }',
      '@media(max-width:480px) { .logout-modal { padding:24px 18px 20px; } .user-name { max-width:70px; } }'
    ].join('\n');
    document.head.appendChild(authStyles);

    function updateAuthUI(user) {
      currentUser = user;
      if (user) {
        // Replace login button with user profile button
        if (googleLoginBtn) {
          var avatarHTML = '';
          if (user.avatar_url) {
            avatarHTML = '<img src="' + user.avatar_url + '" alt="" class="user-avatar" referrerpolicy="no-referrer">';
          } else {
            var initial = (user.username || 'U').charAt(0).toUpperCase();
            avatarHTML = '<div class="user-avatar-placeholder">' + initial + '</div>';
          }
          googleLoginBtn.className = 'user-profile-btn';
          googleLoginBtn.innerHTML = avatarHTML + '<span class="user-name">' + user.username + '</span>';
          googleLoginBtn.onclick = function(e) { e.stopPropagation(); showLogoutModal(); };
        }
        // Hide desktop login/register buttons
        if (loginBtn) loginBtn.style.display = 'none';
        if (registerBtn) registerBtn.style.display = 'none';
        // Hide mobile buttons
        if (mobileLoginBtn) mobileLoginBtn.style.display = 'none';
        if (mobileRegisterBtn) mobileRegisterBtn.style.display = 'none';
      }
    }

    function showLogoutModal() {
      var existing = document.getElementById('logoutOverlay');
      if (existing) return;

      var avatarHTML = '';
      if (currentUser.avatar_url) {
        avatarHTML = '<img src="' + currentUser.avatar_url + '" alt="" class="logout-avatar-large" referrerpolicy="no-referrer">';
      } else {
        var initial = (currentUser.username || 'U').charAt(0).toUpperCase();
        avatarHTML = '<div class="logout-avatar-large-ph">' + initial + '</div>';
      }

      var overlay = document.createElement('div');
      overlay.className = 'logout-overlay';
      overlay.id = 'logoutOverlay';
      overlay.innerHTML =
        '<div class="logout-modal">' +
          '<div class="logout-avatar-wrap">' + avatarHTML + '</div>' +
          '<h3>' + currentUser.username + '</h3>' +
          '<p class="logout-email">' + (currentUser.email || '') + '</p>' +
          '<div class="logout-divider"></div>' +
          '<div class="logout-actions">' +
            '<button class="logout-profile-btn" id="logoutProfileBtn"><i class="fas fa-user-edit"></i> Profile Settings</button>' +
            '<button class="logout-btn" id="logoutConfirmBtn"><i class="fas fa-sign-out-alt"></i> Log Out</button>' +
            '<button class="logout-cancel" id="logoutCancelBtn">Stay Logged In</button>' +
          '</div>' +
          '<div class="logout-member-since"><i class="fas fa-shield-alt"></i> Your data is safe with us</div>' +
        '</div>';
      document.body.appendChild(overlay);

      overlay.querySelector('#logoutConfirmBtn').addEventListener('click', function() {
        this.disabled = true;
        this.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Logging out...';
        fetch('/api/auth/logout', { method: 'POST' })
          .then(function() { location.reload(); })
          .catch(function() { location.reload(); });
      });

      overlay.querySelector('#logoutProfileBtn').addEventListener('click', function() {
        overlay.remove();
        if (typeof window.openProfileSettings === 'function') window.openProfileSettings();
      });

      overlay.querySelector('#logoutCancelBtn').addEventListener('click', function() {
        overlay.remove();
      });

      overlay.addEventListener('click', function(e) {
        if (e.target === overlay) overlay.remove();
      });
    }

    // Check auth state on page load
    fetch('/api/auth/me')
      .then(function(r) { return r.json(); })
      .then(function(data) {
        if (data.loggedIn) {
          updateAuthUI(data.user);
          if (data.isAdmin && googleLoginBtn) {
            var adminLink = document.createElement('a');
            adminLink.href = '/admin.html';
            adminLink.className = 'admin-panel-link';
            adminLink.innerHTML = '<i class="fas fa-shield-alt"></i>';
            adminLink.title = 'Admin Panel';
            googleLoginBtn.parentNode.insertBefore(adminLink, googleLoginBtn);
            // Inject admin link style
            var aStyle = document.createElement('style');
            aStyle.textContent = '.admin-panel-link{display:inline-flex;align-items:center;justify-content:center;width:34px;height:34px;border-radius:50%;background:rgba(0,255,204,0.1);color:#00ffcc;font-size:0.85rem;text-decoration:none;transition:all 0.25s ease;border:1px solid rgba(0,255,204,0.2);margin-right:8px}.admin-panel-link:hover{background:rgba(0,255,204,0.2);transform:scale(1.05)}@media(min-width:900px){.admin-panel-link{display:inline-flex !important}}';
            document.head.appendChild(aStyle);
          }
        }
      })
      .catch(function() {});

    // Auto-open login modal if redirected from game page with ?action=login
    if (window.location.search.indexOf('action=login') !== -1 && loginModal) {
      setTimeout(function() { loginModal.classList.add('active'); }, 500);
      // Clean URL
      history.replaceState(null, '', window.location.pathname);
    }

    // Google Login Button - opens login modal (when not logged in)
    // NOTE: When logged in, the onclick is reassigned in updateAuthUI to showLogoutModal.
    // We use onclick (not addEventListener) to avoid double-firing.
    if (googleLoginBtn && !googleLoginBtn._authClickSet) {
      googleLoginBtn._authClickSet = true;
      googleLoginBtn.onclick = function() {
        if (currentUser) {
          showLogoutModal();
        } else {
          if (loginModal) loginModal.classList.add('active');
        }
      };
    }
    
    // Game card tap/press handling with proper touch logic
    function initGameCardHandlers() {
    document.querySelectorAll('.game-card').forEach(card => {
      if (card._clickInit) return; // skip if already initialized
      card._clickInit = true;
      // Add click-effect overlay element
      const clickEffect = document.createElement('div');
      clickEffect.className = 'game-card-click-effect';
      card.appendChild(clickEffect);
      
      let touchStartX = 0;
      let touchStartY = 0;
      let touchMoved = false;
      const MOVE_THRESHOLD = 10; // pixels
      
      const triggerTap = (event) => {
        // Ignore taps on inner links or buttons
        const targetTag = event.target.tagName;
        if (targetTag === 'A' || targetTag === 'BUTTON') return;
        
        // Add active class for visual press effect
        card.classList.add('active');
        
        // Remove the effect after animation completes
        setTimeout(() => {
          card.classList.remove('active');
        }, 200);
        
        // Navigate after a brief delay so the effect is visible
        const gameLink = card.getAttribute('data-link');
        if (gameLink) {
          setTimeout(() => {
            window.location.href = gameLink;
          }, 150);
        }
      };
      
      const handleTouchStart = (event) => {
        const touch = event.touches[0];
        touchStartX = touch.clientX;
        touchStartY = touch.clientY;
        touchMoved = false;
      };
      
      const handleTouchMove = (event) => {
        const touch = event.touches[0];
        const deltaX = touch.clientX - touchStartX;
        const deltaY = touch.clientY - touchStartY;
        
        if (Math.abs(deltaX) > MOVE_THRESHOLD || Math.abs(deltaY) > MOVE_THRESHOLD) {
          // User is scrolling, not tapping
          touchMoved = true;
        }
      };
      
      const handleTouchEnd = (event) => {
        // Mark touch time to suppress the following synthetic click
        lastTouchTime = Date.now();
        
        if (touchMoved) {
          // It was a scroll; do nothing
          return;
        }
        
        triggerTap(event);
      };
      
      const handleClick = (event) => {
        // Ignore synthetic click that follows a touch
        if (Date.now() - lastTouchTime < 400) {
          return;
        }
        
        triggerTap(event);
      };
      
      // Touch events: passive so scrolling remains smooth
      card.addEventListener('touchstart', handleTouchStart, { passive: true });
      card.addEventListener('touchmove', handleTouchMove, { passive: true });
      card.addEventListener('touchend', handleTouchEnd);
      
      // Mouse / pointer click (desktop)
      card.addEventListener('click', handleClick);
    });
    } // end initGameCardHandlers
    initGameCardHandlers();
    document.addEventListener('gameCardsLoaded', initGameCardHandlers);

    // Help Button Tooltip
    const helpTooltip = document.getElementById('helpTooltip');
    let tooltipShown = false;
    
    function showHelpTooltip() {
      if (helpButton && helpTooltip && !tooltipShown && helpButton.classList.contains('visible')) {
        helpTooltip.classList.add('show');
        tooltipShown = true;
        setTimeout(() => {
          helpTooltip.classList.remove('show');
        }, 1500);
      }
    }
    
    // Help Modal
    if (helpButton && helpModal) {
      helpButton.addEventListener('click', () => {
        helpModal.classList.add('active');
        if (helpTooltip) {
          helpTooltip.classList.remove('show');
        }
      });
    }
    
    if (closeHelpModal && closeHelpBtn && helpModal) {
      [closeHelpModal, closeHelpBtn].forEach(el => {
        el.addEventListener('click', () => {
          helpModal.classList.remove('active');
        });
      });
    }
    
    // Game Detail Modal
    if (closeGameDetailModal && gameDetailModal) {
      closeGameDetailModal.addEventListener('click', () => {
        gameDetailModal.classList.remove('active');
      });
    }
    
    // ===== Professional Search System =====
    function initSearchSystem() {
      var searchInput = document.getElementById('gamesSearchInput');
      var dropdown = document.getElementById('searchDropdown');
      var dropdownList = document.getElementById('searchDropdownList');
      var noResults = document.getElementById('searchNoResults');
      var clearBtn = document.getElementById('searchClearBtn');
      var countBadge = document.getElementById('searchResultCount');
      var filterChips = document.querySelectorAll('.filter-chip');
      var allCards = document.querySelectorAll('.game-card');
      var desktopSearchInput = document.getElementById('searchInput');
      var mobileSearchInput = document.getElementById('mobileSearchInput');
      var activeFilter = 'all';
      var highlightIndex = -1;

      if (!searchInput || !allCards.length) return;

      // Create backdrop overlay
      var backdrop = document.createElement('div');
      backdrop.className = 'search-backdrop';
      document.body.appendChild(backdrop);

      // Build game data from cards
      var games = [];
      allCards.forEach(function(card, idx) {
        var titleEl = card.querySelector('.game-title');
        var imgEl = card.querySelector('.game-icon');
        var metaEl = card.querySelector('.game-meta');
        var ratingEl = card.querySelector('.game-rating');
        games.push({
          index: idx,
          card: card,
          title: titleEl ? titleEl.textContent : '',
          image: imgEl ? imgEl.src : '',
          meta: metaEl ? metaEl.textContent.replace(/\s+/g, ' ').trim() : '',
          rating: ratingEl ? ratingEl.querySelector('.rating-num').textContent : '',
          categories: (card.getAttribute('data-category') || '').split(' '),
          link: card.getAttribute('data-link') || '#'
        });
      });

      // Highlight matching text in title
      function highlightText(text, query) {
        if (!query) return text;
        var escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return text.replace(new RegExp('(' + escaped + ')', 'gi'), '<span class="highlight">$1</span>');
      }

      // Render dropdown items
      function renderDropdown(filtered, query) {
        dropdownList.innerHTML = '';
        highlightIndex = -1;

        if (filtered.length === 0) {
          noResults.classList.add('visible');
          dropdownList.style.display = 'none';
        } else {
          noResults.classList.remove('visible');
          dropdownList.style.display = 'block';
          filtered.forEach(function(g, i) {
            var item = document.createElement('a');
            item.className = 'search-dropdown-item';
            item.href = g.link;
            item.setAttribute('data-idx', i);
            item.innerHTML =
              '<img src="' + g.image + '" alt="' + g.title + '" loading="lazy">' +
              '<div class="search-dropdown-info">' +
                '<div class="search-dropdown-title">' + highlightText(g.title, query) + '</div>' +
                '<div class="search-dropdown-meta">' +
                  '<span class="rating-stars"><i class="fas fa-star"></i> ' + g.rating + '</span>' +
                  '<span>' + g.meta + '</span>' +
                '</div>' +
              '</div>' +
              '<i class="fas fa-chevron-right search-dropdown-arrow"></i>';
            dropdownList.appendChild(item);
          });
        }
        dropdown.classList.add('open');
        backdrop.classList.add('open');
      }

      // Filter cards on the main list with animation
      function filterCards(query, category) {
        var visibleCount = 0;
        games.forEach(function(g) {
          var matchSearch = !query || g.title.toLowerCase().indexOf(query) !== -1;
          var matchCat = category === 'all' || g.categories.indexOf(category) !== -1;
          if (matchSearch && matchCat) {
            g.card.classList.remove('filtered-out');
            g.card.classList.add('filtered-in');
            g.card.style.display = '';
            visibleCount++;
          } else {
            g.card.classList.remove('filtered-in');
            g.card.classList.add('filtered-out');
          }
        });

        // Update count badge
        if (query || category !== 'all') {
          countBadge.textContent = visibleCount + ' / ' + games.length;
          countBadge.classList.add('visible');
        } else {
          countBadge.classList.remove('visible');
        }

        return visibleCount;
      }

      // Main search handler
      function handleSearch(query) {
        var q = query.toLowerCase().trim();
        var filtered = games.filter(function(g) {
          var matchSearch = !q || g.title.toLowerCase().indexOf(q) !== -1;
          var matchCat = activeFilter === 'all' || g.categories.indexOf(activeFilter) !== -1;
          return matchSearch && matchCat;
        });

        // Show/hide clear btn
        if (q.length > 0) {
          clearBtn.classList.add('visible');
        } else {
          clearBtn.classList.remove('visible');
        }

        // Filter main cards
        filterCards(q, activeFilter);

        // Show dropdown only when there's a query
        if (q.length > 0) {
          renderDropdown(filtered, q);
        } else {
          closeDropdown();
        }
      }

      function closeDropdown() {
        dropdown.classList.remove('open');
        backdrop.classList.remove('open');
        highlightIndex = -1;
      }

      // Search input events
      searchInput.addEventListener('input', function() {
        handleSearch(this.value);
        // Sync other inputs
        if (desktopSearchInput) desktopSearchInput.value = this.value;
        if (mobileSearchInput) mobileSearchInput.value = this.value;
      });

      searchInput.addEventListener('focus', function() {
        if (this.value.trim().length > 0) {
          handleSearch(this.value);
        }
      });

      // Keyboard navigation
      searchInput.addEventListener('keydown', function(e) {
        var items = dropdownList.querySelectorAll('.search-dropdown-item');
        if (!items.length || !dropdown.classList.contains('open')) return;

        if (e.key === 'ArrowDown') {
          e.preventDefault();
          highlightIndex = Math.min(highlightIndex + 1, items.length - 1);
          updateHighlight(items);
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          highlightIndex = Math.max(highlightIndex - 1, 0);
          updateHighlight(items);
        } else if (e.key === 'Enter' && highlightIndex >= 0) {
          e.preventDefault();
          items[highlightIndex].click();
        } else if (e.key === 'Escape') {
          closeDropdown();
          searchInput.blur();
        }
      });

      function updateHighlight(items) {
        items.forEach(function(el, i) {
          el.classList.toggle('highlighted', i === highlightIndex);
          if (i === highlightIndex) el.scrollIntoView({ block: 'nearest' });
        });
      }

      // Clear button
      clearBtn.addEventListener('click', function() {
        searchInput.value = '';
        if (desktopSearchInput) desktopSearchInput.value = '';
        if (mobileSearchInput) mobileSearchInput.value = '';
        clearBtn.classList.remove('visible');
        closeDropdown();
        filterCards('', activeFilter);
        searchInput.focus();
      });

      // Backdrop click closes dropdown
      backdrop.addEventListener('click', function() {
        closeDropdown();
      });

      // Filter chips
      filterChips.forEach(function(chip) {
        chip.addEventListener('click', function() {
          filterChips.forEach(function(c) { c.classList.remove('active'); });
          this.classList.add('active');
          activeFilter = this.getAttribute('data-filter');
          var q = searchInput.value.toLowerCase().trim();
          filterCards(q, activeFilter);
          // Close dropdown when changing filter
          if (dropdown.classList.contains('open') && q.length > 0) {
            handleSearch(q);
          }
        });
      });

      // Sync desktop/mobile search inputs to main
      function syncFromExternal(input) {
        if (!input) return;
        input.addEventListener('input', function() {
          searchInput.value = this.value;
          handleSearch(this.value);
        });
      }
      syncFromExternal(desktopSearchInput);
      syncFromExternal(mobileSearchInput);

      // Close dropdown on outside click
      document.addEventListener('click', function(e) {
        if (!searchInput.contains(e.target) && !dropdown.contains(e.target)) {
          closeDropdown();
        }
      });

    } // end initSearchSystem
    initSearchSystem();
    document.addEventListener('gameCardsLoaded', function() { setTimeout(initSearchSystem, 50); });
    
    // Show/hide help button on scroll
    if (helpButton) {
      let lastScrollPosition = 0;
      const scrollThreshold = 200;
      let helpButtonVisibleBefore = false;
      
      window.addEventListener('scroll', () => {
        const currentScrollPosition = window.pageYOffset || document.documentElement.scrollTop;
        
        if (currentScrollPosition > scrollThreshold) {
          if (!helpButtonVisibleBefore) {
            helpButton.classList.add('visible');
            helpButtonVisibleBefore = true;
            // Show tooltip when button first becomes visible
            setTimeout(() => {
              if (!tooltipShown && helpButton.classList.contains('visible')) {
                showHelpTooltip();
              }
            }, 500);
          }
        } else {
          helpButton.classList.remove('visible');
          helpButtonVisibleBefore = false;
        }
        
        lastScrollPosition = currentScrollPosition;
      });
    }
    
    // Auth Modals
    function showLoginModal() {
      loginModal.classList.add('active');
      if (mobileMenu) mobileMenu.classList.remove('active');
    }
    
    function showRegisterModal() {
      registerModal.classList.add('active');
      if (mobileMenu) mobileMenu.classList.remove('active');
    }
    
    if (loginBtn) loginBtn.addEventListener('click', showLoginModal);
    if (mobileLoginBtn) mobileLoginBtn.addEventListener('click', showLoginModal);
    
    if (registerBtn) registerBtn.addEventListener('click', showRegisterModal);
    if (mobileRegisterBtn) mobileRegisterBtn.addEventListener('click', showRegisterModal);
    
    if (closeLoginModal && closeRegisterModal) {
      [closeLoginModal, closeRegisterModal].forEach(el => {
        el.addEventListener('click', () => {
          if (loginModal) loginModal.classList.remove('active');
          if (registerModal) registerModal.classList.remove('active');
        });
      });
    }
    
    if (switchToRegister && loginModal && registerModal) {
      switchToRegister.addEventListener('click', (e) => {
        e.preventDefault();
        loginModal.classList.remove('active');
        registerModal.classList.add('active');
      });
    }
    
    if (switchToLogin && loginModal && registerModal) {
      switchToLogin.addEventListener('click', (e) => {
        e.preventDefault();
        registerModal.classList.remove('active');
        loginModal.classList.add('active');
      });
    }
    
    // Close modals when clicking outside
    window.addEventListener('click', (e) => {
      if (e.target.classList.contains('modal')) {
        document.querySelectorAll('.modal').forEach(modal => {
          modal.classList.remove('active');
        });
      }
    });
    
    // Show Toast Notification
    function showToast(message, type = 'success') {
      toastMessage.textContent = message;
      toast.className = `toast ${type} show`;
      
      setTimeout(() => {
        toast.classList.remove('show');
      }, 3000);
    }
    
    
    // ===== CONTACT FORM (sends real email via API) =====
    window.validateContactForm = function() {
      // Reset errors
      document.getElementById('nameError').textContent = '';
      document.getElementById('emailError').textContent = '';
      document.getElementById('messageError').textContent = '';

      var nameVal = document.getElementById('name').value.trim();
      var emailVal = document.getElementById('email').value.trim();
      var messageVal = document.getElementById('message').value.trim();
      var isValid = true;

      if (nameVal === '') {
        document.getElementById('nameError').textContent = 'Name is required';
        isValid = false;
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailVal)) {
        document.getElementById('emailError').textContent = 'Valid email is required';
        isValid = false;
      }
      if (messageVal.length < 10) {
        document.getElementById('messageError').textContent = 'Message must be at least 10 characters';
        isValid = false;
      }

      if (!isValid) return false;

      // Send to backend API
      var submitBtn = document.querySelector('.contact-submit');
      var originalHTML = submitBtn.innerHTML;
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending...';

      fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: nameVal, email: emailVal, message: messageVal })
      })
      .then(function(r) { return r.json().then(function(d) { return { ok: r.ok, data: d }; }); })
      .then(function(res) {
        if (res.ok && res.data.success) {
          showToast('Your message has been sent! We will contact you soon.');
          document.getElementById('form').reset();
        } else {
          showToast(res.data.error || 'Failed to send message', 'error');
        }
      })
      .catch(function() {
        showToast('Network error. Please try again.', 'error');
      })
      .finally(function() {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalHTML;
      });

      return false; // Prevent default form submission
    }
    
    // ===== GOOGLE OAUTH BUTTONS =====
    var googleSignInBtn = document.getElementById('googleSignInBtn');
    var googleRegisterBtn = document.getElementById('googleRegisterBtn');
    if (googleSignInBtn) {
      googleSignInBtn.addEventListener('click', function() {
        window.location.href = '/api/auth/google';
      });
    }
    if (googleRegisterBtn) {
      googleRegisterBtn.addEventListener('click', function() {
        window.location.href = '/api/auth/google';
      });
    }

    // ===== LOGIN FORM =====
    var loginForm = document.querySelector('#loginModal .auth-form');
    if (loginForm) {
      loginForm.addEventListener('submit', function(e) {
        e.preventDefault();
        var email = document.getElementById('loginEmail').value;
        var password = document.getElementById('loginPassword').value;
        var btn = loginForm.querySelector('.login-submit-btn');
        btn.disabled = true;
        btn.textContent = 'Logging in...';

        fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: email, password: password })
        })
        .then(function(r) { return r.json().then(function(d) { return { ok: r.ok, data: d }; }); })
        .then(function(res) {
          if (res.ok && res.data.success) {
            showToast('Welcome back, ' + res.data.user.username + '!');
            loginModal.classList.remove('active');
            updateAuthUI(res.data.user);
            loginForm.reset();
          } else {
            showToast(res.data.error || 'Login failed', 'error');
          }
        })
        .catch(function() { showToast('Network error. Please try again.', 'error'); })
        .finally(function() { btn.disabled = false; btn.textContent = 'Login'; });
      });
    }

    // ===== REGISTER FORM =====
    var registerForm = document.querySelector('#registerModal .auth-form');
    if (registerForm) {
      registerForm.addEventListener('submit', function(e) {
        e.preventDefault();
        var username = document.getElementById('registerUsername').value;
        var email = document.getElementById('registerEmail').value;
        var password = document.getElementById('registerPassword').value;
        var confirm = document.getElementById('registerConfirm').value;
        var btn = registerForm.querySelector('.login-submit-btn');

        if (password !== confirm) {
          showToast('Passwords do not match', 'error');
          return;
        }

        btn.disabled = true;
        btn.textContent = 'Creating account...';

        var avatarUrl = document.getElementById('registerAvatarUrl') ? document.getElementById('registerAvatarUrl').value : '';

        fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: username, email: email, password: password, avatar_url: avatarUrl })
        })
        .then(function(r) { return r.json().then(function(d) { return { ok: r.ok, data: d }; }); })
        .then(function(res) {
          if (res.ok && res.data.success) {
            showToast('Welcome to ModXnet, ' + res.data.user.username + '!');
            registerModal.classList.remove('active');
            updateAuthUI(res.data.user);
            registerForm.reset();
          } else {
            showToast(res.data.error || 'Registration failed', 'error');
          }
        })
        .catch(function() { showToast('Network error. Please try again.', 'error'); })
        .finally(function() { btn.disabled = false; btn.textContent = 'Register'; });
      });
    }
    
    // ===== AVATAR PICKER SYSTEM =====
    var AVATAR_STYLES = [
      'bottts-neutral', 'pixel-art', 'adventurer', 'adventurer-neutral',
      'avataaars', 'big-ears', 'big-smile', 'croodles', 'fun-emoji',
      'icons', 'identicon', 'lorelei', 'micah', 'miniavs', 'notionists',
      'open-peeps', 'personas', 'shapes', 'thumbs'
    ];
    var AVATAR_SEEDS = [
      'gamer1','player2','ninja3','wolf4','storm5','blade6','fire7','ice8',
      'shadow9','thunder10','cyber11','viper12','ace13','phoenix14','star15',
      'lunar16','nova17','blaze18','frost19','hawk20','pixel21','neon22',
      'ghost23','rogue24'
    ];

    function generateAvatarUrl(seed, style) {
      style = style || AVATAR_STYLES[Math.floor(Math.random() * AVATAR_STYLES.length)];
      seed = seed || AVATAR_SEEDS[Math.floor(Math.random() * AVATAR_SEEDS.length)] + Date.now();
      return 'https://api.dicebear.com/7.x/' + style + '/svg?seed=' + seed;
    }

    function buildAvatarGrid(gridEl, previewEl, hiddenInput, count) {
      if (!gridEl) return;
      count = count || 12;
      gridEl.innerHTML = '';
      var usedStyles = [];
      for (var i = 0; i < count; i++) {
        var style = AVATAR_STYLES[i % AVATAR_STYLES.length];
        var seed = AVATAR_SEEDS[i % AVATAR_SEEDS.length];
        var url = 'https://api.dicebear.com/7.x/' + style + '/svg?seed=' + seed;
        usedStyles.push(url);
        var div = document.createElement('div');
        div.className = 'avatar-option' + (i === 0 ? ' selected' : '');
        div.innerHTML = '<img src="' + url + '" alt="Avatar ' + (i+1) + '">';
        div.setAttribute('data-url', url);
        div.addEventListener('click', (function(u, el) {
          return function() {
            gridEl.querySelectorAll('.avatar-option').forEach(function(o) { o.classList.remove('selected'); });
            el.classList.add('selected');
            if (previewEl) previewEl.src = u;
            if (hiddenInput) hiddenInput.value = u;
          };
        })(url, div));
        gridEl.appendChild(div);
      }
      // Set first as default
      if (previewEl && usedStyles[0]) previewEl.src = usedStyles[0];
      if (hiddenInput && usedStyles[0]) hiddenInput.value = usedStyles[0];
    }

    // Build registration avatar grid
    var regGrid = document.getElementById('avatarPickerGrid');
    var regPreview = document.getElementById('selectedAvatarPreview');
    var regHidden = document.getElementById('registerAvatarUrl');
    buildAvatarGrid(regGrid, regPreview, regHidden, 12);

    // Randomize button
    var randomizeBtn = document.getElementById('randomizeAvatarBtn');
    if (randomizeBtn) {
      randomizeBtn.addEventListener('click', function() {
        var url = generateAvatarUrl();
        if (regPreview) regPreview.src = url;
        if (regHidden) regHidden.value = url;
        // Deselect grid options
        if (regGrid) regGrid.querySelectorAll('.avatar-option').forEach(function(o) { o.classList.remove('selected'); });
      });
    }

    // File upload for avatar (registration)
    var avatarFileInput = document.getElementById('avatarFileInput');
    if (avatarFileInput) {
      avatarFileInput.addEventListener('change', function() {
        var file = this.files[0];
        if (!file) return;
        if (file.size > 2 * 1024 * 1024) { showToast('Image must be under 2MB', 'error'); return; }
        var reader = new FileReader();
        reader.onload = function(e) {
          if (regPreview) regPreview.src = e.target.result;
          // Store as data URL temporarily; will upload on registration
          if (regHidden) regHidden.value = e.target.result;
          if (regGrid) regGrid.querySelectorAll('.avatar-option').forEach(function(o) { o.classList.remove('selected'); });
        };
        reader.readAsDataURL(file);
      });
    }

    // ===== PROFILE SETTINGS MODAL =====
    var profileModal = document.getElementById('profileModal');
    var closeProfileModal = document.getElementById('closeProfileModal');
    var profileForm = document.getElementById('profileForm');
    var profileAvatarGrid = document.getElementById('profileAvatarGrid');
    var profileAvatarPreview = document.getElementById('profileAvatarPreview');
    var profileAvatarUrl = document.getElementById('profileAvatarUrl');

    if (closeProfileModal) {
      closeProfileModal.addEventListener('click', function() {
        profileModal.classList.remove('active');
      });
    }
    if (profileModal) {
      profileModal.addEventListener('click', function(e) {
        if (e.target === profileModal) profileModal.classList.remove('active');
      });
    }

    // Build profile avatar grid
    buildAvatarGrid(profileAvatarGrid, profileAvatarPreview, profileAvatarUrl, 12);

    // Profile random button
    var profileRandomBtn = document.getElementById('profileRandomAvatar');
    if (profileRandomBtn) {
      profileRandomBtn.addEventListener('click', function() {
        var url = generateAvatarUrl();
        if (profileAvatarPreview) profileAvatarPreview.src = url;
        if (profileAvatarUrl) profileAvatarUrl.value = url;
        if (profileAvatarGrid) profileAvatarGrid.querySelectorAll('.avatar-option').forEach(function(o) { o.classList.remove('selected'); });
      });
    }

    // Profile file upload
    var profileAvatarFile = document.getElementById('profileAvatarFile');
    if (profileAvatarFile) {
      profileAvatarFile.addEventListener('change', function() {
        var file = this.files[0];
        if (!file) return;
        if (file.size > 2 * 1024 * 1024) { showToast('Image must be under 2MB', 'error'); return; }
        // Upload to server
        var formData = new FormData();
        formData.append('avatar', file);
        fetch('/api/auth/avatar', { method: 'POST', credentials: 'same-origin', body: formData })
        .then(function(r) { return r.json(); })
        .then(function(data) {
          if (data.success && data.avatar_url) {
            if (profileAvatarPreview) profileAvatarPreview.src = data.avatar_url;
            if (profileAvatarUrl) profileAvatarUrl.value = data.avatar_url;
            showToast('Avatar uploaded!');
            if (profileAvatarGrid) profileAvatarGrid.querySelectorAll('.avatar-option').forEach(function(o) { o.classList.remove('selected'); });
          } else {
            showToast(data.error || 'Upload failed', 'error');
          }
        })
        .catch(function() { showToast('Upload failed', 'error'); });
      });
    }

    // Open profile modal function
    window.openProfileSettings = function() {
      // Load current user data
      fetch('/api/auth/me', { credentials: 'same-origin' })
      .then(function(r) { return r.json(); })
      .then(function(data) {
        if (data.loggedIn && data.user) {
          document.getElementById('profileUsername').value = data.user.username || '';
          document.getElementById('profileEmail').value = data.user.email || '';
          var avatar = data.user.avatar_url || generateAvatarUrl(data.user.username);
          document.getElementById('profileAvatarPreview').src = avatar;
          document.getElementById('profileAvatarUrl').value = avatar;
          // Deselect all grid options, select matching one if exists
          if (profileAvatarGrid) {
            profileAvatarGrid.querySelectorAll('.avatar-option').forEach(function(o) {
              o.classList.remove('selected');
              if (o.getAttribute('data-url') === avatar) o.classList.add('selected');
            });
          }
          profileModal.classList.add('active');
        }
      });
    };

    // Profile form submit
    if (profileForm) {
      profileForm.addEventListener('submit', function(e) {
        e.preventDefault();
        var username = document.getElementById('profileUsername').value.trim();
        var avatarUrl = document.getElementById('profileAvatarUrl').value;
        var btn = profileForm.querySelector('.login-submit-btn');
        btn.disabled = true;
        btn.textContent = 'Saving...';

        fetch('/api/auth/profile', {
          method: 'PUT',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: username, avatar_url: avatarUrl })
        })
        .then(function(r) { return r.json(); })
        .then(function(data) {
          if (data.success && data.user) {
            showToast('Profile updated!');
            updateAuthUI(data.user);
            profileModal.classList.remove('active');
          } else {
            showToast(data.error || 'Update failed', 'error');
          }
        })
        .catch(function() { showToast('Network error', 'error'); })
        .finally(function() {
          btn.disabled = false;
          btn.innerHTML = '<i class="fas fa-save" style="margin-right:6px"></i>Save Changes';
        });
      });
    }

    const newsletterForm = document.querySelector('.newsletter-form');
    if (newsletterForm) {
      newsletterForm.addEventListener('submit', (e) => {
        e.preventDefault();
        showToast('Thanks for subscribing to our newsletter!');
        e.target.reset();
      });
    }
    
    // Animation on scroll
    function animateOnScroll() {
      const elements = document.querySelectorAll('.animate-in');
      
      elements.forEach(element => {
        const elementPosition = element.getBoundingClientRect().top;
        const screenPosition = window.innerHeight / 1.3;
        
        if (elementPosition < screenPosition) {
          element.style.opacity = '1';
        }
      });
    }
    
    window.addEventListener('scroll', animateOnScroll);
    window.addEventListener('load', animateOnScroll);
    
    // Initialize animations
    animateOnScroll();
    
    
    // Initialize modals as hidden
    if (helpModal) {
      helpModal.classList.remove('active');
    }
    if (loginModal) {
      loginModal.classList.remove('active');
    }
    if (registerModal) {
      registerModal.classList.remove('active');
    }
    if (gameDetailModal) {
      gameDetailModal.classList.remove('active');
    }
    
    // Initialize help button visibility
    if (helpButton) {
      helpButton.classList.remove('visible');
    }

    // Fetch Game News from Google News RSS via rss2json
    const newsGrid = document.getElementById('newsGrid');
    if (newsGrid) {
      // RSS feeds from gaming sites that include images
      const feeds = [
        'https://feeds.feedburner.com/ign/games-all',
        'https://www.gamespot.com/feeds/mashup/',
        'https://kotaku.com/rss'
      ];

      var allArticles = [];
      var feedsDone = 0;

      feeds.forEach(function(feedUrl) {
        var apiUrl = 'https://api.rss2json.com/v1/api.json?rss_url=' + encodeURIComponent(feedUrl);
        fetch(apiUrl)
          .then(function(res) { return res.json(); })
          .then(function(data) {
            if (data.status === 'ok' && data.items) {
              data.items.forEach(function(item) {
                var img = item.thumbnail || (item.enclosure ? item.enclosure.link : '') || extractImage(item.description) || extractImage(item.content) || '';
                if (img) {
                  allArticles.push({
                    title: item.title.replace(/ - .*$/, ''),
                    link: item.link,
                    image: img,
                    source: item.author || extractFeedName(feedUrl),
                    date: new Date(item.pubDate)
                  });
                }
              });
            }
          })
          .catch(function() {})
          .finally(function() {
            feedsDone++;
            if (feedsDone === feeds.length) {
              renderNews();
            }
          });
      });

      function renderNews() {
        if (allArticles.length === 0) {
          showFallbackNews();
          return;
        }
        // Sort by date, newest first
        allArticles.sort(function(a, b) { return b.date - a.date; });
        // Take the first 6 with images
        var top = allArticles.slice(0, 6);
        newsGrid.innerHTML = top.map(function(item) {
          var timeAgo = getTimeAgo(item.date);
          return '<a href="' + item.link + '" target="_blank" rel="noopener" class="news-card">'
            + '<img src="' + item.image + '" alt="" class="news-thumb" loading="lazy" onerror="this.style.display=\'none\'">'
            + '<div class="news-content">'
            + '<div class="news-title">' + item.title + '</div>'
            + '<span class="news-source">' + item.source + '</span>'
            + '<span class="news-date">' + timeAgo + '</span>'
            + '</div></a>';
        }).join('');
      }

      function extractImage(html) {
        if (!html) return '';
        var match = html.match(/<img[^>]+src=["']([^"']+)["']/i);
        return match ? match[1] : '';
      }

      function extractFeedName(url) {
        if (url.indexOf('ign') !== -1) return 'IGN';
        if (url.indexOf('gamespot') !== -1) return 'GameSpot';
        if (url.indexOf('kotaku') !== -1) return 'Kotaku';
        return 'Gaming News';
      }

      function getTimeAgo(date) {
        var now = new Date();
        var diffMs = now - date;
        var diffMins = Math.floor(diffMs / 60000);
        var diffHrs = Math.floor(diffMins / 60);
        var diffDays = Math.floor(diffHrs / 24);
        if (diffMins < 60) return diffMins + 'm ago';
        if (diffHrs < 24) return diffHrs + 'h ago';
        if (diffDays < 7) return diffDays + 'd ago';
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      }

      function showFallbackNews() {
        var fallback = [
          { title: 'Top Mobile Games to Watch in 2025', source: 'IGN', url: 'https://www.ign.com/articles/best-mobile-games', img: 'https://assets-prd.ignimgs.com/2024/12/10/best-mobile-games-1733868게임47-1733868866498.jpg' },
          { title: 'GTA 6 Release Date and Latest Updates', source: 'GameSpot', url: 'https://www.gamespot.com/articles/gta-6/', img: 'https://www.gamespot.com/a/uploads/original/1179/11799911/4240944-gta6.jpg' },
          { title: 'Best Racing Games on Mobile Right Now', source: 'PC Gamer', url: 'https://www.pcgamer.com/best-racing-games/', img: 'https://cdn.mos.cms.futurecdn.net/racing-games.jpg' },
          { title: 'Upcoming Open World Games You Need to Play', source: 'Kotaku', url: 'https://kotaku.com/', img: 'https://i.kinja-img.com/image/upload/c_fill,h_675,pg_1,q_80,w_1200/open-world-games.jpg' },
        ];
        newsGrid.innerHTML = fallback.map(function(item) {
          return '<a href="' + item.url + '" target="_blank" rel="noopener" class="news-card">'
            + '<div class="news-thumb" style="display:flex;align-items:center;justify-content:center;background:var(--lighter);"><i class="fas fa-gamepad" style="font-size:1.5rem;color:var(--text-secondary);"></i></div>'
            + '<div class="news-content">'
            + '<div class="news-title">' + item.title + '</div>'
            + '<span class="news-source">' + item.source + '</span>'
            + '</div></a>';
        }).join('');
      }
    }
