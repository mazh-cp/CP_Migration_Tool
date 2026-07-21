# Release Notes — Migrator

## v1.6.0 (2026-07-21) — Coverage report, routing, VPN/HA/inspection notes, IPv6

### Highlights

- **Migration coverage report + Export-page panel:** converted counts, manual-review categories, and unsupported constructs grouped by command — the tool now tells you exactly what it did and did not migrate.
- **Static routes convert to Gaia** (`set static-route` / `set ipv6 static-route`); dynamic routing (OSPF/BGP/EIGRP) becomes review notes.
- **VPN review notes for all three vendors** (ASA, FortiGate, Palo Alto) exported as `vpn.notes.json`; pre-shared keys are never captured.
- **HA (failover) and inspection (policy-map / threat-detection)** detected and flagged for ClusterXL / Threat Prevention planning.
- **IPv6** across ASA (objects, routes, `any6`), FortiGate (`address6`/`addrgrp6`/`policy6`), and Palo Alto addresses.
- **Nested object-groups** resolve order-independently (forward references, multi-level nesting).
- **Security:** secret redaction repaired (previous regexes never matched) and enforced across warnings and report samples; routing/HA/VPN secrets are masked at parse time. Run `scripts/redact-normalized-data.ts` once to clean historical rows.

### Upgrade

```bash
curl -fsSL https://raw.githubusercontent.com/mazh-cp/CP_Migration_Tool/v1.6.0/deploy/upgrade-production.sh | sudo env BRANCH=v1.6.0 DOC_RELEASE_TAG=v1.6.0 bash
```

After upgrade: `cd apps/web && npx prisma db push` (additive `routesJson`/`vpnJson` columns) and optionally `npx ts-node --compiler-options '{"module":"CommonJS"}' scripts/redact-normalized-data.ts`.

---

## v1.3.1 (2026-03-24) — Fix curl-piped `upgrade-production.sh`

### Fix

- **`upgrade-production.sh` via `curl | sudo bash`:** The v1.3.0 wrapper used `BASH_SOURCE` to find `update_azure_ubuntu.sh`, which **does not work** when the script is read from stdin (unbound variable / wrong path). v1.3.1 **fetches the updater from GitHub** when no local file exists.

### Pinned upgrade (use one of these)

```bash
curl -fsSL https://raw.githubusercontent.com/mazh-cp/CP_Migration_Tool/v1.3.1/deploy/upgrade-production.sh | sudo bash -s -- v1.3.1
```

```bash
curl -fsSL https://raw.githubusercontent.com/mazh-cp/CP_Migration_Tool/v1.3.1/deploy/update_azure_ubuntu.sh | sudo env BRANCH=v1.3.1 bash
```

**Note:** `BRANCH=v1.x curl … | sudo bash` does **not** pass `BRANCH` into the script sudo runs — use **`bash -s -- v1.x`** or **`sudo env BRANCH=v1.x bash`**.

---

## v1.3.0 (2026-03-24) — FTD/FMC advanced ACLs & production upgrade scripts

### Highlights

- **Parse / Map Policy:** **`access-list … advanced`** (FTD/FMC style with `ifc`, `object-group`, `rule-id`) is parsed so policies appear under Map Policy; **`trust`** ACEs map to **allow**.
- **Parser robustness:** **`object-group`** blocks no longer swallow the following **`access-list`** line; **`remark`** lines are ignored cleanly.
- **Normalize:** Resolves **`object-group` / `object`** tokens in rules to registry names.
- **Operations:** **`deploy/upgrade-production.sh`** (canonical server upgrade via curl) and **`deploy/upgrade-remote-production.sh`** (SSH from laptop → curl on VM).

### Upgrade (Ubuntu VM)

Use **v1.3.1** for the wrapper, or see **v1.3.1** release notes above for `bash -s` / `env BRANCH` patterns.

**Latest `main`:**

```bash
curl -fsSL https://raw.githubusercontent.com/mazh-cp/CP_Migration_Tool/main/deploy/upgrade-production.sh | sudo bash
```

**From your workstation (SSH):**

```bash
REMOTE=ubuntu@YOUR-VM ./deploy/upgrade-remote-production.sh v1.3.1
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
