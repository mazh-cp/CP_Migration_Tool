# Remote Installation — CP Migration Tool

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

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Login fails | Check `journalctl -u cp-migration-tool -n 30` for "Login failed" — shows `authEnvSet`, `expectedUser` |
| authEnvSet: false | .env not loading; ensure `start.sh` uses `node load-env.js` (run reinstall) |
| Password with $ | Use quotes in .env: `AUTH_PASSWORD='CPwin$$'` |
| 500 errors | See journalctl. Ensure SESSION_SECRET in .env is 32+ chars; data dir exists: `sudo mkdir -p /opt/cp_migration_tool/apps/web/data` |
| Health check fails | `sudo systemctl status cp-migration-tool`; check logs |

## Service Commands

```bash
sudo systemctl status cp-migration-tool
sudo systemctl restart cp-migration-tool
journalctl -u cp-migration-tool -f
```
