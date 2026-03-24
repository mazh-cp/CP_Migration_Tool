# Release Notes — Migrator

## v1.3.0 (2026-03-24) — FTD/FMC advanced ACLs & production upgrade scripts

### Highlights

- **Parse / Map Policy:** **`access-list … advanced`** (FTD/FMC style with `ifc`, `object-group`, `rule-id`) is parsed so policies appear under Map Policy; **`trust`** ACEs map to **allow**.
- **Parser robustness:** **`object-group`** blocks no longer swallow the following **`access-list`** line; **`remark`** lines are ignored cleanly.
- **Normalize:** Resolves **`object-group` / `object`** tokens in rules to registry names.
- **Operations:** **`deploy/upgrade-production.sh`** (canonical server upgrade via curl) and **`deploy/upgrade-remote-production.sh`** (SSH from laptop → curl on VM).

### Upgrade (Ubuntu VM)

**Pinned to v1.3.0:**

```bash
BRANCH=v1.3.0 curl -fsSL https://raw.githubusercontent.com/mazh-cp/CP_Migration_Tool/v1.3.0/deploy/upgrade-production.sh | sudo bash
```

**Latest `main`:**

```bash
curl -fsSL https://raw.githubusercontent.com/mazh-cp/CP_Migration_Tool/main/deploy/upgrade-production.sh | sudo bash
```

**From your workstation (SSH):**

```bash
REMOTE=ubuntu@YOUR-VM ./deploy/upgrade-remote-production.sh v1.3.0
```

After deploy, **hard-refresh** the browser. **Re-run Parse** on projects that use FMC/FTD-style advanced ACL text.

---

## v1.2.0 (2025-03-25) — Production parse reliability (504 / gateway timeouts)

### Highlights

- **Parse:** Background job + **HTTP 202** + status polling — avoids **504** when parse takes longer than reverse-proxy limits.
- **Parse counts:** **`parseCounts`** on **`GET /status?jobId=`** when the job completes, plus **`/normalized-summary`** — no longer downloads full **`/normalized`** just for dashboard numbers (fixes 504 after successful parse on large configs).
- **Validate / Map:** (from v1.1.x line) duplicate rename & service port fixes, FQDN → Check Point **fqdn**, proxy-safe JSON on import.

### Upgrade (Ubuntu VM)

**Latest `main`:**

```bash
curl -fsSL https://raw.githubusercontent.com/mazh-cp/CP_Migration_Tool/main/deploy/update_azure_ubuntu.sh | sudo bash
```

**Pinned to v1.2.0** (server checks out tag `v1.2.0`):

```bash
BRANCH=v1.2.0 curl -fsSL https://raw.githubusercontent.com/mazh-cp/CP_Migration_Tool/v1.2.0/deploy/update_azure_ubuntu.sh | sudo bash
```

After deploy, **hard-refresh** the browser (Ctrl+Shift+R). Re-run **Parse** on affected projects.

---

## v1.1.0 (2025-03-24) — Validate fixes, FQDN mapping, proxy-safe API

### Highlights

- **Validate:** Rename duplicate objects and add service ports from the UI; new `patch-object` API
- **Map Objects:** FQDN sources map to Check Point **fqdn** (re-parse projects to refresh mappings)
- **Production:** Import/parse tolerate HTML error pages from reverse proxies; remote install docs for body limits and `MAX_UPLOAD_MB`

### Upgrade (Ubuntu VM)

**Latest `main`:**

```bash
curl -fsSL https://raw.githubusercontent.com/mazh-cp/CP_Migration_Tool/main/deploy/update_azure_ubuntu.sh | sudo bash
```

**Pinned to this release** (checkout tag `v1.1.0` on the server):

```bash
BRANCH=v1.1.0 curl -fsSL https://raw.githubusercontent.com/mazh-cp/CP_Migration_Tool/v1.1.0/deploy/update_azure_ubuntu.sh | sudo bash
```

After deploy, **re-run Parse** on projects that should pick up FQDN mapping changes.

---

## v1.0.2 (2025-03-10) — Production Fix (jose + SESSION_SECRET)

### Fixes

- **Internal Server Error 500:** Downgraded `jose` from v6 to v5.10.0 for Edge Runtime compatibility in Next.js middleware
- **SESSION_SECRET validation:** Updated `.env.example` template to use a 32+ character placeholder
- **REMOTE_INSTALL.md:** Added SESSION_SECRET troubleshooting for 500 errors

### Migration

Existing installations: pull latest, `npm ci`, rebuild, restart. No .env changes needed if SESSION_SECRET was already 32+ chars.

---

## v1.0.1 (2025-03-10) — Stable Remote Install

### Fixes

- **Login / .env loading:** Node-based `load-env.js` replaces shell sourcing — passwords with `$`, `&`, etc. work when quoted
- **Remote install:** Clearer installer, REMOTE_INSTALL.md, diagnostic logging for login failures
- **Docs:** .env.example note on quoting; REMOTE_INSTALL.md for remote troubleshooting

### Migration

Existing installations: pull latest, rebuild, restart. Ensure `.env` uses quotes for special chars: `AUTH_PASSWORD='CPwin$$'`

---

## v1.0.0 (2025-03-09) — Production Release

**Project:** Migrator (formerly Cisco ASA/FTD → Check Point Converter)  
**Repository:** https://github.com/mazh-cp/CP_Migration_Tool

### Highlights

- Production-grade build with security hardening
- One-command Ubuntu/Azure VM deployment
- RBAC with user management and project-level access control
- Full secret exposure audit and remediation
- Health and readiness endpoints
- Comprehensive documentation and deployment guides

### New Features

- **RBAC:** User management and project-level roles (owner, admin, editor, viewer)
- **Health endpoints:** `GET /health` and `GET /ready` for orchestration
- **Startup validation:** Fails fast if required environment variables are missing
- **Safe logging:** Redaction of secrets, tokens, and credentials in logs
- **Azure installer:** `deploy/install_azure_ubuntu.sh` for one-command deployment

### Security

- SESSION_SECRET required (min 32 chars) in production
- No credentials, API keys, or config content logged
- Gitleaks-compatible; no hardcoded secrets
- Request size limits, secure headers, CORS via env

### Supported Formats

| Source | Formats |
|--------|---------|
| ASA | Text (.txt, .cfg) |
| FTD | JSON, ASA-compatible text |

| Export | Outputs |
|--------|---------|
| SMS | bundle.json, run_import.cli, SmartConsole CSV |
| Gateway | Gaia clish |

### Known Limitations

- Reports page is placeholder
- SQLite for single-node; use PostgreSQL for scale
- VPN, routing protocols, complex object-group nesting not supported

### Upgrade from 0.9.x

1. Run `npx prisma db push` for schema updates (User, ProjectMember)
2. Set `SESSION_SECRET` (min 32 chars) in production
3. Set `AUTH_USERNAME` and `AUTH_PASSWORD` or create users via Settings
4. Review `.env.example` for new variables

---

## v0.9.0-rc1 — Previous

See `docs/release-notes.md` for historical release notes.
