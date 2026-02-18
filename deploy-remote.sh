#!/bin/bash
# Run this script ON the VPS (Ubuntu) to deploy ModXnet
set -e

APP_DIR="/var/www/modxnet"
REPO_URL="https://github.com/oussama2004123-hash/modxnet.git"

echo "=== ModXnet VPS Deployment ==="

# Install build tools (required for better-sqlite3 native module)
apt-get update -qq
apt-get install -y build-essential python3 2>/dev/null || true

# Install Node.js 20 if not present
if ! command -v node &>/dev/null; then
  echo "Installing Node.js 20..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi
node -v

# Install PM2 globally if not present
if ! command -v pm2 &>/dev/null; then
  echo "Installing PM2..."
  npm install -g pm2
fi
pm2 -v

# Create app directory
mkdir -p "$APP_DIR"
cd "$APP_DIR"

# Clone or pull
if [ -d .git ]; then
  echo "Pulling latest from GitHub..."
  git fetch origin
  git reset --hard origin/main
  git pull origin main
else
  echo "Cloning repository..."
  git clone "$REPO_URL" .
fi

# Install dependencies (better-sqlite3 needs native build)
echo "Installing npm dependencies..."
npm install

# Create or update .env
if [ -f /tmp/modxnet.env ]; then
  echo "Using .env from deploy..."
  cp /tmp/modxnet.env .env
  rm -f /tmp/modxnet.env
elif [ ! -f .env ]; then
  echo "Creating .env from template..."
  cat > .env << 'ENVEOF'
PORT=3334
NODE_ENV=production
SITE_URL=https://modxnet.com
GOOGLE_CALLBACK_URL=https://modxnet.com/api/auth/google/callback
SESSION_SECRET=CHANGE_ME
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
ADMIN_EMAIL=
RAWG_API_KEY=
SMTP_EMAIL=
SMTP_APP_PASSWORD=
CONTACT_RECEIVE_EMAIL=
ENVEOF
  echo "IMPORTANT: Edit .env and add your secrets: nano $APP_DIR/.env"
else
  sed -i 's|GOOGLE_CALLBACK_URL=.*|GOOGLE_CALLBACK_URL=https://modxnet.com/api/auth/google/callback|' .env 2>/dev/null || true
  grep -q "SITE_URL=" .env || echo "SITE_URL=https://modxnet.com" >> .env
  grep -q "NODE_ENV=" .env || echo "NODE_ENV=production" >> .env
fi

# Restart with PM2
echo "Starting with PM2..."
pm2 delete modxnet 2>/dev/null || true
cd "$APP_DIR" && pm2 start server.js --name modxnet --cwd "$APP_DIR"
pm2 save
pm2 startup | tail -1 | bash 2>/dev/null || true

echo ""
echo "=== Deployment complete ==="
echo "App running at http://localhost:3334"
echo "Ensure Nginx/Cloudflare proxies to port 3334"
echo "Edit .env if needed: nano $APP_DIR/.env"
echo "View logs: pm2 logs modxnet"
