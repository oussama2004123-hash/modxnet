require('dotenv').config();
const express = require('express');
const session = require('express-session');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');
const path = require('path');
const {
  db,
  findUserById, findUserByEmail, findUserByGoogleId, createUser, updateUserAvatar, updateUserProfile, updateUserByAdmin, markWelcomeEmailSent, linkGoogleIdForUser, getHelpFaqs,
  getReviewsByGame, createReview, userReviewExists,
  getCommentsByGame, createComment,
  analyzeSentiment, cleanupExpired,
  getAllGames, getAllGamesAdmin, getTrashedGames, getGameBySlug, getGameById, insertGame, updateGame, softDeleteGame, restoreGame, permanentDeleteGame,
  getAllAdblue, getAdblueBySlug, upsertAdblue, deleteAdblue,
  getConfig, setConfig, getAllConfig,
  getAllUsers, deleteUser, getAllReviews, getAllComments, deleteReview, deleteComment,
  findUserByUsername, getReviewCountByGame, getCommentCountByGame,
  createReviewWithDate, createCommentWithDate
} = require('./database');
const multer = require('multer');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3334;
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || '';

/** Gmail for SMTP + contact inbox (override with SMTP_EMAIL / CONTACT_RECEIVE_EMAIL in .env or host vars) */
const DEFAULT_SUPPORT_EMAIL = 'modxnet.support@gmail.com';
const SMTP_USER = String(process.env.SMTP_EMAIL || DEFAULT_SUPPORT_EMAIL).trim();
const CONTACT_INBOX = String(process.env.CONTACT_RECEIVE_EMAIL || SMTP_USER).trim();

function getSiteBaseUrl(req) {
  const env = (process.env.SITE_URL || '').trim().replace(/\/+$/, '');
  if (env) return env;
  const host = req.get('host');
  if (!host) return 'https://modxnet.com';
  const proto = (req.protocol === 'http' && (process.env.NODE_ENV === 'production' || process.env.RAILWAY_ENVIRONMENT)) ? 'https' : req.protocol;
  return proto + '://' + host;
}

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Site URL for outbound email links when no request (uses SITE_URL or modxnet.com). */
function getPublicBaseUrl() {
  const env = (process.env.SITE_URL || '').trim().replace(/\/+$/, '');
  if (env) return env;
  return 'https://modxnet.com';
}

/** Default broadcast templates (admin can edit). Use {{username}} and {{siteUrl}} (no trailing slash). */
function getComebackEmailDefaults() {
  const html =
    '<div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;color:#1a1a1a;line-height:1.55;font-size:16px;">' +
    '<p style="margin:0 0 18px;font-size:17px;">Hey {{username}},</p>' +
    '<p style="margin:0 0 14px;">We noticed you haven\'t visited <strong>ModXNet</strong> in a while — and we get it, life gets busy.</p>' +
    '<p style="margin:0 0 16px;font-weight:600;">But here\'s what you\'ve been missing:</p>' +
    '<ul style="margin:0 0 20px;padding-left:20px;">' +
    '<li style="margin-bottom:8px;">🔥 <strong>GTA V Mobile</strong> — Full open world, now in your pocket</li>' +
    '<li style="margin-bottom:8px;">🏎️ <strong>Forza Horizon 5 Mobile</strong> — Stunning graphics on Android</li>' +
    '<li style="margin-bottom:8px;">🚗 <strong>Assetto Corsa Mobile</strong> — The most realistic racing experience on mobile</li>' +
    '<li style="margin-bottom:8px;">🚛 <strong>Euro Truck Simulator 2 Mobile</strong> — Chill and drive anywhere</li>' +
    '</ul>' +
    '<p style="margin:0 0 12px;">All free. All available right now on <strong>ModXNet</strong>.</p>' +
    '<p style="margin:0 0 24px;">These aren\'t basic mobile games — they\'re the full PC experience, optimized for Android.</p>' +
    '<p style="margin:0 0 28px;text-align:center;">' +
    '<a href="{{siteUrl}}/" style="display:inline-block;padding:14px 32px;background:linear-gradient(135deg,#00ffcc,#00c4a7);color:#0a0a0a;font-weight:700;border-radius:12px;text-decoration:none;font-size:16px;">Download now — visit ModXNet</a>' +
    '</p>' +
    '<p style="margin:0;font-size:15px;color:#333;">See you on the road,<br><strong>The ModXNet Team</strong></p>' +
    '</div>';
  const text =
    'Hey {{username}},\n\n' +
    'We noticed you haven\'t visited ModXNet in a while — and we get it, life gets busy.\n\n' +
    'But here\'s what you\'ve been missing:\n\n' +
    '• GTA V Mobile — Full open world, now in your pocket\n' +
    '• Forza Horizon 5 Mobile — Stunning graphics on Android\n' +
    '• Assetto Corsa Mobile — The most realistic racing experience on mobile\n' +
    '• Euro Truck Simulator 2 Mobile — Chill and drive anywhere\n\n' +
    'All free. All available right now on ModXNet.\n\n' +
    'These aren\'t basic mobile games — they\'re the full PC experience, optimized for Android.\n\n' +
    'Download now: {{siteUrl}}/\n\n' +
    'See you on the road,\nThe ModXNet Team';
  return {
    subject: 'We miss you on ModXNet — come back for free games',
    html,
    text
  };
}

function applyComebackSubjectTemplate(template, username) {
  const name = (username || 'there').trim() || 'there';
  return String(template || '').replace(/\{\{username\}\}/g, name).slice(0, 500);
}

function applyComebackHtmlTemplate(template, username, siteBase) {
  const name = (username || 'there').trim() || 'there';
  const base = String(siteBase || getPublicBaseUrl()).replace(/\/+$/, '');
  return String(template || '')
    .replace(/\{\{username\}\}/g, escapeHtml(name))
    .replace(/\{\{siteUrl\}\}/g, escapeHtml(base));
}

function applyComebackTextTemplate(template, username, siteBase) {
  const name = (username || 'there').trim() || 'there';
  const base = String(siteBase || getPublicBaseUrl()).replace(/\/+$/, '');
  return String(template || '')
    .replace(/\{\{username\}\}/g, name)
    .replace(/\{\{siteUrl\}\}/g, base);
}

/** Fallback plain text when admin leaves text body empty. */
function crudeHtmlToText(html) {
  return String(html || '')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function upsertHeadTag(html, tagName, attrs, innerText) {
  // For <title> use innerText, others are self-closing-like tags
  if (tagName === 'title') {
    const titleRe = /<title>[\s\S]*?<\/title>/i;
    const safe = `<title>${escapeHtml(innerText || '')}</title>`;
    if (titleRe.test(html)) return html.replace(titleRe, safe);
    return html.replace(/<\/head>/i, safe + '\n</head>');
  }

  const attrString = Object.entries(attrs || {})
    .map(([k, v]) => ` ${k}="${escapeHtml(v)}"`)
    .join('');
  const tagHtml = `<${tagName}${attrString}>`;

  // Match same tag by name + key attrs (name/rel/property)
  let selectorRe = null;
  if (tagName === 'meta' && attrs && attrs.name) {
    selectorRe = new RegExp(`<meta[^>]*\\sname=["']${attrs.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["'][^>]*>`, 'i');
  } else if (tagName === 'link' && attrs && attrs.rel) {
    selectorRe = new RegExp(`<link[^>]*\\srel=["']${attrs.rel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["'][^>]*>`, 'i');
  }

  if (selectorRe && selectorRe.test(html)) return html.replace(selectorRe, tagHtml);
  return html.replace(/<\/head>/i, tagHtml + '\n</head>');
}

function injectSeoTags({ html, title, description, keywords, canonical }) {
  let out = html;
  out = upsertHeadTag(out, 'title', null, title);
  out = upsertHeadTag(out, 'meta', { name: 'description', content: description }, null);
  out = upsertHeadTag(out, 'meta', { name: 'keywords', content: keywords }, null);
  out = upsertHeadTag(out, 'link', { rel: 'canonical', href: canonical }, null);
  return out;
}

/**
 * Build star-rating HTML for a game card (server-side mirror of client buildStarsListHtml).
 */
function buildStarsHtml(rating) {
  const r = typeof rating === 'number' ? rating : parseFloat(rating) || 0;
  let s = '';
  let full = Math.floor(r);
  const frac = r % 1;
  const half = frac >= 0.25 && frac < 0.75;
  if (frac >= 0.75) full++;
  for (let i = 0; i < full; i++) s += '<i class="fas fa-star"></i>';
  if (half) s += '<i class="fas fa-star-half-alt"></i>';
  for (let j = full + (half ? 1 : 0); j < 5; j++) s += '<i class="far fa-star"></i>';
  return s;
}

/**
 * Render the <div class="games-container view-grid">…</div> block from DB rows.
 * Replaces any existing static cards in the HTML so the page always reflects the database.
 */
function injectGameCards(html) {
  try {
    const games = getAllGames.all();
    if (!games || !games.length) return html;

    const esc = s => String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    let cards = '';
    for (const g of games) {
      const r = typeof g.rating === 'number' ? g.rating : parseFloat(g.rating) || 0;
      cards += `
      <div class="game-card" data-game="${esc(g.data_game)}" data-link="${esc(g.link)}" data-category="${esc(g.category)}" data-rating="${r}">
        <img src="${esc(g.image_url)}" alt="${esc(g.title)}" class="game-icon" loading="lazy">
        <div class="game-info">
          <div class="game-title">${esc(g.title)}</div>
          <div class="game-meta"><span>${esc(g.version)}</span><span class="meta-dot">&middot;</span><span>${esc(g.release_date)}</span></div>
          <div class="game-rating">${buildStarsHtml(r)}<span class="rating-num">${r.toFixed(1)}</span></div>
        </div>
        <i class="fas fa-chevron-right game-arrow"></i>
      </div>`;
    }

    const containerHtml = `<div class="games-container view-grid">${cards}\n    </div>`;

    // Replace the existing static container (greedy match between opening and closing div)
    const re = /<div\s+class="games-container\s+view-grid"[\s\S]*?<\/div>\s*(?=\s*(?:<!--|\n\s*<(?:a |section|\/section)))/i;
    if (re.test(html)) {
      return html.replace(re, containerHtml);
    }
    return html;
  } catch (e) {
    return html;
  }
}

// ========== HEALTH CHECK (must be first, before any middleware) ==========
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', uptime: process.uptime() });
});

// ========== MIDDLEWARE ==========
const isProduction = process.env.NODE_ENV === 'production' || process.env.RAILWAY_ENVIRONMENT;

// Trust reverse proxy (Cloudflare, Nginx, Railway) for correct req.protocol and client IP
app.set('trust proxy', 1);

app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));

app.use(session({
  secret: process.env.SESSION_SECRET || 'modxnet-fallback-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: isProduction,  // true on Railway (HTTPS), false on localhost
    httpOnly: true,
    sameSite: isProduction ? 'lax' : 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
  }
}));

app.use(passport.initialize());
app.use(passport.session());

// ========== PASSPORT CONFIG ==========
passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser((id, done) => {
  try {
    const user = findUserById.get(id);
    done(null, user || null);
  } catch (err) {
    done(err, null);
  }
});

// Google OAuth — redirect_uri must match Google Cloud Console "Authorized redirect URIs" exactly.
// Build from each request's Host (with trust proxy) so prod is never stuck on localhost from .env.
function getGoogleOAuthCallbackUrl(req) {
  let host = req.get('host');
  if (host && host.includes('127.0.0.1')) {
    host = host.replace('127.0.0.1', 'localhost');
  }
  if (!host) {
    const base = (process.env.SITE_URL || '').trim().replace(/\/+$/, '') || ('http://localhost:' + PORT);
    return base + '/api/auth/google/callback';
  }
  let proto = req.protocol || 'https';
  if (proto === 'http' && isProduction) {
    proto = 'https';
  }
  return proto + '://' + host + '/api/auth/google/callback';
}

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  // Real URI is passed on each passport.authenticate(..., { callbackURL }) call
  callbackURL: 'http://localhost:' + PORT + '/api/auth/google/callback',
  proxy: isProduction
}, (accessToken, refreshToken, profile, done) => {
  try {
    // Check if user already exists with this Google ID
    let user = findUserByGoogleId.get(profile.id);
    if (user) return done(null, user);

    // Check if user exists with same email
    const email = profile.emails && profile.emails[0] ? profile.emails[0].value : '';
    if (email) {
      user = findUserByEmail.get(email);
      if (user) {
        if (profile.id && (!user.google_id || String(user.google_id).trim() === '')) {
          linkGoogleIdForUser.run(profile.id, user.id);
          user = findUserById.get(user.id);
        }
        return done(null, user);
      }
    }

    // Create new user
    const result = createUser.run({
      username: profile.displayName || email.split('@')[0],
      email: email,
      password_hash: null,
      google_id: profile.id,
      avatar_url: profile.photos && profile.photos[0] ? profile.photos[0].value : ''
    });

    user = findUserById.get(result.lastInsertRowid);
    done(null, user);
  } catch (err) {
    done(err, null);
  }
}));
} else {
  console.warn('WARNING: GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET not set. Google OAuth disabled.');
}

