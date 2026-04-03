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

**Optional (same project, before or with parse):**

- **FortiAnalyzer** — `sourceType` **fortianalyzer** (JSON or CSV hit data) can be added so parse merges **hit counts** into normalized rules when a firewall config artifact exists. Import the **latest** firewall config by upload time when combining artifacts.

End-user detail: [USER_GUIDE.md](USER_GUIDE.md). State machine and API-oriented flow: [docs/process-flow.md](docs/process-flow.md).

---

## FortiManager (policy package) → Check Point — operator workflow

Same **Parse → Map → Validate → Export** stepper as FortiGate; only **Import** differs. You need the **ADOM** name, **policy package** name, and optionally a **VDOM** segment if the package is scoped per VDOM.

1. **Prepare inputs**  
   Either:  
   - A **JSON bundle** that matches what Migrator expects (policy package firewall rules plus object DB: addresses, groups, custom services, service groups)—typically from FortiManager JSON API export or a prior live pull, **or**  
   - **Network access** from the **Migrator server** to FortiManager’s HTTPS **base URL** for **live pull** (production installs usually require a routable manager URL; lab-only **`FMG_ALLOW_PRIVATE_URLS`** relaxes private/loopback checks—see `apps/web/.env.example`).

2. **Create project**  
   **Projects** → **New Project** → **Source type: Fortinet FortiManager (policy package)** → **Create & Import**.

3. **Import — file or paste**  
   On **Import**, select **Fortinet FortiManager (JSON bundle)**. **Paste** the JSON or **upload** a `.json` file → **Import & Continue**. Respect **`MAX_UPLOAD_MB`**; **413** if over limit.

4. **Import — live API pull (alternative)**  
   On the same Import page, use **FortiManager — live API pull**:  
   - **Base URL** — e.g. `https://fortimanager.example.com` (no trailing slash required).  
   - **Session key** from an API admin on FortiManager, **or** enable **username / password** for a one-shot login (credentials are used only for that request and are **not stored**).  
   - **ADOM** and **Policy package** (required); **VDOM** if applicable.  
   - **Pull from FortiManager & import**.  
   On success you are sent to **Parse** like file import.

5. **Parse**  
   **Run Parse** (async **202** + poll). Review counts and warnings → **Map Interfaces**.

6. **Map Interfaces → Map Objects → Map Policy → Validate → Export**  
   Same as the FortiGate workflow above.

**Optional:** Add **FortiAnalyzer** hit data on Import before parse to merge hit counts when a compatible firewall/manager artifact set exists.

---

## Security Checklist

1. Use strong `AUTH_PASSWORD` and `SESSION_SECRET`
2. Set `SESSION_SECRET` (min 32 chars) in production
3. Use HTTPS in production
4. Protect Settings with `CONFIG_PIN` if needed
5. See [SECURITY.md](SECURITY.md) for full details
