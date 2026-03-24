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

Pulls latest `main`, runs `npm ci`, Prisma, build, **refreshes the systemd unit** (avoids stale `ExecStart`), and restarts the service.

**Latest `main`:**

```bash
curl -fsSL https://raw.githubusercontent.com/mazh-cp/CP_Migration_Tool/main/deploy/update_azure_ubuntu.sh | sudo bash
```

**Pinned release (example v1.1.0):** set `BRANCH` to the tag so the server checkout matches the release:

```bash
BRANCH=v1.1.0 curl -fsSL https://raw.githubusercontent.com/mazh-cp/CP_Migration_Tool/v1.1.0/deploy/update_azure_ubuntu.sh | sudo bash
```

Optional: `BRANCH=main PORT=3000` if you need non-default branch or port for the unit file (health checks also read `PORT` from `apps/web/.env` when set). Override doc banner: `DOC_RELEASE_TAG=v1.1.0`.

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
| `Unexpected token '<', "<!DOCTYPE"...` when importing/parsing | The browser received an **HTML** error page (not JSON). Often a **reverse proxy** (Nginx, Azure App Gateway, load balancer) rejecting a large POST or returning 502/504 HTML. See **Large uploads / HTML instead of JSON** below. |
| **HTTP 504** on **Run Parse** (HTML error in alert) | **Gateway timeout:** the proxy gave up before the app finished. Current app returns **202** quickly and finishes parse in the background — **upgrade to latest `main`**. Also raise timeouts: **Azure Application Gateway** → backend settings → **Request timeout** (up to 900s on v2 where supported); **Nginx** → `proxy_read_timeout 600s;` `proxy_send_timeout 600s;` and reload. |

### Large uploads / HTML instead of JSON

**Important:** `client_max_body_size 50m;` is **not** a shell command. It is a line you put inside a **web server config file** (only if you use Nginx). Pasting it at the bash prompt will show `command not found`.

**Default VM install (this repo’s script)** runs the app on **port 3000** with **systemd** and does **not** install Nginx. If `sudo nginx` says `command not found`, Nginx is simply not installed — that is normal unless you added it yourself.

| How you reach the app | What to change |
|----------------------|----------------|
| **Browser → `http://VM:3000` only** | No Nginx involved. Raise the app limit: edit `/opt/cp_migration_tool/apps/web/.env`, set e.g. `MAX_UPLOAD_MB=50`, then `sudo systemctl restart cp-migration-tool`. Default is 25 MB. |
| **Azure / corporate URL** (HTTPS, custom domain) | Something else terminates TLS or proxies traffic. In **Azure Portal**, check **Application Gateway**, **Front Door**, **Load Balancer + VM**, or a **jump host Nginx**. Increase **request body / WAF / upload** limits there, or install Nginx on the VM and proxy to `127.0.0.1:3000` with the snippet below. |
| **You want Nginx on the VM** | Install it, edit a site file, then reload: `sudo apt update && sudo apt install -y nginx`, edit e.g. `/etc/nginx/sites-available/default` (or your vhost), add the `location` block below inside `server { }`, then `sudo nginx -t && sudo systemctl reload nginx`. |

### Nginx in front of Migrator (optional; recommended limits if you use Nginx)

```nginx
location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    client_max_body_size 50m;
    proxy_read_timeout 600s;
    proxy_send_timeout 600s;
    proxy_connect_timeout 60s;
}
```

## Service Commands

```bash
sudo systemctl status cp-migration-tool
sudo systemctl restart cp-migration-tool
journalctl -u cp-migration-tool -f
```