// Admin account — only this email (Google or local login) can use /admin and /api/admin/*
const ADMIN_EMAIL = String(process.env.ADMIN_EMAIL || 'modxnet.support@gmail.com').trim().toLowerCase();

function isAdminEmail(email) {
  return String(email || '').trim().toLowerCase() === ADMIN_EMAIL;
}

// Auth middleware helper
function requireAuth(req, res, next) {
  if (req.isAuthenticated()) return next();
  res.status(401).json({ error: 'You must be logged in' });
}

// ========== AUTH ROUTES ==========
/** Set ALLOW_LOCAL_AUTH=1 in .env to re-enable email/password register & login (e.g. local dev). */
const GOOGLE_ONLY_AUTH = process.env.ALLOW_LOCAL_AUTH !== '1';

app.get('/api/auth/config', (req, res) => {
  res.json({
    googleOnly: GOOGLE_ONLY_AUTH,
    googleOAuthEnabled: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)
  });
});

// Google OAuth
app.get('/api/auth/google', (req, res, next) => {
  const callbackURL = getGoogleOAuthCallbackUrl(req);
  passport.authenticate('google', { scope: ['profile', 'email'], callbackURL })(req, res, next);
});

app.get('/api/auth/google/callback',
  (req, res, next) => {
    const callbackURL = getGoogleOAuthCallbackUrl(req);
    passport.authenticate('google', { failureRedirect: '/?login=failed', callbackURL })(req, res, next);
  },
  async (req, res) => {
    const returnTo = req.session.returnTo || '/';
    delete req.session.returnTo;
    const uid = req.user && req.user.id;
    try {
      if (uid) await sendWelcomeEmailIfNeeded(uid);
    } catch (e) {
      console.error('[welcome-email] Google callback error:', e && e.message);
    }
    res.redirect(returnTo);
  }
);

// Email/Password Registration
app.post('/api/auth/register', async (req, res) => {
  try {
    if (GOOGLE_ONLY_AUTH) {
      return res.status(403).json({
        error: 'Registration with email and password is disabled. Please use Sign in with Google.',
        googleOnly: true
      });
    }
    const { username, email, password, avatar_url } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ error: 'All fields are required' });
    }
    if (username.length < 2) {
      return res.status(400).json({ error: 'Username must be at least 2 characters' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    // Check if email already exists
    const existing = findUserByEmail.get(email);
    if (existing) {
      return res.status(400).json({ error: 'An account with this email already exists' });
    }

    // Hash password and create user
    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(password, salt);

    const result = createUser.run({
      username,
      email,
      password_hash: hash,
      google_id: null,
      avatar_url: avatar_url || ''
    });

    const user = findUserById.get(result.lastInsertRowid);

    // Log user in immediately
    req.login(user, (err) => {
      if (err) return res.status(500).json({ error: 'Registration succeeded but auto-login failed' });
      void sendWelcomeEmailIfNeeded(user.id);
      res.json({
        success: true,
        user: { id: user.id, username: user.username, email: user.email, avatar_url: user.avatar_url }
      });
    });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Server error during registration' });
  }
});

// Email/Password Login
app.post('/api/auth/login', async (req, res) => {
  try {
    if (GOOGLE_ONLY_AUTH) {
      return res.status(403).json({
        error: 'Email/password sign-in is disabled. Please use Sign in with Google.',
        googleOnly: true
      });
    }
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const user = findUserByEmail.get(email);
    if (!user || !user.password_hash) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    req.login(user, (err) => {
      if (err) return res.status(500).json({ error: 'Login failed' });
      void sendWelcomeEmailIfNeeded(user.id);
      res.json({
        success: true,
        user: { id: user.id, username: user.username, email: user.email, avatar_url: user.avatar_url }
      });
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Server error during login' });
  }
});

// Get current user
app.get('/api/auth/me', (req, res) => {
  if (req.isAuthenticated()) {
    const u = req.user;
    res.json({
      loggedIn: true,
      user: { id: u.id, username: u.username, email: u.email, avatar_url: u.avatar_url },
      isAdmin: isAdminEmail(u.email)
    });
  } else {
    res.json({ loggedIn: false });
  }
});

// Logout
app.post('/api/auth/logout', (req, res) => {
  req.logout(() => {
    req.session.destroy();
    res.json({ success: true });
  });
});

// ========== USER PROFILE ==========

// Avatar upload for users
const avatarUploadDir = path.join(process.env.UPLOAD_DIR || path.join(__dirname, 'uploads'), 'avatars');
if (!fs.existsSync(avatarUploadDir)) fs.mkdirSync(avatarUploadDir, { recursive: true });

const avatarStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, avatarUploadDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, 'avatar-' + req.user.id + '-' + Date.now() + ext);
  }
});
const avatarUpload = multer({
  storage: avatarStorage,
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (/\.(jpg|jpeg|png|gif|webp)$/i.test(file.originalname)) cb(null, true);
    else cb(new Error('Only image files are allowed'));
  }
});

// Upload avatar
app.post('/api/auth/avatar', requireAuth, avatarUpload.single('avatar'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No image uploaded' });
    const url = '/uploads/avatars/' + req.file.filename;
    updateUserAvatar.run(url, req.user.id);
    req.user.avatar_url = url;
    res.json({ success: true, avatar_url: url });
  } catch (err) {
    res.status(500).json({ error: 'Failed to upload avatar' });
  }
});

// Update avatar (from random selection or URL)
app.put('/api/auth/avatar', requireAuth, (req, res) => {
  try {
    const { avatar_url } = req.body;
    if (!avatar_url) return res.status(400).json({ error: 'Avatar URL is required' });
    updateUserAvatar.run(avatar_url, req.user.id);
    req.user.avatar_url = avatar_url;
    res.json({ success: true, avatar_url });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update avatar' });
  }
});

// Update profile (username + avatar)
app.put('/api/auth/profile', requireAuth, (req, res) => {
  try {
    const { username, avatar_url } = req.body;
    if (!username || username.trim().length < 2) return res.status(400).json({ error: 'Username must be at least 2 characters' });
    updateUserProfile.run({
      id: req.user.id,
      username: username.trim(),
      avatar_url: avatar_url || req.user.avatar_url || ''
    });
    req.user.username = username.trim();
    if (avatar_url !== undefined) req.user.avatar_url = avatar_url;
    res.json({
      success: true,
      user: { id: req.user.id, username: req.user.username, email: req.user.email, avatar_url: req.user.avatar_url }
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// Admin: update any user
app.put('/api/admin/users/:id', requireAdmin, (req, res) => {
  try {
    const { username, email, avatar_url } = req.body;
    if (!username || !email) return res.status(400).json({ error: 'Username and email are required' });
    updateUserByAdmin.run({
      id: parseInt(req.params.id),
      username: username.trim(),
      email: email.trim(),
      avatar_url: avatar_url || ''
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update user' });
  }
});

// ========== CONTACT FORM ==========
// Gmail SMTP — force IPv4 (Railway doesn't support IPv6 outbound)
const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,
  family: 4,
  auth: {
    user: SMTP_USER,
    pass: process.env.SMTP_APP_PASSWORD
  },
  tls: {
    rejectUnauthorized: false
  },
  connectionTimeout: 10000,
  greetingTimeout: 10000,
  socketTimeout: 15000
});

// Verify SMTP connection on startup
console.log(`Contact form mail: from <${SMTP_USER}> → to <${CONTACT_INBOX}>`);
transporter.verify()
  .then(() => console.log('SMTP connection verified (port 587) - contact form ready'))
  .catch(err => console.error('SMTP connection FAILED:', err.code, err.message));

/** One-time welcome email after sign-in (not shown on site). Set WELCOME_EMAIL_ALWAYS=1 to send on every login (testing; does not update DB flag). */
async function sendWelcomeEmailIfNeeded(userId) {
  const alwaysSend = process.env.WELCOME_EMAIL_ALWAYS === '1';
  try {
    const row = findUserById.get(userId);
    if (!row || !String(row.email || '').trim()) {
      console.warn('[welcome-email] skip: no user/email for id', userId);
      return;
    }
    const toAddr = String(row.email).trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(toAddr)) {
      console.warn('[welcome-email] skip: invalid email', toAddr);
      return;
    }

    const sentFlag = row.welcome_email_sent;
    const alreadySent = sentFlag === 1 || sentFlag === true || Number(sentFlag) === 1;
    if (alreadySent && !alwaysSend) {
      console.log('[welcome-email] skip: already sent to', toAddr);
      return;
    }

    if (!process.env.SMTP_APP_PASSWORD || !String(process.env.SMTP_APP_PASSWORD).trim()) {
      console.error('[welcome-email] skip: SMTP_APP_PASSWORD is missing — cannot send mail');
      return;
    }

    const name = String(row.username || 'there').trim();
    const safeName = escapeHtml(name);
    const html = `
      <div style="font-family:Georgia,Times,serif;max-width:600px;margin:0 auto;color:#222;line-height:1.55;">
        <p style="font-size:17px;margin-bottom:16px;">Dear <strong>${safeName}</strong>, thank you for joining our community. We are pleased to have you with us.</p>
        <p style="font-size:16px;">Every title in our catalog is offered <strong>at no cost</strong> to you. Below is a short, step-by-step guide to obtaining your download smoothly.</p>
        <div style="margin:24px 0;padding:20px;background:#f6f9fc;border-radius:10px;border:1px solid #e2e8f0;">
          <h2 style="margin:0 0 14px;font-size:18px;color:#0d9488;">How to download — tutorial</h2>
          <ol style="margin:0;padding-left:22px;font-size:15px;">
            <li style="margin-bottom:10px;">Open the game you want on ModXnet and select the <strong>Download</strong> button.</li>
            <li style="margin-bottom:10px;">When prompted, choose any offer from the list that appears.</li>
            <li style="margin-bottom:10px;">Start the selected offer and complete it as instructed (for example: install a suggested application and use it for about 30 seconds).</li>
            <li style="margin-bottom:10px;">Return to ModXnet, keep the site open, and remain on the page for approximately 30 seconds so our system can verify completion.</li>
            <li style="margin-bottom:10px;">Your download will begin or unlock automatically once the offer is confirmed.</li>
          </ol>
        </div>
        <p style="font-size:15px;color:#444;">If anything is unclear, use the <strong>Help</strong> button on the website for common questions, or contact us via the form. Enjoy your games responsibly.</p>
        <p style="margin-top:28px;font-size:13px;color:#888;">— ModXnet</p>
      </div>`;

    const text =
      `Dear ${name},\n\n` +
      'Thank you for joining ModXnet. Every title in our catalog is offered at no cost to you.\n\n' +
      'How to download:\n' +
      '1) Open the game on ModXnet and tap Download.\n' +
      '2) Choose an offer from the list.\n' +
      '3) Complete the offer (e.g. install an app and use it ~30 seconds).\n' +
      '4) Return to ModXnet, keep the site open ~30 seconds for verification.\n' +
      '5) Your download unlocks when the offer is confirmed.\n\n' +
      'Use the Help button on the site for common questions, or the contact form if you need help.\n\n' +
      '— ModXnet';

    console.log('[welcome-email] sending from', SMTP_USER, '→', toAddr, '(user id', userId + ')');
    const info = await transporter.sendMail({
      from: `"ModXnet" <${SMTP_USER}>`,
      to: toAddr,
      replyTo: CONTACT_INBOX,
      subject: 'Welcome to ModXnet — your download guide',
      text,
      html
    });
    console.log('[welcome-email] sent OK, messageId:', info && info.messageId);
    if (!alwaysSend) markWelcomeEmailSent.run(userId);
  } catch (err) {
    console.error('[welcome-email] FAILED:', err.code || '', err.message, err.response || '');
  }
}

/** Translate contact message to professional English for the inbox (server-side only). */
async function translateContactMessageForInbox(text) {
  if (!DEEPSEEK_API_KEY || !text) return null;
  try {
    const prompt = `You are assisting ModXnet support. Translate the following customer message into clear, professional English.
Output ONLY the translated text. No quotes or notes. Preserve names, emails, and URLs exactly as given.\n\n${String(text).slice(0, 8000)}`;
    const aiRes = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + DEEPSEEK_API_KEY },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.2,
        max_tokens: 4000
      })
    });
    if (!aiRes.ok) return null;
    const aiData = await aiRes.json();
    const out = (aiData.choices?.[0]?.message?.content || '').trim();
    return out || null;
  } catch (err) {
    console.error('Contact translation (DeepSeek):', err.message);
    return null;
  }
}

