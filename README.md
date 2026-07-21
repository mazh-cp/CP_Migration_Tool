# Migrator

**Cisco ASA / FTD / Fortinet → Check Point Firewall Migration Tool**

Convert Cisco ASA, FTD, or Fortinet FortiGate configurations to Check Point equivalents. Modular, explainable, safe-by-default.

**Version:** 1.6.0  
**Repository:** https://github.com/mazh-cp/CP_Migration_Tool

---

## Purpose

Migrator helps you:

- **Import** Cisco ASA, FTD, or Fortinet FortiGate configurations (paste or file upload)
- **Parse** and normalize to a vendor-neutral model
- **Map** objects, services, rules, interfaces, and NAT to Check Point
- **Validate** and fix missing references
- **Export** to Check Point Mgmt API, SmartConsole CSV, or Gaia clish

---

## Architecture Overview

```
┌─────────────┐    ┌──────────────┐    ┌─────────────┐    ┌─────────────┐    ┌──────────────┐
│  Import     │───▶│  Parse       │───▶│  Normalize  │───▶│  Map        │───▶│  Export      │
│ (ASA/FTD/Fr)│    │  (AST)       │    │  (vendor-   │    │  (CP model) │    │  (JSON/CLI)  │
│             │    │              │    │   neutral)  │    │             │    │              │
└─────────────┘    └──────────────┘    └─────────────┘    └─────────────┘    └──────────────┘
```

| Layer | Technology |
|-------|------------|
| Framework | Next.js 15 (App Router) |
| Backend | API routes, Prisma, SQLite |
| Packages | @cisco2cp/core, parsers, exporters, ui |
| Package manager | npm (workspaces) |
| Build | Turborepo |
| Runtime | **Node.js 22.x** LTS ([`.nvmrc`](.nvmrc); `package.json` `engines`) |

---

## Local Development

