# Deployment — CP Migration Tool

## Production Build

```bash
npm install
npm run build
cd apps/web && npx prisma generate && npx prisma db push
```

## Start

```bash
PORT=3000 HOST=0.0.0.0 npm run start
```

Or from `apps/web`:
```bash
cd apps/web
HOST=0.0.0.0 PORT=3000 npm run start
```

---

## Environment

1. Copy `apps/web/.env.example` to `apps/web/.env`
2. Set required variables:
   - `DATABASE_URL` — SQLite path
   - `AUTH_USERNAME` / `AUTH_PASSWORD` (or create users via Settings)
   - `SESSION_SECRET` — min 32 characters
3. Optional: `CONFIG_PIN`, `UPLOAD_DIR`, `MAX_UPLOAD_MB`, `LOG_LEVEL`

---

## Ubuntu / Azure One-Command Installer

### Option 1: curl (recommended)

```bash
curl -fsSL https://raw.githubusercontent.com/mazh-cp/CP_Migration_Tool/main/deploy/install_azure_ubuntu.sh | bash
```

### Option 2: git clone + run

```bash
git clone https://github.com/mazh-cp/CP_Migration_Tool.git
cd CP_Migration_Tool
sudo bash deploy/install_azure_ubuntu.sh
```

### Option 3: Manual

1. Install Node.js LTS (20.x)
2. Clone repo
3. Run `deploy/install_azure_ubuntu.sh` with sudo
4. Edit `/opt/cp_migration_tool/.env` with your values
5. Restart: `sudo systemctl restart cp-migration-tool`

---

## Post-Install

1. **Set .env:** Edit `/opt/cp_migration_tool/.env` — set `AUTH_USERNAME`, `AUTH_PASSWORD`, `SESSION_SECRET`
2. **Restart:** `sudo systemctl restart cp-migration-tool`
3. **Verify:** `curl http://localhost:3000/health` → `{"status":"ok"}`
4. **Access:** `http://<VM-PUBLIC-IP>:3000`

---

## Service Commands

| Command | Description |
|---------|-------------|
| `sudo systemctl start cp-migration-tool` | Start |
| `sudo systemctl stop cp-migration-tool` | Stop |
| `sudo systemctl restart cp-migration-tool` | Restart |
| `sudo systemctl status cp-migration-tool` | Status |
| `journalctl -u cp-migration-tool -f` | Logs |

---

## Port 3000

The app binds to `0.0.0.0:3000`. The installer opens UFW port 3000 if UFW is enabled. Ensure your Azure NSG allows inbound TCP 3000 if accessing from the internet.
