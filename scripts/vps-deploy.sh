#!/usr/bin/env bash
# Run ON the VPS (or: ssh root@HOST 'bash -s' < scripts/vps-deploy.sh)
set -euo pipefail
APP_DIR="${APP_DIR:-/var/www/modxnet}"
cd "$APP_DIR"

echo "==> [1] Git: fetch + reset to origin/main"
git fetch origin
git reset --hard origin/main

echo "==> [2] PM2: restart modxnet + save"
pm2 restart modxnet
pm2 save

echo "==> [3] PM2 status"
pm2 status

echo "==> [4] Recent logs (grep comeback-blast / SMTP)"
pm2 logs modxnet --lines 200 --nostream 2>&1 | grep -E 'comeback-blast|SMTP connection|SMTP connection FAILED' | tail -n 50 || true

echo "==> [5] Last 40 log lines (any)"
pm2 logs modxnet --lines 40 --nostream 2>&1 | tail -n 40

PORT="$(grep -E '^PORT=' .env 2>/dev/null | cut -d= -f2 | tr -d '\r' || true)"
PORT="${PORT:-3334}"
echo "==> [6] Health http://127.0.0.1:${PORT}/health"
curl -sS "http://127.0.0.1:${PORT}/health" && echo "" || echo "(curl failed — check PORT in .env / nginx)"

echo "==> [7] Broadcast status route (401 = OK, route exists; 200 = logged in as admin)"
code="$(curl -sS -o /dev/null -w '%{http_code}' "http://127.0.0.1:${PORT}/api/admin/email/broadcast-status" || echo 'err')"
echo "HTTP $code"

echo "Done. Open Admin → Home and refresh 'Email broadcast status' while signed in."
echo "Note: Personal Gmail caps ~500 recipients/day; use Workspace or SES/SendGrid for large lists."
