# VPS Fix – Why the project may not work

## Most likely causes

1. **Old code / Express 5 crash** – The SPA route `app.get('*')` was removed because it crashes with Express 5. If the VPS hasn’t pulled the latest code, it will keep failing.
2. **`better-sqlite3` native build** – On Ubuntu, the native module needs build tools.
3. **PM2 is stuck in error state** – It may keep restarting and failing.

---

## Fix steps (run on VPS)

Connect to the server:

```bash
ssh root@46.225.175.37
```

Then run:

```bash
# 1. Update code from GitHub
cd /var/www/modxnet
git fetch origin
git reset --hard origin/main
git pull origin main

# 2. Install build tools (for better-sqlite3)
apt-get update -qq && apt-get install -y build-essential python3

# 3. Reinstall dependencies
rm -rf node_modules
npm install

# 4. Ensure .env has production settings
grep -q "SITE_URL=" .env || echo "SITE_URL=https://modxnet.com" >> .env
grep -q "NODE_ENV=" .env || echo "NODE_ENV=production" >> .env

# 5. Restart PM2
pm2 delete modxnet 2>/dev/null || true
pm2 start server.js --name modxnet --cwd /var/www/modxnet
pm2 save

# 6. Check status
pm2 status
pm2 logs modxnet --lines 20
```

---

## If it still fails

Run directly to see the error:

```bash
cd /var/www/modxnet && node server.js
```

Share the full error output. Typical errors:

- **`PathError` / `Missing parameter name`** → still on old code; pull again.
- **`Cannot find module 'better-sqlite3'`** → run `npm install` again.
- **`EADDRINUSE`** → port 3334 is in use; stop other processes or change `PORT` in `.env`.

---

## Google login: `Error 401: disabled_client`

Google shows **“The OAuth client was disabled”** when the **OAuth 2.0 Client ID** in Google Cloud is turned off, deleted, or the project was restricted. **This is not a bug in the Node app** — the server only uses `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` from `.env`.

### What to do (Google Cloud Console)

1. Open **[Google Cloud Console → APIs & Services → Credentials](https://console.cloud.google.com/apis/credentials)** (pick the **same project** that created your Web client).
2. Under **OAuth 2.0 Client IDs**, open your **Web application** client (not “Desktop” or wrong type).
3. If the client is listed but disabled, **enable** it or the project; if it was **deleted**, you must **create a new** “OAuth client ID” → type **Web application**.
4. Under **Authorized redirect URIs**, add **every** URL you use, **exactly** (scheme, host, path — no trailing slash on the path unless you use it):
   - `http://localhost:3334/api/auth/google/callback`
   - `https://modxnet.com/api/auth/google/callback`
   - `https://www.modxnet.com/api/auth/google/callback`
5. **OAuth consent screen** (same project): publishing status must allow your users (**Testing** + test users, or **In production**). If the app is in testing, add Google accounts that should be able to sign in under **Test users**.
6. Copy the new **Client ID** and **Client secret** into `/var/www/modxnet/.env` on the VPS:
   ```bash
   nano /var/www/modxnet/.env
   # Set GOOGLE_CLIENT_ID=... and GOOGLE_CLIENT_SECRET=...
   ```
   Then: `pm2 restart modxnet --update-env`

If the whole **Google Cloud project** is closed or suspended, create a **new project**, set up the OAuth consent screen again, create a new Web client, update `.env`, and restart PM2.

### Security note

If client credentials were ever shared or committed, **create a new OAuth client** or **reset the client secret** in the console and update `.env` only on the server (never commit `.env`).
