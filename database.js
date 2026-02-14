const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbPath = process.env.DB_PATH || path.join(__dirname, 'modxnet.db');

// Ensure the directory exists (for Railway volumes like /data)
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

const db = new Database(dbPath);

// Enable WAL mode for better performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ========== CREATE TABLES ==========
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT,
    google_id TEXT UNIQUE,
    avatar_url TEXT DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS reviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    game_slug TEXT NOT NULL,
    rating INTEGER NOT NULL CHECK(rating >= 1 AND rating <= 5),
    text TEXT NOT NULL,
    sentiment TEXT DEFAULT 'positive',
    expires_at DATETIME DEFAULT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    game_slug TEXT NOT NULL,
    text TEXT NOT NULL,
    sentiment TEXT DEFAULT 'positive',
    expires_at DATETIME DEFAULT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_reviews_game ON reviews(game_slug);
  CREATE INDEX IF NOT EXISTS idx_comments_game ON comments(game_slug);

  CREATE TABLE IF NOT EXISTS games (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT UNIQUE NOT NULL,
    title TEXT NOT NULL,
    image_url TEXT NOT NULL DEFAULT '',
    data_game TEXT NOT NULL DEFAULT '',
    category TEXT NOT NULL DEFAULT '',
    version TEXT NOT NULL DEFAULT 'v1.0',
    release_date TEXT NOT NULL DEFAULT '',
    rating REAL NOT NULL DEFAULT 4.0,
    link TEXT NOT NULL DEFAULT '',
    sort_order INTEGER NOT NULL DEFAULT 0,
    visible INTEGER NOT NULL DEFAULT 1,
    deleted_at DATETIME DEFAULT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS site_config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS adblue_config (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    game_slug TEXT UNIQUE NOT NULL,
    variable_name TEXT NOT NULL DEFAULT 'PKiWi_Ojz_wYrvyc',
    it_value INTEGER NOT NULL DEFAULT 0,
    key_value TEXT NOT NULL DEFAULT '',
    script_url TEXT NOT NULL DEFAULT 'https://da4talg8ap14y.cloudfront.net/5b1c47d.js',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// ========== SEED DEFAULT GAMES (only if table is empty) ==========
const gameCount = db.prepare('SELECT COUNT(*) as cnt FROM games').get();
if (gameCount.cnt === 0) {
  const insertGame = db.prepare(`INSERT INTO games (slug, title, image_url, data_game, category, version, release_date, rating, link, sort_order) VALUES (@slug, @title, @image_url, @data_game, @category, @version, @release_date, @rating, @link, @sort_order)`);
  const defaultGames = [
    { slug: 'BeamNG-drive-Mobile', title: 'BeamNG.drive Mobile', image_url: 'https://avatars.githubusercontent.com/u/6404024?s=280&v=4', data_game: 'beamng', category: 'racing simulation', version: 'v1.0', release_date: 'Feb 2025', rating: 4.0, link: '/BeamNG-drive-Mobile/', sort_order: 1 },
    { slug: 'GTA-5-Mobile', title: 'GTA V Mobile', image_url: 'https://i.pinimg.com/736x/8f/01/03/8f010359c57da7850e723fa17a53b55e.jpg', data_game: 'gta5', category: 'openworld action', version: 'v1.1', release_date: 'Jan 2025', rating: 4.0, link: '/GTA-5-Mobile/', sort_order: 2 },
    { slug: 'Assetto-Corsa-Mobile', title: 'Assetto Corsa Mobile', image_url: 'https://i.postimg.cc/mgStnz0K/Picsart-25-10-16-14-24-02-706.jpg', data_game: 'assetto', category: 'racing simulation', version: 'v2.0', release_date: 'Mar 2025', rating: 5.0, link: '/Assetto-Corsa-Mobile/', sort_order: 3 },
    { slug: 'Forza-Horizon-5', title: 'Forza Horizon 5 Mobile', image_url: 'https://images.seeklogo.com/logo-png/40/1/forza-horizon-5-logo-png_seeklogo-406612.png', data_game: 'forza', category: 'racing openworld', version: 'v1.0', release_date: 'Dec 2024', rating: 4.0, link: '/Forza-Horizon-5/', sort_order: 4 },
    { slug: 'ETS-2-Mobile', title: 'Euro Truck Simulator 2', image_url: 'https://i.pinimg.com/564x/32/ae/e5/32aee5919f1c4e81da58627d21b3323a.jpg', data_game: 'eurotruck', category: 'simulation', version: 'v1.0.0', release_date: 'Nov 2024', rating: 4.0, link: '/ETS-2-Mobile/', sort_order: 5 },
    { slug: 'Watchdogs2-Mobile', title: 'Watch Dogs 2 Mobile', image_url: 'https://images.steamusercontent.com/ugc/180542583658076938/524D520DFF7C6671219DF93F38B195D435B93786/?imw=637&imh=358&ima=fit&impolicy=Letterbox&imcolor=%23000000&letterbox=true', data_game: 'watchdogs', category: 'openworld action', version: 'v1.0.5', release_date: 'Oct 2024', rating: 3.5, link: '/Watchdogs2-Mobile/', sort_order: 6 },
    { slug: 'The-Crew-Motorfest-Mobile', title: 'The Crew MotorFest', image_url: 'https://i.postimg.cc/8Pq2KNXW/TCM-KA-low-Rez.jpg', data_game: 'motorfest', category: 'racing openworld', version: 'v1.0.0', release_date: 'Jan 2025', rating: 4.5, link: '/The-Crew-Motorfest-Mobile/', sort_order: 7 }
  ];
  const insertMany = db.transaction((games) => { for (const g of games) insertGame.run(g); });
  insertMany(defaultGames);
}

// ========== SEED DEFAULT ADBLUE CONFIG (only if table is empty) ==========
const adblueCount = db.prepare('SELECT COUNT(*) as cnt FROM adblue_config').get();
if (adblueCount.cnt === 0) {
  const insertAdblue = db.prepare(`INSERT INTO adblue_config (game_slug, variable_name, it_value, key_value, script_url) VALUES (@game_slug, @variable_name, @it_value, @key_value, @script_url)`);
  const defaultAdblue = [
    { game_slug: 'BeamNG-drive-Mobile', variable_name: 'PKiWi_Ojz_wYrvyc', it_value: 4428106, key_value: '2bb12', script_url: 'https://da4talg8ap14y.cloudfront.net/5b1c47d.js' },
    { game_slug: 'GTA-5-Mobile', variable_name: 'PKiWi_Ojz_wYrvyc', it_value: 4455572, key_value: 'e7e4f', script_url: 'https://da4talg8ap14y.cloudfront.net/5b1c47d.js' },
    { game_slug: 'Assetto-Corsa-Mobile', variable_name: 'PKiWi_Ojz_wYrvyc', it_value: 4455972, key_value: '5c9ff', script_url: 'https://da4talg8ap14y.cloudfront.net/5b1c47d.js' },
    { game_slug: 'Forza-Horizon-5', variable_name: 'PKiWi_Ojz_wYrvyc', it_value: 4455992, key_value: '146ef', script_url: 'https://da4talg8ap14y.cloudfront.net/5b1c47d.js' },
    { game_slug: 'ETS-2-Mobile', variable_name: 'PKiWi_Ojz_wYrvyc', it_value: 4513374, key_value: 'f32e1', script_url: 'https://da4talg8ap14y.cloudfront.net/5b1c47d.js' },
    { game_slug: 'Watchdogs2-Mobile', variable_name: 'LSggc_lIq_uBTErc', it_value: 4513158, key_value: '28405', script_url: 'https://da4talg8ap14y.cloudfront.net/e6fbc02.js' },
    { game_slug: 'The-Crew-Motorfest-Mobile', variable_name: 'PKiWi_Ojz_wYrvyc', it_value: 4476533, key_value: '8af25', script_url: 'https://da4talg8ap14y.cloudfront.net/5b1c47d.js' }
  ];
  const insertManyAB = db.transaction((items) => { for (const a of items) insertAdblue.run(a); });
  insertManyAB(defaultAdblue);
}

// Add deleted_at column to games if missing
try { db.exec(`ALTER TABLE games ADD COLUMN deleted_at DATETIME DEFAULT NULL`); } catch(e) {}

// Add sentiment columns to existing tables if they don't have them yet
try { db.exec(`ALTER TABLE reviews ADD COLUMN sentiment TEXT DEFAULT 'positive'`); } catch(e) {}
try { db.exec(`ALTER TABLE reviews ADD COLUMN expires_at DATETIME DEFAULT NULL`); } catch(e) {}
try { db.exec(`ALTER TABLE comments ADD COLUMN sentiment TEXT DEFAULT 'positive'`); } catch(e) {}
try { db.exec(`ALTER TABLE comments ADD COLUMN expires_at DATETIME DEFAULT NULL`); } catch(e) {}

// ========== SENTIMENT ANALYSIS ==========
const BAD_WORDS = [
  // Profanity / insults
  'fuck', 'shit', 'damn', 'ass', 'bitch', 'bastard', 'dick', 'crap', 'piss',
  'idiot', 'stupid', 'dumb', 'moron', 'loser', 'suck', 'sucks', 'sucked',
  'wtf', 'stfu', 'lmao', 'trash', 'garbage', 'worst', 'terrible', 'horrible',
  'pathetic', 'useless', 'worthless', 'disgusting', 'awful', 'hate', 'hated',
  // Scam / spam indicators
  'scam', 'fake', 'virus', 'malware', 'steal', 'stolen', 'fraud', 'ripoff',
  'rip off', 'dont download', 'don\'t download', 'do not download', 'warning',
  'waste of time', 'waste of money', 'clickbait', 'spam', 'phishing',
  // Negative extremes
  'broken', 'doesnt work', 'doesn\'t work', 'does not work', 'not working',
  'crashed', 'crashes', 'laggy', 'unplayable', 'refund', 'delete this',
  'never', 'ruined', 'disaster', 'joke', 'laughable', 'embarrassing'
];

const NEGATIVE_PHRASES = [
  'waste of', 'piece of', 'load of', 'pile of', 'bunch of crap',
  'do not', 'dont', 'don\'t', 'never download', 'stay away',
  'complete garbage', 'total trash', 'absolutely terrible',
  'zero stars', '0 stars', 'negative review', 'one star',
  'poor quality', 'low quality', 'no effort', 'lazy dev'
];

function analyzeSentiment(text, rating) {
  var lower = text.toLowerCase();
  var score = 0; // positive = good, negative = bad

  // Rating-based scoring (reviews only)
  if (rating !== undefined && rating !== null) {
    if (rating <= 1) score -= 3;
    else if (rating <= 2) score -= 1;
    else if (rating >= 4) score += 2;
    else if (rating >= 5) score += 3;
  }

  // Check for bad words
  var badWordCount = 0;
  for (var i = 0; i < BAD_WORDS.length; i++) {
    if (lower.includes(BAD_WORDS[i])) {
      badWordCount++;
      score -= 2;
    }
  }

  // Check negative phrases
  for (var j = 0; j < NEGATIVE_PHRASES.length; j++) {
    if (lower.includes(NEGATIVE_PHRASES[j])) {
      score -= 2;
    }
  }

  // ALL CAPS detection (shouting = usually angry)
  var upperRatio = (text.replace(/[^A-Z]/g, '').length) / Math.max(text.replace(/[^a-zA-Z]/g, '').length, 1);
  if (text.length > 10 && upperRatio > 0.7) {
    score -= 2;
  }

  // Excessive punctuation (!!!, ???)
  if (/[!?]{3,}/.test(text)) {
    score -= 1;
  }

  // Positive keywords bonus
  var positiveWords = ['great', 'amazing', 'awesome', 'love', 'loved', 'excellent',
    'fantastic', 'perfect', 'best', 'good', 'nice', 'cool', 'fun', 'enjoy',
    'smooth', 'recommend', 'recommended', 'beautiful', 'incredible', 'wonderful',
    'superb', 'brilliant', 'outstanding', 'impressive', 'works great', 'well done',
    'thank', 'thanks', 'helpful'];
  for (var k = 0; k < positiveWords.length; k++) {
    if (lower.includes(positiveWords[k])) {
      score += 1;
    }
  }

  // Determine sentiment
  if (score <= -3 || badWordCount >= 2) return 'negative';
  if (score <= -1) return 'neutral';
  return 'positive';
}

// ========== CLEANUP: delete expired negative content ==========
function cleanupExpired() {
  db.exec(`DELETE FROM reviews WHERE expires_at IS NOT NULL AND expires_at <= datetime('now')`);
  db.exec(`DELETE FROM comments WHERE expires_at IS NOT NULL AND expires_at <= datetime('now')`);
}

// Run cleanup every 2 minutes
setInterval(cleanupExpired, 2 * 60 * 1000);
// Also run on startup
cleanupExpired();

// ========== USER HELPERS ==========
const findUserById = db.prepare('SELECT * FROM users WHERE id = ?');
const findUserByEmail = db.prepare('SELECT * FROM users WHERE email = ?');
const findUserByGoogleId = db.prepare('SELECT * FROM users WHERE google_id = ?');

const createUser = db.prepare(`
  INSERT INTO users (username, email, password_hash, google_id, avatar_url)
  VALUES (@username, @email, @password_hash, @google_id, @avatar_url)
`);

const updateUserAvatar = db.prepare('UPDATE users SET avatar_url = ? WHERE id = ?');
const updateUserProfile = db.prepare('UPDATE users SET username = @username, avatar_url = @avatar_url WHERE id = @id');
const updateUserByAdmin = db.prepare('UPDATE users SET username = @username, email = @email, avatar_url = @avatar_url WHERE id = @id');

// ========== REVIEW HELPERS ==========
// Only return reviews that haven't expired
const getReviewsByGame = db.prepare(`
  SELECT r.id, r.rating, r.text, r.sentiment, r.created_at, r.game_slug,
         u.username, u.avatar_url
  FROM reviews r
  JOIN users u ON r.user_id = u.id
  WHERE r.game_slug = ?
    AND (r.expires_at IS NULL OR r.expires_at > datetime('now'))
  ORDER BY r.created_at DESC
`);

const createReview = db.prepare(`
  INSERT INTO reviews (user_id, game_slug, rating, text, sentiment, expires_at)
  VALUES (@user_id, @game_slug, @rating, @text, @sentiment, @expires_at)
`);

const userReviewExists = db.prepare(`
  SELECT id FROM reviews WHERE user_id = ? AND game_slug = ?
`);

// ========== COMMENT HELPERS ==========
// Only return comments that haven't expired
const getCommentsByGame = db.prepare(`
  SELECT c.id, c.text, c.sentiment, c.created_at, c.game_slug,
         u.username, u.avatar_url
  FROM comments c
  JOIN users u ON c.user_id = u.id
  WHERE c.game_slug = ?
    AND (c.expires_at IS NULL OR c.expires_at > datetime('now'))
  ORDER BY c.created_at DESC
`);

const createComment = db.prepare(`
  INSERT INTO comments (user_id, game_slug, text, sentiment, expires_at)
  VALUES (@user_id, @game_slug, @text, @sentiment, @expires_at)
`);

// ========== FAKE ENGAGEMENT HELPERS ==========
const findUserByUsername = db.prepare('SELECT * FROM users WHERE username = ?');
const getReviewCountByGame = db.prepare('SELECT COUNT(*) as cnt FROM reviews WHERE game_slug = ?');
const getCommentCountByGame = db.prepare('SELECT COUNT(*) as cnt FROM comments WHERE game_slug = ?');
const createReviewWithDate = db.prepare(`
  INSERT INTO reviews (user_id, game_slug, rating, text, sentiment, expires_at, created_at)
  VALUES (@user_id, @game_slug, @rating, @text, @sentiment, @expires_at, @created_at)
`);
const createCommentWithDate = db.prepare(`
  INSERT INTO comments (user_id, game_slug, text, sentiment, expires_at, created_at)
  VALUES (@user_id, @game_slug, @text, @sentiment, @expires_at, @created_at)
`);

// ========== GAME HELPERS ==========
const getAllGames = db.prepare('SELECT * FROM games WHERE visible = 1 AND deleted_at IS NULL ORDER BY sort_order ASC');
const getAllGamesAdmin = db.prepare('SELECT * FROM games WHERE deleted_at IS NULL ORDER BY sort_order ASC');
const getTrashedGames = db.prepare('SELECT * FROM games WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC');
const getGameBySlug = db.prepare('SELECT * FROM games WHERE slug = ?');
const getGameById = db.prepare('SELECT * FROM games WHERE id = ?');
const insertGame = db.prepare(`INSERT INTO games (slug, title, image_url, data_game, category, version, release_date, rating, link, sort_order, visible) VALUES (@slug, @title, @image_url, @data_game, @category, @version, @release_date, @rating, @link, @sort_order, @visible)`);
const updateGame = db.prepare(`UPDATE games SET title=@title, image_url=@image_url, data_game=@data_game, category=@category, version=@version, release_date=@release_date, rating=@rating, link=@link, sort_order=@sort_order, visible=@visible WHERE id=@id`);
const softDeleteGame = db.prepare("UPDATE games SET deleted_at = datetime('now') WHERE id = ?");
const restoreGame = db.prepare('UPDATE games SET deleted_at = NULL WHERE id = ?');
const permanentDeleteGame = db.prepare('DELETE FROM games WHERE id = ?');

// ========== ADBLUE CONFIG HELPERS ==========
const getAllAdblue = db.prepare('SELECT * FROM adblue_config ORDER BY game_slug ASC');
const getAdblueBySlug = db.prepare('SELECT * FROM adblue_config WHERE game_slug = ?');
const upsertAdblue = db.prepare(`INSERT INTO adblue_config (game_slug, variable_name, it_value, key_value, script_url, updated_at) VALUES (@game_slug, @variable_name, @it_value, @key_value, @script_url, datetime('now')) ON CONFLICT(game_slug) DO UPDATE SET variable_name=@variable_name, it_value=@it_value, key_value=@key_value, script_url=@script_url, updated_at=datetime('now')`);
const deleteAdblue = db.prepare('DELETE FROM adblue_config WHERE id = ?');

// ========== SITE CONFIG HELPERS ==========
const getConfig = db.prepare('SELECT value FROM site_config WHERE key = ?');
const setConfig = db.prepare(`INSERT INTO site_config (key, value) VALUES (@key, @value) ON CONFLICT(key) DO UPDATE SET value=@value`);
const getAllConfig = db.prepare('SELECT * FROM site_config ORDER BY key ASC');

// ========== ADMIN: USER HELPERS ==========
const getAllUsers = db.prepare('SELECT id, username, email, avatar_url, created_at FROM users ORDER BY created_at DESC');
const deleteUser = db.prepare('DELETE FROM users WHERE id = ?');
const getAllReviews = db.prepare(`SELECT r.*, u.username, u.email FROM reviews r JOIN users u ON r.user_id = u.id ORDER BY r.created_at DESC`);
const getAllComments = db.prepare(`SELECT c.*, u.username, u.email FROM comments c JOIN users u ON c.user_id = u.id ORDER BY c.created_at DESC`);
const deleteReview = db.prepare('DELETE FROM reviews WHERE id = ?');
const deleteComment = db.prepare('DELETE FROM comments WHERE id = ?');

module.exports = {
  db,
  findUserById,
  findUserByEmail,
  findUserByGoogleId,
  createUser,
  updateUserAvatar,
  updateUserProfile,
  updateUserByAdmin,
  getReviewsByGame,
  createReview,
  userReviewExists,
  getCommentsByGame,
  createComment,
  analyzeSentiment,
  cleanupExpired,
  // Admin - Games
  getAllGames,
  getAllGamesAdmin,
  getTrashedGames,
  getGameBySlug,
  getGameById,
  insertGame,
  updateGame,
  softDeleteGame,
  restoreGame,
  permanentDeleteGame,
  // Fake engagement
  findUserByUsername,
  getReviewCountByGame,
  getCommentCountByGame,
  createReviewWithDate,
  createCommentWithDate,
  // Admin - AdBlue
  getAllAdblue,
  getAdblueBySlug,
  upsertAdblue,
  deleteAdblue,
  // Admin - Config
  getConfig,
  setConfig,
  getAllConfig,
  // Admin - Users/Content
  getAllUsers,
  deleteUser,
  getAllReviews,
  getAllComments,
  deleteReview,
  deleteComment
};
