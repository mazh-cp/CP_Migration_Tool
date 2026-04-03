# Admin Guide — Migrator

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

## FortiGate (FortiOS) → Check Point — operator workflow

Use this sequence to take a FortiGate configuration through to Check Point export (same stepper as ASA/FTD after import).

1. **Obtain the configuration**  
   Export a FortiOS **full configuration** backup (e.g. **Backup** from GUI, or CLI output such as `show full-configuration`) as plain text. Save as `.conf` or `.txt`. Use a single file per project (match global vs VDOM scope to what you are migrating).

2. **Create project**  
   **Projects** → **New Project** → enter a name → **Source type: Fortinet FortiGate** → **Create & Import**.

3. **Import**  
   On the **Import** page, confirm **Fortinet FortiGate** is selected. **Paste** the config or **upload** the file → **Import & Continue**.  
   Respect **`MAX_UPLOAD_MB`** (default 25). On failure, the API may return **413** if the payload is too large.

4. **Parse**  
   Click **Run Parse**. Parsing runs **asynchronously** (HTTP **202** + `jobId`); the UI polls **status** until completion. Review object/rule/NAT/interface counts and warnings → **Proceed to Map Interfaces**.

5. **Map Interfaces**  
   Map each **source** interface to the intended **Check Point** interface name (and overrides if needed) → save → **Map Objects**.

6. **Map Objects**  
   Review proposed Check Point names for networks, groups, and services; **edit** names or service ports/ranges before export if required → **Map Policy**.

7. **Map Policy**  
   Review access rules and NAT; adjust comments or naming via overrides where supported → **Validate**.

8. **Validate**  
   Resolve **errors** (missing references, invalid names, etc.) using the provided actions → **Export** when clear.

9. **Export**  
   Choose **SMS only**, **Gateway only**, or **Both**; for SMS pick **Mgmt API**, **SmartConsole**, and/or **Both** → **Download** the ZIP/artifacts.

**Optional imports (same project, before or with parse):**

- **FortiAnalyzer** — `sourceType` **fortianalyzer** (JSON or CSV hit data) can be added so parse merges **hit counts** into normalized rules when a firewall config artifact exists. Import the **latest** firewall config by upload time when combining artifacts.
- **FortiManager** — Use **Fortinet FortiManager (policy package)** as the project source type; paste/upload JSON or use **live pull** (`/import/fortimanager-live`) per your deployment policy. Subsequent steps are the same.

End-user detail: [USER_GUIDE.md](USER_GUIDE.md). State machine and API-oriented flow: [docs/process-flow.md](docs/process-flow.md).

---

## Security Checklist

1. Use strong `AUTH_PASSWORD` and `SESSION_SECRET`
2. Set `SESSION_SECRET` (min 32 chars) in production
3. Use HTTPS in production
4. Protect Settings with `CONFIG_PIN` if needed
5. See [SECURITY.md](SECURITY.md) for full details