/** English bundle for help chat — keep in sync with HELP_CHAT_EN in script.js */
const HELP_CHAT_EN_BUNDLE = {
  title: 'Download helper',
  greeting: 'Hi! I’m here to help with downloads. Below are the three questions we get the most — tap one and I’ll reply instantly.',
  quickLabel: 'Most asked',
  composerHint: 'Tap a question in the chat to reply',
  subLead: 'All games on ModXnet are free.',
  subTail: 'Pick one of the most asked questions below.',
  items: [
    {
      question: 'How do I download a game?',
      answer: 'Open the game’s page on ModXnet and tap Download. Pick an offer from the list and complete it (for example: install the suggested app and use it for about 30 seconds). Return to ModXnet, keep the tab open on the site for roughly 30 seconds, and your download will unlock or start automatically once the offer is verified. All games on ModXnet are free for you—the offers support the platform.'
    },
    {
      question: 'Are ModXnet games really free?',
      answer: 'Yes. Every game in our catalog is free for you to unlock. You may need to complete a short third‑party offer first; that is how we keep the service free for everyone.'
    },
    {
      question: 'I finished the offer but nothing happens — what now?',
      answer: 'Make sure you returned to the same browser tab on ModXnet, disabled strict blockers if needed, and waited at least 30 seconds on the page. Try completing another offer from the list if the first one did not register. If it still fails, use the contact form and we will help.'
    }
  ]
};

const helpChatLocalizeCache = new Map();
const HELP_CHAT_LOCALIZE_CACHE_MAX = 250;

function normalizeHelpChatLang(raw) {
  if (!raw || typeof raw !== 'string') return '';
  const s = raw.trim().toLowerCase();
  if (!/^[a-z]{2}([-a-z0-9]+)?$/.test(s)) return '';
  return s.length > 2 ? s.slice(0, 2) : s;
}

function helpChatLangEnglishName(code) {
  try {
    const c = code.split('-')[0];
    const dn = new Intl.DisplayNames(['en'], { type: 'language' });
    return dn.of(c) || code;
  } catch {
    return code;
  }
}

function stripAiJsonFence(text) {
  let t = String(text || '').trim();
  if (t.startsWith('```')) {
    t = t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '');
  }
  return t.trim();
}

function isValidHelpChatBundle(o) {
  if (!o || typeof o !== 'object') return false;
  if (typeof o.title !== 'string' || typeof o.greeting !== 'string' || typeof o.quickLabel !== 'string' || typeof o.composerHint !== 'string') return false;
  if (typeof o.subLead !== 'string' || typeof o.subTail !== 'string') return false;
  if (!Array.isArray(o.items) || o.items.length !== 3) return false;
  return o.items.every((it) => it && typeof it.question === 'string' && typeof it.answer === 'string');
}

async function translateHelpChatBundleToLang(targetLang) {
  if (!DEEPSEEK_API_KEY) return null;
  const langName = helpChatLangEnglishName(targetLang);
  const payload = JSON.stringify(HELP_CHAT_EN_BUNDLE);
  const prompt = `You translate ModXnet customer support UI strings. Target language: ${langName} (ISO code: ${targetLang}).
Translate every string value to natural, fluent ${langName}. Keep the brand name "ModXnet" unchanged. Keep time hints like "30 seconds" accurate in the target language.
Output ONLY valid JSON with exactly these keys: title, greeting, quickLabel, composerHint, subLead, subTail, items (array of 3 objects with question and answer). No markdown, no code fences, no commentary.
\n${payload}`;

  const aiRes = await fetch('https://api.deepseek.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + DEEPSEEK_API_KEY },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2,
      max_tokens: 4000
    })
  });
  if (!aiRes.ok) return null;
  const aiData = await aiRes.json();
  const raw = (aiData.choices?.[0]?.message?.content || '').trim();
  let parsed;
  try {
    parsed = JSON.parse(stripAiJsonFence(raw));
  } catch {
    return null;
  }
  return isValidHelpChatBundle(parsed) ? parsed : null;
}

app.post('/api/contact', async (req, res) => {
  try {
    const { name, email, message } = req.body;

    // Validation
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Name is required' });
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Valid email is required' });
    }
    if (!message || message.trim().length < 10) {
      return res.status(400).json({ error: 'Message must be at least 10 characters' });
    }

    const rawName = name.trim();
    const rawEmail = email.trim();
    const rawMsg = message.trim();
    const safeName = escapeHtml(rawName);
    const safeEmail = escapeHtml(rawEmail);
    const safeMsg = escapeHtml(rawMsg);

    let translatedBlock = '';
    const translated = await translateContactMessageForInbox(rawMsg);
    if (translated) {
      translatedBlock = `
          <h3 style="margin-top:20px;color:#0d9488;">Professional English (for support)</h3>
          <div style="background:#e8faf8;padding:15px;border-radius:8px;border:1px solid #b2dfdb;white-space:pre-wrap;">${escapeHtml(translated)}</div>`;
    }

    await transporter.sendMail({
      from: `"ModXnet Contact" <${SMTP_USER}>`,
      to: CONTACT_INBOX,
      replyTo: rawEmail,
      subject: `ModXnet Contact: ${rawName}`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
          <h2 style="color:#00ffcc;border-bottom:1px solid #eee;padding-bottom:10px;">New Contact Message</h2>
          <p><strong>From:</strong> ${safeName}</p>
          <p><strong>Email:</strong> <a href="mailto:${rawEmail}">${safeEmail}</a></p>
          <p><strong>Original message:</strong></p>
          <div style="background:#f5f5f5;padding:15px;border-radius:8px;white-space:pre-wrap;">${safeMsg}</div>
          ${translatedBlock}
          <hr style="margin-top:20px;border:none;border-top:1px solid #eee;">
          <p style="color:#999;font-size:12px;">Sent from ModXnet Contact Form</p>
        </div>
      `
    });

    res.json({ success: true, message: 'Message sent successfully!' });
  } catch (err) {
    console.error('Contact email error:', err.code, err.message);
    let errorMsg = 'Failed to send message. Please try again later.';
    if (err.code === 'EAUTH') errorMsg = 'Email authentication failed. Please contact the admin.';
    if (err.code === 'ESOCKET') errorMsg = 'Email server connection failed. Please try again.';
    res.status(500).json({ error: errorMsg });
  }
});

// Download help topics (stored in DB; no chat API)
app.get('/api/help/faqs', (req, res) => {
  try {
    res.json({ items: getHelpFaqs.all() });
  } catch (err) {
    console.error('help/faqs:', err);
    res.status(500).json({ error: 'Failed to load help' });
  }
});

/** Help chat UI strings in the user’s language (DeepSeek). GET ?lang=xx avoids POST/body issues behind some proxies. */
async function serveHelpLocalize(req, res) {
  res.set('Cache-Control', 'private, no-store');
  const raw = req.method === 'GET'
    ? (Array.isArray(req.query.lang) ? req.query.lang[0] : req.query.lang)
    : (req.body && req.body.lang);
  const lang = normalizeHelpChatLang(raw != null && raw !== '' ? String(raw).trim() : '');
  if (!lang) {
    return res.status(400).json({ error: 'Invalid language code' });
  }
  if (lang === 'en') {
    return res.json({ ...HELP_CHAT_EN_BUNDLE, source: 'en' });
  }
  if (helpChatLocalizeCache.has(lang)) {
    return res.json({ ...helpChatLocalizeCache.get(lang), source: 'cache' });
  }
  if (!DEEPSEEK_API_KEY) {
    return res.json({ ...HELP_CHAT_EN_BUNDLE, source: 'en', fallback: true, reason: 'no_api_key' });
  }
  try {
    const translated = await translateHelpChatBundleToLang(lang);
    if (!translated) {
      return res.json({ ...HELP_CHAT_EN_BUNDLE, source: 'en', fallback: true, reason: 'translate_failed' });
    }
    helpChatLocalizeCache.set(lang, translated);
    if (helpChatLocalizeCache.size > HELP_CHAT_LOCALIZE_CACHE_MAX) {
      const first = helpChatLocalizeCache.keys().next().value;
      helpChatLocalizeCache.delete(first);
    }
    return res.json({ ...translated, source: 'ai' });
  } catch (err) {
    console.error('help/localize:', err.message);
    return res.json({ ...HELP_CHAT_EN_BUNDLE, source: 'en', fallback: true, reason: 'server_error' });
  }
}

app.get('/api/help/localize', serveHelpLocalize);
app.post('/api/help/localize', serveHelpLocalize);

// ========== REVIEWS API ==========
app.get('/api/reviews/:gameSlug', (req, res) => {
  try {
    const reviews = getReviewsByGame.all(req.params.gameSlug);
    res.json(reviews);
  } catch (err) {
    console.error('Get reviews error:', err);
    res.status(500).json({ error: 'Failed to load reviews' });
  }
});

app.post('/api/reviews/:gameSlug', requireAuth, (req, res) => {
  try {
    const { rating, text } = req.body;
    const gameSlug = req.params.gameSlug;

    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ error: 'Rating must be between 1 and 5' });
    }
    if (!text || text.trim().length < 3) {
      return res.status(400).json({ error: 'Review must be at least 3 characters' });
    }

    // Check if user already reviewed this game
    const existing = userReviewExists.get(req.user.id, gameSlug);
    if (existing) {
      return res.status(400).json({ error: 'You already reviewed this game' });
    }

    // Analyze sentiment — negative reviews auto-expire in 10 minutes
    const sentiment = analyzeSentiment(text.trim(), parseInt(rating));
    const expiresAt = sentiment === 'negative'
      ? new Date(Date.now() + 10 * 60 * 1000).toISOString().replace('T', ' ').replace('Z', '')
      : null;

    createReview.run({
      user_id: req.user.id,
      game_slug: gameSlug,
      rating: parseInt(rating),
      text: text.trim(),
      sentiment: sentiment,
      expires_at: expiresAt
    });

    // Return updated list
    const reviews = getReviewsByGame.all(gameSlug);
    res.json({ success: true, reviews });
  } catch (err) {
    console.error('Create review error:', err);
    res.status(500).json({ error: 'Failed to post review' });
  }
});

// ========== COMMENTS API ==========
app.get('/api/comments/:gameSlug', (req, res) => {
  try {
    const comments = getCommentsByGame.all(req.params.gameSlug);
    res.json(comments);
  } catch (err) {
    console.error('Get comments error:', err);
    res.status(500).json({ error: 'Failed to load comments' });
  }
});

app.post('/api/comments/:gameSlug', requireAuth, (req, res) => {
  try {
    const { text } = req.body;
    const gameSlug = req.params.gameSlug;

    if (!text || text.trim().length < 1) {
      return res.status(400).json({ error: 'Comment cannot be empty' });
    }

    // Analyze sentiment — negative comments auto-expire in 10 minutes
    const sentiment = analyzeSentiment(text.trim(), null);
    const expiresAt = sentiment === 'negative'
      ? new Date(Date.now() + 10 * 60 * 1000).toISOString().replace('T', ' ').replace('Z', '')
      : null;

    createComment.run({
      user_id: req.user.id,
      game_slug: gameSlug,
      text: text.trim(),
      sentiment: sentiment,
      expires_at: expiresAt
    });

    // Return updated list
    const comments = getCommentsByGame.all(gameSlug);
    res.json({ success: true, comments });
  } catch (err) {
    console.error('Create comment error:', err);
    res.status(500).json({ error: 'Failed to post comment' });
  }
});

// ========== PUBLIC GAMES API (for dynamic rendering) ==========
app.get('/api/games', (req, res) => {
  try {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.set('Pragma', 'no-cache');
    const games = getAllGames.all();
    res.json(games);
  } catch (err) {
    console.error('Get games error:', err);
    res.status(500).json({ error: 'Failed to load games' });
  }
});

// ========== ADMIN MIDDLEWARE ==========
function requireAdmin(req, res, next) {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  if (!isAdminEmail(req.user.email)) {
    return res.status(403).json({ error: 'Access denied. Admin only.' });
  }
  next();
}

// Admin check endpoint
app.get('/api/admin/check', (req, res) => {
  if (req.isAuthenticated() && isAdminEmail(req.user.email)) {
    res.json({ isAdmin: true, user: { id: req.user.id, username: req.user.username, email: req.user.email, avatar_url: req.user.avatar_url } });
  } else {
    res.json({ isAdmin: false });
  }
});

// ========== ADMIN: AI GENERATE (RAWG + DeepSeek) ==========
app.post('/api/admin/ai-generate', requireAdmin, async (req, res) => {
  try {
    const { gameName } = req.body;
    if (!gameName) return res.status(400).json({ error: 'Game name is required' });

    // 1. Fetch game data + screenshots from RAWG
    const searchUrl = `https://api.rawg.io/api/games?search=${encodeURIComponent(gameName)}&key=${RAWG_API_KEY}&page_size=1`;
    const searchRes = await fetch(searchUrl);
    if (!searchRes.ok) throw new Error('RAWG search failed');
    const searchData = await searchRes.json();
    if (!searchData.results || searchData.results.length === 0) {
      return res.status(404).json({ error: 'Game not found. Try a different name.' });
    }

    const game = searchData.results[0];
    const [detailRes, ssRes] = await Promise.all([
      fetch(`https://api.rawg.io/api/games/${game.id}?key=${RAWG_API_KEY}`),
      fetch(`https://api.rawg.io/api/games/${game.id}/screenshots?key=${RAWG_API_KEY}&page_size=6`)
    ]);
    const detail = detailRes.ok ? await detailRes.json() : game;
    const ssData = ssRes.ok ? await ssRes.json() : { results: [] };

    // Extract RAWG data
    const title = detail.name || game.name;
    const genres = (detail.genres || []).map(g => g.name);
    const genreStr = genres.map(g => g.toLowerCase()).join(' ');
    const developers = (detail.developers || []).map(d => d.name);
    const descRaw = detail.description_raw || '';
    const rating = detail.rating || game.rating || 4.0;
    const coverImage = detail.background_image || game.background_image || '';
    const screenshots = (ssData.results || []).map(s => s.image).filter(Boolean);

    // Build release date
    let releaseDate = '';
    if (detail.released) {
      try {
        const d = new Date(detail.released);
        const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        releaseDate = months[d.getMonth()] + ' ' + d.getFullYear();
      } catch(e) { releaseDate = detail.released; }
    }

    // Short ID
    const shortId = title.toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 10);

    // Version
    const majorV = Math.floor(Math.random() * 3) + 1;
    const minorV = Math.floor(Math.random() * 10);
    const patchV = Math.floor(Math.random() * 5);
    const version = 'v' + majorV + '.' + minorV + '.' + patchV;

    // 2. Call DeepSeek AI for features + description
    let aiFeatures = [];
    let aiDescription = '';
    let aiSubtitle = '';
    let seoTitle = '';
    let seoDescription = '';
    let seoKeywords = '';

    if (DEEPSEEK_API_KEY) {
      try {
        const prompt = `You are writing content for a mobile game download website called ModXnet. Generate content for "${title}" (${genres.join(', ') || 'game'}).

Game info: ${descRaw.substring(0, 500)}

Return ONLY a valid JSON object (no markdown, no code blocks):
{
  "description": "2-3 sentence compelling mobile download page description",
  "features": ["feature 1", "feature 2", "feature 3", "feature 4", "feature 5"],
  "subtitle": "3-5 word subtitle like Open World Action Adventure",
  "seo_title": "SEO title for this game page (max ~60 chars)",
  "seo_description": "SEO meta description (max ~160 chars)",
  "seo_keywords": "comma-separated keywords"
}

Rules:
- Each feature: "Bold Title: Short exciting description" (e.g. "Full Open World: Explore all of Los Santos and Blaine County")
- Exactly 5 features, specific to THIS game
- Description for mobile gaming audience
- Keep factual about the real game
- For SEO: include Android + download intent, avoid keyword stuffing
- JSON only, nothing else`;

        const aiRes = await fetch('https://api.deepseek.com/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + DEEPSEEK_API_KEY },
          body: JSON.stringify({
            model: 'deepseek-chat',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.7,
            max_tokens: 600
          })
        });

        if (aiRes.ok) {
          const aiData = await aiRes.json();
          const content = aiData.choices?.[0]?.message?.content || '';
          let parsed;
          try { parsed = JSON.parse(content); } catch(e) {
            const m = content.match(/```(?:json)?\s*([\s\S]*?)```/) || content.match(/\{[\s\S]*\}/);
            if (m) parsed = JSON.parse(m[1] || m[0]);
          }
          if (parsed) {
            aiFeatures = Array.isArray(parsed.features) ? parsed.features : [];
            aiDescription = parsed.description || '';
            aiSubtitle = parsed.subtitle || '';
            seoTitle = parsed.seo_title || '';
            seoDescription = parsed.seo_description || '';
            seoKeywords = parsed.seo_keywords || '';
          }
        }
      } catch(aiErr) {
        console.error('DeepSeek fallback:', aiErr.message);
      }
    }

    // 3. Fallback if DeepSeek failed
    if (aiFeatures.length === 0) {
      aiFeatures = [
        `Mobile Optimized: ${title} fully optimized with HD graphics and smooth performance`,
        'Touch Controls: Intuitive controls designed specifically for mobile gaming',
        genres.includes('Action') ? 'Intense Combat: Thrilling action-packed battles and mechanics' :
        genres.includes('Racing') ? 'High-Speed Racing: Feel the adrenaline with realistic physics' :
        genres.includes('RPG') ? 'Deep Character System: Customize and level up your character' :
        'Immersive Gameplay: Hours of engaging content and missions',
        'Offline Play: Enjoy the full experience without internet connection',
        'Regular Updates: New content and improvements delivered regularly'
      ];
    }
    if (!aiDescription) {
      const firstSentences = descRaw.split(/(?<=[.!?])\s+/).filter(s => s.length > 10).slice(0, 2).join(' ');
      aiDescription = firstSentences || `Experience ${title} on your mobile device. Download now on ModXnet for Android and iOS.`;
    }
    if (!aiSubtitle) {
      aiSubtitle = genres.length > 0 ? genres.slice(0, 3).join(' ') + ' Game' : 'Mobile Game';
    }

    // 4. SEO fallbacks
    const year = new Date().getFullYear();
    if (!seoTitle) seoTitle = `Download ${title} for Android ${year} - ModXNet`;
    if (!seoDescription) {
      const short = (aiDescription || '').replace(/\s+/g, ' ').trim();
      const v = version.replace(/^v/i, '');
      const base = `Download ${title} v${v} MOD APK for Android.`;
      const combined = (base + ' ' + short + ' Free download on ModXNet.').replace(/\s+/g, ' ').trim();
      seoDescription = combined.length > 170 ? combined.slice(0, 167).trimEnd() + '…' : combined;
    }
    if (!seoKeywords) {
      const cleanName = title.replace(/\s+/g, ' ').trim();
      seoKeywords = [
        `${cleanName} mobile`,
        `${cleanName} android`,
        `${cleanName} apk`,
        `${cleanName} mod`,
        `download ${cleanName}`
      ].join(', ');
    }

    res.json({
      title,
      description: aiDescription,
      features: aiFeatures.slice(0, 5),
      genre: genreStr,
      subtitle: aiSubtitle,
      shortId,
      version,
      releaseDate,
      rating,
      cover_image: coverImage,
      screenshots,
      developers: developers.join(', '),
      seo_title: seoTitle,
      seo_description: seoDescription,
      seo_keywords: seoKeywords
    });
  } catch (err) {
    console.error('AI generate error:', err);
    res.status(500).json({ error: 'Generation failed: ' + err.message });
  }
});