**Prerequisites:** [Node.js 22.x](https://nodejs.org/) (LTS). With [nvm](https://github.com/nvm-sh/nvm): `nvm install && nvm use`. The repo sets **`engine-strict=true`** in [`.npmrc`](.npmrc) so `npm install` fails if your Node version does not satisfy `package.json` `engines`.

```bash
# Install
npm install

# Setup database
cd apps/web && npx prisma generate && npx prisma db push

# Configure (copy and edit)
cp apps/web/.env.example apps/web/.env

# Run dev server
npm run dev
```

Open **http://localhost:3000**

### Existing database (backfill)

After deploying the tenant-isolation schema, run the backfill once to assign existing projects and users to the default tenant:

```bash
cd apps/web && npx ts-node --compiler-options '{"module":"CommonJS"}' scripts/backfill-tenant.ts
```

Then have users log in again so they receive a tenant-bound session.

---

## Security (tenant isolation)

- **One primary tenant per user** — normal users belong to exactly one tenant.
- **No customer email reuse** — the same email cannot be used in another tenant.
- **Tenant from session only** — tenant identity is never taken from request params, body, or headers; it comes only from the validated server-side session.
- **Project APIs** — all project access is scoped by the session’s tenant; `/api/projects/[projectId]` uses `where: { id: projectId, tenantId: session.tenantId }`.
- **Platform admin support** — support access uses a separate time-limited elevated session with justification and audit logging; see [docs/architecture.md](docs/architecture.md).

## SSO (3rd-party URL redirect)

A 3rd-party portal can redirect users to the app with an opaque SSO ID in the URL. Use SSO ID (not email) to reduce enumeration risk.

**Callback URL:** `https://your-app/auth/sso-callback?sso_id=<opaque-id>&tenant=<slug>&ts=<unix>&sig=<hmac>`

- `sso_id` — opaque identifier (8–128 chars, alphanumeric, `_`, `-`).
- `tenant` — tenant slug (default: `default`).
- `ts` — Unix timestamp (required when `SSO_PARTNER_SECRET` is set).
- `sig` — `HMAC-SHA256(SSO_PARTNER_SECRET, sso_id|tenant|ts)` (required when secret is set).
- `return_url` — path to redirect after login (e.g. `/dashboard`).

Set `SSO_PARTNER_SECRET` (min 16 chars) to enforce signature and timestamp validation. Without it, only `sso_id` is required (for dev/testing).

## Weekly cleanup

Cleanup runs **automatically** every Saturday at 2 AM (internal scheduler). No external cron needed.

| What | Details |
|------|---------|
| Schedule | 2 AM every Saturday |
| Runs when | App starts (`npm run dev` or `npm run start`); scheduler registers via Next.js instrumentation |
| Disable | Set `CLEANUP_INTERNAL_ENABLED=false` to use external cron instead |

**Manual / external options:**
- **Script:** `npm run cleanup` (for one-off or external crontab)
- **HTTP:** `curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://your-app/api/cron/cleanup`

Cleanup removes expired `UserSession` and `PlatformAdminSession`, upload files older than `CLEANUP_UPLOAD_DAYS`, and audit logs older than `CLEANUP_AUDIT_RETENTION_DAYS`.

---

## Production Deployment

```bash
# Build
npm run build

# Start (from repo root)
PORT=3000 HOST=0.0.0.0 npm run start
```

Or use the single-command Ubuntu installer (run on VM):

```bash
curl -fsSL https://raw.githubusercontent.com/mazh-cp/CP_Migration_Tool/main/deploy/install_azure_ubuntu.sh | sudo bash
```

### Production VM upgrade (curl)

Run **on the Ubuntu server** (SSH session on the VM). `sudo` does not keep `BRANCH=…` from the left side of the pipe—use `bash -s -- <tag>` or `sudo env BRANCH=…` as below.

**Pinned release (recommended):**

```bash
curl -fsSL https://raw.githubusercontent.com/mazh-cp/CP_Migration_Tool/v1.6.0/deploy/upgrade-production.sh | sudo env BRANCH=v1.6.0 DOC_RELEASE_TAG=v1.6.0 bash
```

**Latest `main`:**

```bash
curl -fsSL https://raw.githubusercontent.com/mazh-cp/CP_Migration_Tool/main/deploy/upgrade-production.sh | sudo env BRANCH=main DOC_RELEASE_TAG=main bash
```

**Alternate pinned form** (`bash -s` passes the ref into the wrapper):

```bash
curl -fsSL https://raw.githubusercontent.com/mazh-cp/CP_Migration_Tool/v1.6.0/deploy/upgrade-production.sh | sudo bash -s -- v1.6.0
```

Full options, laptop one-liner via SSH, and troubleshooting: [deploy/UPGRADE.md](deploy/UPGRADE.md), [REMOTE_INSTALL.md](REMOTE_INSTALL.md), [DEPLOYMENT.md](DEPLOYMENT.md).

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | SQLite path (e.g. `file:./data/dev.db`) |
| `AUTH_USERNAME` | Yes* | Admin login username |
| `AUTH_PASSWORD` | Yes* | Admin login password (bootstrap only; ignored after admin sets a password in-app) |
| `SESSION_SECRET` | Yes (prod) | JWT secret, min 32 characters |
| `CONFIG_PIN` | No | PIN to protect Settings |
| `SSO_PARTNER_SECRET` | No | Shared secret for URL-based SSO redirects (min 16 chars); when set, `sig` and `ts` are required |
| `CRON_SECRET` | No | Secret for manual cleanup API; set when using `POST /api/cron/cleanup` |
| `CLEANUP_INTERNAL_ENABLED` | No | Set to `false` to disable internal Saturday 2 AM scheduler (default: enabled) |
| `UPLOAD_DIR` | No | Upload directory (default `./data/uploads`) |
| `MAX_UPLOAD_MB` | No | Max upload size MB (default 25) |
| `CLEANUP_UPLOAD_DAYS` | No | Delete upload files older than N days (default 30) |
| `CLEANUP_AUDIT_RETENTION_DAYS` | No | Prune audit logs older than N days (default 365; 0 = disable) |
| `LOG_LEVEL` | No | trace \| debug \| info \| warn \| error |
| `HOST` | No | Bind host (default localhost; use 0.0.0.0 for all) |
| `PORT` | No | Port (default 3000) |

*Or create users via Settings (admin account needed first).

---

## Supported Formats

| Source | Formats |
|--------|---------|
| ASA | Text (.txt, .cfg) |
| FTD | JSON, ASA-compatible text |

| Export | Outputs |
|--------|---------|
| SMS (Mgmt API) | bundle.json, run_import.cli |
| SMS (SmartConsole) | objects.csv, services.csv, groups.csv, policy.csv, nat.csv |
| Gateway | gaia_clish.txt |

---

## Security Controls

- `SESSION_SECRET` must be at least 32 characters in production
- Raw config content is never logged
- Secrets (passwords, keys, SNMP) redacted in exports and logs
- HTTPS recommended in production (secure cookie when `NODE_ENV=production`)
- RBAC: project-level roles (owner, admin, editor, viewer)
- **Password policy** — all in-app passwords (self-service change, admin-created users, admin resets) must be 12–72 characters with at least one uppercase, lowercase, digit, and special character, must not contain the username, and are checked against a common-password denylist. Enforced server-side in [`password-policy.ts`](apps/web/src/lib/password-policy.ts); the Settings UI shows a live checklist. Changing a password revokes the account's other active sessions and writes an audit entry (`password.change` / `password.reset`).
- **`AUTH_PASSWORD` is bootstrap-only** — the env admin credentials seed the first login. Once that admin changes their password in **Settings → My profile**, `AUTH_PASSWORD` is no longer accepted for login. Remove `AUTH_PASSWORD` from `.env` after first login.

See [SECURITY.md](SECURITY.md) for details.

> **Schema note:** this adds `User.passwordChangedByUser`. After pulling, run `cd apps/web && npx prisma generate && npx prisma db push` (additive column, non-destructive).

---

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server |
| `npm run build` | Build all packages |
| `npm run start` | Start production server |
| `npm run typecheck` | TypeScript check |
| `npm run lint` | Lint |
| `npm run test` | Run tests |
| `npm run cleanup` | Weekly cleanup (sessions, uploads, audit logs); run via cron |
| `npm run release:check` | Full check (typecheck → lint → test → build) |

---

## Known Limitations

- Reports page is placeholder
- **Static routing** is converted to Gaia `set static-route` commands; **dynamic routing** (OSPF/BGP/EIGRP) is captured as review notes for manual Gaia setup
- **Object-group nesting** resolves order-independently (forward references and multi-level nesting), with warnings for unknown or self-referencing members
- **ASA VPN** (remote-access + site-to-site) is parsed and exported as **review notes** (`vpn.notes.json` in the export bundle) — pre-shared keys are never captured; Check Point VPN communities still require manual recreation
- Every parse produces a **coverage report** (in the migration report): converted counts, review-note categories, and unsupported source constructs grouped by command — nothing is silently dropped
- **High availability** (ASA failover) and **advanced inspection** (policy-map inspects, threat-detection) are detected and captured as review notes in the migration report — plan ClusterXL/Gaia clustering and Threat Prevention blade mapping manually; failover keys are masked
- **FortiGate IPsec VPN** (`vpn ipsec phase1-interface`) and **Palo Alto IKE gateways** are captured as site-to-site review notes (peer, interface, PSK presence — never the secret)
- **IPv6**: ASA (`ipv6 route`, IPv6 objects, `any6` ACLs → Gaia `set ipv6 static-route`), FortiGate (`address6`/`addrgrp6`/`policy6`), and Palo Alto IPv6 addresses are supported; IPv6 interface addressing and IPv6 NAT remain manual
- SQLite for dev/single-node; use PostgreSQL for production scale
- FTD JSON schema support is limited

---

## Troubleshooting

| Issue | Action |
|-------|--------|
| Login fails | Check AUTH_USERNAME / AUTH_PASSWORD in `.env` |
| Session error in production | Set SESSION_SECRET (min 32 chars) |
| Import fails | Verify file size &lt; MAX_UPLOAD_MB |
| Parse errors | Check ASA/FTD format; see [USER_GUIDE.md](USER_GUIDE.md) |
| Bind failed | Use HOST=0.0.0.0 for external access |

---

## Documentation

| Document | Description |
|----------|-------------|
| [USER_GUIDE.md](USER_GUIDE.md) | Step-by-step conversion workflow |
| [ADMIN_GUIDE.md](ADMIN_GUIDE.md) | Auth, settings, RBAC |
| [SECURITY.md](SECURITY.md) | Security controls and practices |
| [DEPLOYMENT.md](DEPLOYMENT.md) | Production and Azure deployment |
| [RELEASE_NOTES.md](RELEASE_NOTES.md) | Version history |
