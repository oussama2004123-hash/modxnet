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