// ========== ADMIN: RAWG AUTO-FETCH ==========
const RAWG_API_KEY = process.env.RAWG_API_KEY || '';

app.get('/api/admin/fetch-game', requireAdmin, async (req, res) => {
  try {
    const query = (req.query.q || '').trim();
    if (!query) return res.status(400).json({ error: 'Game name is required' });
    if (!RAWG_API_KEY || RAWG_API_KEY === 'YOUR_RAWG_KEY_HERE') {
      return res.status(400).json({ error: 'RAWG API key not configured. Add RAWG_API_KEY to your .env file. Get a free key at https://rawg.io/apidocs' });
    }

    // Search for the game
    const searchUrl = `https://api.rawg.io/api/games?search=${encodeURIComponent(query)}&key=${RAWG_API_KEY}&page_size=5`;
    const searchRes = await fetch(searchUrl);
    if (!searchRes.ok) throw new Error('RAWG API returned ' + searchRes.status);
    const searchData = await searchRes.json();

    if (!searchData.results || searchData.results.length === 0) {
      return res.status(404).json({ error: 'Game not found. Try a different name.' });
    }

    const game = searchData.results[0];

    // Fetch detailed info + screenshots
    const detailUrl = `https://api.rawg.io/api/games/${game.id}?key=${RAWG_API_KEY}`;
    const screenshotsUrl = `https://api.rawg.io/api/games/${game.id}/screenshots?key=${RAWG_API_KEY}&page_size=6`;

    const [detailRes, ssRes] = await Promise.all([
      fetch(detailUrl),
      fetch(screenshotsUrl)
    ]);

    const detail = detailRes.ok ? await detailRes.json() : game;
    const ssData = ssRes.ok ? await ssRes.json() : { results: [] };

    // Map genres to category string
    const genres = (detail.genres || []).map(g => g.name.toLowerCase()).join(' ');

    // Build release date
    let releaseDate = '';
    if (detail.released) {
      try {
        const d = new Date(detail.released);
        const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        releaseDate = months[d.getMonth()] + ' ' + d.getFullYear();
      } catch(e) { releaseDate = detail.released; }
    }

    // Build screenshots array
    const screenshots = (ssData.results || []).map(s => s.image).filter(Boolean);

    // Get platforms
    const platforms = (detail.platforms || []).map(p => p.platform.name).join(', ');

    // Get developers
    const developers = (detail.developers || []).map(d => d.name).join(', ');

    // Get tags (first 5)
    const tags = (detail.tags || []).slice(0, 5).map(t => t.name);

    res.json({
      found: true,
      title: detail.name || game.name,
      cover_image: detail.background_image || game.background_image || '',
      category: genres,
      description: detail.description_raw || '',
      rating: detail.rating || game.rating || 4.0,
      release_date: releaseDate,
      screenshots: screenshots,
      platforms: platforms,
      developers: developers,
      tags: tags,
      slug_suggestion: (detail.slug || game.slug || '').replace(/[^a-zA-Z0-9-]/g, ''),
      metacritic: detail.metacritic || null,
      // Also include search results for user to pick
      alternatives: searchData.results.slice(1, 5).map(r => ({
        id: r.id,
        name: r.name,
        image: r.background_image,
        released: r.released,
        rating: r.rating
      }))
    });
  } catch (err) {
    console.error('RAWG fetch error:', err);
    res.status(500).json({ error: 'Failed to fetch game data: ' + err.message });
  }
});

