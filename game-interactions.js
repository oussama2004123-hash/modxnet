/**
 * ModXnet Game Page Interactions
 * Handles reviews and auth state for all game pages.
 * Shows a professional login modal when guests try to post.
 */
(function() {
  'use strict';

  // Determine game slug from URL path
  var pathParts = window.location.pathname.split('/').filter(Boolean);
  var gameSlug = pathParts[0] || '';
  if (!gameSlug) return;

  var currentUser = null;
  var reviewsList = document.getElementById('reviewsList');
  var addReviewBtn = document.getElementById('addReviewBtn');

  // ========== INJECT STYLES ==========
  var css = document.createElement('style');
  css.textContent = [
    /* Review/Comment form styles */
    '.interaction-form { display:none; margin-top:12px; padding:16px; background:rgba(255,255,255,0.03);',
    '  border:1px solid rgba(255,255,255,0.08); border-radius:14px; }',
    '.interaction-form.open { display:block; }',
    '.interaction-form textarea {',
    '  width:100%; padding:12px 14px; border:1px solid rgba(255,255,255,0.1);',
    '  border-radius:10px; background:rgba(0,0,0,0.3); color:#e0e0e0;',
    '  font-family:"Exo 2",sans-serif; font-size:0.9rem; resize:vertical; outline:none;',
    '  transition:border-color 0.2s; min-height:70px; box-sizing:border-box; }',
    '.interaction-form textarea:focus { border-color:rgba(0,255,204,0.4); }',
    '',
    '.star-picker { display:flex; gap:4px; margin-bottom:10px; }',
    '.star-picker i { font-size:1.3rem; cursor:pointer; color:rgba(255,255,255,0.2); transition:color 0.15s; }',
    '.star-picker i.active { color:#ffc107; }',
    '.star-picker i:hover { color:#ffc107; }',
    '',
    '.form-actions { display:flex; gap:8px; margin-top:10px; }',
    '.form-submit-btn { padding:10px 20px; border:none; border-radius:10px;',
    '  background:linear-gradient(135deg,#00ffcc,#00d4aa); color:#0a0a0a;',
    '  font-family:"Exo 2",sans-serif; font-size:0.88rem; font-weight:700;',
    '  cursor:pointer; transition:all 0.2s; }',
    '.form-submit-btn:hover { transform:translateY(-1px); }',
    '.form-submit-btn:disabled { opacity:0.5; cursor:not-allowed; transform:none; }',
    '.form-cancel-btn { padding:10px 16px; border:1px solid rgba(255,255,255,0.1);',
    '  border-radius:10px; background:transparent; color:#a0a0a0;',
    '  font-family:"Exo 2",sans-serif; font-size:0.88rem; cursor:pointer; transition:all 0.2s; }',
    '.form-cancel-btn:hover { background:rgba(255,255,255,0.05); color:#fff; }',
    '',
    '.no-items-msg { color:#666; font-size:0.88rem; padding:12px 0; font-style:italic; }',
    '',
    /* ===== Professional Login Prompt Modal ===== */
    '.login-prompt-overlay {',
    '  position:fixed; inset:0; z-index:99990;',
    '  background:rgba(0,0,0,0.75); backdrop-filter:blur(8px);',
    '  display:flex; align-items:center; justify-content:center;',
    '  padding:20px; opacity:0; animation:lpFadeIn 0.3s ease forwards; }',
    '@keyframes lpFadeIn { to { opacity:1; } }',
    '',
    '.login-prompt-modal {',
    '  background:linear-gradient(145deg,#1a1a2e,#16213e);',
    '  border:1px solid rgba(0,255,204,0.12); border-radius:20px;',
    '  max-width:400px; width:100%; padding:32px 24px 24px;',
    '  text-align:center; font-family:"Exo 2",sans-serif;',
    '  box-shadow:0 16px 50px rgba(0,0,0,0.5),0 0 30px rgba(0,255,204,0.04);',
    '  transform:scale(0.95); animation:lpPopIn 0.3s 0.05s ease forwards; }',
    '@keyframes lpPopIn { to { transform:scale(1); } }',
    '',
    '.lp-icon {',
    '  width:64px; height:64px; margin:0 auto 16px; border-radius:50%;',
    '  background:linear-gradient(135deg,rgba(0,255,204,0.12),rgba(0,255,204,0.04));',
    '  border:2px solid rgba(0,255,204,0.2);',
    '  display:flex; align-items:center; justify-content:center;',
    '  font-size:24px; color:#00ffcc; }',
    '',
    '.login-prompt-modal h3 {',
    '  font-size:1.2rem; font-weight:700; color:#fff; margin:0 0 8px; }',
    '.login-prompt-modal p {',
    '  font-size:0.88rem; color:#a0a0a0; margin:0 0 24px; line-height:1.5; }',
    '.login-prompt-modal p strong { color:#00ffcc; }',
    '',
    '.lp-actions { display:flex; flex-direction:column; gap:10px; }',
    '',
    '.lp-google-btn {',
    '  display:flex; align-items:center; justify-content:center; gap:10px;',
    '  padding:12px 20px; border:none; border-radius:12px;',
    '  background:#fff; color:#333; font-family:"Exo 2",sans-serif;',
    '  font-size:0.92rem; font-weight:600; cursor:pointer;',
    '  transition:all 0.2s; box-shadow:0 2px 8px rgba(0,0,0,0.15); }',
    '.lp-google-btn:hover { transform:translateY(-1px); box-shadow:0 4px 12px rgba(0,0,0,0.2); }',
    '.lp-google-btn img { width:20px; height:20px; }',
    '',
    '.lp-login-btn {',
    '  display:flex; align-items:center; justify-content:center; gap:8px;',
    '  padding:12px 20px; border:none; border-radius:12px;',
    '  background:linear-gradient(135deg,#00ffcc,#00d4aa); color:#0a0a0a;',
    '  font-family:"Exo 2",sans-serif; font-size:0.92rem; font-weight:700;',
    '  cursor:pointer; transition:all 0.2s; }',
    '.lp-login-btn:hover { transform:translateY(-1px); }',
    '',
    '.lp-divider {',
    '  display:flex; align-items:center; gap:12px; margin:2px 0;',
    '  color:#555; font-size:0.78rem; }',
    '.lp-divider::before, .lp-divider::after {',
    '  content:""; flex:1; height:1px; background:rgba(255,255,255,0.08); }',
    '',
    '.lp-close-btn {',
    '  padding:10px 20px; border:1px solid rgba(255,255,255,0.1);',
    '  border-radius:10px; background:transparent; color:#777;',
    '  font-family:"Exo 2",sans-serif; font-size:0.85rem; cursor:pointer;',
    '  transition:all 0.2s; margin-top:4px; }',
    '.lp-close-btn:hover { background:rgba(255,255,255,0.05); color:#bbb; }',
    '',
    '@media (max-width:480px) {',
    '  .login-prompt-modal { padding:24px 18px 20px; }',
    '  .login-prompt-modal h3 { font-size:1.1rem; }',
    '  .lp-icon { width:56px; height:56px; font-size:20px; }',
    '}'
  ].join('\n');
  document.head.appendChild(css);

  // ========== LOGIN PROMPT MODAL ==========
  function showLoginPrompt(action) {
    // Remove existing if any
    var existing = document.getElementById('loginPromptOverlay');
    if (existing) existing.remove();

    var actionText = 'leave a review';

    var overlay = document.createElement('div');
    overlay.className = 'login-prompt-overlay';
    overlay.id = 'loginPromptOverlay';
    overlay.innerHTML =
      '<div class="login-prompt-modal">' +
        '<div class="lp-icon"><i class="fas fa-user-lock"></i></div>' +
        '<h3>Join the Conversation</h3>' +
        '<p>You need to be logged in to <strong>' + actionText + '</strong>.<br>Sign in to share your experience with the community!</p>' +
        '<div class="lp-actions">' +
          '<button class="lp-google-btn" id="lpGoogleBtn">' +
            '<img src="https://i.postimg.cc/tCL4vv7z/google-color-(1).png" alt="Google"> Continue with Google' +
          '</button>' +
          '<div class="lp-divider">or</div>' +
          '<button class="lp-login-btn" id="lpLoginBtn">' +
            '<i class="fas fa-sign-in-alt"></i> Sign in with Email' +
          '</button>' +
          '<button class="lp-close-btn" id="lpCloseBtn">Maybe Later</button>' +
        '</div>' +
      '</div>';

    document.body.appendChild(overlay);

    // Google sign in
    overlay.querySelector('#lpGoogleBtn').addEventListener('click', function() {
      window.location.href = '/api/auth/google';
    });

    // Email login — go to homepage with login modal trigger
    overlay.querySelector('#lpLoginBtn').addEventListener('click', function() {
      window.location.href = '/?action=login';
    });

    // Close
    overlay.querySelector('#lpCloseBtn').addEventListener('click', function() {
      overlay.remove();
    });

    // Close on backdrop click
    overlay.addEventListener('click', function(e) {
      if (e.target === overlay) overlay.remove();
    });
  }

  // ========== UTILITY ==========
  function timeAgo(dateStr) {
    var now = new Date();
    var date = new Date(dateStr);
    var seconds = Math.floor((now - date) / 1000);
    if (seconds < 60) return 'just now';
    var minutes = Math.floor(seconds / 60);
    if (minutes < 60) return minutes + (minutes === 1 ? ' minute ago' : ' minutes ago');
    var hours = Math.floor(minutes / 60);
    if (hours < 24) return hours + (hours === 1 ? ' hour ago' : ' hours ago');
    var days = Math.floor(hours / 24);
    if (days < 30) return days + (days === 1 ? ' day ago' : ' days ago');
    var months = Math.floor(days / 30);
    return months + (months === 1 ? ' month ago' : ' months ago');
  }

  function starsHTML(rating) {
    var html = '';
    for (var i = 1; i <= 5; i++) {
      if (i <= rating) html += '<i class="fas fa-star"></i>';
      else if (i - 0.5 <= rating) html += '<i class="fas fa-star-half-alt"></i>';
      else html += '<i class="far fa-star"></i>';
    }
    return html;
  }

  function escapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ========== RENDER REVIEWS ==========
  function renderReviews(reviews) {
    if (!reviewsList) return;
    if (!reviews || reviews.length === 0) {
      // Keep static HTML content if API returns nothing
      if (reviewsList.children.length === 0) {
        reviewsList.innerHTML = '<li class="no-items-msg">No reviews yet. Be the first to review this game!</li>';
      }
      return;
    }
    reviewsList.innerHTML = reviews.map(function(r) {
      return '<li class="review-item">' +
        '<div class="review-header">' +
          '<span class="review-author">' + escapeHtml(r.username) + '</span>' +
          '<div class="review-stars">' + starsHTML(r.rating) + '</div>' +
        '</div>' +
        '<p class="review-text">' + escapeHtml(r.text) + '</p>' +
        '<span class="review-date">' + timeAgo(r.created_at) + '</span>' +
      '</li>';
    }).join('');
  }

  // ========== FETCH DATA ==========
  function loadReviews() {
    fetch('/api/reviews/' + encodeURIComponent(gameSlug))
      .then(function(r) { return r.json(); })
      .then(function(reviews) {
        if (reviews && reviews.length > 0) renderReviews(reviews);
        // If empty, keep the existing static HTML reviews
      })
      .catch(function() {}); // On error, keep static content
  }

  // ========== REVIEW FORM ==========
  function createReviewForm() {
    var form = document.createElement('div');
    form.className = 'interaction-form';
    form.id = 'reviewForm';
    var selectedRating = 0;

    form.innerHTML =
      '<div class="star-picker" id="starPicker">' +
        '<i class="far fa-star" data-star="1"></i>' +
        '<i class="far fa-star" data-star="2"></i>' +
        '<i class="far fa-star" data-star="3"></i>' +
        '<i class="far fa-star" data-star="4"></i>' +
        '<i class="far fa-star" data-star="5"></i>' +
      '</div>' +
      '<textarea id="reviewTextInput" placeholder="Share your experience with this game..."></textarea>' +
      '<div class="form-actions">' +
        '<button class="form-submit-btn" id="submitReviewBtn"><i class="fas fa-paper-plane"></i> Post Review</button>' +
        '<button class="form-cancel-btn" id="cancelReviewBtn">Cancel</button>' +
      '</div>';

    var section = addReviewBtn.closest('.reviews-section');
    var headerRow = section.querySelector('.section-header-row');
    headerRow.insertAdjacentElement('afterend', form);

    // Star picker
    var stars = form.querySelectorAll('.star-picker i');
    stars.forEach(function(star) {
      star.addEventListener('click', function() {
        selectedRating = parseInt(this.getAttribute('data-star'));
        updateStars();
      });
      star.addEventListener('mouseenter', function() {
        var hoverVal = parseInt(this.getAttribute('data-star'));
        stars.forEach(function(s, i) {
          s.className = i < hoverVal ? 'fas fa-star active' : 'far fa-star';
        });
      });
    });
    form.querySelector('.star-picker').addEventListener('mouseleave', function() {
      updateStars();
    });
    function updateStars() {
      stars.forEach(function(s, i) {
        s.className = i < selectedRating ? 'fas fa-star active' : 'far fa-star';
      });
    }

    // Submit
    form.querySelector('#submitReviewBtn').addEventListener('click', function() {
      var text = form.querySelector('#reviewTextInput').value.trim();
      if (selectedRating === 0) { showFormError(form, 'Please select a star rating'); return; }
      if (text.length < 3) { showFormError(form, 'Review must be at least 3 characters'); return; }

      var btn = this;
      btn.disabled = true;
      btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Posting...';

      fetch('/api/reviews/' + encodeURIComponent(gameSlug), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating: selectedRating, text: text })
      })
      .then(function(r) { return r.json().then(function(d) { return { ok: r.ok, data: d }; }); })
      .then(function(res) {
        if (res.ok && res.data.success) {
          renderReviews(res.data.reviews);
          form.classList.remove('open');
          form.querySelector('#reviewTextInput').value = '';
          selectedRating = 0;
          updateStars();
        } else {
          showFormError(form, res.data.error || 'Failed to post review');
        }
      })
      .catch(function() { showFormError(form, 'Network error. Please try again.'); })
      .finally(function() { btn.disabled = false; btn.innerHTML = '<i class="fas fa-paper-plane"></i> Post Review'; });
    });

    form.querySelector('#cancelReviewBtn').addEventListener('click', function() {
      form.classList.remove('open');
    });

    return form;
  }

  // Small inline error message for forms
  function showFormError(form, msg) {
    var existing = form.querySelector('.form-error-msg');
    if (existing) existing.remove();
    var el = document.createElement('div');
    el.className = 'form-error-msg';
    el.style.cssText = 'color:#ff5757;font-size:0.82rem;margin-top:8px;font-family:"Exo 2",sans-serif;';
    el.innerHTML = '<i class="fas fa-exclamation-circle"></i> ' + msg;
    form.querySelector('.form-actions').insertAdjacentElement('afterend', el);
    setTimeout(function() { if (el.parentNode) el.remove(); }, 4000);
  }

  // ========== INIT ==========
  function init() {
    // Check auth state
    fetch('/api/auth/me')
      .then(function(r) { return r.json(); })
      .then(function(data) {
        if (data.loggedIn) currentUser = data.user;
        setupButtons();
      })
      .catch(function() { setupButtons(); });

    // Load data from API (keeps static content as fallback)
    loadReviews();
  }

  function setupButtons() {
    var reviewForm = null;

    if (addReviewBtn) {
      var newReviewBtn = addReviewBtn.cloneNode(true);
      addReviewBtn.parentNode.replaceChild(newReviewBtn, addReviewBtn);
      addReviewBtn = newReviewBtn;

      addReviewBtn.addEventListener('click', function() {
        if (!currentUser) {
          showLoginPrompt('review');
          return;
        }
        if (!reviewForm) reviewForm = createReviewForm();
        reviewForm.classList.toggle('open');
      });
    }
  }

  // ========== DYNAMIC FAVICON FROM GAME LOGO ==========
  function setGameFavicon() {
    var gameLogo = document.querySelector('img.game-logo');
    if (!gameLogo) return;
    var logoSrc = gameLogo.getAttribute('src');
    if (!logoSrc || logoSrc.indexOf('placehold') !== -1) return;

    // Remove any existing favicon links
    var existingIcons = document.querySelectorAll('link[rel="icon"], link[rel="shortcut icon"]');
    existingIcons.forEach(function(el) { el.remove(); });

    // Create new favicon pointing to the game logo
    var link = document.createElement('link');
    link.rel = 'icon';
    link.type = 'image/png';
    link.href = logoSrc;
    document.head.appendChild(link);
  }

  // Run when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
      init();
      setGameFavicon();
    });
  } else {
    init();
    setGameFavicon();
  }

})();
