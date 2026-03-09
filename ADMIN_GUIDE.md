# Admin Guide — CP Migration Tool

Administration, authentication, RBAC, and configuration.

---

## Access and Authentication

### Login

- Navigate to the application URL (e.g. `http://your-server:3000`)
- Enter **Username** and **Password** (env admin or DB user)
- Click **Sign in** → redirected to Dashboard

### Credentials

| Mode | Description |
|------|-------------|
| Env admin | `AUTH_USERNAME` and `AUTH_PASSWORD` in `.env` — full admin access |
| DB users | Created via Settings by env admin — project-level access |

**Required:** At least one of (AUTH_USERNAME/AUTH_PASSWORD) or DB users for login.

---

## RBAC (Users & Project Access)

- **Admin** (env AUTH_USERNAME): Full access; can manage users and project members
- **Project roles:** owner, admin, editor, viewer
- **Settings → Users & Project Access:** Add users, assign roles per project
- Only the env admin can access Settings RBAC section

---

## Settings

- **Config protection:** If `CONFIG_PIN` is set, enter PIN to unlock
- **Model fetch:** Default (direct) or LiteLLM proxy
- **LiteLLM:** Base URL, model name, API key (stored server-side only)

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | SQLite path (e.g. `file:./data/dev.db`) |
| `AUTH_USERNAME` | Yes* | Admin login username |
| `AUTH_PASSWORD` | Yes* | Admin login password |
| `SESSION_SECRET` | Yes (prod) | JWT secret, min 32 chars |
| `CONFIG_PIN` | No | PIN to lock Settings |
| `UPLOAD_DIR` | No | Upload directory |
| `MAX_UPLOAD_MB` | No | Max upload size MB (default 25) |
| `LOG_LEVEL` | No | trace \| debug \| info \| warn \| error |

*Or create users via Settings (admin required).

---

## Security Checklist

1. Use strong `AUTH_PASSWORD` and `SESSION_SECRET`
2. Set `SESSION_SECRET` (min 32 chars) in production
3. Use HTTPS in production
4. Protect Settings with `CONFIG_PIN` if needed
5. See [SECURITY.md](SECURITY.md) for full details