// ========== ADMIN: GAMES CRUD ==========
app.get('/api/admin/games', requireAdmin, (req, res) => {
  try {
    res.json(getAllGamesAdmin.all());
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/admin/games', requireAdmin, (req, res) => {
  try {
    const { slug, title, image_url, data_game, category, version, release_date, rating, link, sort_order, visible, seo_title, seo_description, seo_keywords } = req.body;
    if (!slug || !title) return res.status(400).json({ error: 'Slug and title are required' });
    insertGame.run({
      slug, title, image_url: image_url || '', data_game: data_game || slug.toLowerCase(),
      category: category || '', version: version || 'v1.0', release_date: release_date || '',
      rating: parseFloat(rating) || 4.0, link: link || '/' + slug + '/',
      sort_order: parseInt(sort_order) || 0, visible: visible !== undefined ? (visible ? 1 : 0) : 1,
      seo_title: seo_title || '',
      seo_description: seo_description || '',
      seo_keywords: seo_keywords || ''
    });
    // Auto-create adblue_config entry for this game if it doesn't exist
    try {
      const existing = getAdblueBySlug.get(slug);
      if (!existing) {
        upsertAdblue.run({
          game_slug: slug,
          variable_name: 'PKiWi_Ojz_wYrvyc',
          it_value: 0,
          key_value: '',
          script_url: 'https://da4talg8ap14y.cloudfront.net/5b1c47d.js'
        });
      }
    } catch(e) { /* non-critical */ }
    res.json({ success: true, games: getAllGamesAdmin.all() });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/admin/games/:id', requireAdmin, (req, res) => {
  try {
    const { title, image_url, data_game, category, version, release_date, rating, link, sort_order, visible, seo_title, seo_description, seo_keywords } = req.body;
    updateGame.run({
      id: parseInt(req.params.id), title, image_url: image_url || '',
      data_game: data_game || '', category: category || '',
      version: version || 'v1.0', release_date: release_date || '',
      rating: parseFloat(rating) || 4.0, link: link || '',
      sort_order: parseInt(sort_order) || 0, visible: visible ? 1 : 0,
      seo_title: seo_title || '',
      seo_description: seo_description || '',
      seo_keywords: seo_keywords || ''
    });
    res.json({ success: true, games: getAllGamesAdmin.all() });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Trash: list trashed games (MUST be before /:id routes)
app.get('/api/admin/games/trash', requireAdmin, (req, res) => {
  try { res.json(getTrashedGames.all()); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

// Soft delete (move to trash)
app.delete('/api/admin/games/:id', requireAdmin, (req, res) => {
  try {
    softDeleteGame.run(parseInt(req.params.id));
    res.json({ success: true, games: getAllGamesAdmin.all() });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Restore from trash
app.post('/api/admin/games/:id/restore', requireAdmin, (req, res) => {
  try {
    restoreGame.run(parseInt(req.params.id));
    res.json({ success: true, games: getAllGamesAdmin.all() });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Permanent delete
app.delete('/api/admin/games/:id/permanent', requireAdmin, (req, res) => {
  try {
    permanentDeleteGame.run(parseInt(req.params.id));
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ========== ADMIN: GENERATE FAKE ENGAGEMENT (Reviews + Comments) ==========

// Fake gamer names and avatars
const FAKE_GAMERS = [
  { name: 'GhostRider_X', avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=ghost' },
  { name: 'ProGamer2025', avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=pro' },
  { name: 'NightWolf_99', avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=wolf' },
  { name: 'ShadowBlade', avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=shadow' },
  { name: 'PixelKing', avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=pixel' },
  { name: 'GameMaster_01', avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=master' },
  { name: 'TurboNinja', avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=turbo' },
  { name: 'DarkPhoenix', avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=phoenix' },
  { name: 'CyberWolf_X', avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=cyber' },
  { name: 'ViperStrike', avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=viper' },
  { name: 'AceGamer_77', avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=ace' },
  { name: 'BlazeFury', avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=blaze' },
  { name: 'StormBreaker', avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=storm' },
  { name: 'IronClad_GG', avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=iron' },
  { name: 'ZeroLag', avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=zero' },
  { name: 'LunarEclipse', avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=lunar' },
  { name: 'NoobSlayer_X', avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=noob' },
  { name: 'ThunderBolt', avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=thunder' },
  { name: 'SilentKiller', avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=silent' },
  { name: 'MaverickGG', avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=maverick' }
];

// Fallback review templates (used if DeepSeek fails)
const REVIEW_TEMPLATES = {
  5: [
    'Absolutely amazing! Best mobile port I have ever played. Runs perfectly on my phone.',
    'This is incredible, the graphics are insane for mobile. 10/10 would recommend!',
    'Perfect game, been playing for hours. The controls feel great on touchscreen.',
    'Love everything about this. The devs did an amazing job porting this to mobile.',
    'Wow just wow, this runs so smooth on my device. Best download from ModXnet!',
    'Can not believe this is running on my phone. Absolutely flawless experience!',
    'Outstanding mobile version! Every detail is perfect, runs like butter.',
    'This game is a masterpiece on mobile. Downloaded it from ModXnet and never looked back.'
  ],
  4: [
    'Really solid game. A few minor bugs but overall an amazing experience.',
    'Great port, plays well on mobile. Would love to see more updates.',
    'Almost perfect! Runs great, controls are good. Just needs a bit more optimization.',
    'Really enjoying this one. Smooth gameplay and great graphics for mobile.',
    'Very good game, the mobile controls take some getting used to but its worth it.',
    'Impressive mobile version! A couple of small issues but nothing major.',
    'Solid 4 stars! Great gameplay, good graphics, runs well on most devices.',
    'Downloaded yesterday and cant stop playing. Great mobile experience overall.'
  ],
  3: [
    'Decent game, fun to play but has some performance issues on older phones.',
    'Its okay, the game itself is good but needs better optimization.',
    'Average experience, good game but the mobile port could be better.'
  ]
};

const COMMENT_TEMPLATES = [
  'Anyone else playing this? Graphics are sick!',
  'Works great on my Samsung, downloading now for my iPad too',
  'How do I get past the first level? Any tips?',
  'This is the best mobile port I have seen in a while',
  'Just downloaded, the file size is reasonable and it runs smooth',
  'ModXnet always has the best versions, thanks!',
  'Been waiting for this one to come to mobile, finally!',
  'The controls are surprisingly good on touchscreen',
  'Playing this on my lunch break every day now lol',
  'My friends dont believe this runs on mobile until I show them',
  'Does this work offline? Would be great for flights',
  'Just finished the main story, what an experience on mobile!',
  'The graphics quality is way better than I expected',
  'Smooth 60fps on my phone, really impressed',
  'Downloaded this last week and already have 20 hours in it'
];

function getOrCreateFakeUser(gamer) {
  let user = findUserByUsername.get(gamer.name);
  if (user) return user;
  // Create the fake user
  createUser.run({
    username: gamer.name,
    email: gamer.name.toLowerCase().replace(/[^a-z0-9]/g, '') + '@modxnet.fake',
    password_hash: null,
    google_id: 'fake_' + gamer.name.toLowerCase().replace(/[^a-z0-9]/g, ''),
    avatar_url: gamer.avatar
  });
  return findUserByUsername.get(gamer.name);
}

function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function randomPastDate(maxDaysAgo) {
  const daysAgo = Math.floor(Math.random() * maxDaysAgo) + 1;
  const hoursAgo = Math.floor(Math.random() * 24);
  const d = new Date(Date.now() - daysAgo * 86400000 - hoursAgo * 3600000);
  return d.toISOString().replace('T', ' ').replace('Z', '').split('.')[0];
}

app.post('/api/admin/games/:slug/generate-engagement', requireAdmin, async (req, res) => {
  try {
    const gameSlug = req.params.slug;
    const { gameName, reviewCount, commentCount } = req.body;
    const title = gameName || gameSlug.replace(/-/g, ' ');
    const numReviews = Math.min(parseInt(reviewCount) || 8, 20);
    const numComments = Math.min(parseInt(commentCount) || 6, 20);

    // Check how many already exist
    const existingReviews = getReviewCountByGame.get(gameSlug).cnt;
    const existingComments = getCommentCountByGame.get(gameSlug).cnt;

    const results = { reviews_created: 0, comments_created: 0, ai_used: false };

    // Pick random unique gamers
    const shuffledGamers = shuffleArray(FAKE_GAMERS);
    const totalNeeded = numReviews + numComments;
    const selectedGamers = shuffledGamers.slice(0, Math.min(totalNeeded, shuffledGamers.length));

    // ---- Try DeepSeek AI for comments ----
    let aiComments = [];
    let aiReviews = [];

    if (DEEPSEEK_API_KEY) {
      try {
        const prompt = `You are generating fake user engagement for a mobile game download website called ModXnet. The game is "${title}".

Generate ONLY a valid JSON object (no markdown, no code blocks):
{
  "reviews": [
    { "rating": 5, "text": "review text here" },
    { "rating": 4, "text": "review text here" }
  ],
  "comments": [
    "comment text here",
    "another comment"
  ]
}

Rules:
- Generate exactly ${numReviews} reviews with ratings: mostly 4-5 stars, maybe one 3-star
- Generate exactly ${numComments} comments
- Reviews should be 1-2 sentences, authentic gamer language, casual tone
- Comments should be short (1 sentence), like real YouTube/forum comments
- Mention specific things about ${title} to make them realistic
- Mix excitement, questions, tips, and casual reactions
- Some comments can have gaming slang, emojis not required
- Make each one unique and different in style
- JSON only, nothing else`;

        const aiRes = await fetch('https://api.deepseek.com/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + DEEPSEEK_API_KEY },
          body: JSON.stringify({
            model: 'deepseek-chat',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.9,
            max_tokens: 1500
          })
        });

        if (aiRes.ok) {
          const aiData = await aiRes.json();
          const content = aiData.choices?.[0]?.message?.content || '';
          let parsed;
          try { parsed = JSON.parse(content); } catch(e) {
            const m = content.match(/\{[\s\S]*\}/);
            if (m) parsed = JSON.parse(m[0]);
          }
          if (parsed) {
            if (Array.isArray(parsed.reviews)) aiReviews = parsed.reviews;
            if (Array.isArray(parsed.comments)) aiComments = parsed.comments;
            results.ai_used = true;
          }
        }
      } catch(aiErr) {
        console.error('DeepSeek engagement fallback:', aiErr.message);
      }
    }

    // ---- Fallback: use templates if AI failed ----
    if (aiReviews.length === 0) {
      // Generate weighted random ratings: 60% 5-star, 30% 4-star, 10% 3-star
      for (let i = 0; i < numReviews; i++) {
        const rand = Math.random();
        const rating = rand < 0.6 ? 5 : rand < 0.9 ? 4 : 3;
        const templates = REVIEW_TEMPLATES[rating];
        const text = templates[Math.floor(Math.random() * templates.length)];
        aiReviews.push({ rating, text });
      }
    }
    if (aiComments.length === 0) {
      const shuffledComments = shuffleArray(COMMENT_TEMPLATES);
      aiComments = shuffledComments.slice(0, numComments);
    }

    // ---- Create fake users and insert reviews with random past dates ----
    let gamerIndex = 0;
    for (let i = 0; i < aiReviews.length && i < numReviews; i++) {
      const gamer = selectedGamers[gamerIndex % selectedGamers.length];
      gamerIndex++;
      try {
        const user = getOrCreateFakeUser(gamer);
        if (!user) continue;
        // Check if this user already reviewed this game
        const exists = userReviewExists.get(user.id, gameSlug);
        if (exists) continue;

        const review = aiReviews[i];
        const rating = Math.max(1, Math.min(5, parseInt(review.rating) || 5));

        createReviewWithDate.run({
          user_id: user.id,
          game_slug: gameSlug,
          rating: rating,
          text: (typeof review === 'string' ? review : review.text || '').substring(0, 500),
          sentiment: rating >= 4 ? 'positive' : 'neutral',
          expires_at: null,
          created_at: randomPastDate(30) // Random date within last 30 days
        });
        results.reviews_created++;
      } catch(e) { /* skip on error */ }
    }

    // ---- Insert comments with random past dates ----
    for (let i = 0; i < aiComments.length && i < numComments; i++) {
      const gamer = selectedGamers[gamerIndex % selectedGamers.length];
      gamerIndex++;
      try {
        const user = getOrCreateFakeUser(gamer);
        if (!user) continue;

        const text = (typeof aiComments[i] === 'string' ? aiComments[i] : aiComments[i].text || '').substring(0, 500);
        if (!text) continue;

        createCommentWithDate.run({
          user_id: user.id,
          game_slug: gameSlug,
          text: text,
          sentiment: 'positive',
          expires_at: null,
          created_at: randomPastDate(14) // Random date within last 14 days
        });
        results.comments_created++;
      } catch(e) { /* skip on error */ }
    }

    results.total_reviews = existingReviews + results.reviews_created;
    results.total_comments = existingComments + results.comments_created;
    res.json({ success: true, ...results });
  } catch (err) {
    console.error('Generate engagement error:', err);
    res.status(500).json({ error: 'Failed to generate engagement: ' + err.message });
  }
});

// ========== ADMIN: GAME PAGE EDITOR ==========
// Read a game page's HTML
app.get('/api/admin/gamepage/:slug', requireAdmin, (req, res) => {
  try {
    const pageDir = path.join(__dirname, req.params.slug);
    const pagePath = path.join(pageDir, 'index.html');
    if (!fs.existsSync(pagePath)) return res.status(404).json({ error: 'Game page not found' });
    const content = fs.readFileSync(pagePath, 'utf8');
    // List files in the game folder
    const files = fs.readdirSync(pageDir).filter(f => !f.startsWith('.'));
    res.json({ slug: req.params.slug, content, files });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Extract images from a game page HTML
app.get('/api/admin/gamepage/:slug/images', requireAdmin, (req, res) => {
  try {
    const pageDir = path.join(__dirname, req.params.slug);
    const pagePath = path.join(pageDir, 'index.html');
    if (!fs.existsSync(pagePath)) return res.status(404).json({ error: 'Game page not found' });
    const html = fs.readFileSync(pagePath, 'utf8');

    // Extract cover image (first img inside .hero)
    const coverMatch = html.match(/<div[^>]*\bclass="[^"]*\bhero\b[^"]*"[^>]*>\s*<img\s+src="([^"]*)"[^>]*>/i);
    const cover = coverMatch ? coverMatch[1] : '';

    // Extract logo (class game-logo)
    const logoMatch = html.match(/<img\s+src="([^"]*)"[^>]*\bclass="[^"]*\bgame-logo\b[^"]*"[^>]*>/i) ||
                      html.match(/<img[^>]*\bclass="[^"]*\bgame-logo\b[^"]*"[^>]*src="([^"]*)"[^>]*>/i);
    const logo = logoMatch ? logoMatch[1] : '';

    // Extract screenshots (inside .screenshot-grid)
    const ssSection = html.match(/<div[^>]*\bclass="[^"]*\bscreenshot-grid\b[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
    const screenshots = [];
    if (ssSection) {
      const imgRegex = /<img\s+src="([^"]*)"[^>]*>/gi;
      let m;
      while ((m = imgRegex.exec(ssSection[1])) !== null) {
        screenshots.push(m[1]);
      }
    }

    res.json({ cover, logo, screenshots });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Update images in a game page HTML
app.put('/api/admin/gamepage/:slug/images', requireAdmin, (req, res) => {
  try {
    const pageDir = path.join(__dirname, req.params.slug);
    const pagePath = path.join(pageDir, 'index.html');
    if (!fs.existsSync(pagePath)) return res.status(404).json({ error: 'Game page not found' });
    let html = fs.readFileSync(pagePath, 'utf8');
    const { cover, logo, screenshots } = req.body;

    // Update cover image (first <img> inside .hero — allows extra classes / whitespace)
    if (typeof cover === 'string') {
      const heroCoverRe = /(<div[^>]*\bclass="[^"]*\bhero\b[^"]*"[^>]*>\s*<img\s+src=")([^"]*)(")/i;
      if (heroCoverRe.test(html)) {
        html = html.replace(heroCoverRe, '$1' + cover.replace(/\$/g, '$$$$') + '$3');
      }
    }

    // Update logo image and favicon
    if (typeof logo === 'string') {
      // Try src before class="game-logo"
      html = html.replace(
        /(<img\s+src=")([^"]*)("[^>]*\bclass="[^"]*\bgame-logo\b[^"]*"[^>]*>)/i,
        '$1' + logo.replace(/\$/g, '$$$$') + '$3'
      );
      // Also try class before src
      html = html.replace(
        /(<img[^>]*\bclass="[^"]*\bgame-logo\b[^"]*"[^>]*src=")([^"]*)("[^>]*>)/i,
        '$1' + logo.replace(/\$/g, '$$$$') + '$3'
      );
      // Update favicon to match game logo
      if (logo && logo.indexOf('placehold') === -1) {
        html = html.replace(
          /(<link\s+rel="icon"\s+href=")([^"]*)(")/i,
          '$1' + logo.replace(/\$/g, '$$$$') + '$3'
        );
      }
    }

    // Update screenshots (grid may use id="screenshotGrid" and/or extra classes)
    if (Array.isArray(screenshots)) {
      const ssSection = html.match(/(<div[^>]*\bclass="[^"]*\bscreenshot-grid\b[^"]*"[^>]*>)([\s\S]*?)(<\/div>)/i);
      if (ssSection) {
        const title = html.match(/<h1>([^<]*)<\/h1>/i);
        const gameName = title ? title[1] : 'Game';
        let newContent = '\n';
        screenshots.forEach(function(url, i) {
          if (url && url.trim()) {
            newContent += '                <img src="' + url.trim() + '" alt="' + gameName + ' Screenshot ' + (i + 1) + '" class="screenshot">\n';
          }
        });
        newContent += '            ';
        html = html.replace(ssSection[0], ssSection[1] + newContent + ssSection[3]);
      }
    }

    fs.writeFileSync(pagePath, html, 'utf8');
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Extract features from a game page HTML
app.get('/api/admin/gamepage/:slug/features', requireAdmin, (req, res) => {
  try {
    const pageDir = path.join(__dirname, req.params.slug);
    const pagePath = path.join(pageDir, 'index.html');
    if (!fs.existsSync(pagePath)) return res.status(404).json({ error: 'Game page not found' });
    const html = fs.readFileSync(pagePath, 'utf8');

    const featureSection = html.match(/<ul\s+class="feature-list"[^>]*>([\s\S]*?)<\/ul>/i);
    const features = [];
    if (featureSection) {
      const spanRegex = /<span>([^<]*)<\/span>/gi;
      let m;
      while ((m = spanRegex.exec(featureSection[1])) !== null) {
        if (m[1].trim()) features.push(m[1].trim());
      }
    }
    res.json({ features });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Update features in a game page HTML
app.put('/api/admin/gamepage/:slug/features', requireAdmin, (req, res) => {
  try {
    const pageDir = path.join(__dirname, req.params.slug);
    const pagePath = path.join(pageDir, 'index.html');
    if (!fs.existsSync(pagePath)) return res.status(404).json({ error: 'Game page not found' });
    let html = fs.readFileSync(pagePath, 'utf8');
    const { features } = req.body;

    if (Array.isArray(features)) {
      const featureSection = html.match(/(<ul\s+class="feature-list"[^>]*>)([\s\S]*?)(<\/ul>)/i);
      if (featureSection) {
        let newContent = '\n';
        features.forEach(function(text) {
          if (text && text.trim()) {
            newContent += '                <li>\n                    <i class="fas fa-check-circle"></i>\n                    <span>' + text.trim() + '</span>\n                </li>\n';
          }
        });
        newContent += '            ';
        html = html.replace(featureSection[0], featureSection[1] + newContent + featureSection[3]);
        fs.writeFileSync(pagePath, html, 'utf8');
      }
    }
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Get votes (rating + vote count) from game page
app.get('/api/admin/gamepage/:slug/votes', requireAdmin, (req, res) => {
  try {
    const pageDir = path.join(__dirname, req.params.slug);
    const pagePath = path.join(pageDir, 'index.html');
    const scriptPath = path.join(pageDir, 'script.js');
    if (!fs.existsSync(pagePath)) return res.json({ rating: 4.0, votes: 0 });

    let rating = 4.0, votes = 0;
    const html = fs.readFileSync(pagePath, 'utf8');

    // Extract from HTML: <span class="rating-value">4.5</span>
    const ratingMatch = html.match(/<span\s+class="rating-value"[^>]*>([\d.]+)<\/span>/);
    if (ratingMatch) rating = parseFloat(ratingMatch[1]) || 4.0;

    // Extract from HTML: <span class="votes-count"...>10,367 votes</span>
    const votesMatch = html.match(/<span\s+class="votes-count"[^>]*>([\d,]+)\s*votes<\/span>/i);
    if (votesMatch) votes = parseInt(votesMatch[1].replace(/,/g, '')) || 0;

    // Also try from script.js for more accurate data
    if (fs.existsSync(scriptPath)) {
      const js = fs.readFileSync(scriptPath, 'utf8');
      const jsVotes = js.match(/currentVotes\s*:\s*(\d+)/);
      const jsRating = js.match(/currentRating\s*:\s*([\d.]+)/);
      if (jsVotes) votes = parseInt(jsVotes[1]) || votes;
      if (jsRating) rating = parseFloat(jsRating[1]) || rating;
    }

    res.json({ rating, votes });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Update votes (rating + vote count) in game page HTML + JS
app.put('/api/admin/gamepage/:slug/votes', requireAdmin, (req, res) => {
  try {
    const { rating, votes } = req.body;
    const ratingVal = parseFloat(rating) || 4.0;
    const votesVal = parseInt(votes) || 0;
    const votesFormatted = votesVal.toLocaleString('en-US');

    const pageDir = path.join(__dirname, req.params.slug);
    const pagePath = path.join(pageDir, 'index.html');
    const scriptPath = path.join(pageDir, 'script.js');

    // Update HTML
    if (fs.existsSync(pagePath)) {
      let html = fs.readFileSync(pagePath, 'utf8');
      // Update rating value
      html = html.replace(
        /(<span\s+class="rating-value"[^>]*>)[\d.]+(<\/span>)/,
        '$1' + ratingVal + '$2'
      );
      // Ensure votes-count span has id="votesCount" (some pages are missing it)
      html = html.replace(
        /<span\s+class="votes-count">/g,
        '<span class="votes-count" id="votesCount">'
      );
      // Update votes count (handles both with and without id)
      html = html.replace(
        /(<span\s+class="votes-count"[^>]*>)[\d,]+\s*votes(<\/span>)/i,
        '$1' + votesFormatted + ' votes$2'
      );
      // Update star icons based on rating
      const fullStars = Math.floor(ratingVal);
      const hasHalf = (ratingVal - fullStars) >= 0.3;
      let starsHtml = '';
      for (let i = 1; i <= 5; i++) {
        if (i <= fullStars) {
          starsHtml += '                    <i class="fas fa-star star-icon" data-rating="' + i + '"></i>\n';
        } else if (i === fullStars + 1 && hasHalf) {
          starsHtml += '                    <i class="fas fa-star-half-alt star-icon" data-rating="' + i + '"></i>\n';
        } else {
          starsHtml += '                    <i class="far fa-star star-icon" data-rating="' + i + '"></i>\n';
        }
      }
      // Replace the stars container content (handle both multiline and single-line formats)
      html = html.replace(
        /(<div\s+class="stars-container"[^>]*>)([\s\S]*?)(<\/div>[\s\S]*?<div\s+class="rating-info">)/,
        '$1\n' + starsHtml + '                $3'
      );
      fs.writeFileSync(pagePath, html, 'utf8');
    }

    // Update script.js
    if (fs.existsSync(scriptPath)) {
      let js = fs.readFileSync(scriptPath, 'utf8');
      js = js.replace(/currentVotes\s*:\s*\d+/, 'currentVotes: ' + votesVal);
      js = js.replace(/currentRating\s*:\s*[\d.]+/, 'currentRating: ' + ratingVal);
      fs.writeFileSync(scriptPath, js, 'utf8');
    }

    res.json({ success: true, rating: ratingVal, votes: votesVal });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Rename a game page folder
app.post('/api/admin/gamepage/:slug/rename', requireAdmin, (req, res) => {
  try {
    const oldSlug = req.params.slug;
    const { newSlug } = req.body;
    if (!newSlug || !newSlug.trim()) return res.status(400).json({ error: 'New folder name is required' });
    const cleanSlug = newSlug.trim().replace(/[^a-zA-Z0-9-_]/g, '');
    if (!cleanSlug) return res.status(400).json({ error: 'Invalid folder name' });

    const oldDir = path.join(__dirname, oldSlug);
    const newDir = path.join(__dirname, cleanSlug);

    if (!fs.existsSync(oldDir)) return res.status(404).json({ error: 'Original folder not found' });
    if (oldSlug === cleanSlug) return res.json({ success: true, slug: cleanSlug });
    if (fs.existsSync(newDir)) return res.status(400).json({ error: 'A folder with name "' + cleanSlug + '" already exists' });

    fs.renameSync(oldDir, newDir);
    res.json({ success: true, slug: cleanSlug });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Save a game page's HTML
app.put('/api/admin/gamepage/:slug', requireAdmin, (req, res) => {
  try {
    const pageDir = path.join(__dirname, req.params.slug);
    const pagePath = path.join(pageDir, 'index.html');
    if (!fs.existsSync(pageDir)) return res.status(404).json({ error: 'Game folder not found' });
    fs.writeFileSync(pagePath, req.body.content, 'utf8');
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// List all game folders
app.get('/api/admin/gamepages', requireAdmin, (req, res) => {
  try {
    const dirs = fs.readdirSync(__dirname, { withFileTypes: true })
      .filter(d => d.isDirectory() && fs.existsSync(path.join(__dirname, d.name, 'index.html')) && !['node_modules', 'uploads', '.git', '.cursor'].includes(d.name))
      .map(d => {
        const files = fs.readdirSync(path.join(__dirname, d.name)).filter(f => !f.startsWith('.'));
        return { slug: d.name, files };
      });
    res.json(dirs);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// List trashed game page folders
app.get('/api/admin/gamepages/trash', requireAdmin, (req, res) => {
  try {
    const dirs = fs.readdirSync(__dirname, { withFileTypes: true })
      .filter(d => d.isDirectory() && d.name.startsWith('_trash_') && fs.existsSync(path.join(__dirname, d.name, 'index.html')))
      .map(d => {
        const originalSlug = d.name.replace(/^_trash_/, '');
        const files = fs.readdirSync(path.join(__dirname, d.name)).filter(f => !f.startsWith('.'));
        return { slug: originalSlug, trashName: d.name, files };
      });
    res.json(dirs);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Soft-delete a game page (rename folder to _trash_<slug>)
app.delete('/api/admin/gamepages/:slug', requireAdmin, (req, res) => {
  try {
    const slug = req.params.slug;
    const pageDir = path.join(__dirname, slug);
    if (!fs.existsSync(pageDir)) return res.status(404).json({ error: 'Game page folder not found' });
    const trashDir = path.join(__dirname, '_trash_' + slug);
    if (fs.existsSync(trashDir)) {
      // If trash version already exists, remove it first
      fs.rmSync(trashDir, { recursive: true, force: true });
    }
    fs.renameSync(pageDir, trashDir);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Restore a trashed game page
app.post('/api/admin/gamepages/:slug/restore', requireAdmin, (req, res) => {
  try {
    const slug = req.params.slug;
    const trashDir = path.join(__dirname, '_trash_' + slug);
    if (!fs.existsSync(trashDir)) return res.status(404).json({ error: 'Trashed page folder not found' });
    const pageDir = path.join(__dirname, slug);
    if (fs.existsSync(pageDir)) return res.status(400).json({ error: 'A folder with this name already exists. Rename or delete it first.' });
    fs.renameSync(trashDir, pageDir);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Permanently delete a trashed game page
app.delete('/api/admin/gamepages/:slug/permanent', requireAdmin, (req, res) => {
  try {
    const slug = req.params.slug;
    const trashDir = path.join(__dirname, '_trash_' + slug);
    if (!fs.existsSync(trashDir)) return res.status(404).json({ error: 'Trashed page folder not found' });
    fs.rmSync(trashDir, { recursive: true, force: true });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Create a new game page from template
app.post('/api/admin/gamepages', requireAdmin, (req, res) => {
  try {
    const { slug, title, subtitle, genre, description, features, pageRating, pageVotes } = req.body;
    if (!slug || !title) return res.status(400).json({ error: 'Folder name and game title are required' });
    
    const pageDir = path.join(__dirname, slug);
    if (fs.existsSync(pageDir)) return res.status(400).json({ error: 'A folder with this name already exists' });
    
    // Vote values
    const ratingVal = parseFloat(pageRating) || 4.0;
    const votesVal = parseInt(pageVotes) || Math.floor(Math.random() * 15000) + 3000;
    const votesFormatted = votesVal.toLocaleString('en-US');
    
    // Build star icons based on rating
    const fullStars = Math.floor(ratingVal);
    const hasHalf = (ratingVal - fullStars) >= 0.3;
    let starsHtml = '';
    for (let i = 1; i <= 5; i++) {
      if (i <= fullStars) starsHtml += '<i class="fas fa-star star-icon" data-rating="' + i + '"></i>';
      else if (i === fullStars + 1 && hasHalf) starsHtml += '<i class="fas fa-star-half-alt star-icon" data-rating="' + i + '"></i>';
      else starsHtml += '<i class="far fa-star star-icon" data-rating="' + i + '"></i>';
    }
    
    // Get adblue config for this game (if exists)
    let adConfig = null;
    try { adConfig = getAdblueBySlug.get(slug); } catch(e) {}
    const adVarName = (adConfig && adConfig.variable_name) || 'PKiWi_Ojz_wYrvyc';
    const adItValue = (adConfig && adConfig.it_value) || 0;
    const adKeyValue = (adConfig && adConfig.key_value) || '';
    const adScriptUrl = (adConfig && adConfig.script_url) || 'https://da4talg8ap14y.cloudfront.net/5b1c47d.js';
    
    // Find a template game folder to copy style.css and script.js from
    const templateDir = path.join(__dirname, 'GTA-5-Mobile');
    let templateCss = '';
    let templateJs = '';
    if (fs.existsSync(path.join(templateDir, 'style.css'))) {
      templateCss = fs.readFileSync(path.join(templateDir, 'style.css'), 'utf8');
    }
    if (fs.existsSync(path.join(templateDir, 'script.js'))) {
      templateJs = fs.readFileSync(path.join(templateDir, 'script.js'), 'utf8');
    }
    
    // Build the game page HTML
    const gameTitle = title;
    const gameSubtitle = subtitle || genre || 'Mobile Game';
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=5.0, user-scalable=yes">
    <meta name="description" content="${description ? description.replace(/"/g, '&quot;') : 'Download ' + gameTitle + ' - modxnet.com'}">
    <meta property="og:title" content="${gameTitle} - Modxnet.com">
    <link rel="icon" href="https://placehold.co/64x64/1a1a2e/00ffcc?text=${encodeURIComponent(gameTitle.charAt(0))}">
    <title>${gameTitle} - Modxnet.com</title>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css">
    <link href="https://fonts.googleapis.com/css2?family=Exo+2:wght@300;400;500;600;700&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="style.css">
    <style>
        @font-face { font-family: 'Exo 2'; font-display: swap; }
    </style>
    <!-- AdBlueMedia Configuration -->
    <script type="text/javascript">
        window.${adVarName} = {"it":${adItValue},"key":"${adKeyValue}"};
        var ${adVarName} = {"it":${adItValue},"key":"${adKeyValue}"};
    </script>
    <script src="${adScriptUrl}" async></script>
</head>
<body>
    <header class="header">
        <div class="header-content">
            <a href="/" class="back-icon"><i class="fas fa-arrow-left"></i></a>
        </div>
    </header>

    <div class="hero">
        <img src="https://placehold.co/800x400/1a1a2e/00ffcc?text=${encodeURIComponent(gameTitle)}" alt="${gameTitle} Cover">
    </div>

    <main class="main-content">
        <div class="game-title-section">
            <div class="game-title-wrapper">
                <img src="https://placehold.co/80x80/1a1a2e/00ffcc?text=${encodeURIComponent(gameTitle.charAt(0))}" alt="${gameTitle} Logo" class="game-logo">
                <div class="game-text">
                    <h1>${gameTitle}</h1>
                    <p class="game-subtitle">${gameSubtitle}</p>
                </div>
            </div>
        </div>

        <div class="get-section">
            <button onclick="showContentLocker('android')" class="get-btn">
                <i class="fab fa-android"></i> Get for Android
            </button>
            <button onclick="showContentLocker('ios')" class="get-btn">
                <i class="fab fa-apple"></i> Get for iOS
            </button>
        </div>

        <section class="app-info-section">
            <h2 class="section-title">App Information</h2>
            <div class="info-grid">
                <div class="info-item"><span class="info-label">App Name</span><span class="info-value">${gameTitle}</span></div>
                <div class="info-item"><span class="info-label">Latest Version</span><span class="info-value">1.0.0</span></div>
                <div class="info-item"><span class="info-label">Genre</span><span class="info-value">${gameSubtitle}</span></div>
                <div class="info-item"><span class="info-label">Developer</span><span class="info-value">—</span></div>
                <div class="info-item"><span class="info-label">OS Version</span><span class="info-value">Android 8.0+ / iOS 13.0+</span></div>
                <div class="info-item"><span class="info-label">Get it on</span><span class="info-value">ModXNet</span></div>
            </div>
        </section>

        <section class="rating-section">
            <div class="rating-display">
                <div class="stars-container" id="starsContainer">
                    ${starsHtml}
                </div>
                <div class="rating-info"><span class="rating-value">${ratingVal}</span><span class="votes-count" id="votesCount">${votesFormatted} votes</span></div>
            </div>
        </section>

        <section class="features-section">
            <h2 class="section-title">Features</h2>
            <ul class="feature-list">
${(Array.isArray(features) && features.length > 0 ? features : ['Feature 1 — Edit this in the admin panel', 'Feature 2', 'Feature 3']).map(f => '                <li><i class="fas fa-check-circle"></i><span>' + f + '</span></li>').join('\n')}
            </ul>
        </section>

        <section class="screenshots-section">
            <h2 class="section-title">Screenshots</h2>
            <div class="screenshot-grid" id="screenshotGrid">
                <img src="https://placehold.co/400x220/1a1a2e/00ffcc?text=Screenshot+1" alt="Screenshot 1" class="screenshot">
                <img src="https://placehold.co/400x220/1a1a2e/00ffcc?text=Screenshot+2" alt="Screenshot 2" class="screenshot">
            </div>
        </section>

        <section class="reviews-section">
            <div class="section-header-row">
                <h2 class="section-title">Reviews</h2>
                <button type="button" class="add-review-btn" id="addReviewBtn"><i class="fas fa-plus"></i> Add Review</button>
            </div>
            <ul class="reviews-list" id="reviewsList"></ul>
        </section>

        <section class="comments-section">
            <div class="section-header-row">
                <h2 class="section-title">Comments</h2>
                <button type="button" class="add-comment-btn" id="addCommentBtn"><i class="fas fa-comment"></i> Add Comment</button>
            </div>
            <ul class="comments-list" id="commentsList"></ul>
        </section>
    </main>

    <footer class="footer">
        <div class="footer-bottom"><p>&copy; 2025 <a href="/">modxnet.com</a>. All rights reserved.</p></div>
    </footer>

    <nav class="bottom-nav">
        <a href="/" class="bottom-nav-item"><i class="fas fa-home"></i><span>Home</span></a>
        <a href="/games.html" class="bottom-nav-item active"><i class="fas fa-gamepad"></i><span>Games</span></a>
        <a href="/trending.html" class="bottom-nav-item"><i class="fas fa-fire"></i><span>Trending</span></a>
        <button type="button" class="bottom-nav-item bottom-nav-auth"><i class="fas fa-user"></i><span>Login</span></button>
    </nav>

    <div id="content-locker-container" class="content-locker-container">
        <div id="content-locker-wrapper" class="content-locker-wrapper"></div>
    </div>

    <script src="script.js"></script>
    <script src="../game-interactions.js"></script>
    <script src="../detect-blocker.js"></script>
</body>
</html>`;

    // Update template JS with correct vote values
    if (templateJs) {
      templateJs = templateJs.replace(/currentVotes\s*:\s*\d+/, 'currentVotes: ' + votesVal);
      templateJs = templateJs.replace(/currentRating\s*:\s*[\d.]+/, 'currentRating: ' + ratingVal);
    }
    
    // Create the folder and files
    fs.mkdirSync(pageDir, { recursive: true });
    fs.writeFileSync(path.join(pageDir, 'index.html'), html, 'utf8');
    if (templateCss) fs.writeFileSync(path.join(pageDir, 'style.css'), templateCss, 'utf8');
    if (templateJs) fs.writeFileSync(path.join(pageDir, 'script.js'), templateJs, 'utf8');
    
    res.json({ success: true, slug });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ========== ADMIN: IMAGE UPLOAD ==========
const uploadDir = process.env.UPLOAD_DIR || path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, 'game-' + Date.now() + ext);
  }
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 }, fileFilter: (req, file, cb) => {
  if (/\.(jpg|jpeg|png|gif|webp)$/i.test(file.originalname)) cb(null, true);
  else cb(new Error('Only image files are allowed'));
}});

app.post('/api/admin/upload', requireAdmin, upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No image uploaded' });
  const url = '/uploads/' + req.file.filename;
  res.json({ success: true, url });
});

// ========== ADMIN: ADBLUE CONFIG ==========
app.get('/api/admin/adblue', requireAdmin, (req, res) => {
  try { res.json(getAllAdblue.all()); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/admin/adblue/:gameSlug', requireAdmin, (req, res) => {
  try {
    const { variable_name, it_value, key_value, script_url } = req.body;
    const varName = variable_name || 'PKiWi_Ojz_wYrvyc';
    const itVal = parseInt(it_value) || 0;
    const keyVal = key_value || '';
    const scriptVal = script_url || 'https://da4talg8ap14y.cloudfront.net/5b1c47d.js';

    upsertAdblue.run({
      game_slug: req.params.gameSlug,
      variable_name: varName,
      it_value: itVal,
      key_value: keyVal,
      script_url: scriptVal
    });

    // Also update the game page HTML with the new it/key values
    try {
      const pagePath = path.join(__dirname, req.params.gameSlug, 'index.html');
      if (fs.existsSync(pagePath)) {
        let html = fs.readFileSync(pagePath, 'utf8');
        // Replace the window.VAR = {"it":...,"key":"..."} pattern
        html = html.replace(
          /window\.\w+\s*=\s*\{"it"\s*:\s*\d+\s*,\s*"key"\s*:\s*"[^"]*"\s*\}/g,
          'window.' + varName + ' = {"it":' + itVal + ',"key":"' + keyVal + '"}'
        );
        // Replace the var VAR = {"it":...,"key":"..."} pattern
        html = html.replace(
          /var\s+\w+\s*=\s*\{"it"\s*:\s*\d+\s*,\s*"key"\s*:\s*"[^"]*"\s*\}/g,
          'var ' + varName + ' = {"it":' + itVal + ',"key":"' + keyVal + '"}'
        );
        // Replace the script src if changed
        html = html.replace(
          /(<script\s+src=")https:\/\/da4talg8ap14y\.cloudfront\.net\/[^"]*("[^>]*><\/script>)/i,
          '$1' + scriptVal + '$2'
        );
        fs.writeFileSync(pagePath, html, 'utf8');
      }
    } catch(e) { /* non-critical: page HTML update failed */ }

    res.json({ success: true, configs: getAllAdblue.all() });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Public: get adblue config for a game (used by game pages)
app.get('/api/adblue/:gameSlug', (req, res) => {
  try {
    const config = getAdblueBySlug.get(req.params.gameSlug);
    if (!config || !config.it_value || !config.key_value) {
      return res.json({ configured: false });
    }
    res.json({
      configured: true,
      variable_name: config.variable_name,
      it_value: config.it_value,
      key_value: config.key_value,
      script_url: config.script_url
    });
  } catch (err) { res.json({ configured: false }); }
});

// Sync: ensure every game has an adblue_config entry
app.post('/api/admin/adblue/sync', requireAdmin, (req, res) => {
  try {
    const games = getAllGamesAdmin.all();
    let created = 0;
    games.forEach(g => {
      const existing = getAdblueBySlug.get(g.slug);
      if (!existing) {
        upsertAdblue.run({
          game_slug: g.slug,
          variable_name: 'PKiWi_Ojz_wYrvyc',
          it_value: 0,
          key_value: '',
          script_url: 'https://da4talg8ap14y.cloudfront.net/5b1c47d.js'
        });
        created++;
      }
    });
    res.json({ success: true, created, configs: getAllAdblue.all() });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ========== ADMIN: USERS ==========
app.get('/api/admin/users', requireAdmin, (req, res) => {
  try { res.json(getAllUsers.all()); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/admin/users/:id', requireAdmin, (req, res) => {
  try {
    deleteUser.run(parseInt(req.params.id));
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/**
 * Remove @modxnet.fake engagement users and any non-Google account (no google_id).
 * Never deletes the admin row (ADMIN_EMAIL). Body: { "confirm": "DELETE_NON_GOOGLE_AND_FAKE_USERS" }
 */
app.post('/api/admin/users/purge-non-google', requireAdmin, (req, res) => {
  if (!req.body || req.body.confirm !== 'DELETE_NON_GOOGLE_AND_FAKE_USERS') {
    return res.status(400).json({
      error: 'Send JSON { "confirm": "DELETE_NON_GOOGLE_AND_FAKE_USERS" } to proceed.'
    });
  }
  try {
    const adminNorm = ADMIN_EMAIL;
    const stmt = db.prepare(`
      DELETE FROM users
      WHERE LOWER(TRIM(email)) != ?
      AND (
        LOWER(TRIM(email)) LIKE '%@modxnet.fake'
        OR google_id IS NULL
        OR TRIM(COALESCE(google_id, '')) = ''
      )
    `);
    const info = stmt.run(adminNorm);
    res.json({ success: true, deleted: info.changes });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const COMEBACK_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Real inboxes only — generated review users use @modxnet.fake and must not receive blasts. */
function isComebackBlastRecipient(email) {
  const e = String(email || '').trim();
  if (!COMEBACK_EMAIL_RE.test(e)) return false;
  if (e.toLowerCase().endsWith('@modxnet.fake')) return false;
  return true;
}

let comebackBlastInProgress = false;

app.get('/api/admin/email/comeback-draft', requireAdmin, (req, res) => {
  try {
    const users = getAllUsers.all();
    const n = users.filter((u) => isComebackBlastRecipient(u.email)).length;
    const defaults = getComebackEmailDefaults();
    res.json({
      siteUrl: getPublicBaseUrl(),
      recipientCount: n,
      placeholders: ['{{username}}', '{{siteUrl}}'],
      defaults: {
        subject: defaults.subject,
        html: defaults.html,
        text: defaults.text
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Send email blast to all users with real addresses (skips @modxnet.fake).
 * Body: { "confirm": true, "subject": "...", "html": "...", "text": "..." (optional) }
 * Sends in the background so nginx/proxy timeouts do not abort a long run.
 */
app.post('/api/admin/email/comeback-blast', requireAdmin, (req, res) => {
  if (!req.body || req.body.confirm !== true) {
    return res.status(400).json({ error: 'Set JSON body { "confirm": true } to send.' });
  }
  if (!process.env.SMTP_APP_PASSWORD || !String(process.env.SMTP_APP_PASSWORD).trim()) {
    return res.status(503).json({ error: 'SMTP not configured (SMTP_APP_PASSWORD missing).' });
  }
  const subjectTpl = String(req.body.subject || '').trim();
  const htmlTpl = String(req.body.html || '').trim();
  const textTplRaw = req.body.text != null ? String(req.body.text).trim() : '';
  if (!subjectTpl) {
    return res.status(400).json({ error: 'Subject is required.' });
  }
  if (!htmlTpl || htmlTpl.length < 4) {
    return res.status(400).json({ error: 'HTML body is required (a few characters minimum).' });
  }
  const siteBase = getPublicBaseUrl();
  let users;
  try {
    users = getAllUsers.all();
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }

  const recipients = users.filter((u) => isComebackBlastRecipient(u.email));
  if (recipients.length === 0) {
    return res.json({
      success: true,
      sent: 0,
      failed: 0,
      recipientCount: 0,
      message: 'No recipients. Only real addresses count (@modxnet.fake test accounts are excluded). Add users with Gmail or other real emails, or sign in with Google.'
    });
  }

  if (comebackBlastInProgress) {
    return res.status(429).json({
      error: 'A broadcast is already running. Wait a minute and check server logs (pm2 logs modxnet) for [comeback-blast].'
    });
  }

  comebackBlastInProgress = true;
  const tpl = { subjectTpl, htmlTpl, textTplRaw, siteBase };
  const startedIso = new Date().toISOString();
  emailBroadcastStatus = {
    state: 'running',
    startedAt: startedIso,
    finishedAt: null,
    recipientCount: recipients.length,
    sent: 0,
    failed: 0,
    failures: [],
    error: null
  };

  void (async () => {
    let sent = 0;
    const failures = [];
    try {
      console.log('[comeback-blast] starting, recipients:', recipients.length);
      for (const u of recipients) {
        const email = String(u.email || '').trim();
        try {
          const htmlFinal = applyComebackHtmlTemplate(tpl.htmlTpl, u.username, tpl.siteBase);
          const textFinal = tpl.textTplRaw.length
            ? applyComebackTextTemplate(tpl.textTplRaw, u.username, tpl.siteBase)
            : crudeHtmlToText(htmlFinal);
          const subjectFinal = applyComebackSubjectTemplate(tpl.subjectTpl, u.username);
          await transporter.sendMail({
            from: `"ModXNet" <${SMTP_USER}>`,
            to: email,
            replyTo: CONTACT_INBOX,
            subject: subjectFinal,
            text: textFinal,
            html: htmlFinal
          });
          sent++;
          emailBroadcastStatus.sent = sent;
          emailBroadcastStatus.failed = failures.length;
          await new Promise((r) => setTimeout(r, 450));
        } catch (err) {
          failures.push({ email, error: err.message || String(err) });
          emailBroadcastStatus.failed = failures.length;
          emailBroadcastStatus.failures = failures.slice(0, 25);
          console.error('[comeback-blast] fail', email, err.code || '', err.message);
        }
      }
      console.log('[comeback-blast] finished sent=' + sent + ' failed=' + failures.length);
      emailBroadcastStatus = {
        state: 'completed',
        startedAt: emailBroadcastStatus.startedAt,
        finishedAt: new Date().toISOString(),
        recipientCount: recipients.length,
        sent,
        failed: failures.length,
        failures: failures.slice(0, 25),
        error: null
      };
    } catch (err) {
      emailBroadcastStatus = {
        state: 'error',
        startedAt: startedIso,
        finishedAt: new Date().toISOString(),
        recipientCount: recipients.length,
        sent,
        failed: failures.length,
        failures: failures.slice(0, 25),
        error: err.message || String(err)
      };
      console.error('[comeback-blast] fatal', err);
    } finally {
      comebackBlastInProgress = false;
    }
  })();

  res.json({
    success: true,
    background: true,
    recipientCount: recipients.length,
    message:
      'Queued ' +
      recipients.length +
      ' email(s). They send in the background (~0.5s each). Test accounts @modxnet.fake are skipped. Watch VPS: pm2 logs modxnet — look for [comeback-blast].'
  });
});

// ========== ADMIN: REVIEWS & COMMENTS ==========
app.get('/api/admin/reviews', requireAdmin, (req, res) => {
  try { res.json(getAllReviews.all()); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/admin/reviews/:id', requireAdmin, (req, res) => {
  try {
    deleteReview.run(parseInt(req.params.id));
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/admin/comments', requireAdmin, (req, res) => {
  try { res.json(getAllComments.all()); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/admin/comments/:id', requireAdmin, (req, res) => {
  try {
    deleteComment.run(parseInt(req.params.id));
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ========== ADMIN: SITE CONFIG ==========
app.get('/api/admin/config', requireAdmin, (req, res) => {
  try { res.json(getAllConfig.all()); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/admin/config/:key', requireAdmin, (req, res) => {
  try {
    setConfig.run({ key: req.params.key, value: req.body.value || '' });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ========== ADMIN: STATS ==========
app.get('/api/admin/stats', requireAdmin, (req, res) => {
  try {
    const { db } = require('./database');
    const userCount = db.prepare('SELECT COUNT(*) as cnt FROM users').get().cnt;
    const gameCount = db.prepare('SELECT COUNT(*) as cnt FROM games').get().cnt;
    const reviewCount = db.prepare('SELECT COUNT(*) as cnt FROM reviews').get().cnt;
    const commentCount = db.prepare('SELECT COUNT(*) as cnt FROM comments').get().cnt;
    res.json({ users: userCount, games: gameCount, reviews: reviewCount, comments: commentCount });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Serve uploaded images
app.use('/uploads', express.static(uploadDir));

// ========== STATIC FILES (after all /api routes) ==========
// ========== SEO HTML ROUTES (must be before static files) ==========

app.get('/', (req, res, next) => {
  try {
    const filePath = path.join(__dirname, 'index.html');
    if (!fs.existsSync(filePath)) return next();
    let html = fs.readFileSync(filePath, 'utf8');
    html = injectGameCards(html);
    const year = new Date().getFullYear();
    const games = getAllGames.all();
    const topNames = (games || []).slice(0, 6).map(g => g.title).filter(Boolean);
    const title = `Download Mobile Games for Android ${year} - ModXNet`;
    const description = topNames.length
      ? `Download the latest mobile games for Android. Top picks: ${topNames.join(', ')}. Free download on ModXNet.`
      : `Download the latest mobile games for Android ${year}. Free download on ModXNet.`;
    const keywords = `modded games, mobile games, android games, mod apk, download games, ModXNet`;
    const canonical = getSiteBaseUrl(req) + '/';
    res.set('Cache-Control', 'no-store');
    res.type('html').send(injectSeoTags({ html, title, description, keywords, canonical }));
  } catch (e) {
    next();
  }
});

app.get('/category/:category', (req, res, next) => {
  try {
    const filePath = path.join(__dirname, 'index.html');
    if (!fs.existsSync(filePath)) return next();
    let html = fs.readFileSync(filePath, 'utf8');
    html = injectGameCards(html);
    const year = new Date().getFullYear();
    const cat = String(req.params.category || '').toLowerCase().replace(/[^a-z0-9_-]/g, '');
    const { db } = require('./database');
    const matches = db.prepare(`SELECT title FROM games WHERE visible = 1 AND deleted_at IS NULL AND lower(category) LIKE ? ORDER BY sort_order ASC LIMIT 8`).all('%' + cat + '%');
    const titles = matches.map(r => r.title).filter(Boolean);
    const prettyCat = cat.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    const title = `Download ${prettyCat} Games for Android ${year} - ModXNet`;
    const description = titles.length
      ? `Download ${prettyCat} games for Android. Popular: ${titles.join(', ')}. Free download on ModXNet.`
      : `Download ${prettyCat} games for Android ${year}. Free download on ModXNet.`;
    const keywords = `${cat} games, ${cat} mobile, ${cat} android, ${cat} apk, mod apk, download ${cat} games`;
    const canonical = getSiteBaseUrl(req) + `/category/${cat}`;
    res.set('Cache-Control', 'no-store');
    res.type('html').send(injectSeoTags({ html, title, description, keywords, canonical }));
  } catch (e) {
    next();
  }
});

app.get('/all-games', (req, res, next) => {
  try {
    const filePath = path.join(__dirname, 'all-games.html');
    if (!fs.existsSync(filePath)) return next();
    const html = fs.readFileSync(filePath, 'utf8');
    const year = new Date().getFullYear();
    const games = getAllGames.all();
    const titles = (games || []).map(g => g.title).filter(Boolean);
    const title = `All Games — Free Mobile Downloads ${year} | ModXNet`;
    const description = titles.length
      ? `Browse every game on ModXNet. ${titles.slice(0, 15).join(', ')}. Free downloads for Android—complete a short offer to unlock your file.`
      : `Browse the full ModXNet game catalog ${year}. Free mobile game downloads.`;
    const keywords = `all games, ModXNet catalog, free android games, mobile downloads, mod games`;
    const canonical = getSiteBaseUrl(req).replace(/\/+$/, '') + '/all-games';
    res.type('html').send(injectSeoTags({ html, title, description, keywords, canonical }));
  } catch (e) {
    next();
  }
});

app.get('/:gameSlug/', (req, res, next) => {
  // Only intercept real game folders with DB record; otherwise let static handle
  try {
    if (!req.params.gameSlug || req.params.gameSlug.startsWith('api')) return next();
    const slug = req.params.gameSlug;
    const game = getGameBySlug.get(slug);
    const pagePath = path.join(__dirname, slug, 'index.html');
    if (!game || !fs.existsSync(pagePath)) return next();

    const html = fs.readFileSync(pagePath, 'utf8');
    const year = new Date().getFullYear();
    const base = getSiteBaseUrl(req).replace(/\/+$/, '');
    const canonical = base + '/' + slug + '/';

    const pageTitle = (game.seo_title && String(game.seo_title).trim())
      ? String(game.seo_title).trim()
      : `Download ${game.title} for Android ${year} - ModXNet`;
    const pageDesc = (game.seo_description && String(game.seo_description).trim())
      ? String(game.seo_description).trim()
      : `Download ${game.title} v${String(game.version || '').replace(/^v/i, '')} MOD APK for Android. Free download on ModXNet.`;
    const pageKeywords = (game.seo_keywords && String(game.seo_keywords).trim())
      ? String(game.seo_keywords).trim()
      : `${game.title} mobile, ${game.title} android, ${game.title} apk, ${game.title} mod, download ${game.title}`;

    res.type('html').send(injectSeoTags({
      html,
      title: pageTitle,
      description: pageDesc,
      keywords: pageKeywords,
      canonical
    }));
  } catch (e) {
    next();
  }
});

// Order: API routes already defined above → static files → SPA fallback last
app.use(express.static(path.join(__dirname), {
  extensions: ['html'],
  index: false
}));

// SPA fallback: index.html for non-API routes only. Never override /api/*.
// Uses app.use instead of app.get('*') for Express 5 / path-to-regexp compatibility
app.use((req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  try {
    const filePath = path.join(__dirname, 'index.html');
    let html = fs.readFileSync(filePath, 'utf8');
    html = injectGameCards(html);
    res.set('Cache-Control', 'no-store');
    res.type('html').send(html);
  } catch (e) {
    res.sendFile(path.join(__dirname, 'index.html'), (err) => {
      if (err) next(err);
    });
  }
});

// ========== START SERVER ==========
app.listen(PORT, '0.0.0.0', () => {
  const siteUrl = process.env.SITE_URL || process.env.GOOGLE_CALLBACK_URL;
  let domain = process.env.RAILWAY_PUBLIC_DOMAIN || (siteUrl ? siteUrl.replace(/^https?:\/\//, '').split('/')[0] : null) || 'localhost:' + PORT;
  const protocol = (domain && domain !== 'localhost:' + PORT) ? 'https' : 'http';
  console.log('ModXnet server running on ' + protocol + '://' + domain);
});
