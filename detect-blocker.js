/**
 * ModXnet Adblocker / VPN / Private DNS Detection
 * - Ad blocker: multi-signal scoring (2/3 required), shows full-page modal
 * - VPN: strict mode — disables download buttons only, shows inline warning
 */
(function() {
  'use strict';

  var CHECK_DELAY = 1800;
  var adModalShowing = false;
  var vpnBlocked = false;

  // ========== INJECT STYLES ==========
  var styleSheet = document.createElement('style');
  styleSheet.textContent = [
    /* Full-page ad blocker modal */
    '.blocker-overlay {',
    '  position: fixed; inset: 0; z-index: 99999;',
    '  background: rgba(0,0,0,0.88); backdrop-filter: blur(10px);',
    '  display: flex; align-items: center; justify-content: center;',
    '  padding: 20px;',
    '}',
    '.blocker-modal {',
    '  background: linear-gradient(145deg, #1a1a2e, #16213e);',
    '  border: 1px solid rgba(0,255,204,0.15);',
    '  border-radius: 20px; max-width: 440px; width: 100%;',
    '  padding: 36px 28px 28px; text-align: center;',
    '  box-shadow: 0 20px 60px rgba(0,0,0,0.6), 0 0 40px rgba(0,255,204,0.05);',
    '  font-family: "Exo 2", sans-serif; color: #e0e0e0;',
    '}',
    '.blocker-icon-wrap {',
    '  width: 72px; height: 72px; margin: 0 auto 20px;',
    '  border-radius: 50%; display: flex; align-items: center; justify-content: center;',
    '  font-size: 30px;',
    '}',
    '.blocker-icon-wrap.adblock {',
    '  background: linear-gradient(135deg, rgba(255,87,87,0.15), rgba(255,87,87,0.05));',
    '  border: 2px solid rgba(255,87,87,0.3); color: #ff5757;',
    '}',
    '.blocker-modal h2 {',
    '  font-size: 1.35rem; font-weight: 700; margin: 0 0 10px;',
    '  background: linear-gradient(90deg, #ffffff, #b0b0b0);',
    '  -webkit-background-clip: text; -webkit-text-fill-color: transparent;',
    '  background-clip: text;',
    '}',
    '.blocker-modal p {',
    '  font-size: 0.92rem; color: #a0a0a0; margin: 0 0 22px; line-height: 1.55;',
    '}',
    '.blocker-steps {',
    '  text-align: left; margin: 0 0 24px; padding: 0;',
    '  list-style: none; counter-reset: step;',
    '}',
    '.blocker-steps li {',
    '  counter-increment: step; position: relative;',
    '  padding: 12px 14px 12px 48px; margin-bottom: 8px;',
    '  background: rgba(255,255,255,0.03); border-radius: 12px;',
    '  border: 1px solid rgba(255,255,255,0.05);',
    '  font-size: 0.88rem; color: #c8c8c8; line-height: 1.45;',
    '}',
    '.blocker-steps li::before {',
    '  content: counter(step); position: absolute; left: 14px; top: 12px;',
    '  width: 24px; height: 24px; border-radius: 50%;',
    '  background: rgba(0,255,204,0.1); border: 1px solid rgba(0,255,204,0.25);',
    '  color: #00ffcc; font-size: 0.75rem; font-weight: 700;',
    '  display: flex; align-items: center; justify-content: center;',
    '}',
    '.blocker-refresh-btn {',
    '  display: inline-flex; align-items: center; gap: 8px;',
    '  padding: 13px 32px; border: none; border-radius: 12px;',
    '  background: linear-gradient(135deg, #00ffcc, #00d4aa);',
    '  color: #0a0a0a; font-family: "Exo 2", sans-serif;',
    '  font-size: 0.95rem; font-weight: 700; cursor: pointer;',
    '  transition: all 0.25s ease; box-shadow: 0 4px 20px rgba(0,255,204,0.25);',
    '}',
    '.blocker-refresh-btn:hover {',
    '  transform: translateY(-2px); box-shadow: 0 6px 28px rgba(0,255,204,0.35);',
    '}',
    '.blocker-refresh-btn:active { transform: translateY(0); }',
    '.blocker-note {',
    '  margin-top: 16px; font-size: 0.76rem; color: #666;',
    '}',
    '.blocker-note i { margin-right: 4px; }',
    '.page-blocked { overflow: hidden !important; height: 100vh !important; }',
    '',
    /* VPN — disabled download buttons */
    '.get-btn.vpn-disabled {',
    '  opacity: 0.35 !important; pointer-events: none !important;',
    '  cursor: not-allowed !important; filter: grayscale(1) !important;',
    '  position: relative !important;',
    '}',
    '',
    /* VPN warning banner above buttons */
    '.vpn-warning-banner {',
    '  display: flex; align-items: center; gap: 12px;',
    '  background: linear-gradient(135deg, rgba(255,193,7,0.08), rgba(255,87,7,0.06));',
    '  border: 1px solid rgba(255,193,7,0.25); border-radius: 14px;',
    '  padding: 14px 16px; margin-bottom: 14px;',
    '  font-family: "Exo 2", sans-serif;',
    '}',
    '.vpn-warning-icon {',
    '  width: 44px; height: 44px; min-width: 44px; border-radius: 50%;',
    '  background: rgba(255,193,7,0.12); border: 1.5px solid rgba(255,193,7,0.3);',
    '  display: flex; align-items: center; justify-content: center;',
    '  color: #ffc107; font-size: 18px;',
    '}',
    '.vpn-warning-text {',
    '  flex: 1;',
    '}',
    '.vpn-warning-text strong {',
    '  display: block; font-size: 0.88rem; color: #ffc107; margin-bottom: 2px;',
    '}',
    '.vpn-warning-text span {',
    '  font-size: 0.78rem; color: #a0a0a0; line-height: 1.4;',
    '}',
    '.vpn-warning-refresh {',
    '  padding: 8px 14px; border: 1px solid rgba(255,193,7,0.3);',
    '  border-radius: 8px; background: rgba(255,193,7,0.1);',
    '  color: #ffc107; font-size: 0.75rem; font-weight: 600;',
    '  font-family: "Exo 2", sans-serif; cursor: pointer;',
    '  white-space: nowrap; transition: all 0.2s ease;',
    '}',
    '.vpn-warning-refresh:hover {',
    '  background: rgba(255,193,7,0.2); border-color: rgba(255,193,7,0.5);',
    '}',
    '',
    /* VPN modal (shown on button click attempt) */
    '.vpn-modal-overlay {',
    '  position: fixed; inset: 0; z-index: 99998;',
    '  background: rgba(0,0,0,0.75); backdrop-filter: blur(6px);',
    '  display: flex; align-items: center; justify-content: center;',
    '  padding: 20px;',
    '}',
    '.vpn-modal {',
    '  background: linear-gradient(145deg, #1a1a2e, #16213e);',
    '  border: 1px solid rgba(255,193,7,0.2); border-radius: 20px;',
    '  max-width: 420px; width: 100%; padding: 32px 24px 24px;',
    '  text-align: center; font-family: "Exo 2", sans-serif;',
    '  box-shadow: 0 16px 50px rgba(0,0,0,0.5);',
    '}',
    '.vpn-modal .blocker-icon-wrap {',
    '  background: linear-gradient(135deg, rgba(255,193,7,0.15), rgba(255,193,7,0.05));',
    '  border: 2px solid rgba(255,193,7,0.3); color: #ffc107;',
    '}',
    '.vpn-modal h2 {',
    '  font-size: 1.2rem; font-weight: 700; color: #fff; margin: 0 0 8px;',
    '}',
    '.vpn-modal p {',
    '  font-size: 0.88rem; color: #a0a0a0; margin: 0 0 20px; line-height: 1.5;',
    '}',
    '.vpn-modal-actions {',
    '  display: flex; gap: 10px; justify-content: center;',
    '}',
    '.vpn-modal-close {',
    '  padding: 10px 22px; border: 1px solid rgba(255,255,255,0.1);',
    '  border-radius: 10px; background: rgba(255,255,255,0.05);',
    '  color: #a0a0a0; font-family: "Exo 2", sans-serif;',
    '  font-size: 0.88rem; cursor: pointer; transition: all 0.2s ease;',
    '}',
    '.vpn-modal-close:hover { background: rgba(255,255,255,0.1); color: #fff; }',
    '.vpn-modal-refresh {',
    '  padding: 10px 22px; border: none; border-radius: 10px;',
    '  background: linear-gradient(135deg, #ffc107, #e6ac00);',
    '  color: #0a0a0a; font-family: "Exo 2", sans-serif;',
    '  font-size: 0.88rem; font-weight: 700; cursor: pointer;',
    '  transition: all 0.2s ease;',
    '}',
    '.vpn-modal-refresh:hover { transform: translateY(-1px); }',
    '',
    '@media (max-width: 480px) {',
    '  .blocker-modal { padding: 28px 20px 22px; }',
    '  .blocker-modal h2 { font-size: 1.2rem; }',
    '  .blocker-steps li { font-size: 0.82rem; padding: 10px 12px 10px 42px; }',
    '  .blocker-icon-wrap { width: 60px; height: 60px; font-size: 24px; }',
    '  .vpn-warning-banner { flex-wrap: wrap; gap: 10px; }',
    '  .vpn-warning-refresh { width: 100%; text-align: center; padding: 10px; }',
    '}'
  ].join('\n');
  document.head.appendChild(styleSheet);

  // ========== AD BLOCKER MODAL ==========
  function showAdblockModal() {
    if (adModalShowing) return;
    adModalShowing = true;
    var overlay = document.createElement('div');
    overlay.className = 'blocker-overlay';
    overlay.id = 'blockerOverlay';
    overlay.innerHTML =
      '<div class="blocker-modal">' +
        '<div class="blocker-icon-wrap adblock"><i class="fas fa-shield-alt"></i></div>' +
        '<h2>Ad Blocker Detected</h2>' +
        '<p>It looks like you\'re using an ad blocker or private DNS (like AdGuard). Our content relies on ads to stay free. Please disable it to continue.</p>' +
        '<ul class="blocker-steps">' +
          '<li>Open your device <strong>Settings</strong> app</li>' +
          '<li>Go to <strong>Network & Internet</strong> or <strong>Connections</strong></li>' +
          '<li>Tap <strong>Private DNS</strong> and set it to <strong>Off</strong> or <strong>Automatic</strong></li>' +
          '<li>If using a browser extension, click the <strong>ad blocker icon</strong> and choose <strong>Pause / Disable</strong></li>' +
          '<li>Come back and tap the button below</li>' +
        '</ul>' +
        '<button class="blocker-refresh-btn" onclick="location.reload()"><i class="fas fa-redo-alt"></i> I\'ve Disabled It — Refresh</button>' +
        '<div class="blocker-note"><i class="fas fa-lock"></i> Your data is safe. We only use non-intrusive ads.</div>' +
      '</div>';
    document.body.appendChild(overlay);
    document.body.classList.add('page-blocked');
  }

  // ========== VPN — DISABLE DOWNLOAD BUTTONS ==========
  function blockDownloadButtons() {
    if (vpnBlocked) return;
    vpnBlocked = true;

    var getButtons = document.querySelectorAll('.get-btn');
    var getSection = getButtons.length > 0 ? getButtons[0].parentElement : null;

    if (!getSection) return;

    // Insert warning banner above the buttons
    var banner = document.createElement('div');
    banner.className = 'vpn-warning-banner';
    banner.id = 'vpnWarningBanner';
    banner.innerHTML =
      '<div class="vpn-warning-icon"><i class="fas fa-globe"></i></div>' +
      '<div class="vpn-warning-text">' +
        '<strong><i class="fas fa-exclamation-triangle"></i> VPN Detected</strong>' +
        '<span>Downloads are disabled while connected to a VPN or proxy. Disconnect your VPN and refresh to unlock.</span>' +
      '</div>' +
      '<button class="vpn-warning-refresh" onclick="location.reload()"><i class="fas fa-redo-alt"></i> Refresh</button>';
    getSection.parentElement.insertBefore(banner, getSection);

    // Disable all download buttons
    getButtons.forEach(function(btn) {
      btn.classList.add('vpn-disabled');
      btn.setAttribute('data-original-onclick', btn.getAttribute('onclick') || '');
      btn.removeAttribute('onclick');
    });

    // Intercept clicks on disabled buttons — show VPN modal
    getSection.addEventListener('click', function(e) {
      var btn = e.target.closest('.get-btn');
      if (btn && btn.classList.contains('vpn-disabled')) {
        e.preventDefault();
        e.stopPropagation();
        showVpnClickModal();
      }
    }, true);

    // Also intercept the showContentLocker function
    if (typeof window.showContentLocker === 'function') {
      var originalShowContentLocker = window.showContentLocker;
      window.showContentLocker = function() {
        if (vpnBlocked) {
          showVpnClickModal();
          return;
        }
        originalShowContentLocker.apply(this, arguments);
      };
    }
  }

  // VPN modal shown when user tries to click a disabled download button
  function showVpnClickModal() {
    var existing = document.getElementById('vpnClickModal');
    if (existing) return;

    var overlay = document.createElement('div');
    overlay.className = 'vpn-modal-overlay';
    overlay.id = 'vpnClickModal';
    overlay.innerHTML =
      '<div class="vpn-modal">' +
        '<div class="blocker-icon-wrap"><i class="fas fa-globe"></i></div>' +
        '<h2>VPN / Proxy Detected</h2>' +
        '<p>Downloads are blocked while you\'re connected to a VPN or proxy. Please disconnect and refresh the page to unlock downloads.</p>' +
        '<ul class="blocker-steps">' +
          '<li>Open your <strong>VPN app</strong> (NordVPN, ExpressVPN, etc.)</li>' +
          '<li>Tap <strong>Disconnect</strong> or <strong>Turn Off</strong></li>' +
          '<li>Wait a few seconds, then tap <strong>Refresh</strong> below</li>' +
        '</ul>' +
        '<div class="vpn-modal-actions">' +
          '<button class="vpn-modal-close" id="vpnModalClose">Close</button>' +
          '<button class="vpn-modal-refresh" onclick="location.reload()"><i class="fas fa-redo-alt"></i> I\'ve Disconnected — Refresh</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(overlay);

    // Close button
    document.getElementById('vpnModalClose').addEventListener('click', function() {
      overlay.remove();
    });

    // Close on backdrop click
    overlay.addEventListener('click', function(e) {
      if (e.target === overlay) overlay.remove();
    });
  }

  // ========== AD BLOCKER DETECTION ==========
  function checkBaitElement(callback) {
    var bait = document.createElement('div');
    bait.innerHTML = '&nbsp;';
    bait.className = 'ad_unit ad-zone ad-space adsbox ad-banner';
    bait.style.cssText =
      'position:absolute !important;left:-9999px !important;top:-9999px !important;' +
      'width:300px !important;height:250px !important;overflow:hidden !important;' +
      'pointer-events:none !important;';
    document.body.appendChild(bait);

    setTimeout(function() {
      var blocked = false;
      try {
        var s = window.getComputedStyle(bait);
        blocked = !bait || bait.offsetParent === null ||
          bait.offsetHeight === 0 || bait.offsetWidth === 0 ||
          s.display === 'none' || s.visibility === 'hidden';
      } catch(e) { blocked = false; }
      if (bait && bait.parentNode) bait.remove();
      callback(blocked);
    }, 500);
  }

  function checkIframeBait(callback) {
    var iframe = document.createElement('iframe');
    iframe.style.cssText =
      'position:absolute !important;left:-9999px !important;top:-9999px !important;' +
      'width:1px !important;height:1px !important;opacity:0 !important;';
    iframe.src = 'about:blank';
    iframe.id = 'ad_iframe_test';
    iframe.className = 'ad_iframe';
    document.body.appendChild(iframe);

    setTimeout(function() {
      var blocked = false;
      try {
        blocked = !iframe || iframe.offsetHeight === 0 ||
          window.getComputedStyle(iframe).display === 'none';
      } catch(e) { blocked = false; }
      if (iframe && iframe.parentNode) iframe.remove();
      callback(blocked);
    }, 500);
  }

  function checkAdScript(callback) {
    var fired = false;
    function done(result) {
      if (fired) return;
      fired = true;
      callback(result);
    }
    try {
      var req = new XMLHttpRequest();
      req.open('GET', 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js', true);
      req.timeout = 4000;
      req.onload = function() { done(false); };
      req.onerror = function() { done(true); };
      req.ontimeout = function() { done(false); };
      req.send();
    } catch(e) { done(false); }
  }

  // ========== VPN DETECTION (strict) ==========
  function detectVpn(callback) {
    var results = { api1: null, api2: null };
    var finished = 0;

    function checkDone() {
      finished++;
      if (finished < 2) return;
      // Strict: if EITHER API confirms VPN, block downloads
      callback(results.api1 === true || results.api2 === true);
    }

    // API 1: ipapi.co
    fetchJson('https://ipapi.co/json/', function(data) {
      if (data && data.org) {
        results.api1 = matchVpnOrg(data.org);
      } else {
        results.api1 = false;
      }
      checkDone();
    });

    // API 2: ip-api.com (provides hosting/proxy flags directly)
    fetchJson('https://ip-api.com/json/?fields=status,org,hosting,proxy', function(data) {
      if (data && data.status === 'success') {
        // ip-api directly tells us if it's a hosting/proxy IP
        if (data.hosting === true || data.proxy === true) {
          results.api2 = true;
        } else if (data.org) {
          results.api2 = matchVpnOrg(data.org);
        } else {
          results.api2 = false;
        }
      } else {
        results.api2 = false;
      }
      checkDone();
    });
  }

  function matchVpnOrg(org) {
    var o = org.toLowerCase();
    var keywords = [
      'vpn', 'proxy', 'hosting', 'datacenter', 'data center',
      'colocation', 'ovh', 'digitalocean', 'amazon', 'aws',
      'google cloud', 'azure', 'linode', 'vultr', 'hetzner',
      'mullvad', 'nordvpn', 'expressvpn', 'surfshark',
      'cyberghost', 'protonvpn', 'windscribe', 'tunnelbear',
      'hotspot shield', 'private internet', 'pia', 'ipvanish',
      'psiphon', 'hide.me', 'torguard', 'purevpn', 'astrill'
    ];
    for (var i = 0; i < keywords.length; i++) {
      if (o.indexOf(keywords[i]) !== -1) return true;
    }
    return false;
  }

  function fetchJson(url, cb) {
    try {
      var xhr = new XMLHttpRequest();
      xhr.open('GET', url, true);
      xhr.timeout = 5000;
      xhr.onreadystatechange = function() {
        if (xhr.readyState === 4) {
          if (xhr.status === 200) {
            try { cb(JSON.parse(xhr.responseText)); } catch(e) { cb(null); }
          } else { cb(null); }
        }
      };
      xhr.ontimeout = function() { cb(null); };
      xhr.onerror = function() { cb(null); };
      xhr.send();
    } catch(e) { cb(null); }
  }

  // ========== MAIN DETECTION FLOW ==========
  function runDetection() {
    var signals = 0;
    var checks = 0;

    function evaluateAdblock() {
      checks++;
      if (checks < 3) return;

      if (signals >= 2) {
        showAdblockModal();
        // Don't bother checking VPN if ad blocker is detected
      } else {
        // No ad blocker — now check VPN strictly
        detectVpn(function(isVpn) {
          if (isVpn) {
            blockDownloadButtons();
          }
        });
      }
    }

    checkBaitElement(function(b) { if (b) signals++; evaluateAdblock(); });
    checkIframeBait(function(b) { if (b) signals++; evaluateAdblock(); });
    checkAdScript(function(b) { if (b) signals++; evaluateAdblock(); });
  }

  // ========== INIT ==========
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
      setTimeout(runDetection, CHECK_DELAY);
    });
  } else {
    setTimeout(runDetection, CHECK_DELAY);
  }

})();
