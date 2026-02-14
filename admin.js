// ===== MODXNET ADMIN PANEL (Unified Games) =====
(function() {
  var adminUser = null;

  // ===== HELPERS =====
  function $(id) { return document.getElementById(id); }
  function toast(msg, type) {
    var t = $('adminToast');
    t.textContent = msg;
    t.className = 'admin-toast ' + (type || 'success') + ' show';
    setTimeout(function() { t.classList.remove('show'); }, 3000);
  }

  async function api(url, opts) {
    try {
      var res = await fetch(url, Object.assign({ headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin' }, opts || {}));
      var data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Request failed');
      return data;
    } catch (err) {
      toast(err.message, 'error');
      throw err;
    }
  }

  function escHtml(s) {
    if (!s) return '';
    var d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }
  function escAttr(s) { return escHtml(s).replace(/"/g, '&quot;'); }
  function formatDate(d) {
    if (!d) return '';
    try { return new Date(d).toLocaleDateString('en-US', { year:'numeric', month:'short', day:'numeric' }); }
    catch(e) { return d; }
  }
  function starsHtml(n) {
    var h = '';
    for (var i = 1; i <= 5; i++) {
      h += i <= n ? '<i class="fas fa-star" style="color:#ffa502;font-size:0.75rem"></i>' : '<i class="far fa-star" style="color:var(--text3);font-size:0.75rem"></i>';
    }
    return h;
  }
  var thumbFallback = "data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2260%22 height=%2260%22><rect fill=%22%231a1a28%22 width=%2260%22 height=%2260%22 rx=%228%22/><text x=%2230%22 y=%2235%22 fill=%22%2300ffcc%22 font-size=%2218%22 text-anchor=%22middle%22>?</text></svg>";

  // ===== AUTH CHECK =====
  async function checkAdmin() {
    try {
      var data = await fetch('/api/admin/check', { credentials: 'same-origin' }).then(function(r) { return r.json(); });
      if (!data.isAdmin) { $('authGate').style.display = 'flex'; $('adminShell').style.display = 'none'; return; }
      adminUser = data.user;
      $('authGate').style.display = 'none';
      $('adminShell').style.display = 'flex';
      $('topbarUser').innerHTML = (adminUser.avatar_url ? '<img src="' + adminUser.avatar_url + '" referrerpolicy="no-referrer">' : '') + '<span>' + adminUser.username + '</span>';
      loadDashboard();
      loadTrashCounts();
    } catch (e) { $('authGate').style.display = 'flex'; }
  }

  // ===== TAB NAVIGATION =====
  var tabTitles = { dashboard:'Home', games:'Games', trash:'Trash', adblue:'Ad Config', users:'Users', reviews:'Reviews', comments:'Comments' };

  window.switchTab = function(tab) {
    document.querySelectorAll('.tab-content').forEach(function(el) { el.classList.remove('active'); });
    document.querySelectorAll('.nav-item[data-tab]').forEach(function(el) { el.classList.remove('active'); });
    var target = $('tab-' + tab);
    if (target) target.classList.add('active');
    var navItem = document.querySelector('.nav-item[data-tab="' + tab + '"]');
    if (navItem) navItem.classList.add('active');
    $('pageTitle').textContent = tabTitles[tab] || tab;
    if (tab === 'dashboard') loadDashboard();
    else if (tab === 'games') showGamesList();
    else if (tab === 'trash') { loadTrash(); loadPageTrash(); }
    else if (tab === 'adblue') loadAdblue();
    else if (tab === 'users') loadUsers();
    else if (tab === 'reviews') loadReviews();
    else if (tab === 'comments') loadComments();
    $('sidebar').classList.remove('open');
  };

  document.querySelectorAll('.nav-item[data-tab]').forEach(function(el) {
    el.addEventListener('click', function(e) { e.preventDefault(); switchTab(this.getAttribute('data-tab')); });
  });
  $('sidebarToggle').addEventListener('click', function() { $('sidebar').classList.toggle('open'); });

  // ===== DASHBOARD =====
  async function loadDashboard() {
    try {
      var s = await api('/api/admin/stats');
      $('statsGrid').innerHTML =
        '<div class="stat-card"><div class="stat-icon users"><i class="fas fa-users"></i></div><div class="stat-info"><h4>' + s.users + '</h4><p>Users</p></div></div>' +
        '<div class="stat-card"><div class="stat-icon games"><i class="fas fa-gamepad"></i></div><div class="stat-info"><h4>' + s.games + '</h4><p>Games</p></div></div>' +
        '<div class="stat-card"><div class="stat-icon reviews"><i class="fas fa-star"></i></div><div class="stat-info"><h4>' + s.reviews + '</h4><p>Reviews</p></div></div>' +
        '<div class="stat-card"><div class="stat-icon comments"><i class="fas fa-comments"></i></div><div class="stat-info"><h4>' + s.comments + '</h4><p>Comments</p></div></div>';
    } catch (e) {}
  }

  // ===== TRASH COUNTS =====
  async function loadTrashCounts() {
    try {
      var trashed = await fetch('/api/admin/games/trash', { credentials: 'same-origin' }).then(function(r) { return r.json(); });
      var pageTrash = await fetch('/api/admin/gamepages/trash', { credentials: 'same-origin', headers: { 'Accept': 'application/json' } }).then(function(r) { return r.json(); });
      var total = (Array.isArray(trashed) ? trashed.length : 0) + (Array.isArray(pageTrash) ? pageTrash.length : 0);
      var badge = $('trashBadge');
      if (total > 0) { badge.textContent = total; badge.style.display = 'inline'; }
      else { badge.style.display = 'none'; }
    } catch(e) {}
  }

  // ===========================================================================
  // ===== GAMES — UNIFIED LIST + EDITOR =======================================
  // ===========================================================================
  var gamesData = [];
  var currentEditSlug = null; // null = new game, string = editing existing
  var originalSlug = null; // tracks original slug to detect renames
  var currentEditId = null;
  var pageImagesData = { cover: '', logo: '', screenshots: [] };
  var featuresData = [];
  var pageExists = false;

  // ----- Show the game list -----
  function showGamesList() {
    $('gamesListView').style.display = '';
    $('gameEditorView').style.display = 'none';
    loadGames();
  }

  async function loadGames() {
    try { gamesData = await api('/api/admin/games'); renderGamesList(); } catch (e) {}
  }

  function renderGamesList() {
    var html = '';
    gamesData.forEach(function(g) {
      var hasPage = g._hasPage; // we'll set this from server
      html += '<div class="game-list-card" onclick="openGameEditor(\'' + escAttr(g.slug) + '\',' + g.id + ')">' +
        '<img src="' + (g.image_url || '') + '" class="game-list-thumb" onerror="this.src=\'' + thumbFallback + '\'">' +
        '<div class="game-list-info">' +
          '<h4>' + escHtml(g.title) + '</h4>' +
          '<div class="game-list-meta">' +
            '<span>' + escHtml(g.category || 'No type') + '</span>' +
            '<span>' + escHtml(g.version || '—') + '</span>' +
            '<span>' + starsHtml(Math.round(g.rating)) + '</span>' +
          '</div>' +
          '<div class="game-list-tags">' +
            '<span class="game-tag folder-tag"><i class="fas fa-folder"></i> ' + escHtml(g.slug) + '</span>' +
            (g.visible ? '<span class="game-tag visible-tag"><i class="fas fa-eye"></i> Visible</span>' : '<span class="game-tag hidden-tag"><i class="fas fa-eye-slash"></i> Hidden</span>') +
          '</div>' +
        '</div>' +
        '<div class="game-list-actions">' +
          '<button class="game-list-trash-btn" onclick="event.stopPropagation();trashGame(' + g.id + ',\'' + escAttr(g.title) + '\')" title="Move to Trash"><i class="fas fa-trash"></i></button>' +
          '<button class="edit-btn" title="Edit"><i class="fas fa-chevron-right"></i></button>' +
        '</div>' +
      '</div>';
    });
    $('gamesGrid').innerHTML = html || '<div style="text-align:center;color:var(--text2);padding:40px"><i class="fas fa-gamepad" style="font-size:2rem;opacity:0.3;display:block;margin-bottom:12px"></i>No games yet. Click "Add New Game" to get started.</div>';
  }

  // ----- Trash a game (from list) -----
  window.trashGame = function(id, title) {
    if (!confirm('Move "' + title + '" to trash?\n\nYou can restore it later from the Trash tab.')) return;
    api('/api/admin/games/' + id, { method: 'DELETE' }).then(function(data) {
      gamesData = data.games;
      renderGamesList();
      loadTrashCounts();
      toast('Moved to trash. You can restore it anytime.');
    });
  };

  // ----- Open editor (new or existing) -----
  $('addGameBtn').addEventListener('click', function() { openGameEditor(null, null); });

  window.openGameEditor = async function(slug, id) {
    currentEditSlug = slug;
    currentEditId = id;
    pageExists = false;
    pageImagesData = { cover: '', logo: '', screenshots: [] };

    // Switch views
    $('gamesListView').style.display = 'none';
    $('gameEditorView').style.display = '';
    $('htmlEditorSection').style.display = 'none';

    // Set title
    $('editorTitle').textContent = slug ? 'Edit: ' + slug : 'Add New Game';
    $('editorPreviewLink').style.display = slug ? '' : 'none';
    if (slug) $('editorPreviewLink').href = '/' + slug + '/';

    // Reset auto-fetch
    $('fetchGameName').value = '';
    showFetchStatus($('fetchStatus'), '', '');
    $('fetchAlternatives').innerHTML = '';
    $('fetchAlternatives').classList.remove('show');

    if (slug && id) {
      // Editing existing — fill card fields from DB
      var g = gamesData.find(function(x) { return x.id === id; });
      if (g) {
        $('gameId').value = g.id;
        $('gameTitle').value = g.title;
        $('gameSlug').value = g.slug;
        originalSlug = g.slug;
        $('gameImageUrl').value = g.image_url || '';
        $('gameCategory').value = g.category || '';
        $('gameDataGame').value = g.data_game || '';
        $('gameVersion').value = g.version || 'v1.0';
        $('gameReleaseDate').value = g.release_date || '';
        $('gameRating').value = g.rating || 4.0;
        $('gameLink').value = g.link || '';
        $('gameSortOrder').value = g.sort_order || 0;
        $('gameVisible').value = g.visible ? '1' : '0';
        var preview = $('gameImagePreview');
        preview.innerHTML = g.image_url ? '<img src="' + g.image_url + '" onerror="this.style.display=\'none\'">' : '';
      }

      // Try to load game page images + HTML
      try {
        var imgRes = await fetch('/api/admin/gamepage/' + encodeURIComponent(slug) + '/images', {
          credentials: 'same-origin', headers: { 'Accept': 'application/json' }
        });
        if (imgRes.ok) {
          var imgs = await imgRes.json();
          pageImagesData = { cover: imgs.cover || '', logo: imgs.logo || '', screenshots: imgs.screenshots || [] };
          pageExists = true;
        }
      } catch(e) {}

      // Load features
      try {
        var featRes = await fetch('/api/admin/gamepage/' + encodeURIComponent(slug) + '/features', {
          credentials: 'same-origin', headers: { 'Accept': 'application/json' }
        });
        if (featRes.ok) {
          var featData = await featRes.json();
          featuresData = featData.features || [];
        }
      } catch(e) { featuresData = []; }

      // Load adblue config for this game
      try {
        var adRes = await fetch('/api/admin/adblue', {
          credentials: 'same-origin', headers: { 'Accept': 'application/json' }
        });
        if (adRes.ok) {
          var allAdblue = await adRes.json();
          var adConfig = allAdblue.find(function(a) { return a.game_slug === slug; });
          if (adConfig) {
            $('editorAdblueIt').value = adConfig.it_value || '';
            $('editorAdblueKey').value = adConfig.key_value || '';
            $('editorAdblueVar').value = adConfig.variable_name || 'PKiWi_Ojz_wYrvyc';
            $('editorAdblueScript').value = adConfig.script_url || 'https://da4talg8ap14y.cloudfront.net/5b1c47d.js';
            $('adblueInlineStatus').innerHTML = adConfig.it_value && adConfig.key_value
              ? '<i class="fas fa-check-circle" style="color:#00ffcc"></i> Content locker is configured'
              : '<i class="fas fa-exclamation-triangle" style="color:#ffa500"></i> Not configured yet — set IT and Key values';
          } else {
            $('editorAdblueIt').value = '';
            $('editorAdblueKey').value = '';
            $('editorAdblueVar').value = 'PKiWi_Ojz_wYrvyc';
            $('editorAdblueScript').value = 'https://da4talg8ap14y.cloudfront.net/5b1c47d.js';
            $('adblueInlineStatus').innerHTML = '<i class="fas fa-exclamation-triangle" style="color:#ffa500"></i> Not configured yet — set IT and Key values';
          }
        }
      } catch(e) {}

      // Load votes from game page
      try {
        var votesRes = await fetch('/api/admin/gamepage/' + encodeURIComponent(slug) + '/votes', {
          credentials: 'same-origin', headers: { 'Accept': 'application/json' }
        });
        if (votesRes.ok) {
          var votesData = await votesRes.json();
          $('editorPageRating').value = votesData.rating || 4.0;
          $('editorVoteCount').value = votesData.votes || 0;
          updateVotesPreview();
        }
      } catch(e) {}

      // Load engagement status (review + comment counts)
      try {
        var revRes = await fetch('/api/reviews/' + encodeURIComponent(slug), {
          credentials: 'same-origin', headers: { 'Accept': 'application/json' }
        });
        var comRes = await fetch('/api/comments/' + encodeURIComponent(slug), {
          credentials: 'same-origin', headers: { 'Accept': 'application/json' }
        });
        var revCount = 0, comCount = 0;
        if (revRes.ok) { var r = await revRes.json(); revCount = r.length; }
        if (comRes.ok) { var c = await comRes.json(); comCount = c.length; }
        if (revCount > 0 || comCount > 0) {
          $('engagementStatus').innerHTML = '<i class="fas fa-check-circle" style="color:#00ffcc"></i> This game has ' + revCount + ' reviews and ' + comCount + ' comments';
        } else {
          $('engagementStatus').innerHTML = '<i class="fas fa-info-circle" style="color:var(--text3)"></i> No reviews or comments yet — click Generate to add some';
        }
      } catch(e) {
        $('engagementStatus').innerHTML = '';
      }

      // Load HTML content
      try {
        var pageData = await api('/api/admin/gamepage/' + encodeURIComponent(slug));
        $('editorTextarea').value = pageData.content;
        var filesHtml = '';
        pageData.files.forEach(function(f) {
          filesHtml += '<span class="editor-file-tag"><i class="fas fa-file"></i> ' + escHtml(f) + '</span>';
        });
        $('editorFiles').innerHTML = filesHtml;
        $('htmlEditorSection').style.display = '';
        pageExists = true;
      } catch(e) {
        $('editorTextarea').value = '';
        $('editorFiles').innerHTML = '<span class="editor-file-tag" style="color:var(--text3)"><i class="fas fa-info-circle"></i> Game page folder doesn\'t exist yet — it will be created on save.</span>';
        $('htmlEditorSection').style.display = '';
      }

    } else {
      // New game — reset everything
      $('gameId').value = '';
      $('gameTitle').value = '';
      $('gameSlug').value = '';
      originalSlug = null;
      $('gameImageUrl').value = '';
      $('gameCategory').value = '';
      $('gameDataGame').value = '';
      $('gameVersion').value = 'v1.0';
      $('gameReleaseDate').value = '';
      $('gameRating').value = 4.0;
      $('gameLink').value = '';
      $('gameSortOrder').value = 0;
      $('gameVisible').value = '1';
      $('gameImagePreview').innerHTML = '';
      $('editorTextarea').value = '';
      $('editorFiles').innerHTML = '<span class="editor-file-tag" style="color:var(--text3)"><i class="fas fa-info-circle"></i> Game page will be created automatically on save.</span>';
      $('htmlEditorSection').style.display = '';
      featuresData = [];
      // Reset adblue fields for new game
      $('editorAdblueIt').value = '';
      $('editorAdblueKey').value = '';
      $('editorAdblueVar').value = 'PKiWi_Ojz_wYrvyc';
      $('editorAdblueScript').value = 'https://da4talg8ap14y.cloudfront.net/5b1c47d.js';
      $('adblueInlineStatus').innerHTML = '<i class="fas fa-info-circle" style="color:var(--text3)"></i> Set IT and Key after saving the game';
      // Reset votes with random values
      var randRating = (Math.floor(Math.random() * 10) + 36) / 10; // 3.6 - 4.5
      var randVotes = Math.floor(Math.random() * 15000) + 3000; // 3000 - 18000
      $('editorPageRating').value = randRating;
      $('editorVoteCount').value = randVotes;
      updateVotesPreview();
      // Reset engagement
      $('engagementReviewCount').value = 8;
      $('engagementCommentCount').value = 6;
      $('engagementStatus').innerHTML = '<i class="fas fa-info-circle" style="color:var(--text3)"></i> Reviews and comments will be auto-generated when you save';
    }

    renderImageEditor();
    renderFeatures();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // ----- Back to list -----
  $('editorBackBtn').addEventListener('click', function() {
    currentEditSlug = null;
    currentEditId = null;
    showGamesList();
  });

  // ----- Auto-fill slug from title -----
  $('gameTitle').addEventListener('input', function() {
    if (!originalSlug) {
      var title = this.value.trim();
      $('gameSlug').value = title.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '-');
      $('gameLink').value = '/' + $('gameSlug').value + '/';
    }
  });

  // ----- Card image upload & preview -----
  $('gameImageFile').addEventListener('change', async function() {
    var file = this.files[0]; if (!file) return;
    var fd = new FormData(); fd.append('image', file);
    try {
      var res = await fetch('/api/admin/upload', { method: 'POST', body: fd, credentials: 'same-origin' });
      var data = await res.json();
      if (data.url) { $('gameImageUrl').value = data.url; $('gameImagePreview').innerHTML = '<img src="' + data.url + '">'; toast('Picture uploaded!'); }
    } catch (e) { toast('Upload failed', 'error'); }
  });
  $('gameImageUrl').addEventListener('input', function() {
    var url = this.value.trim();
    $('gameImagePreview').innerHTML = url ? '<img src="' + url + '" onerror="this.style.display=\'none\'">' : '';
  });

  // ===========================================================================
  // ===== AUTO-FETCH (RAWG) ===================================================
  // ===========================================================================
  var lastFetchData = null;

  async function doAutoFetch(query, statusEl, altsEl, fillCallback) {
    if (!query) { showFetchStatus(statusEl, 'Type a game name first.', 'error'); return null; }
    var btn = event ? event.currentTarget : null;
    if (btn) { btn.disabled = true; btn.classList.add('loading'); }
    showFetchStatus(statusEl, '', '');
    if (altsEl) altsEl.classList.remove('show');

    try {
      var res = await fetch('/api/admin/fetch-game?q=' + encodeURIComponent(query), {
        credentials: 'same-origin',
        headers: { 'Accept': 'application/json' }
      });
      var ct = res.headers.get('content-type') || '';
      if (!ct.includes('application/json')) {
        throw new Error('Server returned an unexpected response. Make sure you are logged in as admin.');
      }
      var data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Fetch failed');

      lastFetchData = data;
      showFetchStatus(statusEl, '<i class="fas fa-check-circle"></i> Found: <strong>' + escHtml(data.title) + '</strong>' + (data.rating ? ' — ' + data.rating + '/5' : '') + (data.developers ? ' by ' + escHtml(data.developers) : ''), 'success');

      // Show alternatives
      if (altsEl && data.alternatives && data.alternatives.length > 0) {
        var altHtml = '<small style="color:var(--text3);width:100%;margin-bottom:2px">Not the right game? Pick one:</small>';
        data.alternatives.forEach(function(a) {
          altHtml += '<div class="autofetch-alt" data-id="' + a.id + '" data-name="' + escAttr(a.name) + '">' +
            (a.image ? '<img src="' + a.image + '" onerror="this.style.display=\'none\'">' : '') +
            '<span>' + escHtml(a.name) + '</span></div>';
        });
        altsEl.innerHTML = altHtml;
        altsEl.classList.add('show');
        altsEl.querySelectorAll('.autofetch-alt').forEach(function(el) {
          el.addEventListener('click', function() {
            var name = this.getAttribute('data-name');
            doAutoFetch(name, statusEl, altsEl, fillCallback);
          });
        });
      }

      if (fillCallback) fillCallback(data);
      return data;
    } catch (err) {
      showFetchStatus(statusEl, '<i class="fas fa-exclamation-circle"></i> ' + escHtml(err.message), 'error');
      return null;
    } finally {
      if (btn) { btn.disabled = false; btn.classList.remove('loading'); }
    }
  }

  function showFetchStatus(el, html, type) {
    if (!el) return;
    el.innerHTML = html;
    el.className = 'autofetch-status' + (html ? ' show' : '') + (type ? ' ' + type : '');
  }

  $('fetchGameBtn').addEventListener('click', function(e) {
    var query = $('fetchGameName').value.trim();
    doAutoFetch(query, $('fetchStatus'), $('fetchAlternatives'), function(data) {
      // Fill game card fields
      $('gameTitle').value = data.title || '';
      if (!originalSlug) {
        $('gameSlug').value = (data.title || '').replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '-') + '-Mobile';
        $('gameLink').value = '/' + $('gameSlug').value + '/';
      }
      $('gameImageUrl').value = data.cover_image || '';
      if (data.cover_image) {
        $('gameImagePreview').innerHTML = '<img src="' + data.cover_image + '" onerror="this.style.display=\'none\'">';
      }
      $('gameCategory').value = data.category || '';
      $('gameDataGame').value = (data.title || '').toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 12);
      $('gameRating').value = data.rating || 4.0;
      $('gameReleaseDate').value = data.release_date || '';

      // Also fill game page images from RAWG
      if (data.cover_image) {
        pageImagesData.cover = data.cover_image;
      }
      if (data.screenshots && data.screenshots.length > 0) {
        pageImagesData.screenshots = data.screenshots.slice();
      }
      renderImageEditor();
      toast('All game details auto-filled!');
    });
  });

  $('fetchGameName').addEventListener('keydown', function(e) {
    if (e.key === 'Enter') { e.preventDefault(); $('fetchGameBtn').click(); }
  });

  // ===== AI GENERATE (DeepSeek) =====
  $('aiGenerateBtn').addEventListener('click', async function() {
    var gameName = $('fetchGameName').value.trim() || $('gameTitle').value.trim();
    if (!gameName) {
      showFetchStatus($('fetchStatus'), '<i class="fas fa-exclamation-circle"></i> Enter a game name first (in the search bar or Game Name field).', 'error');
      return;
    }

    var btn = this;
    btn.disabled = true;
    btn.classList.add('loading');
    showFetchStatus($('fetchStatus'), '<i class="fas fa-robot" style="color:#a855f7"></i> Generating everything for <strong>' + escHtml(gameName) + '</strong>...', '');

    try {
      var res = await fetch('/api/admin/ai-generate', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ gameName: gameName })
      });
      var ct = res.headers.get('content-type') || '';
      if (!ct.includes('application/json')) throw new Error('Server returned unexpected response');
      var data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Generation failed');

      // Fill Game Name
      if (data.title) {
        $('gameTitle').value = data.title;
      }

      // Fill Folder Name (only for new games)
      if (!originalSlug && data.title) {
        $('gameSlug').value = data.title.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '-') + '-Mobile';
        $('gameLink').value = '/' + $('gameSlug').value + '/';
      }

      // Fill Game Type
      if (data.genre) {
        $('gameCategory').value = data.genre;
      }

      // Fill Short ID
      if (data.shortId) {
        $('gameDataGame').value = data.shortId;
      }

      // Fill Version
      if (data.version) {
        $('gameVersion').value = data.version;
      }

      // Fill Release Date
      if (data.releaseDate) {
        $('gameReleaseDate').value = data.releaseDate;
      }

      // Fill Rating
      if (data.rating) {
        $('gameRating').value = data.rating;
      }

      // Fill Cover Image from RAWG (if present in response)
      if (data.cover_image) {
        $('gameImageUrl').value = data.cover_image;
        $('gameImagePreview').innerHTML = '<img src="' + data.cover_image + '" onerror="this.style.display=\'none\'">';
        pageImagesData.cover = data.cover_image;
      }

      // Fill Screenshots from RAWG
      if (data.screenshots && data.screenshots.length > 0) {
        pageImagesData.screenshots = data.screenshots.slice();
      }

      // Fill features
      if (data.features && data.features.length > 0) {
        featuresData = data.features.slice();
        renderFeatures();
      }

      // Store description and subtitle for game page creation
      if (data.description) window._aiDescription = data.description;
      if (data.subtitle) window._aiSubtitle = data.subtitle;

      // Update image previews
      renderImageEditor();

      // Build status message
      var filled = [];
      if (data.title) filled.push('name');
      if (data.genre) filled.push('type');
      if (data.shortId) filled.push('short ID');
      if (data.version) filled.push('version');
      if (data.releaseDate) filled.push('date');
      if (data.features) filled.push(data.features.length + ' features');
      showFetchStatus($('fetchStatus'),
        '<i class="fas fa-check-circle" style="color:#a855f7"></i> Generated: <strong>' + filled.join(', ') + '</strong>' +
        (data.developers ? ' — by ' + escHtml(data.developers) : ''),
        'success');
      toast('Everything generated! Just add the game pictures and save.');
    } catch(err) {
      showFetchStatus($('fetchStatus'), '<i class="fas fa-exclamation-circle"></i> ' + escHtml(err.message), 'error');
    }

    btn.disabled = false;
    btn.classList.remove('loading');
  });

  // ===========================================================================
  // ===== IMAGE EDITOR ========================================================
  // ===========================================================================
  function renderImageEditor() {
    setImgPreview('imgCoverImg', 'imgCoverEmpty', pageImagesData.cover);
    $('imgCoverUrl').value = pageImagesData.cover;
    setImgPreview('imgLogoImg', 'imgLogoEmpty', pageImagesData.logo);
    $('imgLogoUrl').value = pageImagesData.logo;
    renderScreenshots();
  }

  function setImgPreview(imgId, emptyId, url) {
    var img = $(imgId);
    var empty = $(emptyId);
    if (url) {
      img.src = url;
      img.classList.add('loaded');
      img.onerror = function() { img.classList.remove('loaded'); empty.style.display = 'flex'; };
      empty.style.display = 'none';
    } else {
      img.src = '';
      img.classList.remove('loaded');
      empty.style.display = 'flex';
    }
  }

  function renderScreenshots() {
    var grid = $('imgSsGrid');
    var html = '';
    pageImagesData.screenshots.forEach(function(url, i) {
      html += '<div class="img-ss-item" data-index="' + i + '">' +
        (url ? '<img src="' + escAttr(url) + '" class="img-ss-preview" onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'flex\'">' +
               '<div class="img-ss-empty" style="display:none"><i class="fas fa-image"></i></div>'
             : '<div class="img-ss-empty"><i class="fas fa-image"></i> No image</div>') +
        '<div class="img-ss-controls">' +
          '<input type="text" class="img-ss-url" value="' + escAttr(url) + '" placeholder="Screenshot URL..." data-ss-index="' + i + '">' +
          '<label class="img-ss-upload" title="Upload"><i class="fas fa-upload"></i><input type="file" accept="image/*" style="display:none" data-ss-index="' + i + '"></label>' +
          '<button type="button" class="img-ss-remove" title="Remove" data-ss-index="' + i + '"><i class="fas fa-trash"></i></button>' +
        '</div>' +
      '</div>';
    });
    grid.innerHTML = html || '<p style="color:var(--text3);font-size:0.78rem;padding:8px">No screenshots yet. Click "Add" to add one.</p>';

    grid.querySelectorAll('.img-ss-url').forEach(function(inp) {
      inp.addEventListener('change', function() {
        var idx = parseInt(this.getAttribute('data-ss-index'));
        pageImagesData.screenshots[idx] = this.value.trim();
        renderScreenshots();
      });
    });
    grid.querySelectorAll('.img-ss-upload input').forEach(function(inp) {
      inp.addEventListener('change', function() {
        var idx = parseInt(this.getAttribute('data-ss-index'));
        uploadImageFor(this, function(url) {
          pageImagesData.screenshots[idx] = url;
          renderScreenshots();
        });
      });
    });
    grid.querySelectorAll('.img-ss-remove').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var idx = parseInt(this.getAttribute('data-ss-index'));
        pageImagesData.screenshots.splice(idx, 1);
        renderScreenshots();
      });
    });
  }

  $('imgAddSsBtn').addEventListener('click', function() {
    pageImagesData.screenshots.push('');
    renderScreenshots();
    var inputs = $('imgSsGrid').querySelectorAll('.img-ss-url');
    if (inputs.length) inputs[inputs.length - 1].focus();
  });

  $('imgCoverUrl').addEventListener('input', function() {
    pageImagesData.cover = this.value.trim();
    setImgPreview('imgCoverImg', 'imgCoverEmpty', pageImagesData.cover);
  });

  $('imgLogoUrl').addEventListener('input', function() {
    pageImagesData.logo = this.value.trim();
    setImgPreview('imgLogoImg', 'imgLogoEmpty', pageImagesData.logo);
  });

  function uploadImageFor(fileInput, callback) {
    var file = fileInput.files[0];
    if (!file) return;
    var fd = new FormData();
    fd.append('image', file);
    fetch('/api/admin/upload', { method: 'POST', body: fd, credentials: 'same-origin' })
      .then(function(r) { return r.json(); })
      .then(function(data) {
        if (data.url) { callback(data.url); toast('Image uploaded!'); }
        else { toast('Upload failed', 'error'); }
      })
      .catch(function() { toast('Upload failed', 'error'); });
  }

  // Cover upload
  document.querySelector('#gameEditorView .img-editor-card:first-child .img-upload-input').addEventListener('change', function() {
    var self = this;
    uploadImageFor(self, function(url) {
      $('imgCoverUrl').value = url;
      pageImagesData.cover = url;
      setImgPreview('imgCoverImg', 'imgCoverEmpty', url);
    });
  });

  // Logo upload
  document.querySelector('#gameEditorView .img-editor-card:last-child .img-upload-input').addEventListener('change', function() {
    var self = this;
    uploadImageFor(self, function(url) {
      $('imgLogoUrl').value = url;
      pageImagesData.logo = url;
      setImgPreview('imgLogoImg', 'imgLogoEmpty', url);
    });
  });

  // ===========================================================================
  // ===== FEATURES EDITOR =====================================================
  // ===========================================================================
  function renderFeatures() {
    var container = $('featuresEditor');
    var html = '';
    featuresData.forEach(function(text, i) {
      html += '<div class="feature-edit-item" data-index="' + i + '">' +
        '<div class="feature-icon"><i class="fas fa-check-circle"></i></div>' +
        '<input type="text" value="' + escAttr(text) + '" placeholder="e.g. Full Open World: Explore all locations" data-feat-index="' + i + '">' +
        '<button type="button" class="feature-remove" title="Remove" data-feat-index="' + i + '"><i class="fas fa-times"></i></button>' +
      '</div>';
    });
    container.innerHTML = html || '<p style="color:var(--text3);font-size:0.78rem;padding:4px">No features yet. Click "Add Feature" below.</p>';

    // Bind events
    container.querySelectorAll('input[data-feat-index]').forEach(function(inp) {
      inp.addEventListener('change', function() {
        var idx = parseInt(this.getAttribute('data-feat-index'));
        featuresData[idx] = this.value.trim();
      });
      // Also update on blur so we don't lose partial edits
      inp.addEventListener('blur', function() {
        var idx = parseInt(this.getAttribute('data-feat-index'));
        featuresData[idx] = this.value.trim();
      });
    });
    container.querySelectorAll('.feature-remove').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var idx = parseInt(this.getAttribute('data-feat-index'));
        featuresData.splice(idx, 1);
        renderFeatures();
      });
    });
  }

  $('addFeatureBtn').addEventListener('click', function() {
    featuresData.push('');
    renderFeatures();
    // Focus the new input
    var inputs = $('featuresEditor').querySelectorAll('input[data-feat-index]');
    if (inputs.length) inputs[inputs.length - 1].focus();
  });

  // ===========================================================================
  // ===== SAVE & PUBLISH (Combined) ===========================================
  // ===========================================================================
  $('editorSaveAllBtn').addEventListener('click', async function() {
    var btn = this;
    var slug = $('gameSlug').value.trim();
    var title = $('gameTitle').value.trim();

    if (!slug || !title) { toast('Game name and folder name are required.', 'error'); return; }

    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';

    try {
      // 1. Save game card to database
      var cardPayload = {
        slug: slug,
        title: title,
        image_url: $('gameImageUrl').value.trim(),
        data_game: $('gameDataGame').value.trim(),
        category: $('gameCategory').value.trim(),
        version: $('gameVersion').value.trim(),
        release_date: $('gameReleaseDate').value.trim(),
        rating: parseFloat($('gameRating').value) || 4.0,
        link: $('gameLink').value.trim() || ('/' + slug + '/'),
        sort_order: parseInt($('gameSortOrder').value) || 0,
        visible: $('gameVisible').value === '1'
      };

      var id = $('gameId').value;
      var cardData;
      if (id) {
        cardData = await api('/api/admin/games/' + id, { method: 'PUT', body: JSON.stringify(cardPayload) });
      } else {
        cardData = await api('/api/admin/games', { method: 'POST', body: JSON.stringify(cardPayload) });
      }
      gamesData = cardData.games;

      // 2. Rename game page folder if slug changed
      if (originalSlug && originalSlug !== slug) {
        try {
          await fetch('/api/admin/gamepage/' + encodeURIComponent(originalSlug) + '/rename', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: JSON.stringify({ newSlug: slug })
          });
          originalSlug = slug;
          pageExists = true;
        } catch(e) { /* rename failed, will try to create */ }
      }

      // 3. Create game page folder if it doesn't exist
      if (!pageExists) {
        try {
          await api('/api/admin/gamepages', {
            method: 'POST',
            body: JSON.stringify({
              slug: slug,
              title: title,
              subtitle: window._aiSubtitle || '',
              genre: $('gameCategory').value.trim().split(' ').map(function(w) { return w.charAt(0).toUpperCase() + w.slice(1); }).join(', '),
              description: window._aiDescription || '',
              features: featuresData.filter(function(f) { return f && f.trim(); }),
              pageRating: parseFloat($('editorPageRating').value) || 4.0,
              pageVotes: parseInt($('editorVoteCount').value) || 0
            })
          });
          pageExists = true;
        } catch(e) {
          // Folder may already exist, that's OK
          pageExists = true;
        }
      }

      // 3. Save game page images
      var ssFiltered = pageImagesData.screenshots.filter(function(u) { return u && u.trim(); });
      try {
        await fetch('/api/admin/gamepage/' + encodeURIComponent(slug) + '/images', {
          method: 'PUT',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body: JSON.stringify({
            cover: pageImagesData.cover,
            logo: pageImagesData.logo,
            screenshots: ssFiltered
          })
        });
      } catch(e) { /* page images save failed, non-critical */ }

      // 4. Save features
      var filteredFeatures = featuresData.filter(function(f) { return f && f.trim(); });
      if (filteredFeatures.length > 0) {
        try {
          await fetch('/api/admin/gamepage/' + encodeURIComponent(slug) + '/features', {
            method: 'PUT',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: JSON.stringify({ features: filteredFeatures })
          });
        } catch(e) { /* features save failed, non-critical */ }
      }

      // 5. Save HTML first (so subsequent writes to the file aren't overwritten)
      var htmlContent = $('editorTextarea').value;
      if (htmlContent && htmlContent.trim()) {
        try {
          await api('/api/admin/gamepage/' + encodeURIComponent(slug), {
            method: 'PUT',
            body: JSON.stringify({ content: htmlContent })
          });
        } catch(e) { /* HTML save failed, non-critical */ }
      }

      // 6. Save adblue config (content locker it/key) — writes into HTML file
      var adblueIt = $('editorAdblueIt').value.trim();
      var adblueKey = $('editorAdblueKey').value.trim();
      if (adblueIt || adblueKey) {
        try {
          await fetch('/api/admin/adblue/' + encodeURIComponent(slug), {
            method: 'PUT',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: JSON.stringify({
              variable_name: $('editorAdblueVar').value.trim() || 'PKiWi_Ojz_wYrvyc',
              it_value: parseInt(adblueIt) || 0,
              key_value: adblueKey,
              script_url: $('editorAdblueScript').value.trim() || 'https://da4talg8ap14y.cloudfront.net/5b1c47d.js'
            })
          });
          $('adblueInlineStatus').innerHTML = '<i class="fas fa-check-circle" style="color:#00ffcc"></i> Content locker is configured';
        } catch(e) { /* adblue save failed, non-critical */ }
      }

      // 7. Save votes (rating + vote count) — writes into HTML + JS files AFTER HTML is saved
      try {
        await fetch('/api/admin/gamepage/' + encodeURIComponent(slug) + '/votes', {
          method: 'PUT',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body: JSON.stringify({
            rating: parseFloat($('editorPageRating').value) || 4.0,
            votes: parseInt($('editorVoteCount').value) || 0
          })
        });
      } catch(e) { /* votes save failed, non-critical */ }

      // Update the editing state
      if (!currentEditId) {
        // Find the newly created game in the list
        var newGame = gamesData.find(function(g) { return g.slug === slug; });
        if (newGame) {
          currentEditId = newGame.id;
          $('gameId').value = newGame.id;
        }
      }
      currentEditSlug = slug;
      originalSlug = slug;
      $('editorTitle').textContent = 'Edit: ' + slug;
      $('editorPreviewLink').style.display = '';
      $('editorPreviewLink').href = '/' + slug + '/';

      // Reload the HTML to show the updated version
      try {
        var freshPage = await api('/api/admin/gamepage/' + encodeURIComponent(slug));
        $('editorTextarea').value = freshPage.content;
      } catch(e) {}

      // 8. Auto-generate fake engagement for NEW games
      var isNewGame = !id; // was a new game (no id before save)
      var autoEngage = $('autoEngagementCheck') && $('autoEngagementCheck').checked;
      if (isNewGame && autoEngage) {
        try {
          var engRes = await fetch('/api/admin/games/' + encodeURIComponent(slug) + '/generate-engagement', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: JSON.stringify({
              gameName: title,
              reviewCount: parseInt($('engagementReviewCount').value) || 8,
              commentCount: parseInt($('engagementCommentCount').value) || 6
            })
          });
          if (engRes.ok) {
            var engData = await engRes.json();
            $('engagementStatus').innerHTML = '<i class="fas fa-check-circle" style="color:#00ffcc"></i> Generated ' + engData.reviews_created + ' reviews + ' + engData.comments_created + ' comments' + (engData.ai_used ? ' (AI)' : ' (templates)');
          }
        } catch(e) { /* engagement generation failed, non-critical */ }
      }

      toast('Game saved & published! Everyone can see it now.');
    } catch (err) {
      toast('Save failed: ' + err.message, 'error');
    }

    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-save"></i> Save &amp; Publish';
  });

  // ----- Votes Preview & Randomize -----
  function updateVotesPreview() {
    var rating = parseFloat($('editorPageRating').value) || 0;
    var votes = parseInt($('editorVoteCount').value) || 0;
    var starsHtml = '';
    for (var i = 1; i <= 5; i++) {
      if (i <= Math.floor(rating)) starsHtml += '<i class="fas fa-star" style="color:#ffd700"></i>';
      else if (i === Math.floor(rating) + 1 && (rating - Math.floor(rating)) >= 0.3) starsHtml += '<i class="fas fa-star-half-alt" style="color:#ffd700"></i>';
      else starsHtml += '<i class="far fa-star" style="color:#555"></i>';
    }
    $('votesPreview').innerHTML = starsHtml + ' <b style="color:var(--primary)">' + rating.toFixed(1) + '</b> — <span style="color:var(--text2)">' + votes.toLocaleString() + ' votes</span>';
  }

  $('editorPageRating').addEventListener('input', updateVotesPreview);
  $('editorVoteCount').addEventListener('input', updateVotesPreview);

  $('randomizeVotesBtn').addEventListener('click', function() {
    var rating = (Math.floor(Math.random() * 10) + 36) / 10; // 3.6 - 4.5
    var votes = Math.floor(Math.random() * 15000) + 3000; // 3000 - 18000
    $('editorPageRating').value = rating;
    $('editorVoteCount').value = votes;
    updateVotesPreview();
  });

  // ----- Manual Generate Engagement Button -----
  $('generateEngagementBtn').addEventListener('click', async function() {
    var btn = this;
    var slug = $('gameSlug').value.trim();
    var title = $('gameTitle').value.trim();
    if (!slug) { toast('Save the game first before generating engagement.', 'error'); return; }

    btn.disabled = true;
    btn.querySelector('.fa-robot').style.display = 'none';
    btn.querySelector('.fa-spin').style.display = 'inline-block';
    $('engagementStatus').innerHTML = '<i class="fas fa-spinner fa-spin" style="color:var(--primary)"></i> Generating reviews and comments with AI...';

    try {
      var res = await fetch('/api/admin/games/' + encodeURIComponent(slug) + '/generate-engagement', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({
          gameName: title || slug.replace(/-/g, ' '),
          reviewCount: parseInt($('engagementReviewCount').value) || 8,
          commentCount: parseInt($('engagementCommentCount').value) || 6
        })
      });
      if (res.ok) {
        var data = await res.json();
        $('engagementStatus').innerHTML = '<i class="fas fa-check-circle" style="color:#00ffcc"></i> Generated ' + data.reviews_created + ' reviews + ' + data.comments_created + ' comments' + (data.ai_used ? ' (DeepSeek AI)' : ' (templates)') + ' — Total: ' + data.total_reviews + ' reviews, ' + data.total_comments + ' comments';
        toast('Engagement generated! ' + data.reviews_created + ' reviews + ' + data.comments_created + ' comments');
      } else {
        var err = await res.json();
        $('engagementStatus').innerHTML = '<i class="fas fa-exclamation-triangle" style="color:#ff4444"></i> ' + (err.error || 'Failed to generate');
        toast('Failed to generate engagement', 'error');
      }
    } catch(e) {
      $('engagementStatus').innerHTML = '<i class="fas fa-exclamation-triangle" style="color:#ff4444"></i> Network error';
      toast('Network error generating engagement', 'error');
    }

    btn.disabled = false;
    btn.querySelector('.fa-robot').style.display = '';
    btn.querySelector('.fa-spin').style.display = 'none';
  });

  // ===========================================================================
  // ===== TRASH (Game Cards + Page Folders) ====================================
  // ===========================================================================
  async function loadTrash() {
    try {
      var trashed = await api('/api/admin/games/trash');
      var html = '';
      trashed.forEach(function(g) {
        html += '<tr>' +
          '<td><img src="' + (g.image_url || '') + '" class="game-thumb" onerror="this.src=\'' + thumbFallback + '\'"></td>' +
          '<td><strong>' + escHtml(g.title) + '</strong><br><small style="color:var(--text3)">' + escHtml(g.slug) + '</small></td>' +
          '<td style="font-size:0.82rem;color:var(--text2)">' + formatDate(g.deleted_at) + '</td>' +
          '<td><div class="actions-cell">' +
            '<button class="restore-btn" onclick="restoreGame(' + g.id + ',\'' + escAttr(g.title) + '\')"><i class="fas fa-undo"></i> Restore</button>' +
            '<button class="danger-btn" onclick="permanentDelete(' + g.id + ',\'' + escAttr(g.title) + '\')"><i class="fas fa-fire"></i> Delete Forever</button>' +
          '</div></td>' +
        '</tr>';
      });
      $('trashBody').innerHTML = html || '<tr><td colspan="4" style="text-align:center;color:var(--text2);padding:30px"><i class="fas fa-check-circle" style="color:var(--success);margin-right:8px"></i>No game cards in trash.</td></tr>';
    } catch (e) {}
  }

  async function loadPageTrash() {
    try {
      var res = await fetch('/api/admin/gamepages/trash', { credentials: 'same-origin', headers: { 'Accept': 'application/json' } });
      var data = await res.json();
      var html = '';
      if (Array.isArray(data) && data.length > 0) {
        data.forEach(function(p) {
          html += '<div class="page-trash-card">' +
            '<div class="trash-page-icon"><i class="fas fa-file-code"></i></div>' +
            '<div class="trash-page-info">' +
              '<h4>' + escHtml(p.slug) + '</h4>' +
              '<p>' + p.files.length + ' files: ' + p.files.join(', ') + '</p>' +
            '</div>' +
            '<div class="trash-page-actions">' +
              '<button class="restore-btn" onclick="restorePage(\'' + escAttr(p.slug) + '\')"><i class="fas fa-undo"></i> Restore</button>' +
              '<button class="danger-btn" onclick="permanentDeletePage(\'' + escAttr(p.slug) + '\')"><i class="fas fa-fire"></i> Delete Forever</button>' +
            '</div>' +
          '</div>';
        });
      } else {
        html = '<p style="color:var(--text2);text-align:center;padding:20px"><i class="fas fa-check-circle" style="color:var(--success);margin-right:8px"></i>No page folders in trash.</p>';
      }
      $('pageTrashGrid').innerHTML = html;
    } catch(e) {
      $('pageTrashGrid').innerHTML = '<p style="color:var(--text3);padding:10px">Could not load page trash.</p>';
    }
  }

  window.restoreGame = function(id, title) {
    if (!confirm('Restore "' + title + '" back to your game list?')) return;
    api('/api/admin/games/' + id + '/restore', { method: 'POST' }).then(function(data) {
      gamesData = data.games;
      loadTrash();
      loadTrashCounts();
      toast('"' + title + '" has been restored!');
    });
  };

  window.permanentDelete = function(id, title) {
    if (!confirm('DELETE FOREVER: "' + title + '"?\n\nThis CANNOT be undone!')) return;
    api('/api/admin/games/' + id + '/permanent', { method: 'DELETE' }).then(function() {
      loadTrash();
      loadTrashCounts();
      toast('Permanently deleted.');
    });
  };

  window.restorePage = function(slug) {
    if (!confirm('Restore "' + slug + '" page folder?')) return;
    fetch('/api/admin/gamepages/' + encodeURIComponent(slug) + '/restore', {
      method: 'POST', credentials: 'same-origin', headers: { 'Accept': 'application/json' }
    }).then(function(r) { return r.json(); }).then(function(data) {
      if (data.success) { toast('"' + slug + '" restored!'); loadPageTrash(); loadTrashCounts(); }
      else { toast(data.error || 'Failed', 'error'); }
    }).catch(function() { toast('Restore failed', 'error'); });
  };

  window.permanentDeletePage = function(slug) {
    if (!confirm('DELETE FOREVER: "' + slug + '" page folder?\n\nAll files will be removed permanently!')) return;
    fetch('/api/admin/gamepages/' + encodeURIComponent(slug) + '/permanent', {
      method: 'DELETE', credentials: 'same-origin', headers: { 'Accept': 'application/json' }
    }).then(function(r) { return r.json(); }).then(function(data) {
      if (data.success) { toast('Permanently deleted.'); loadPageTrash(); loadTrashCounts(); }
      else { toast(data.error || 'Failed', 'error'); }
    }).catch(function() { toast('Delete failed', 'error'); });
  };

  // ===========================================================================
  // ===== AD CONFIG (ADBLUE) ==================================================
  // ===========================================================================
  var adblueData = [];

  async function loadAdblue() {
    try {
      // Sync first: ensures every game in the database gets an adblue_config entry
      var syncResult = await api('/api/admin/adblue/sync', { method: 'POST' });
      if (syncResult && syncResult.configs) {
        adblueData = syncResult.configs;
      } else {
        adblueData = await api('/api/admin/adblue');
      }
      renderAdblue();
    } catch (e) {
      try { adblueData = await api('/api/admin/adblue'); renderAdblue(); } catch (e2) {}
    }
  }

  function renderAdblue() {
    var html = '';
    adblueData.forEach(function(a) {
      var isConfigured = a.it_value && a.key_value;
      var statusBadge = isConfigured
        ? '<span style="display:inline-block;padding:2px 8px;border-radius:8px;font-size:0.7rem;font-weight:600;background:rgba(0,255,204,0.15);color:#00ffcc;margin-left:8px">ACTIVE</span>'
        : '<span style="display:inline-block;padding:2px 8px;border-radius:8px;font-size:0.7rem;font-weight:600;background:rgba(255,165,0,0.15);color:#ffa500;margin-left:8px">NOT SET</span>';
      html += '<div class="adblue-card" style="' + (!isConfigured ? 'border-color:rgba(255,165,0,0.3)' : '') + '">' +
        '<div class="adblue-card-header">' +
          '<h4><i class="fas fa-gamepad" style="color:var(--primary);margin-right:8px"></i>' + escHtml(a.game_slug) + statusBadge + '</h4>' +
          '<button class="edit-btn" onclick="editAdblue(\'' + escAttr(a.game_slug) + '\')"><i class="fas fa-edit"></i> ' + (isConfigured ? 'Edit' : 'Set Up') + '</button>' +
        '</div>' +
        '<div class="adblue-field"><label>Variable</label><div class="val">' + escHtml(a.variable_name) + '</div></div>' +
        '<div class="adblue-field"><label>IT (Offer ID)</label><div class="val">' + (a.it_value || '<span style="color:#666">—</span>') + '</div></div>' +
        '<div class="adblue-field"><label>Key</label><div class="val">' + (a.key_value ? escHtml(a.key_value) : '<span style="color:#666">—</span>') + '</div></div>' +
        '<div class="adblue-field"><label>Script URL</label><div class="val" style="font-size:0.75rem">' + escHtml(a.script_url) + '</div></div>' +
      '</div>';
    });
    $('adblueCards').innerHTML = html || '<p style="color:var(--text2)">No games found. Add games first.</p>';
  }

  window.editAdblue = function(slug) {
    var item = adblueData.find(function(a) { return a.game_slug === slug; });
    if (!item) return;
    $('adblueModalTitle').textContent = 'Edit Ad Config: ' + slug;
    $('adblueGameSlug').value = slug;
    $('adblueSlugDisplay').value = slug;
    $('adblueVarName').value = item.variable_name;
    $('adblueItValue').value = item.it_value;
    $('adblueKeyValue').value = item.key_value;
    $('adblueScriptUrl').value = item.script_url;
    $('adblueModal').classList.add('active');
  };
  window.closeAdblueModal = function() { $('adblueModal').classList.remove('active'); };

  $('adblueForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    var slug = $('adblueGameSlug').value;
    var payload = {
      variable_name: $('adblueVarName').value.trim(),
      it_value: parseInt($('adblueItValue').value),
      key_value: $('adblueKeyValue').value.trim(),
      script_url: $('adblueScriptUrl').value.trim()
    };
    try {
      var data = await api('/api/admin/adblue/' + encodeURIComponent(slug), { method: 'PUT', body: JSON.stringify(payload) });
      adblueData = data.configs;
      renderAdblue();
      closeAdblueModal();
      toast('Ad config saved!');
    } catch (e) {}
  });

  // ===========================================================================
  // ===== USERS ===============================================================
  // ===========================================================================
  async function loadUsers() {
    try {
      var users = await api('/api/admin/users');
      $('usersCount').textContent = users.length;

      // Stats
      var fakeCount = users.filter(function(u) { return u.email && u.email.endsWith('@modxnet.fake'); }).length;
      var realCount = users.length - fakeCount;
      var googleCount = users.filter(function(u) { return u.avatar_url && u.avatar_url.includes('googleusercontent.com'); }).length;
      $('usersStats').innerHTML =
        '<div style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:12px;font-size:0.82rem;color:var(--text2)">' +
          '<span><i class="fas fa-users" style="color:var(--primary);margin-right:4px"></i> <b>' + realCount + '</b> real users</span>' +
          '<span><i class="fas fa-robot" style="color:#888;margin-right:4px"></i> <b>' + fakeCount + '</b> system users</span>' +
          '<span><i class="fab fa-google" style="color:#4285f4;margin-right:4px"></i> <b>' + googleCount + '</b> Google accounts</span>' +
        '</div>';

      var html = '';
      users.forEach(function(u) {
        var isFake = u.email && u.email.endsWith('@modxnet.fake');
        var isGoogle = u.avatar_url && u.avatar_url.includes('googleusercontent.com');
        var avatar = u.avatar_url
          ? '<img src="' + u.avatar_url + '" class="user-avatar" referrerpolicy="no-referrer" style="width:32px;height:32px;border-radius:50%;object-fit:cover">'
          : '<div style="width:32px;height:32px;border-radius:50%;background:linear-gradient(135deg,#00ffcc,#00d4aa);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:14px;color:#0a0a0a">' + (u.username || 'U').charAt(0).toUpperCase() + '</div>';
        var typeBadge = isFake
          ? '<span style="display:inline-block;padding:1px 6px;border-radius:6px;font-size:0.68rem;background:rgba(136,136,136,0.15);color:#888">System</span>'
          : isGoogle
            ? '<span style="display:inline-block;padding:1px 6px;border-radius:6px;font-size:0.68rem;background:rgba(66,133,244,0.15);color:#4285f4">Google</span>'
            : '<span style="display:inline-block;padding:1px 6px;border-radius:6px;font-size:0.68rem;background:rgba(0,255,204,0.15);color:#00ffcc">Email</span>';
        html += '<tr>' +
          '<td>' + avatar + '</td>' +
          '<td><strong>' + escHtml(u.username) + '</strong></td>' +
          '<td style="font-size:0.82rem;color:var(--text2)">' + escHtml(u.email) + '</td>' +
          '<td>' + typeBadge + '</td>' +
          '<td style="font-size:0.78rem;color:var(--text3)">' + formatDate(u.created_at) + '</td>' +
          '<td style="white-space:nowrap">' +
            '<button class="edit-btn" onclick="editUser(' + u.id + ',\'' + escAttr(u.username) + '\',\'' + escAttr(u.email) + '\',\'' + escAttr(u.avatar_url || '') + '\')" style="margin-right:4px"><i class="fas fa-edit"></i></button>' +
            '<button class="danger-btn" onclick="removeUser(' + u.id + ',\'' + escAttr(u.username) + '\')"><i class="fas fa-trash"></i></button>' +
          '</td>' +
        '</tr>';
      });
      $('usersBody').innerHTML = html || '<tr><td colspan="6" style="text-align:center;color:var(--text2);padding:30px">No users yet</td></tr>';
    } catch (e) {}
  }

  // Edit user
  window.editUser = function(id, username, email, avatarUrl) {
    $('userEditId').value = id;
    $('userEditUsername').value = username;
    $('userEditEmail').value = email;
    $('userEditAvatar').value = avatarUrl;
    $('userEditAvatarPreview').src = avatarUrl || '';
    $('userEditAvatarPreview').style.display = avatarUrl ? '' : 'none';
    $('userEditTitle').textContent = 'Edit User: ' + username;
    $('userEditModal').classList.add('active');
  };
  window.closeUserEditModal = function() { $('userEditModal').classList.remove('active'); };

  // Update avatar preview when URL changes
  $('userEditAvatar').addEventListener('input', function() {
    var url = this.value.trim();
    $('userEditAvatarPreview').src = url;
    $('userEditAvatarPreview').style.display = url ? '' : 'none';
  });

  // Save user edit
  $('userEditForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    var id = $('userEditId').value;
    try {
      await api('/api/admin/users/' + id, {
        method: 'PUT',
        body: JSON.stringify({
          username: $('userEditUsername').value.trim(),
          email: $('userEditEmail').value.trim(),
          avatar_url: $('userEditAvatar').value.trim()
        })
      });
      closeUserEditModal();
      toast('User updated!');
      loadUsers();
    } catch(e) { toast('Failed to update user', 'error'); }
  });

  window.removeUser = function(id, name) {
    if (!confirm('Delete user "' + name + '"?\nAll their reviews and comments will also be removed.')) return;
    api('/api/admin/users/' + id, { method: 'DELETE' }).then(function() { toast('User removed'); loadUsers(); });
  };

  // Download users data as CSV
  $('downloadUsersBtn').addEventListener('click', async function() {
    try {
      var users = await api('/api/admin/users');
      if (!users || users.length === 0) { toast('No users to download', 'error'); return; }

      var csv = 'Username,Email,Avatar URL,Joined\n';
      users.forEach(function(u) {
        var username = '"' + (u.username || '').replace(/"/g, '""') + '"';
        var email = '"' + (u.email || '').replace(/"/g, '""') + '"';
        var avatar = '"' + (u.avatar_url || '').replace(/"/g, '""') + '"';
        var joined = '"' + (u.created_at || '') + '"';
        csv += username + ',' + email + ',' + avatar + ',' + joined + '\n';
      });

      var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      var link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = 'modxnet-users-' + new Date().toISOString().slice(0, 10) + '.csv';
      link.click();
      URL.revokeObjectURL(link.href);
      toast('Downloaded ' + users.length + ' users');
    } catch(e) { toast('Failed to download users', 'error'); }
  });

  // ===========================================================================
  // ===== REVIEWS =============================================================
  // ===========================================================================
  async function loadReviews() {
    try {
      var reviews = await api('/api/admin/reviews');
      $('reviewsCount').textContent = reviews.length;
      var html = '';
      reviews.forEach(function(r) {
        html += '<tr>' +
          '<td><strong>' + escHtml(r.username) + '</strong></td>' +
          '<td style="font-size:0.82rem">' + escHtml(r.game_slug) + '</td>' +
          '<td>' + starsHtml(r.rating) + '</td>' +
          '<td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="' + escAttr(r.text) + '">' + escHtml(r.text) + '</td>' +
          '<td class="sentiment-' + r.sentiment + '">' + r.sentiment + '</td>' +
          '<td style="font-size:0.78rem;color:var(--text3)">' + formatDate(r.created_at) + '</td>' +
          '<td><button class="danger-btn" onclick="removeReview(' + r.id + ')"><i class="fas fa-trash"></i></button></td>' +
        '</tr>';
      });
      $('reviewsBody').innerHTML = html || '<tr><td colspan="7" style="text-align:center;color:var(--text2);padding:30px">No reviews yet</td></tr>';
    } catch (e) {}
  }

  window.removeReview = function(id) {
    if (!confirm('Delete this review?')) return;
    api('/api/admin/reviews/' + id, { method: 'DELETE' }).then(function() { toast('Review removed'); loadReviews(); });
  };

  // ===========================================================================
  // ===== COMMENTS ============================================================
  // ===========================================================================
  async function loadComments() {
    try {
      var comments = await api('/api/admin/comments');
      $('commentsCount').textContent = comments.length;
      var html = '';
      comments.forEach(function(c) {
        html += '<tr>' +
          '<td><strong>' + escHtml(c.username) + '</strong></td>' +
          '<td style="font-size:0.82rem">' + escHtml(c.game_slug) + '</td>' +
          '<td style="max-width:250px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="' + escAttr(c.text) + '">' + escHtml(c.text) + '</td>' +
          '<td class="sentiment-' + c.sentiment + '">' + c.sentiment + '</td>' +
          '<td style="font-size:0.78rem;color:var(--text3)">' + formatDate(c.created_at) + '</td>' +
          '<td><button class="danger-btn" onclick="removeComment(' + c.id + ')"><i class="fas fa-trash"></i></button></td>' +
        '</tr>';
      });
      $('commentsBody').innerHTML = html || '<tr><td colspan="6" style="text-align:center;color:var(--text2);padding:30px">No comments yet</td></tr>';
    } catch (e) {}
  }

  window.removeComment = function(id) {
    if (!confirm('Delete this comment?')) return;
    api('/api/admin/comments/' + id, { method: 'DELETE' }).then(function() { toast('Comment removed'); loadComments(); });
  };

  // ===== INIT =====
  checkAdmin();
})();
