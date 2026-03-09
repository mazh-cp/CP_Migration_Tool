# Deployment — CP Migration Tool

## Single-Command Install (Remote VM)

From any Ubuntu 22.04/24.04 VM (Azure, AWS, on-prem):

```bash
curl -fsSL https://raw.githubusercontent.com/mazh-cp/CP_Migration_Tool/main/deploy/install_azure_ubuntu.sh | sudo bash
```

This will:

- Install Node.js LTS (20.x) if needed
- Clone the repo to `/opt/cp_migration_tool`
- Create service user `cpmt`
- Create data directories and generate SESSION_SECRET
- Build and start the app on port 3000
- Open UFW port 3000 if UFW is active

---

## Manual Install

### Option 1: Git clone + run

```bash
git clone https://github.com/mazh-cp/CP_Migration_Tool.git
cd CP_Migration_Tool
sudo bash deploy/install_azure_ubuntu.sh
```

### Option 2: Manual steps

```bash
npm install
npm run build
cd apps/web && npx prisma generate && npx prisma db push
HOST=0.0.0.0 PORT=3000 npm run start
```

---

## Environment

`.env` is at `/opt/cp_migration_tool/apps/web/.env` (after install).

| Variable        | Required | Description                          |
|-----------------|----------|--------------------------------------|
| `DATABASE_URL`  | Yes      | SQLite path (installer sets absolute)|
| `AUTH_USERNAME` | Yes      | Login username (default: admin)      |
| `AUTH_PASSWORD` | Yes      | Login password (default: changeme)   |
| `SESSION_SECRET`| Yes      | Min 32 chars (installer can generate)|

Optional: `CONFIG_PIN`, `UPLOAD_DIR`, `MAX_UPLOAD_MB`, `LOG_LEVEL`.

---

## Post-Install

1. **Change credentials:** Edit `/opt/cp_migration_tool/apps/web/.env` — set `AUTH_USERNAME`, `AUTH_PASSWORD`
2. **Restart:** `sudo systemctl restart cp-migration-tool`
3. **Verify:** `curl http://localhost:3000/health` → `{"status":"ok"}`
4. **Access:** `http://<VM-PUBLIC-IP>:3000`

---

## Service Commands

| Command | Description |
|---------|-------------|
| `sudo systemctl status cp-migration-tool` | Status |
| `sudo systemctl restart cp-migration-tool` | Restart |
| `journalctl -u cp-migration-tool -f` | Logs |

---

## Port 3000

The app binds to `0.0.0.0:3000`. Ensure Azure NSG / firewall allows inbound TCP 3000 for external access.
