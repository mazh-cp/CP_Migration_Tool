#!/bin/bash
# =============================================================================
# Migrator — Single-command Production Updater (Ubuntu/Azure)
# Run:
#   curl -fsSL https://raw.githubusercontent.com/mazh-cp/CP_Migration_Tool/main/deploy/update_azure_ubuntu.sh | sudo bash
# Optional:
#   BRANCH=main PORT=3000 APP_DIR=/opt/cp_migration_tool SERVICE_NAME=cp-migration-tool curl -fsSL ... | sudo bash
# =============================================================================
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/cp_migration_tool}"
SERVICE_USER="${SERVICE_USER:-cpmt}"
SERVICE_NAME="${SERVICE_NAME:-cp-migration-tool}"
REPO_URL="${REPO_URL:-https://github.com/mazh-cp/CP_Migration_Tool.git}"
BRANCH="${BRANCH:-main}"
PORT="${PORT:-3000}"
ENV_FILE="$APP_DIR/apps/web/.env"
START_SH="$APP_DIR/apps/web/start.sh"

# PORT used for health checks (must match systemd + apps/web/.env when set)
derive_port_from_env() {
  [ -f "$ENV_FILE" ] || return 0
  awk -F= '/^[[:space:]]*PORT=/ {
    v = $2
    gsub(/^[ \t]+|[ \t\r]+$/, "", v)
    gsub(/^["\x27]+|["\x27]+$/, "", v)
    if (v != "") { print v; exit }
  }' "$ENV_FILE" 2>/dev/null || true
}

derive_port_for_health() {
  local p="${PORT}"
  local from_env
  from_env="$(derive_port_from_env)"
  if [ -n "$from_env" ]; then
    p="$from_env"
  fi
  echo "$p"
}

if [ "$(id -u)" -ne 0 ]; then
  echo "==> Re-running with sudo..."
  exec sudo bash "$0" "$@"
fi

echo ""
echo "=============================================="
echo "  Migrator — Production Update"
echo "=============================================="
echo "  App dir:      $APP_DIR"
echo "  Branch:       $BRANCH"
echo "  Service:      $SERVICE_NAME"
echo "  Service user: $SERVICE_USER"
echo "  Port:         $PORT"
echo "=============================================="
echo ""

if [ ! -d "$APP_DIR/.git" ]; then
  echo "ERROR: $APP_DIR is not a git checkout."
  echo "Run installer first:"
  echo "  curl -fsSL https://raw.githubusercontent.com/mazh-cp/CP_Migration_Tool/main/deploy/install_azure_ubuntu.sh | sudo bash"
  exit 1
fi

if ! id "$SERVICE_USER" &>/dev/null; then
  echo "ERROR: service user '$SERVICE_USER' does not exist."
  exit 1
fi

echo "==> Ensuring required tools are installed..."
apt-get update -qq
apt-get install -y -qq git curl build-essential

if ! command -v node &>/dev/null; then
  echo "==> Installing Node.js LTS (20.x)..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi
echo "==> Node $(node -v), npm $(npm -v)"

echo "==> Updating repository..."
cd "$APP_DIR"
sudo -u "$SERVICE_USER" git fetch --all --tags --prune
sudo -u "$SERVICE_USER" git checkout -f "$BRANCH"
sudo -u "$SERVICE_USER" git reset --hard "origin/$BRANCH"
chown -R "$SERVICE_USER:$SERVICE_USER" "$APP_DIR"

if [ ! -f "$ENV_FILE" ]; then
  echo "ERROR: Missing $ENV_FILE"
  echo "Create it from apps/web/.env.example and set production values before updating."
  exit 1
fi

echo "==> Preserving existing .env and ensuring safe defaults..."
grep -q '^COOKIE_SECURE=' "$ENV_FILE" || echo "COOKIE_SECURE=false" >> "$ENV_FILE"
if ! grep -q '^DATABASE_URL=file:' "$ENV_FILE"; then
  sed -i "s|^DATABASE_URL=.*|DATABASE_URL=file:$APP_DIR/apps/web/data/dev.db|" "$ENV_FILE" || true
fi
chown "$SERVICE_USER:$SERVICE_USER" "$ENV_FILE"

echo "==> Installing npm dependencies..."
sudo -u "$SERVICE_USER" npm ci

echo "==> Ensuring app data directories..."
mkdir -p "$APP_DIR/apps/web/data/uploads"
chown -R "$SERVICE_USER:$SERVICE_USER" "$APP_DIR/apps/web/data"

echo "==> Running Prisma generate + db push..."
cd "$APP_DIR/apps/web"
sudo -u "$SERVICE_USER" npx prisma generate
sudo -u "$SERVICE_USER" npx prisma db push --accept-data-loss
cd "$APP_DIR"

echo "==> Building application..."
sudo -u "$SERVICE_USER" npm run build

HEALTH_PORT="$(derive_port_for_health)"

echo "==> Ensuring startup wrapper is executable..."
sed -i 's/\r$//' "$START_SH" 2>/dev/null || true
chmod +x "$START_SH" 2>/dev/null || true
if [ ! -f "$START_SH" ]; then
  echo "ERROR: Missing $START_SH (repository layout changed?)"
  exit 1
fi

echo "==> Installing / refreshing systemd unit (fixes 203/EXEC from stale ExecStart)..."
cat > "/etc/systemd/system/${SERVICE_NAME}.service" << EOF
[Unit]
Description=Migrator - Cisco ASA/FTD to Check Point Migration
After=network.target

[Service]
Type=simple
User=$SERVICE_USER
WorkingDirectory=$APP_DIR/apps/web
Environment=NODE_ENV=production
Environment=HOST=0.0.0.0
Environment=PORT=$HEALTH_PORT
ExecStart=$START_SH
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

echo "==> Restarting systemd service..."
systemctl daemon-reload
systemctl restart "$SERVICE_NAME"
systemctl enable "$SERVICE_NAME" >/dev/null 2>&1 || true

echo "==> Waiting for health endpoint (http://127.0.0.1:${HEALTH_PORT}/health)..."
for i in $(seq 1 24); do
  sleep 5
  if curl -sf "http://127.0.0.1:${HEALTH_PORT}/health" >/dev/null 2>&1; then
    echo "    Healthy after ${i}x5s"
    break
  fi
  echo "    Attempt $i/24..."
done

if curl -sf "http://127.0.0.1:${HEALTH_PORT}/health" >/dev/null 2>&1; then
  echo ""
  echo "=============================================="
  echo "  SUCCESS — Production update completed"
  echo "=============================================="
  echo ""
  echo "  App:     http://<YOUR-VM-IP>:${HEALTH_PORT}"
  echo "  Health:  http://127.0.0.1:${HEALTH_PORT}/health"
  echo "  Ready:   http://127.0.0.1:${HEALTH_PORT}/ready"
  echo ""
  echo "  Service status: systemctl status $SERVICE_NAME"
  echo "  Service logs:   journalctl -u $SERVICE_NAME -f"
else
  echo ""
  echo "=============================================="
  echo "  FAILED — Health check did not pass"
  echo "=============================================="
  echo ""
  echo "If systemd shows status=203/EXEC, ExecStart was invalid—this script refreshes the unit; re-run once."
  echo "If browsers show 'Failed to find Server Action', hard-refresh (Ctrl+Shift+R) after deploy."
  journalctl -u "$SERVICE_NAME" -n 100 --no-pager || true
  exit 1
fi
