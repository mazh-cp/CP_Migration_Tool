# Remote Installation — Migrator

Stable installation for Ubuntu 22.04/24.04 VMs (Azure, AWS, on-prem).

## One-Command Install

```bash
curl -fsSL https://raw.githubusercontent.com/mazh-cp/CP_Migration_Tool/main/deploy/install_azure_ubuntu.sh | sudo bash
```

## Default Login

| Field | Value |
|-------|-------|
| Username | `admin` |
| Password | `changeme` |

**Change immediately** after first login: Settings → or edit `/opt/cp_migration_tool/apps/web/.env`.

## Differences from Local Dev

| Aspect | Local | Remote |
|--------|-------|--------|
| .env loading | Next.js auto-loads | Node loader (`load-env.js`) — no shell expansion |
| Special chars in password | Works | Use quotes: `AUTH_PASSWORD='Pass$123'` |
| Start command | `npm run dev` | `start.sh` → `node load-env.js` → Next.js |
| Bind | localhost | 0.0.0.0:3000 |
| Database | ./data/dev.db | /opt/.../apps/web/data/dev.db |

## Changing Password via SSH

Use an editor (not `sed`) for passwords with `$`, `&`, etc.:

```bash
ssh user@vm-ip "sudo nano /opt/cp_migration_tool/apps/web/.env"
```

Set `AUTH_PASSWORD='YourNewPassword'` (single quotes for special chars), save, then:

```bash
sudo systemctl restart cp-migration-tool
```

## One-Command Production Upgrade

Pulls latest `main`, runs `npm ci`, Prisma, build, **refreshes the systemd unit** (avoids stale `ExecStart`), and restarts the service:

```bash
curl -fsSL https://raw.githubusercontent.com/mazh-cp/CP_Migration_Tool/main/deploy/update_azure_ubuntu.sh | sudo bash
```

Optional: `BRANCH=main PORT=3000` if you need non-default branch or port for the unit file (health checks also read `PORT` from `apps/web/.env` when set).

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Login fails | Check `journalctl -u cp-migration-tool -n 30` for "Login failed" — shows `authEnvSet`, `expectedUser` |
| authEnvSet: false | .env not loading; ensure `start.sh` uses `node load-env.js` (run reinstall) |
| Password with $ | Use quotes in .env: `AUTH_PASSWORD='CPwin$$'` |
| 500 errors | See journalctl. Ensure SESSION_SECRET in .env is 32+ chars; data dir exists: `sudo mkdir -p /opt/cp_migration_tool/apps/web/data` |
| Login OK but redirects to login | Using HTTP (not HTTPS). Add `COOKIE_SECURE=false` to .env and restart |
| "Invalid credentials" (authEnvSet: true) | Run `curl http://YOUR-VM:3000/api/auth/diagnostic` — check `authPasswordLength`; must match password you type (e.g. "changeme" = 8) |
| Health check fails | `sudo systemctl status cp-migration-tool`; check logs |
| `systemctl` status **203/EXEC** | `ExecStart` path invalid or `start.sh` not executable. Run the **upgrade script** above (it reinstalls the unit and `chmod +x start.sh`). Verify: `test -x /opt/cp_migration_tool/apps/web/start.sh` |
| `Failed to find Server Action` in logs after deploy | Harmless noise from browsers still on an old JS bundle; hard refresh (Ctrl+Shift+R) or clear site data. |

## Service Commands

```bash
sudo systemctl status cp-migration-tool
sudo systemctl restart cp-migration-tool
journalctl -u cp-migration-tool -f
```
