#!/bin/bash
# Run this ON the VPS to fix PM2 error. Usage: bash fix-pm2.sh
# Or: ssh root@46.225.175.37 "bash -s" < fix-pm2.sh

set -e
APP_DIR="/var/www/modxnet"
cd "$APP_DIR" || exit 1

echo "=== Fixing ModXnet PM2 ==="

# Install build tools for better-sqlite3
apt-get update -qq && apt-get install -y build-essential python3 2>/dev/null || true

# Rebuild native modules
echo "Reinstalling dependencies..."
rm -rf node_modules
npm install

# Restart PM2
pm2 delete modxnet 2>/dev/null || true
pm2 start server.js --name modxnet --cwd "$APP_DIR"
pm2 save

echo ""
echo "Check status: pm2 status"
echo "View logs: pm2 logs modxnet"
