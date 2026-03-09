#!/bin/bash
# =============================================================================
# CP Migration Tool — Single-command Ubuntu/Azure installer
# Run: curl -fsSL https://raw.githubusercontent.com/mazh-cp/CP_Migration_Tool/main/deploy/install_azure_ubuntu.sh | sudo bash
# Compatible with Ubuntu 22.04 and 24.04
# =============================================================================
set -e

APP_DIR="/opt/cp_migration_tool"
SERVICE_USER="cpmt"
REPO_URL="${REPO_URL:-https://github.com/mazh-cp/CP_Migration_Tool.git}"
BRANCH="${BRANCH:-main}"
PORT="${PORT:-3000}"

# Re-exec with sudo if not root
if [ "$(id -u)" -ne 0 ]; then
  echo "==> Re-running with sudo..."
  exec sudo bash "$0" "$@"
fi

echo ""
echo "=============================================="
echo "  CP Migration Tool — Ubuntu Installer"
echo "=============================================="
echo "  App dir: $APP_DIR"
echo "  Port:    $PORT"
echo "  Repo:    $REPO_URL ($BRANCH)"
echo "=============================================="
echo ""

# Install Node.js LTS if not present
if ! command -v node &>/dev/null; then
  echo "==> Installing Node.js LTS (20.x)..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi
echo "==> Node $(node -v), npm $(npm -v)"

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
  chown -R "$SERVICE_USER:$SERVICE_USER" "$APP_DIR"
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

# Create data directories first (required for SQLite)
echo "==> Creating data directories..."
mkdir -p "$APP_DIR/apps/web/data"
mkdir -p "$APP_DIR/apps/web/data/uploads"
chown -R "$SERVICE_USER:$SERVICE_USER" "$APP_DIR/apps/web/data"

# Create or update .env
ENV_FILE="$APP_DIR/apps/web/.env"
ENV_EXAMPLE="$APP_DIR/apps/web/.env.example"

if [ ! -f "$ENV_FILE" ]; then
  echo "==> Creating .env from template..."
  cp "$ENV_EXAMPLE" "$ENV_FILE"
  # Generate secure SESSION_SECRET (32+ chars)
  SECRET=$(openssl rand -base64 32 2>/dev/null || head -c 32 /dev/urandom | base64 2>/dev/null || echo "your-secret-key-min-32-chars-please-change")
  sed -i "s|SESSION_SECRET=.*|SESSION_SECRET=$SECRET|" "$ENV_FILE"
  sed -i "s|NODE_ENV=.*|NODE_ENV=production|" "$ENV_FILE"
  # Use absolute path for SQLite
  sed -i "s|DATABASE_URL=.*|DATABASE_URL=file:$APP_DIR/apps/web/data/dev.db|" "$ENV_FILE"
  chown "$SERVICE_USER:$SERVICE_USER" "$ENV_FILE"
  echo "    Generated SESSION_SECRET automatically"
else
  echo "==> .env exists, preserving (ensure DATABASE_URL, AUTH_*, SESSION_SECRET are set)"
fi

# Ensure NODE_ENV=production in service (override any .env)
echo "==> Setting up database..."
cd "$APP_DIR/apps/web"
sudo -u "$SERVICE_USER" npx prisma generate
sudo -u "$SERVICE_USER" npx prisma db push --accept-data-loss 2>/dev/null || true
cd "$APP_DIR"

# Build
echo "==> Building application (this may take 1-2 minutes)..."
sudo -u "$SERVICE_USER" npm run build

# Install systemd service
echo "==> Installing systemd service..."
cat > /etc/systemd/system/cp-migration-tool.service << EOF
[Unit]
Description=CP Migration Tool - Cisco ASA/FTD to Check Point Migration
After=network.target

[Service]
Type=simple
User=$SERVICE_USER
WorkingDirectory=$APP_DIR/apps/web
Environment=NODE_ENV=production
Environment=HOST=0.0.0.0
Environment=PORT=$PORT
EnvironmentFile=-$ENV_FILE
ExecStart=/usr/bin/npx next start -H 0.0.0.0 -p $PORT
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

# Open UFW port if active
if command -v ufw &>/dev/null && ufw status 2>/dev/null | grep -q "Status: active"; then
  echo "==> Opening UFW port $PORT..."
  ufw allow "$PORT"/tcp 2>/dev/null || true
fi

# Enable and start
echo "==> Enabling and starting service..."
systemctl daemon-reload
systemctl enable cp-migration-tool
systemctl restart cp-migration-tool

# Wait for health (up to 60 seconds)
echo "==> Waiting for app to start..."
for i in 1 2 3 4 5 6 7 8 9 10 11 12; do
  sleep 5
  if curl -sf "http://127.0.0.1:$PORT/health" >/dev/null 2>&1; then
    echo "    Healthy after ${i}x5s"
    break
  fi
  echo "    Attempt $i/12..."
done

# Result
if curl -sf "http://127.0.0.1:$PORT/health" >/dev/null 2>&1; then
  echo ""
  echo "=============================================="
  echo "  SUCCESS — CP Migration Tool is running"
  echo "=============================================="
  echo ""
  echo "  App:     http://<YOUR-VM-IP>:$PORT"
  echo "  Health:  http://127.0.0.1:$PORT/health"
  echo "  Ready:   http://127.0.0.1:$PORT/ready"
  echo ""
  echo "  Commands:"
  echo "    status:  sudo systemctl status cp-migration-tool"
  echo "    logs:    journalctl -u cp-migration-tool -f"
  echo "    restart: sudo systemctl restart cp-migration-tool"
  echo ""
  echo "  Optional: Edit $ENV_FILE to set AUTH_USERNAME, AUTH_PASSWORD (default: admin/changeme)"
  echo ""
else
  echo ""
  echo "=============================================="
  echo "  WARNING — Health check failed"
  echo "=============================================="
  echo ""
  journalctl -u cp-migration-tool -n 50 --no-pager 2>/dev/null || true
  echo ""
  echo "  Troubleshoot: journalctl -u cp-migration-tool -f"
  exit 1
fi
