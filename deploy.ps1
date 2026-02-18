# ModXnet VPS Deployment Script
# Run: .\deploy.ps1
# You will be prompted for the SSH password when connecting.

$VPS_HOST = "46.225.175.37"
$VPS_USER = "root"
$APP_DIR = "/var/www/modxnet"

Write-Host "=== ModXnet VPS Deploy ===" -ForegroundColor Cyan
Write-Host "Target: $VPS_USER@$VPS_HOST" -ForegroundColor Gray
Write-Host ""

# Step 1: Copy deploy script to VPS (convert to Unix LF line endings for Linux)
Write-Host "[1/3] Copying deploy script to VPS..." -ForegroundColor Yellow
$scriptContent = [System.IO.File]::ReadAllText("$PWD\deploy-remote.sh", [System.Text.Encoding]::UTF8).Replace("`r`n","`n").Replace("`r","`n")
[System.IO.File]::WriteAllText("$PWD\deploy-remote-unix.sh", $scriptContent, [System.Text.UTF8Encoding]::new($false))
scp -o StrictHostKeyChecking=accept-new .\deploy-remote-unix.sh "${VPS_USER}@${VPS_HOST}:/tmp/deploy-remote.sh"
Remove-Item .\deploy-remote-unix.sh -ErrorAction SilentlyContinue
if ($LASTEXITCODE -ne 0) {
    Write-Host "SCP failed. Check your SSH connection." -ForegroundColor Red
    exit 1
}

# Step 2: Copy .env to VPS /tmp (deploy script will move to app dir)
Write-Host "[2/3] Copying .env to VPS..." -ForegroundColor Yellow
$envContent = Get-Content .\.env -Raw
$envContent = $envContent -replace 'GOOGLE_CALLBACK_URL=.*', 'GOOGLE_CALLBACK_URL=https://modxnet.com/api/auth/google/callback'
if ($envContent -notmatch 'SITE_URL=') { $envContent = $envContent + "`nSITE_URL=https://modxnet.com" }
if ($envContent -notmatch 'NODE_ENV=') { $envContent = $envContent + "`nNODE_ENV=production" }
$envContent | Out-File -FilePath .\.env.production -Encoding utf8 -NoNewline
scp -o StrictHostKeyChecking=accept-new .\.env.production "${VPS_USER}@${VPS_HOST}:/tmp/modxnet.env"
Remove-Item .\.env.production -ErrorAction SilentlyContinue

# Step 3: Run deploy script on VPS
Write-Host "[3/3] Running deployment on VPS (enter password when prompted)..." -ForegroundColor Yellow
$remoteCommands = "bash /tmp/deploy-remote.sh"
ssh -o StrictHostKeyChecking=accept-new "${VPS_USER}@${VPS_HOST}" $remoteCommands

Write-Host ""
Write-Host "=== Done ===" -ForegroundColor Green
Write-Host "Site should be live at https://modxnet.com (ensure domain points to $VPS_HOST)"
