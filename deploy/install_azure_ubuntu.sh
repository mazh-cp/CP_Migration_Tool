#!/bin/bash
# =============================================================================
# CP Migration Tool — Ubuntu/Azure one-command installer
# Compatible with Ubuntu 22.04 and 24.04
# =============================================================================
set -e

APP_NAME="cp-migration-tool"
APP_DIR="/opt/cp_migration_tool"
SERVICE_USER="cpmt"
REPO_URL="${REPO_URL:-https://github.com/mazh-cp/CP_Migration_Tool.git}"
BRANCH="${BRANCH:-main}"
PORT="${PORT:-3000}"

echo "==> CP Migration Tool — Ubuntu Installer"
echo "    App dir: $APP_DIR"
echo "    Port: $PORT"
echo ""

# Require root
if [ "$(id -u)" -ne 0 ]; then
  echo "ERROR: This script must be run with sudo" >&2
  exit 1
fi

# Install Node.js LTS if not present
if ! command -v node &>/dev/null; then
  echo "==> Installing Node.js LTS (20.x)..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi

# Install build essentials, git, curl
echo "==> Installing build dependencies..."
apt-get update -qq
apt-get install -y -qq git curl build-essential

# Create service user
if ! id "$SERVICE_USER" &>/dev/null; then
  echo "==> Creating service user: $SERVICE_USER"
  useradd -r -s /bin/false -d "$APP_DIR" "$SERVICE_USER"
fi

# Clone or update repo
if [ -d "$APP_DIR/.git" ]; then
  echo "==> Updating existing installation..."
  cd "$APP_DIR"
  sudo -u "$SERVICE_USER" git fetch origin
  sudo -u "$SERVICE_USER" git checkout -f "$BRANCH"
  sudo -u "$SERVICE_USER" git pull origin "$BRANCH" || true
else
  echo "==> Cloning repository..."
  rm -rf "$APP_DIR"
  git clone --depth 1 -b "$BRANCH" "$REPO_URL" "$APP_DIR"
  chown -R "$SERVICE_USER:$SERVICE_USER" "$APP_DIR"
  cd "$APP_DIR"
fi

# Install dependencies
echo "==> Installing npm dependencies..."
sudo -u "$SERVICE_USER" npm ci

# Create data directories (required for SQLite and uploads)
echo "==> Creating data directories..."
mkdir -p "$APP_DIR/apps/web/data"
mkdir -p "$APP_DIR/apps/web/data/uploads"
chown -R "$SERVICE_USER:$SERVICE_USER" "$APP_DIR/apps/web/data"

# Create .env from template if missing
ENV_FILE="$APP_DIR/apps/web/.env"
ENV_EXAMPLE="$APP_DIR/apps/web/.env.example"
if [ ! -f "$ENV_FILE" ]; then
  echo "==> Creating .env from template..."
  cp "$ENV_EXAMPLE" "$ENV_FILE"
  chown "$SERVICE_USER:$SERVICE_USER" "$ENV_FILE"
  echo "    IMPORTANT: Edit $ENV_FILE and set AUTH_USERNAME, AUTH_PASSWORD, SESSION_SECRET"
else
  echo "==> .env already exists, skipping template"
fi

# Generate Prisma client and push schema
echo "==> Setting up database..."
cd "$APP_DIR/apps/web"
sudo -u "$SERVICE_USER" npx prisma generate
sudo -u "$SERVICE_USER" npx prisma db push --accept-data-loss 2>/dev/null || true
cd "$APP_DIR"

# Build
echo "==> Building application..."
sudo -u "$SERVICE_USER" npm run build

# Install systemd service
echo "==> Installing systemd service..."
cat > /etc/systemd/system/cp-migration-tool.service << EOF
[Unit]
Description=CP Migration Tool
After=network.target

[Service]
Type=simple
User=$SERVICE_USER
WorkingDirectory=$APP_DIR/apps/web
EnvironmentFile=-$APP_DIR/apps/web/.env
Environment=NODE_ENV=production
Environment=HOST=0.0.0.0
Environment=PORT=$PORT
ExecStart=/usr/bin/npx next start -H 0.0.0.0 -p $PORT
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

# Open UFW port if UFW is active
if command -v ufw &>/dev/null && ufw status | grep -q "Status: active"; then
  echo "==> Opening UFW port $PORT..."
  ufw allow "$PORT"/tcp || true
  ufw status | head -20
fi

# Enable and start service
echo "==> Enabling and starting service..."
systemctl daemon-reload
systemctl enable cp-migration-tool
systemctl restart cp-migration-tool

# Wait for startup (Next.js can take 20-30s on first run on slower VMs)
echo "==> Waiting for app to start..."
for i in 1 2 3 4 5 6 7 8 9 10; do
  sleep 5
  if curl -sf "http://127.0.0.1:$PORT/health" > /dev/null 2>&1; then
    break
  fi
  echo "    Attempt $i/10..."
done

# Verify health
if curl -sf "http://127.0.0.1:$PORT/health" > /dev/null 2>&1; then
  echo ""
  echo "=== SUCCESS ==="
  echo "CP Migration Tool is running."
  echo ""
  echo "  Health:  http://127.0.0.1:$PORT/health"
  echo "  Ready:   http://127.0.0.1:$PORT/ready"
  echo "  App:     http://<YOUR-VM-IP>:$PORT"
  echo ""
  echo "NEXT STEPS:"
  echo "  1. Edit $ENV_FILE and set: AUTH_USERNAME, AUTH_PASSWORD, SESSION_SECRET"
  echo "  2. Restart: sudo systemctl restart cp-migration-tool"
  echo "  3. Open http://<YOUR-VM-PUBLIC-IP>:$PORT in a browser"
  echo ""
  echo "Service: sudo systemctl status cp-migration-tool"
  echo "Logs:    journalctl -u cp-migration-tool -f"
else
  echo ""
  echo "WARNING: Health check failed."
  echo ""
  echo "=== Service logs (last 40 lines) ==="
  journalctl -u cp-migration-tool -n 40 --no-pager 2>/dev/null || true
  echo ""
  echo "Run for live logs: journalctl -u cp-migration-tool -f"
  exit 1
fi
