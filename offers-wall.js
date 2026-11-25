/*
 * ModXnet offers popup (AdBlueMedia Offers API)
 * Replaces the old AdBlueMedia content locker. The game page buttons call
 * showContentLocker('android' | 'ios'). The popup first shows only "Download Now";
 * tapping it reveals the steps and the offers from /api/offers/<game>. It then polls
 * /api/offers/status/<token> until the AdBlueMedia postback confirms a completed offer,
 * and starts the download automatically.
 */
(function () {
    'use strict';

    var POLL_MS = 5000;
    var POLL_MAX_MS = 45 * 60 * 1000;
    var TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

    var slug = decodeURIComponent((location.pathname.split('/')[1] || '').trim());
    var storeKey = 'mx_offers_' + slug;
    var state = {
        platform: 'android', token: null, open: false, pollTimer: null, pollStarted: 0,
        loading: false, unlocked: null, clicked: false, revealed: false, offers: null,
        error: null, impressionsSent: false, autoStarted: false
    };
    var els = {};

    /** Analytics: push an event for Google Tag Manager (GTM-M7JMN9D2 sends these to GA4). Never throws. */
    function track(name, extra) {
        try {
            window.dataLayer = window.dataLayer || [];
            var ev = { event: name, game: slug, platform: state.platform, offer_id: undefined, offer_name: undefined };
            if (extra) Object.keys(extra).forEach(function (k) { ev[k] = extra[k]; });
            window.dataLayer.push(ev);
        } catch (e) {}
    }

    // Popup text comes from Admin > Ad Config (/api/offers-config/<game>). These are only
    // a fallback for when that request fails; keep them in sync with POPUP_TEXT_DEFAULTS in server.js.
    var texts = {
        brand_name: 'ModXnet', brand_logo: '/favicon.png', badge_text: 'Free · 1 task',
        title: 'Download {game}', subtitle: 'Free {platform} download',
        note: 'After completing *ONE* task, you will be able to download the Game for _FREE_.',
        download_button: 'Download Now', loading_button: 'Loading…',
        step1: 'Click on any offer from the list',
        step2: 'Install an app and run it for 30 seconds, or complete a short survey',
        step3: 'Your download will start automatically',
        loading_offers: 'Loading offers…',
        no_offers: 'No offers are available for your device or country right now. Turn off any VPN and try again.',
        retry_button: 'Try again', verify_text: 'Checking for verification',
        after_click: 'Complete the offer, then come back to this page. Your download will start automatically.',
        done_note: 'Task completed! Your _FREE_ download is ready.',
        download_starting: 'Your download is starting… If it does not start, tap Download Now.',
        starting_button: 'Starting download…',
        link_missing: 'Your offer is confirmed, but the download link for this game is not ready yet. Please contact support from the Help page and mention this game.',
        not_available: 'This game is not available for {platform} yet. The {other} version is ready below.',
        other_platform: 'Get the {other} version instead',
        banner_image: '', game_logo: ''
    };
    var configReady = Promise.race([
        fetch('/api/offers-config/' + encodeURIComponent(slug), { headers: { 'Accept': 'application/json' }, credentials: 'same-origin' })
            .then(function (r) { return r.ok ? r.json() : null; })
            .then(function (d) {
                if (!d || !d.texts) return;
                Object.keys(d.texts).forEach(function (k) { if (typeof d.texts[k] === 'string') texts[k] = d.texts[k]; });
            })
            .catch(function () {}),
        new Promise(function (resolve) { setTimeout(resolve, 2500); })
    ]);

    /** Text with {game} {platform} {other} filled in */
    function t(key) {
        var p = platformName(state.platform);
        var o = platformName(state.platform === 'ios' ? 'android' : 'ios');
        var raw = texts[key] == null ? '' : String(texts[key]);
        if (raw === '-') return '';  // '-' in the admin hides this part
        return raw
            .replace(/\{game\}/g, (els.info && els.info.title) || 'this game')
            .replace(/\{platform\}/g, p)
            .replace(/\{other\}/g, o);
    }

    /** Like t(), but *word* becomes yellow and _word_ green */
    function rich(key) {
        var frag = document.createDocumentFragment();
        t(key).split(/(\*[^*]+\*|_[^_]+_)/).forEach(function (part) {
            if (!part) return;
            if (/^\*[^*]+\*$/.test(part)) frag.appendChild(el('span', 'ow-one', part.slice(1, -1)));
            else if (/^_[^_]+_$/.test(part)) frag.appendChild(el('span', 'ow-free', part.slice(1, -1)));
            else frag.appendChild(document.createTextNode(part));
        });
        return frag;
    }

    function injectStyles() {
        if (document.getElementById('ow-styles')) return;
        var css = [
            '.ow-overlay{position:fixed;inset:0;z-index:100000;display:none;overflow-y:auto;-webkit-overflow-scrolling:touch;overscroll-behavior:contain;background:rgba(38,35,33,.94);padding:18px 10px calc(24px + env(safe-area-inset-bottom,0px));font-family:"Exo 2",system-ui,sans-serif}',
            '.ow-overlay.ow-open{display:block}',
            '.ow-card{position:relative;max-width:480px;margin:0 auto;background:#1b161b;border:1px solid rgba(255,255,255,.08);border-radius:6px;padding:14px 22px 26px;color:#e8e8e8;box-shadow:0 20px 60px rgba(0,0,0,.45);animation:ow-in .2s ease-out}',
            '@keyframes ow-in{from{transform:translateY(12px);opacity:0}to{transform:none;opacity:1}}',
            '.ow-top{position:relative;display:flex;align-items:center;justify-content:center;min-height:40px;margin:22px 0 18px}',
            '.ow-brand{display:flex;align-items:center;gap:7px;color:#fff;font-weight:800;font-style:italic;font-size:1.15rem;letter-spacing:-.2px;text-decoration:none}',
            '.ow-brand img{width:24px;height:24px;border-radius:50%}',
            '.ow-badge{position:absolute;top:-30px;right:-10px;display:flex;align-items:center;gap:6px;padding:5px 12px;border-radius:50px;border:1px solid rgba(34,197,94,.45);background:rgba(34,197,94,.08);color:#4ade80;font-size:.74rem;font-weight:700;white-space:nowrap}',
            '.ow-close{position:absolute;top:8px;left:8px;width:32px;height:32px;border:0;border-radius:50%;background:transparent;color:rgba(255,255,255,.45);font-size:22px;line-height:32px;cursor:pointer}',
            '.ow-close:hover{color:#fff;background:rgba(255,255,255,.08)}',
            '.ow-banner{position:relative;overflow:hidden;border-radius:14px;padding:22px 16px 18px;text-align:center;background:#111}',
            '.ow-banner-bg{position:absolute;inset:-12px;width:calc(100% + 24px);height:calc(100% + 24px);object-fit:cover;filter:blur(4px) brightness(.42) saturate(1.1)}',
            '.ow-banner::after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,0) 35%,rgba(0,0,0,.55) 100%)}',
            '.ow-banner>*:not(.ow-banner-bg){position:relative;z-index:1}',
            '.ow-logo{display:block;width:108px;height:108px;margin:0 auto 14px;border-radius:20px;object-fit:cover;background:#2a2a2a;border:2px solid rgba(255,255,255,.18);box-shadow:0 8px 24px rgba(0,0,0,.45)}',
            '.ow-game{margin:0;font-size:1.3rem;font-weight:800;color:#fff;line-height:1.25;text-shadow:0 2px 10px rgba(0,0,0,.6)}',
            '.ow-game-sub{display:flex;align-items:center;justify-content:center;gap:7px;margin:8px 0 0;color:#a3a3a3;font-size:.86rem;font-weight:600}',
            '.ow-game-sub i{color:#4ade80}',
            '.ow-note{margin:28px 0 0;padding:16px 18px;border-left:4px solid #e74c3c;border-radius:12px;background:#222;color:#fff;font-weight:700;font-size:1.08rem;line-height:1.45}',
            '.ow-note .ow-one{color:#facc15}',
            '.ow-note .ow-free{color:#4ade80;font-weight:600}',
            '.ow-note.ow-success{border-left-color:#22c55e}',
            '.ow-offers-box{display:none;margin:22px 0 0;animation:ow-in .2s ease-out}',
            '.ow-offers-box.ow-show{display:block}',
            '.ow-steps{margin:0 0 20px;padding:0;list-style:none;counter-reset:ow}',
            '.ow-steps li{counter-increment:ow;display:flex;align-items:flex-start;gap:12px;padding:8px 0;color:#e8e8e8;font-size:.95rem;font-weight:600;line-height:1.4}',
            '.ow-steps li::before{content:counter(ow);flex:none;width:26px;height:26px;border-radius:50%;background:#00ffd5;color:#111;font-weight:800;font-size:.85rem;display:flex;align-items:center;justify-content:center}',
            '.ow-tasks{display:flex;flex-direction:column;gap:10px}',
            '.ow-task{display:flex;align-items:center;justify-content:center;min-height:68px;padding:12px 18px;border-radius:16px;border:2px solid #d9fff6;background:#00ffd5;color:#111;font-weight:700;font-size:1rem;line-height:1.3;text-align:center;text-decoration:none;box-shadow:0 2px 0 rgba(0,0,0,.25);transition:transform .08s,filter .15s;-webkit-tap-highlight-color:transparent;overflow-wrap:anywhere}',
            '.ow-task:hover{filter:brightness(1.06)}',
            '.ow-task:active{transform:scale(.985)}',
            '.ow-task.ow-clicked{border-color:#22c55e}',
            '.ow-msg{margin:16px 0 0;text-align:center;font-size:.88rem;color:#a3a3a3;line-height:1.45}',
            '.ow-msg:empty{display:none}',
            '.ow-msg.ow-warn{color:#fca5a5}',
            '.ow-msg.ow-ok{color:#4ade80}',
            '.ow-wait{display:flex;align-items:center;justify-content:center;gap:9px}',
            '.ow-spin{flex:none;width:16px;height:16px;border-radius:50%;border:2px solid rgba(0,255,213,.25);border-top-color:#00ffd5;animation:ow-rot .8s linear infinite}',
            '.ow-loading{display:flex;flex-direction:column;align-items:center;gap:12px;padding:20px 0;color:#a3a3a3;font-size:.9rem;text-align:center}',
            '.ow-loading .ow-spin{width:28px;height:28px;border-width:3px}',
            '@keyframes ow-rot{to{transform:rotate(360deg)}}',
            '.ow-actions{display:flex;flex-direction:column;align-items:center;gap:10px;margin:40px 0 6px}',
            '.ow-actions.ow-hidden{display:none}',
            '.ow-dl{display:inline-flex;align-items:center;justify-content:center;gap:9px;min-width:200px;padding:15px 30px;border:0;border-radius:8px;background:linear-gradient(180deg,#22c55e,#16a34a);color:#fff;font-family:inherit;font-weight:700;font-size:1.12rem;text-decoration:none;cursor:pointer;box-shadow:0 0 22px rgba(34,197,94,.45);animation:ow-pulse 1.8s ease-in-out infinite}',
            '.ow-dl:active{transform:scale(.98)}',
            '@keyframes ow-pulse{0%,100%{box-shadow:0 0 18px rgba(34,197,94,.35)}50%{box-shadow:0 0 30px rgba(34,197,94,.7)}}',
            '.ow-alt{color:#a3a3a3;font-size:.84rem;text-decoration:underline}',
            '.ow-verify{display:none;align-items:center;justify-content:center;gap:10px;margin:18px 0 0;padding:13px 14px;border-radius:12px;border:1px dashed rgba(0,255,213,.35);background:rgba(0,255,213,.06);color:#d4fff6;font-size:.92rem;font-weight:600}',
            '.ow-verify.ow-show{display:flex}',
            '.ow-verify .ow-spin{width:18px;height:18px}',
            '.ow-dots::after{content:"";display:inline-block;width:1.2em;text-align:left;animation:ow-dots 1.4s steps(4,end) infinite}',
            '@keyframes ow-dots{0%{content:""}25%{content:"."}50%{content:".."}75%{content:"..."}}',
            '.ow-dl.ow-busy{pointer-events:none;opacity:.92;animation:none}',
            '.ow-dl .ow-spin{width:18px;height:18px;border-color:rgba(255,255,255,.35);border-top-color:#fff}',
            '.ow-retry{margin-top:4px;padding:10px 22px;border:1px solid rgba(255,255,255,.2);border-radius:8px;background:transparent;color:#e8e8e8;font-family:inherit;font-weight:600;cursor:pointer}',
            'body.ow-lock{overflow:hidden!important}'
        ].join('\n');
        var st = document.createElement('style');
        st.id = 'ow-styles';
        st.textContent = css;
        document.head.appendChild(st);
    }

    function el(tag, cls, text) {
        var n = document.createElement(tag);
        if (cls) n.className = cls;
        if (text != null) n.textContent = text;
        return n;
    }

    function icon(name) {
        var i = el('i', name);
        i.setAttribute('aria-hidden', 'true');
        return i;
    }

    function pageInfo() {
        var h = document.querySelector('.game-text h1, h1');
        var logo = document.querySelector('.game-logo');
        var banner = document.querySelector('.hero img');
        return {
            title: (h && h.textContent.trim()) || 'this game',
            logo: logo ? logo.currentSrc || logo.src : '',
            banner: banner ? banner.currentSrc || banner.src : (logo ? logo.src : '')
        };
    }

    function build() {
        if (els.overlay) return;
        injectStyles();
        var info = els.info = pageInfo();
        if (texts.banner_image) info.banner = texts.banner_image === '-' ? '' : texts.banner_image;
        if (texts.game_logo) info.logo = texts.game_logo === '-' ? '' : texts.game_logo;

        els.overlay = el('div', 'ow-overlay');
        els.overlay.setAttribute('role', 'dialog');
        els.overlay.setAttribute('aria-modal', 'true');
        els.overlay.setAttribute('aria-labelledby', 'ow-game-title');
        var card = el('div', 'ow-card');

        var close = el('button', 'ow-close');
        close.type = 'button';
        close.setAttribute('aria-label', 'Close');
        close.textContent = '×';
        close.addEventListener('click', hide);
        card.appendChild(close);

        // Brand row
        var top = el('div', 'ow-top');
        var brand = el('div', 'ow-brand');
        if (texts.brand_logo && texts.brand_logo !== '-') {
            var bimg = el('img');
            bimg.src = texts.brand_logo;
            bimg.alt = '';
            bimg.onerror = function () { bimg.remove(); };
            brand.appendChild(bimg);
        }
        if (t('brand_name')) brand.appendChild(document.createTextNode(t('brand_name')));
        top.appendChild(brand);
        if (t('badge_text')) {
            var badge = el('div', 'ow-badge');
            badge.appendChild(icon('fas fa-shield-alt'));
            badge.appendChild(document.createTextNode(' '));
            els.badge = el('span', null, '');
            badge.appendChild(els.badge);
            top.appendChild(badge);
        }
        card.appendChild(top);

        // Banner with blurred cover, game logo and title
        var banner = el('div', 'ow-banner');
        if (info.banner) {
            var bg = el('img', 'ow-banner-bg');
            bg.src = info.banner;
            bg.alt = '';
            banner.appendChild(bg);
        }
        if (info.logo) {
            var lg = el('img', 'ow-logo');
            lg.src = info.logo;
            lg.alt = info.title + ' logo';
            lg.onerror = function () { lg.remove(); };
            banner.appendChild(lg);
        }
        var gt = els.title = el('h2', 'ow-game', '');
        gt.id = 'ow-game-title';
        banner.appendChild(gt);
        var gs = el('p', 'ow-game-sub');
        gs.appendChild(icon('far fa-check-circle'));
        els.platformLabel = el('span', null, '');
        gs.appendChild(els.platformLabel);
        banner.appendChild(gs);
        card.appendChild(banner);

        // Instruction note
        els.note = el('div', 'ow-note');
        card.appendChild(els.note);

        // Steps + offers: hidden until "Download Now" is tapped
        els.offersBox = el('div', 'ow-offers-box');
        var steps = el('ol', 'ow-steps');
        els.steps = steps;
        els.offersBox.appendChild(steps);
        els.tasks = el('div', 'ow-tasks');
        els.offersBox.appendChild(els.tasks);
        // Live "checking" row under the offers while we poll for the postback
        els.verify = el('div', 'ow-verify');
        els.verify.setAttribute('role', 'status');
        els.verify.setAttribute('aria-live', 'polite');
        els.verify.appendChild(el('div', 'ow-spin'));
        els.verifyText = el('span', 'ow-dots', '');
        els.verify.appendChild(els.verifyText);
        els.offersBox.appendChild(els.verify);
        card.appendChild(els.offersBox);

        els.msg = el('div', 'ow-msg');
        card.appendChild(els.msg);

        // Download button
        els.actions = el('div', 'ow-actions');
        els.dl = el('a', 'ow-dl');
        els.dl.href = '#';
        els.dl.setAttribute('role', 'button');
        setDlBusy(false);
        els.dl.addEventListener('click', onDownloadClick);
        els.actions.appendChild(els.dl);
        els.alt = el('a', 'ow-alt');
        els.alt.style.display = 'none';
        els.alt.target = '_blank';
        els.alt.rel = 'noopener';
        els.actions.appendChild(els.alt);
        card.appendChild(els.actions);

        els.overlay.appendChild(card);
        els.overlay.addEventListener('click', function (e) { if (e.target === els.overlay) hide(); });
        document.addEventListener('keydown', function (e) { if (state.open && e.key === 'Escape') hide(); });
        document.addEventListener('visibilitychange', function () {
            if (state.open && document.visibilityState === 'visible' && state.token) checkStatus();
        });
        document.body.appendChild(els.overlay);
        if (window.visualViewport) {
            window.visualViewport.addEventListener('resize', fitOverlay);
            window.visualViewport.addEventListener('scroll', fitOverlay);
        }
        window.addEventListener('resize', fitOverlay);
    }

    function platformName(p) { return p === 'ios' ? 'iOS' : 'Android'; }

    function setNote(done) {
        els.note.textContent = '';
        els.note.classList.toggle('ow-success', !!done);
        els.note.appendChild(rich(done ? 'done_note' : 'note'));
        els.note.style.display = els.note.textContent ? '' : 'none';
    }

    function setMsg(text, kind, spinner) {
        els.msg.textContent = '';
        els.msg.className = 'ow-msg' + (kind ? ' ' + kind : '');
        if (!text) return;
        if (spinner) {
            var w = el('div', 'ow-wait');
            w.appendChild(el('div', 'ow-spin'));
            w.appendChild(el('span', null, text));
            els.msg.appendChild(w);
        } else {
            els.msg.textContent = text;
        }
    }

    function showDownloadButton(visible) {
        els.actions.classList.toggle('ow-hidden', !visible);
    }

    /** Download Now button: normal label, or a spinner with a short label while busy */
    function setDlBusy(busyText) {
        els.dl.textContent = '';
        els.dl.classList.toggle('ow-busy', !!busyText);
        els.dl.setAttribute('aria-busy', busyText ? 'true' : 'false');
        if (busyText) {
            els.dl.appendChild(el('div', 'ow-spin'));
            els.dl.appendChild(document.createTextNode(' ' + busyText));
        } else {
            els.dl.appendChild(icon('fas fa-download'));
            els.dl.appendChild(document.createTextNode(' ' + t('download_button')));
        }
    }

    function showVerify(on) {
        els.verify.classList.toggle('ow-show', !!on);
    }

    // ---- Offers area (only drawn once the visitor has tapped Download Now) ----
    function drawTasks() {
        if (!state.revealed) return;
        els.tasks.textContent = '';
        showVerify(!!(state.offers && state.offers.length && !state.loading && !state.error));
        if (state.loading || (!state.offers && !state.error)) {
            var l = el('div', 'ow-loading');
            l.appendChild(el('div', 'ow-spin'));
            l.appendChild(el('span', null, t('loading_offers')));
            els.tasks.appendChild(l);
            return;
        }
        if (state.error || !state.offers.length) {
            var box = el('div', 'ow-loading');
            box.appendChild(el('span', null, state.error || t('no_offers')));
            var retry = el('button', 'ow-retry', t('retry_button'));
            retry.type = 'button';
            retry.addEventListener('click', load);
            box.appendChild(retry);
            els.tasks.appendChild(box);
            return;
        }
        state.offers.forEach(function (o) {
            var a = el('a', 'ow-task', o.anchor);
            a.dir = 'auto';
            a.href = o.url;
            a.target = '_blank';
            a.rel = 'noopener';
            if (o.conversion) a.title = o.conversion;
            a.addEventListener('click', function () {
                a.classList.add('ow-clicked');
                state.clicked = true;
                track('offer_click', { offer_id: o.id, offer_name: o.name || o.anchor });
                setMsg(t('after_click'));
                startPolling();
            });
            els.tasks.appendChild(a);
        });
        if (!state.impressionsSent) {
            state.impressionsSent = true;
            state.offers.forEach(function (o) {
                if (o.impression_url) { var px = new Image(); px.referrerPolicy = 'no-referrer'; px.src = o.impression_url; }
            });
        }
    }

    function reveal() {
        state.revealed = true;
        showDownloadButton(false);
        els.offersBox.classList.add('ow-show');
        setMsg(state.clicked ? t('after_click') : '');
        drawTasks();
        if (!state.offers && !state.loading) load();
        // keep checking for the postback while the offers are on screen
        if (state.token) startPolling();
        // bring the steps into view on small screens
        try { els.offersBox.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (e) {}
    }

    function linkFor(downloads) {
        var d = downloads || {};
        return d[state.platform === 'ios' ? 'ios' : 'android'] || d.android || d.ios || '';
    }

    function renderUnlocked(downloads, justCompleted) {
        stopPolling();
        state.unlocked = downloads || {};
        setNote(true);
        els.offersBox.classList.remove('ow-show');
        showVerify(false);
        setDlBusy(false);
        showDownloadButton(true);
        var want = state.platform === 'ios' ? 'ios' : 'android';
        var other = want === 'ios' ? 'android' : 'ios';
        var link = linkFor(state.unlocked);

        if (!link) {
            setMsg(t('link_missing'), 'ow-warn');
        } else if (justCompleted && !state.autoStarted) {
            state.autoStarted = true;
            track('offer_completed');
            track('game_download');
            setMsg(t('download_starting'), 'ow-ok');
            setTimeout(function () { window.location.href = link; }, 900);
        } else if (!state.unlocked[want]) {
            setMsg(t('not_available'));
        } else {
            setMsg('');
        }
        if (state.unlocked[want] && state.unlocked[other]) {
            els.alt.href = state.unlocked[other];
            els.alt.textContent = t('other_platform');
            els.alt.style.display = '';
        } else {
            els.alt.style.display = 'none';
        }
    }

    function onDownloadClick(e) {
        e.preventDefault();
        if (els.dl.classList.contains('ow-busy')) return;
        if (state.unlocked) {
            var link = linkFor(state.unlocked);
            if (!link) {
                setMsg(t('link_missing'), 'ow-warn');
                return;
            }
            setDlBusy(t('starting_button'));
            track('game_download');
            setTimeout(function () {
                window.location.href = link;
                setTimeout(function () { setDlBusy(false); }, 2500);
            }, 700);
            return;
        }
        // Short loading state, then show the steps and offers (waits for the feed if it is still loading)
        track('offer_wall_download_click');
        setDlBusy(t('loading_button'));
        var started = Date.now();
        (function waitForOffers() {
            var ready = !state.loading && (state.offers || state.error);
            if (Date.now() - started >= 1200 && (ready || Date.now() - started > 6000)) {
                setDlBusy(false);
                reveal();
            } else {
                setTimeout(waitForOffers, 150);
            }
        })();
    }

    function saveToken(token) {
        state.token = token;
        try { localStorage.setItem(storeKey, JSON.stringify({ token: token, ts: Date.now() })); } catch (e) {}
    }

    function loadToken() {
        try {
            var v = JSON.parse(localStorage.getItem(storeKey) || 'null');
            if (v && v.token && Date.now() - v.ts < TOKEN_TTL_MS) return v.token;
        } catch (e) {}
        return null;
    }

    // Fetch offers in the background as soon as the popup opens, so they show instantly on tap
    function load() {
        if (state.loading) return;
        state.loading = true;
        state.error = null;
        drawTasks();
        var token = state.token || loadToken();
        var url = '/api/offers/' + encodeURIComponent(slug) + (token ? '?token=' + encodeURIComponent(token) : '');
        fetch(url, { headers: { 'Accept': 'application/json' }, credentials: 'same-origin' })
            .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
            .then(function (res) {
                state.loading = false;
                if (!res.ok) { state.error = (res.d && res.d.error) || 'Could not load offers right now.'; drawTasks(); return; }
                saveToken(res.d.token);
                if (res.d.completed) { if (state.open) renderUnlocked(res.d.downloads, false); else state.unlocked = res.d.downloads || {}; return; }
                state.offers = res.d.offers || [];
                drawTasks();
                if (token && token === res.d.token) startPolling();
            })
            .catch(function () {
                state.loading = false;
                state.error = 'Could not reach the server. Check your connection and try again.';
                drawTasks();
            });
    }

    function checkStatus() {
        if (!state.token || state.unlocked) return;
        fetch('/api/offers/status/' + encodeURIComponent(state.token), { headers: { 'Accept': 'application/json' }, credentials: 'same-origin' })
            .then(function (r) { return r.ok ? r.json() : null; })
            .then(function (d) {
                if (d && d.completed && state.open) renderUnlocked(d.downloads, true);
                else if (d && d.completed) state.unlocked = d.downloads || {};
            })
            .catch(function () {});
    }

    function startPolling() {
        if (state.pollTimer) return;
        state.pollStarted = Date.now();
        state.pollTimer = setInterval(function () {
            if (Date.now() - state.pollStarted > POLL_MAX_MS) { stopPolling(); return; }
            if (document.visibilityState === 'visible') checkStatus();
        }, POLL_MS);
    }

    function stopPolling() {
        if (state.pollTimer) clearInterval(state.pollTimer);
        state.pollTimer = null;
    }

    function show(platform) {
        state.platform = platform === 'ios' ? 'ios' : 'android';
        track('download_button_click');
        configReady.then(function () { open(); });
    }

    /** Fill every admin-editable string (some depend on the chosen platform) */
    function applyTexts() {
        els.title.textContent = t('title');
        els.platformLabel.textContent = t('subtitle');
        els.platformLabel.parentNode.style.display = els.platformLabel.textContent ? '' : 'none';
        if (els.badge) els.badge.textContent = t('badge_text');
        els.steps.textContent = '';
        ['step1', 'step2', 'step3'].forEach(function (k) { if (t(k)) els.steps.appendChild(el('li', null, t(k))); });
        els.steps.style.display = els.steps.children.length ? '' : 'none';
        els.verifyText.textContent = t('verify_text');
        if (!els.dl.classList.contains('ow-busy')) setDlBusy(false);
    }

    /**
     * Pin the popup to the part of the page the visitor can actually see. On phones, if anything
     * on the page is wider than the screen (e.g. a long link in a review), the browser widens the
     * page and a plain full-screen overlay would be centred off to the side.
     */
    function fitOverlay() {
        if (!els.overlay || !state.open) return;
        var vv = window.visualViewport;
        var s = els.overlay.style;
        if (vv && (Math.abs(window.innerWidth - vv.width) > 2 || Math.abs(window.innerHeight - vv.height) > 2)) {
            s.left = vv.offsetLeft + 'px';
            s.top = vv.offsetTop + 'px';
            s.width = vv.width + 'px';
            s.height = vv.height + 'px';
            s.right = 'auto';
            s.bottom = 'auto';
        } else {
            s.left = s.top = s.width = s.height = s.right = s.bottom = '';
        }
    }

    function open() {
        build();
        applyTexts();
        state.open = true;
        els.overlay.classList.add('ow-open');
        fitOverlay();
        els.overlay.scrollTop = 0;
        document.body.classList.add('ow-lock');
        if (state.unlocked) { renderUnlocked(state.unlocked, false); return; }
        setNote(false);
        // Start with only the Download Now button; offers appear when it is tapped
        state.revealed = false;
        els.offersBox.classList.remove('ow-show');
        showDownloadButton(true);
        setMsg('');
        if (!state.offers && !state.loading) load();
        else if (state.clicked) startPolling();
    }

    function hide() {
        state.open = false;
        stopPolling();
        if (els.overlay) els.overlay.classList.remove('ow-open');
        document.body.classList.remove('ow-lock');
    }

    // Keep the old name so the existing "Get for Android / iOS" buttons work unchanged
    window.showContentLocker = show;
    window.showOffersWall = show;
})();
