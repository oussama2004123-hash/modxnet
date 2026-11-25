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
  var tabTitles = { dashboard:'Home', games:'Games', trash:'Trash', adblue:'Ad Config', users:'Users', reviews:'Reviews', messages:'Messages' };

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
    else if (tab === 'messages') loadMessages();
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
        '<div class="stat-card"><div class="stat-icon reviews"><i class="fas fa-star"></i></div><div class="stat-info"><h4>' + s.reviews + '</h4><p>Reviews</p></div></div>';
    } catch (e) {}
    refreshEmailBroadcastUi();
  }

  function renderEmailBroadcastStatus(targetEl, s) {
    if (!targetEl) return;
    if (!s || s.state === 'idle') {
      targetEl.innerHTML = '<span style="color:var(--text3)">No broadcast has run on this server process yet.</span>';
      return;
    }
    if (s.state === 'running' || s.running) {
      targetEl.innerHTML =
        '<strong style="color:var(--primary)">Running</strong> — ' + (s.recipientCount || 0) + ' recipients. Sent: <strong>' + (s.sent || 0) + '</strong>, failed so far: ' + (s.failed || 0) + '.';
      return;
    }
    if (s.state === 'completed') {
      var tail = '';
      if (s.failures && s.failures.length) {
        tail = '<br><span style="font-size:0.78rem;color:#f66">Sample errors: ' + s.failures.slice(0, 3).map(function(f) {
          return escHtml(String(f.email || '') + ': ' + String(f.error || ''));
        }).join(' · ') + '</span>';
      }
      var when = '';
      if (s.finishedAt) {
        try {
          when = formatDate(s.finishedAt) + ' ' + new Date(s.finishedAt).toLocaleTimeString();
        } catch (e2) { when = s.finishedAt; }
      }
      targetEl.innerHTML =
        '<strong>Completed</strong>' + (when ? ' — ' + escHtml(when) : '') +
        '<br>Sent: <strong>' + (s.sent || 0) + '</strong>, failed: <strong>' + (s.failed || 0) + '</strong>.' + tail;
      return;
    }
    if (s.state === 'error') {
      targetEl.innerHTML = '<strong style="color:#f66">Error</strong> — ' + escHtml(s.error || 'Unknown');
      return;
    }
    targetEl.textContent = JSON.stringify(s);
  }

  async function refreshEmailBroadcastUi() {
    try {
      var r = await fetch('/api/admin/email/broadcast-status', { credentials: 'same-origin', headers: { 'Accept': 'application/json' } });
      var s = await r.json();
      if (!r.ok) throw new Error(s.error || 'Status failed');
      renderEmailBroadcastStatus($('dashboardEmailBroadcastStatus'), s);
      renderEmailBroadcastStatus($('comebackBroadcastStatusLine'), s);
    } catch (e) {
      var msg = '<span style="color:#f66">' + escHtml(e.message || 'Could not load status') + '</span>';
      var d = $('dashboardEmailBroadcastStatus');
      var c = $('comebackBroadcastStatusLine');
      if (d) d.innerHTML = msg;
      if (c) c.innerHTML = msg;
    }
  }

  var refreshBroadcastBtn = $('refreshEmailBroadcastStatusBtn');
  if (refreshBroadcastBtn) {
    refreshBroadcastBtn.addEventListener('click', function() { refreshEmailBroadcastUi(); });
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
        $('gameSeoTitle').value = g.seo_title || '';
        $('gameSeoDescription').value = g.seo_description || '';
        $('gameSeoKeywords').value = g.seo_keywords || '';
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
          $('editorAdblueAndroid').value = (adConfig && adConfig.android_url) || '';
          $('editorAdblueIos').value = (adConfig && adConfig.ios_url) || '';
          $('adblueInlineStatus').innerHTML = adConfig && (adConfig.android_url || adConfig.ios_url)
            ? '<i class="fas fa-check-circle" style="color:#00ffcc"></i> Download link set'
            : '<i class="fas fa-exclamation-triangle" style="color:#ffa500"></i> No download link yet: visitors who complete an offer will be told to contact support';
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

      // Load engagement status (review count)
      try {
        var revRes = await fetch('/api/reviews/' + encodeURIComponent(slug), {
          credentials: 'same-origin', headers: { 'Accept': 'application/json' }
        });
        var revCount = 0;
        if (revRes.ok) { var r = await revRes.json(); revCount = r.length; }
        if (revCount > 0) {
          $('engagementStatus').innerHTML = '<i class="fas fa-check-circle" style="color:#00ffcc"></i> This game has ' + revCount + ' reviews';
        } else {
          $('engagementStatus').innerHTML = '<i class="fas fa-info-circle" style="color:var(--text3)"></i> No reviews yet — click Generate to add some';
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
      $('gameSeoTitle').value = '';
      $('gameSeoDescription').value = '';
      $('gameSeoKeywords').value = '';
      $('editorTextarea').value = '';
      $('editorFiles').innerHTML = '<span class="editor-file-tag" style="color:var(--text3)"><i class="fas fa-info-circle"></i> Game page will be created automatically on save.</span>';
      $('htmlEditorSection').style.display = '';
      featuresData = [];
      // Reset download link fields for new game
      $('editorAdblueAndroid').value = '';
      $('editorAdblueIos').value = '';
      $('adblueInlineStatus').innerHTML = '<i class="fas fa-info-circle" style="color:var(--text3)"></i> Add the download links the visitor gets after completing an offer';
      // Reset votes with random values
      var randRating = (Math.floor(Math.random() * 10) + 36) / 10; // 3.6 - 4.5
      var randVotes = Math.floor(Math.random() * 15000) + 3000; // 3000 - 18000
      $('editorPageRating').value = randRating;
      $('editorVoteCount').value = randVotes;
      updateVotesPreview();
      // Reset engagement
      $('engagementReviewCount').value = 8;
      $('engagementStatus').innerHTML = '<i class="fas fa-info-circle" style="color:var(--text3)"></i> Reviews will be auto-generated when you save';
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
      if (data.seo_title && $('gameSeoTitle')) $('gameSeoTitle').value = data.seo_title;
      if (data.seo_description && $('gameSeoDescription')) $('gameSeoDescription').value = data.seo_description;
      if (data.seo_keywords && $('gameSeoKeywords')) $('gameSeoKeywords').value = data.seo_keywords;

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
        visible: $('gameVisible').value === '1',
        seo_title: $('gameSeoTitle') ? $('gameSeoTitle').value.trim() : '',
        seo_description: $('gameSeoDescription') ? $('gameSeoDescription').value.trim() : '',
        seo_keywords: $('gameSeoKeywords') ? $('gameSeoKeywords').value.trim() : ''
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

      // 4. Save full HTML from editor FIRST. The textarea still has old cover/logo/screenshot
      //    URLs until the next step — if we saved images before this, this PUT would overwrite
      //    the file and undo cover/logo/screenshots. Patch images & features after.
      var htmlContent = $('editorTextarea').value;
      if (htmlContent && htmlContent.trim()) {
        try {
          await api('/api/admin/gamepage/' + encodeURIComponent(slug), {
            method: 'PUT',
            body: JSON.stringify({ content: htmlContent })
          });
        } catch(e) { /* HTML save failed, non-critical */ }
      }

      // 5. Patch game page images (cover, logo, screenshots) onto the saved HTML
      var ssFiltered = pageImagesData.screenshots.filter(function(u) { return u && u.trim(); });
      try {
        var imgRes = await fetch('/api/admin/gamepage/' + encodeURIComponent(slug) + '/images', {
          method: 'PUT',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body: JSON.stringify({
            cover: pageImagesData.cover,
            logo: pageImagesData.logo,
            screenshots: ssFiltered
          })
        });
        if (!imgRes.ok) {
          var errTxt = await imgRes.text();
          console.warn('game page images save:', imgRes.status, errTxt);
        }
      } catch(e) { console.warn('game page images save failed', e); }

      // 6. Save features
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

      // 7. Save download links (revealed after an AdBlueMedia offer is completed)
      try {
        var dlRes = await fetch('/api/admin/adblue/' + encodeURIComponent(slug), {
          method: 'PUT',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body: JSON.stringify({
            android_url: $('editorAdblueAndroid').value.trim(),
            ios_url: $('editorAdblueIos').value.trim()
          })
        });
        var dlData = await dlRes.json().catch(function() { return {}; });
        if (!dlRes.ok) {
          $('adblueInlineStatus').innerHTML = '<i class="fas fa-exclamation-triangle" style="color:#ff6b6b"></i> ' + escHtml(dlData.error || 'Download links not saved');
        } else {
          $('adblueInlineStatus').innerHTML = ($('editorAdblueAndroid').value.trim() || $('editorAdblueIos').value.trim())
            ? '<i class="fas fa-check-circle" style="color:#00ffcc"></i> Download link set'
            : '<i class="fas fa-exclamation-triangle" style="color:#ffa500"></i> No download link yet';
        }
      } catch(e) { /* download link save failed, non-critical */ }

      // 8. Save votes (rating + vote count) — writes into HTML + JS files last
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

      // 9. Auto-generate fake engagement for NEW games
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
              commentCount: 0
            })
          });
          if (engRes.ok) {
            var engData = await engRes.json();
            $('engagementStatus').innerHTML = '<i class="fas fa-check-circle" style="color:#00ffcc"></i> Generated ' + engData.reviews_created + ' reviews' + (engData.ai_used ? ' (AI)' : ' (templates)');
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
    $('engagementStatus').innerHTML = '<i class="fas fa-spinner fa-spin" style="color:var(--primary)"></i> Generating reviews with AI...';

    try {
      var res = await fetch('/api/admin/games/' + encodeURIComponent(slug) + '/generate-engagement', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({
          gameName: title || slug.replace(/-/g, ' '),
          reviewCount: parseInt($('engagementReviewCount').value) || 8,
          commentCount: 0
        })
      });
      if (res.ok) {
        var data = await res.json();
        $('engagementStatus').innerHTML = '<i class="fas fa-check-circle" style="color:#00ffcc"></i> Generated ' + data.reviews_created + ' reviews' + (data.ai_used ? ' (DeepSeek AI)' : ' (templates)') + ' — Total: ' + data.total_reviews + ' reviews';
        toast('Reviews generated! ' + data.reviews_created + ' reviews');
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

  // ----- Popup text editor (global + per game) -----
  var POPUP_FIELDS = [
    { group: 'Header' },
    { key: 'brand_name', label: 'Brand name (top)' },
    { key: 'brand_logo', label: 'Brand logo (top)', image: true, hint: 'Upload an image or paste a URL. Type - to hide the logo.' },
    { key: 'badge_text', label: 'Badge (top right)' },
    { key: 'title', label: 'Title in banner' },
    { key: 'subtitle', label: 'Line under the title' },
    { key: 'banner_image', label: 'Banner image', image: true, hint: 'Empty = the game page cover' },
    { key: 'game_logo', label: 'Game logo', image: true, hint: 'Empty = the game page logo' },
    { group: 'Before the offers' },
    { key: 'note', label: 'Note box', area: true },
    { key: 'download_button', label: 'Download button' },
    { key: 'loading_button', label: 'Button while loading' },
    { group: 'Offers' },
    { key: 'step1', label: 'Step 1' },
    { key: 'step2', label: 'Step 2', area: true },
    { key: 'step3', label: 'Step 3' },
    { key: 'loading_offers', label: 'Loading offers' },
    { key: 'verify_text', label: 'Checking row under the offers' },
    { key: 'after_click', label: 'Message after tapping an offer', area: true },
    { key: 'no_offers', label: 'When no offers are available', area: true },
    { key: 'retry_button', label: 'Retry button' },
    { group: 'After the offer is completed' },
    { key: 'done_note', label: 'Note box when completed', area: true },
    { key: 'download_starting', label: 'Download starting message', area: true },
    { key: 'starting_button', label: 'Button while starting download' },
    { key: 'link_missing', label: 'When the game has no download link', area: true },
    { key: 'not_available', label: 'When the chosen platform has no link', area: true },
    { key: 'other_platform', label: 'Link to the other platform' }
  ];
  var popupDefaults = {};
  var popupGlobal = {};

  function renderPopupFields(containerId, prefix, values, placeholders) {
    var html = '';
    POPUP_FIELDS.forEach(function(f) {
      if (f.group) { html += '<h5 style="margin:16px 0 8px;font-size:0.82rem;color:var(--primary);text-transform:uppercase;letter-spacing:.04em">' + escHtml(f.group) + '</h5>'; return; }
      var val = escAttr(values[f.key] || '');
      var ph = escAttr(placeholders[f.key] || '');
      var input;
      if (f.area) {
        input = '<textarea id="' + prefix + f.key + '" rows="2" placeholder="' + ph + '">' + escHtml(values[f.key] || '') + '</textarea>';
      } else if (f.image) {
        // URL box + preview + upload button (uses the existing /api/admin/upload)
        input = '<div style="display:flex;gap:8px;align-items:center">' +
          '<img id="' + prefix + f.key + '_preview" alt="" style="width:40px;height:40px;flex:none;border-radius:8px;object-fit:cover;background:var(--bg);border:1px solid var(--border2)">' +
          '<input type="text" id="' + prefix + f.key + '" value="' + val + '" placeholder="' + ph + '" style="flex:1" data-popup-image="1">' +
          '<button type="button" class="edit-btn" data-popup-upload="' + prefix + f.key + '"><i class="fas fa-upload"></i> Upload</button>' +
          '<input type="file" accept="image/*" id="' + prefix + f.key + '_file" style="display:none">' +
        '</div>';
      } else {
        input = '<input type="text" id="' + prefix + f.key + '" value="' + val + '" placeholder="' + ph + '">';
      }
      html += '<div class="form-group"><label>' + escHtml(f.label) + '</label>' + input +
        (f.hint ? '<small class="form-hint">' + escHtml(f.hint) + '</small>' : '') + '</div>';
    });
    $(containerId).innerHTML = html;
    wirePopupImageFields(containerId);
  }

  /** Preview + upload for the image boxes in the popup text editor */
  function wirePopupImageFields(containerId) {
    var box = $(containerId);
    function refresh(inp) {
      var img = $(inp.id + '_preview');
      var src = (inp.value.trim() || inp.placeholder || '').trim();
      if (src && src !== '-') { img.src = src; img.style.visibility = 'visible'; }
      else { img.removeAttribute('src'); img.style.visibility = 'hidden'; }
    }
    box.querySelectorAll('input[data-popup-image]').forEach(function(inp) {
      refresh(inp);
      inp.addEventListener('input', function() { refresh(inp); });
    });
    box.querySelectorAll('button[data-popup-upload]').forEach(function(btn) {
      var id = btn.getAttribute('data-popup-upload');
      var fileInput = $(id + '_file');
      btn.addEventListener('click', function() { fileInput.click(); });
      fileInput.addEventListener('change', async function() {
        var file = fileInput.files && fileInput.files[0];
        if (!file) return;
        var fd = new FormData();
        fd.append('image', file);
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Uploading';
        try {
          var r = await fetch('/api/admin/upload', { method: 'POST', body: fd, credentials: 'same-origin' });
          var d = await r.json();
          if (!r.ok || !d.url) throw new Error(d.error || 'Upload failed');
          $(id).value = d.url;
          refresh($(id));
          toast('Image uploaded. Click Save to use it.');
        } catch (e) {
          toast(e.message || 'Upload failed', 'error');
        } finally {
          btn.disabled = false;
          btn.innerHTML = '<i class="fas fa-upload"></i> Upload';
          fileInput.value = '';
        }
      });
    });
  }

  function collectPopupFields(prefix) {
    var out = {};
    POPUP_FIELDS.forEach(function(f) {
      if (!f.key) return;
      var v = ($(prefix + f.key).value || '').trim();
      if (v) out[f.key] = v;
    });
    return out;
  }

  $('popupTextsForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    try {
      var s = await api('/api/admin/adblue/settings', { method: 'PUT', body: JSON.stringify({ popup_texts: collectPopupFields('pt_') }) });
      popupGlobal = s.popup_texts || {};
      renderPopupFields('popupTextsFields', 'pt_', popupGlobal, popupDefaults);
      toast('Popup text saved! It is live on every game page.');
    } catch (e) {}
  });

  $('popupTextsReset').addEventListener('click', async function() {
    if (!confirm('Reset all popup text to the defaults? Per-game custom text is kept.')) return;
    try {
      var s = await api('/api/admin/adblue/settings', { method: 'PUT', body: JSON.stringify({ popup_texts: {} }) });
      popupGlobal = s.popup_texts || {};
      renderPopupFields('popupTextsFields', 'pt_', popupGlobal, popupDefaults);
      toast('Popup text reset to defaults');
    } catch (e) {}
  });

  function parseJsonSafe(s) { try { return JSON.parse(s || '{}') || {}; } catch (e) { return {}; } }

  async function loadOfferSettings() {
    try {
      var s = await api('/api/admin/adblue/settings');
      $('offerUserId').value = s.user_id || '';
      $('offerApiKey').value = s.api_key || '';
      $('offerFeedUrl').value = s.feed_url || '';
      $('offerCount').value = s.offer_count || 3;
      $('offerPostbackUrl').value = s.postback_url || '';
      popupDefaults = s.popup_defaults || {};
      popupGlobal = s.popup_texts || {};
      renderPopupFields('popupTextsFields', 'pt_', popupGlobal, popupDefaults);
      var st = s.stats || {};
      $('offerStats').textContent = 'Last 30 days: ' + (st.sessions || 0) + ' visitors opened offers, ' +
        (st.completed || 0) + ' completed, $' + Number(st.payout || 0).toFixed(2) + ' reported by postbacks';
    } catch (e) {}
  }

  $('offerSettingsForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    try {
      var s = await api('/api/admin/adblue/settings', { method: 'PUT', body: JSON.stringify({
        user_id: $('offerUserId').value.trim(),
        api_key: $('offerApiKey').value.trim(),
        feed_url: $('offerFeedUrl').value.trim(),
        offer_count: parseInt($('offerCount').value) || 3
      }) });
      $('offerPostbackUrl').value = s.postback_url || '';
      toast('Offer settings saved!');
    } catch (e) {}
  });

  $('offerTestFeed').addEventListener('click', async function() {
    $('offerTestResult').textContent = 'Fetching offers for your IP and browser...';
    try {
      var r = await fetch('/api/admin/adblue/test-feed', { credentials: 'same-origin', headers: { 'Accept': 'application/json' } });
      var d = await r.json();
      if (!d.success) { $('offerTestResult').innerHTML = '<span style="color:#ff6b6b">Feed error: ' + escHtml(d.error || 'unknown') + '</span>'; return; }
      $('offerTestResult').innerHTML = '<span style="color:#00ffcc">' + d.count + ' offers returned.</span> ' +
        d.offers.slice(0, 5).map(function(o) { return escHtml(o.name) + ' ($' + escHtml(String(o.payout || '?')) + ')'; }).join(' &middot; ');
    } catch (e) { $('offerTestResult').textContent = 'Request failed'; }
  });

  $('offerNewSecret').addEventListener('click', async function() {
    if (!confirm('Create a new postback secret? The old postback URL stops working, so you must paste the new one into AdBlueMedia.')) return;
    try {
      var s = await api('/api/admin/adblue/settings', { method: 'PUT', body: JSON.stringify({ regenerate_secret: true }) });
      $('offerPostbackUrl').value = s.postback_url || '';
      toast('New postback secret created. Update it in AdBlueMedia.');
    } catch (e) {}
  });

  $('offerCopyPostback').addEventListener('click', function() {
    var v = $('offerPostbackUrl').value;
    if (!v) return;
    (navigator.clipboard ? navigator.clipboard.writeText(v) : Promise.reject()).then(function() { toast('Postback URL copied'); }, function() {
      $('offerPostbackUrl').select(); document.execCommand('copy'); toast('Postback URL copied');
    });
  });

  async function loadAdblue() {
    loadOfferSettings();
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
      var isConfigured = a.android_url || a.ios_url;
      var customCount = Object.keys(parseJsonSafe(a.popup_texts)).length;
      var statusBadge = isConfigured
        ? '<span style="display:inline-block;padding:2px 8px;border-radius:8px;font-size:0.7rem;font-weight:600;background:rgba(0,255,204,0.15);color:#00ffcc;margin-left:8px">ACTIVE</span>'
        : '<span style="display:inline-block;padding:2px 8px;border-radius:8px;font-size:0.7rem;font-weight:600;background:rgba(255,165,0,0.15);color:#ffa500;margin-left:8px">NOT SET</span>';
      html += '<div class="adblue-card" style="' + (!isConfigured ? 'border-color:rgba(255,165,0,0.3)' : '') + '">' +
        '<div class="adblue-card-header">' +
          '<h4><i class="fas fa-gamepad" style="color:var(--primary);margin-right:8px"></i>' + escHtml(a.game_slug) + statusBadge + '</h4>' +
          '<button class="edit-btn" onclick="editAdblue(\'' + escAttr(a.game_slug) + '\')"><i class="fas fa-edit"></i> ' + (isConfigured ? 'Edit' : 'Set Up') + '</button>' +
        '</div>' +
        '<div class="adblue-field"><label><i class="fab fa-android"></i> Android</label><div class="val" style="font-size:0.75rem;word-break:break-all">' + (a.android_url ? escHtml(a.android_url) : '<span style="color:#666">—</span>') + '</div></div>' +
        (customCount ? '<div class="adblue-field"><label><i class="fas fa-font"></i> Popup text</label><div class="val" style="font-size:0.75rem">' + customCount + ' custom text' + (customCount > 1 ? 's' : '') + ' for this game</div></div>' : '') +
        '<div class="adblue-field"><label><i class="fab fa-apple"></i> iOS</label><div class="val" style="font-size:0.75rem;word-break:break-all">' + (a.ios_url ? escHtml(a.ios_url) : '<span style="color:#666">—</span>') + '</div></div>' +
      '</div>';
    });
    $('adblueCards').innerHTML = html || '<p style="color:var(--text2)">No games found. Add games first.</p>';
  }

  window.editAdblue = function(slug) {
    var item = adblueData.find(function(a) { return a.game_slug === slug; });
    if (!item) return;
    $('adblueModalTitle').textContent = 'Download Links: ' + slug;
    $('adblueGameSlug').value = slug;
    $('adblueSlugDisplay').value = slug;
    $('adblueAndroidUrl').value = item.android_url || '';
    $('adblueIosUrl').value = item.ios_url || '';
    var gameTexts = parseJsonSafe(item.popup_texts);
    renderPopupFields('adbluePopupFields', 'ptg_', gameTexts, Object.assign({}, popupDefaults, popupGlobal));
    $('adbluePopupDetails').open = Object.keys(gameTexts).length > 0;
    $('adbluePreviewLink').href = '/' + encodeURIComponent(slug) + '/';
    $('adblueModal').classList.add('active');
  };
  window.closeAdblueModal = function() { $('adblueModal').classList.remove('active'); };

  $('adblueForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    var slug = $('adblueGameSlug').value;
    var payload = {
      android_url: $('adblueAndroidUrl').value.trim(),
      ios_url: $('adblueIosUrl').value.trim(),
      popup_texts: collectPopupFields('ptg_')
    };
    try {
      var data = await api('/api/admin/adblue/' + encodeURIComponent(slug), { method: 'PUT', body: JSON.stringify(payload) });
      adblueData = data.configs;
      renderAdblue();
      closeAdblueModal();
      toast('Game popup settings saved!');
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
      var fakeCount = users.filter(function(u) { return u.email && u.email.toLowerCase().endsWith('@modxnet.fake'); }).length;
      var realCount = users.length - fakeCount;
      var googleLinked = users.filter(function(u) { return u.google_id && String(u.google_id).trim(); }).length;
      $('usersStats').innerHTML =
        '<div style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:12px;font-size:0.82rem;color:var(--text2)">' +
          '<span><i class="fas fa-users" style="color:var(--primary);margin-right:4px"></i> <b>' + realCount + '</b> accounts (excl. fake)</span>' +
          '<span><i class="fas fa-robot" style="color:#888;margin-right:4px"></i> <b>' + fakeCount + '</b> @modxnet.fake</span>' +
          '<span><i class="fab fa-google" style="color:#4285f4;margin-right:4px"></i> <b>' + googleLinked + '</b> Google-linked</span>' +
        '</div>';

      var html = '';
      users.forEach(function(u) {
        var isFake = u.email && u.email.toLowerCase().endsWith('@modxnet.fake');
        var hasGoogle = u.google_id && String(u.google_id).trim();
        var avatar = u.avatar_url
          ? '<img src="' + u.avatar_url + '" class="user-avatar" referrerpolicy="no-referrer" style="width:32px;height:32px;border-radius:50%;object-fit:cover">'
          : '<div style="width:32px;height:32px;border-radius:50%;background:linear-gradient(135deg,#00ffcc,#00d4aa);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:14px;color:#0a0a0a">' + (u.username || 'U').charAt(0).toUpperCase() + '</div>';
        var typeBadge = isFake
          ? '<span style="display:inline-block;padding:1px 6px;border-radius:6px;font-size:0.68rem;background:rgba(136,136,136,0.15);color:#888">System</span>'
          : hasGoogle
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
    if (!confirm('Delete user "' + name + '"?\nAll their reviews will also be removed.')) return;
    api('/api/admin/users/' + id, { method: 'DELETE' }).then(function() { toast('User removed'); loadUsers(); });
  };

  var purgeNonGoogleBtn = $('purgeNonGoogleUsersBtn');
  if (purgeNonGoogleBtn) purgeNonGoogleBtn.addEventListener('click', async function() {
    if (!confirm('Delete all users except your admin account (ADMIN_EMAIL) who either use @modxnet.fake or have no Google ID linked?\n\nTheir reviews and comments are removed (database CASCADE). This cannot be undone.')) return;
    var typed = window.prompt('Type exactly: DELETE_NON_GOOGLE_AND_FAKE_USERS');
    if (typed !== 'DELETE_NON_GOOGLE_AND_FAKE_USERS') {
      if (typed !== null) toast('Confirmation text did not match — cancelled.', 'error');
      return;
    }
    try {
      var res = await fetch('/api/admin/users/purge-non-google', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ confirm: 'DELETE_NON_GOOGLE_AND_FAKE_USERS' })
      });
      var data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Purge failed');
      toast('Removed ' + (data.deleted != null ? data.deleted : 0) + ' user(s).', 'success');
      loadUsers();
      loadDashboard();
    } catch (err) {
      toast(err.message || 'Purge failed', 'error');
    }
  });

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

  // ===== MESSAGES (Contact / DMCA / privacy forms) =====
  var MESSAGE_KIND_LABELS = { contact: 'Contact', dmca: 'Copyright (DMCA)', privacy: 'Privacy request' };

  function renderMessagesBadge(open) {
    var b = $('messagesBadge');
    if (!b) return;
    b.textContent = open;
    b.style.display = open > 0 ? '' : 'none';
  }

  async function loadMessages() {
    try {
      var data = await api('/api/admin/messages');
      var items = data.items || [];
      $('messagesCount').textContent = items.length;
      renderMessagesBadge(data.open || 0);
      var html = '';
      items.forEach(function(m) {
        var details = '';
        if (m.details) {
          try {
            var d = JSON.parse(m.details);
            details = Object.keys(d).map(function(k) { return '<div style="font-size:0.8rem;color:var(--text2)"><strong>' + escHtml(k) + ':</strong> ' + escHtml(d[k]) + '</div>'; }).join('');
          } catch (e) {}
        }
        html += '<tr' + (m.handled ? ' style="opacity:0.55"' : '') + '>' +
          '<td style="font-size:0.82rem">' + escHtml(MESSAGE_KIND_LABELS[m.kind] || m.kind) + '</td>' +
          '<td><strong>' + escHtml(m.name) + '</strong><div style="font-size:0.8rem"><a style="color:var(--text2)" href="mailto:' + escAttr(m.email) + '">' + escHtml(m.email) + '</a></div></td>' +
          '<td style="max-width:420px;white-space:pre-wrap;word-break:break-word">' + (m.subject ? '<strong>' + escHtml(m.subject) + '</strong>\n' : '') + escHtml(m.message) + details + '</td>' +
          '<td style="font-size:0.78rem;color:var(--text3)">' + formatDate(m.created_at) + '</td>' +
          '<td style="font-size:0.8rem">' + (m.emailed ? 'Yes' : 'No') + '</td>' +
          '<td style="white-space:nowrap">' +
            '<button class="danger-btn" style="background:transparent;color:var(--text2)" title="' + (m.handled ? 'Mark as open' : 'Mark as handled') + '" onclick="toggleMessageHandled(' + m.id + ',' + (m.handled ? 0 : 1) + ')"><i class="fas ' + (m.handled ? 'fa-undo' : 'fa-check') + '"></i></button> ' +
            '<button class="danger-btn" title="Delete" onclick="removeMessage(' + m.id + ')"><i class="fas fa-trash"></i></button>' +
          '</td>' +
        '</tr>';
      });
      $('messagesBody').innerHTML = html || '<tr><td colspan="6" style="text-align:center;color:var(--text2);padding:30px">No messages yet</td></tr>';
    } catch (e) {}
  }

  window.toggleMessageHandled = function(id, handled) {
    api('/api/admin/messages/' + id + '/handled', { method: 'POST', body: JSON.stringify({ handled: !!handled }) }).then(function() { loadMessages(); });
  };

  window.removeMessage = function(id) {
    if (!confirm('Delete this message? This cannot be undone.')) return;
    api('/api/admin/messages/' + id, { method: 'DELETE' }).then(function() { toast('Message deleted'); loadMessages(); });
  };

  // Show the open-message count in the sidebar after sign-in
  setTimeout(function() {
    fetch('/api/admin/messages', { credentials: 'same-origin' }).then(function(r) { return r.ok ? r.json() : null; })
      .then(function(d) { if (d) renderMessagesBadge(d.open || 0); }).catch(function() {});
  }, 1500);

  // ===== BROADCAST EMAIL (all users, editable templates) =====
  var comebackModal = $('comebackEmailModal');
  var comebackDefaultsCache = null;

  function applyComebackDefaultsForm(def) {
    if (!def) return;
    $('comebackSubject').value = def.subject || '';
    $('comebackHtml').value = def.html || '';
    $('comebackText').value = def.text || '';
  }

  function openComebackEmailModal() {
    if (!comebackModal) return;
    comebackModal.classList.add('active');
    $('comebackConfirmCheck').checked = false;
    $('comebackSendBtn').disabled = true;
    $('comebackSendBtn').innerHTML = '<i class="fas fa-paper-plane"></i> Send emails';
    $('comebackSiteUrlPreview').textContent = '…';
    $('comebackRecipientCount').textContent = '…';
    refreshEmailBroadcastUi();
    fetch('/api/admin/email/comeback-draft', { credentials: 'same-origin' })
      .then(function(r) { return r.json(); })
      .then(function(d) {
        if (d.error) throw new Error(d.error);
        comebackDefaultsCache = d.defaults || null;
        $('comebackSiteUrlPreview').textContent = (d.siteUrl || '').replace(/\/+$/, '');
        $('comebackRecipientCount').textContent = String(typeof d.recipientCount === 'number' ? d.recipientCount : '—');
        if (comebackDefaultsCache) applyComebackDefaultsForm(comebackDefaultsCache);
      })
      .catch(function() {
        $('comebackSiteUrlPreview').textContent = '(unavailable)';
        $('comebackRecipientCount').textContent = '?';
      });
  }
  function closeComebackEmailModal() {
    if (comebackModal) comebackModal.classList.remove('active');
  }
  var openComebackBtn = $('openComebackEmailBtn');
  if (openComebackBtn) openComebackBtn.addEventListener('click', openComebackEmailModal);
  var comebackClose = $('comebackEmailModalClose');
  if (comebackClose) comebackClose.addEventListener('click', closeComebackEmailModal);
  var comebackCancel = $('comebackCancelBtn');
  if (comebackCancel) comebackCancel.addEventListener('click', closeComebackEmailModal);
  var comebackResetDefaultsBtn = $('comebackResetDefaultsBtn');
  if (comebackResetDefaultsBtn) {
    comebackResetDefaultsBtn.addEventListener('click', function() {
      if (comebackDefaultsCache) {
        applyComebackDefaultsForm(comebackDefaultsCache);
        toast('Restored default template', 'success');
      } else {
        fetch('/api/admin/email/comeback-draft', { credentials: 'same-origin' })
          .then(function(r) { return r.json(); })
          .then(function(d) {
            if (d.defaults) {
              comebackDefaultsCache = d.defaults;
              applyComebackDefaultsForm(d.defaults);
              toast('Restored default template', 'success');
            }
          })
          .catch(function() { toast('Could not load defaults', 'error'); });
      }
    });
  }
  if (comebackModal) {
    comebackModal.addEventListener('click', function(e) {
      if (e.target === comebackModal) closeComebackEmailModal();
    });
  }
  var comebackCheck = $('comebackConfirmCheck');
  if (comebackCheck) {
    comebackCheck.addEventListener('change', function() {
      $('comebackSendBtn').disabled = !this.checked;
    });
  }
  var comebackSend = $('comebackSendBtn');
  if (comebackSend) {
    comebackSend.addEventListener('click', function() {
      var sub = ($('comebackSubject').value || '').trim();
      var html = $('comebackHtml').value || '';
      var text = ($('comebackText').value || '').trim();
      if (!sub) { toast('Subject is required', 'error'); return; }
      if (!html || html.length < 4) { toast('HTML body is too short', 'error'); return; }
      var btn = this;
      btn.disabled = true;
      btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending…';
      var payload = { confirm: true, subject: sub, html: html };
      if (text.length) payload.text = text;
      function resetComebackSendBtn() {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-paper-plane"></i> Send emails';
      }
      fetch('/api/admin/email/comeback-blast', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify(payload)
      })
        .then(function(r) {
          return r.text().then(function(text) {
            var d;
            try {
              d = text ? JSON.parse(text) : {};
            } catch (e) {
              throw new Error((text && text.slice(0, 200)) || 'Invalid server response');
            }
            if (!r.ok) throw new Error(d.error || ('HTTP ' + r.status));
            return d;
          });
        })
        .then(function(d) {
          if (d.background) {
            toast(d.message || ('Queued ' + (d.recipientCount || 0) + ' email(s) in background'), 'success');
            refreshEmailBroadcastUi();
            closeComebackEmailModal();
            return;
          }
          if (d.recipientCount === 0 && d.message) {
            toast(d.message, 'error');
            closeComebackEmailModal();
            return;
          }
          var msg = 'Sent ' + (d.sent != null ? d.sent : 0) + ' email(s)';
          if (d.failed) msg += ' — ' + d.failed + ' failed';
          toast(msg, d.failed ? 'error' : 'success');
          if (d.failures && d.failures.length) {
            console.warn('Broadcast failures:', d.failures);
          }
          closeComebackEmailModal();
        })
        .catch(function(err) {
          toast(err.message || 'Send failed', 'error');
          if (comebackCheck) comebackCheck.checked = false;
        })
        .finally(function() {
          resetComebackSendBtn();
        });
    });
  }

  // ===== INIT =====
  checkAdmin();
})();
