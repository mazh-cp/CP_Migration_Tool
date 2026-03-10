# CP Migration Tool

**Cisco ASA/FTD → Check Point Firewall Migration Tool**

Convert Cisco ASA and FTD configurations to Check Point equivalents. Modular, explainable, safe-by-default.

**Version:** 1.0.2  
**Repository:** https://github.com/mazh-cp/CP_Migration_Tool

---

## Purpose

CP Migration Tool helps you:

- **Import** Cisco ASA or FTD configurations (paste or file upload)
- **Parse** and normalize to a vendor-neutral model
- **Map** objects, services, rules, interfaces, and NAT to Check Point
- **Validate** and fix missing references
- **Export** to Check Point Mgmt API, SmartConsole CSV, or Gaia clish

---

## Architecture Overview

```
┌─────────────┐    ┌──────────────┐    ┌─────────────┐    ┌─────────────┐    ┌──────────────┐
│  Import     │───▶│  Parse       │───▶│  Normalize  │───▶│  Map        │───▶│  Export      │
│  (ASA/FTD)  │    │  (AST)       │    │  (vendor-   │    │  (CP model) │    │  (JSON/CLI)  │
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

---

## Local Development

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

See [DEPLOYMENT.md](DEPLOYMENT.md) and [REMOTE_INSTALL.md](REMOTE_INSTALL.md) for details.

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | SQLite path (e.g. `file:./data/dev.db`) |
| `AUTH_USERNAME` | Yes* | Admin login username |
| `AUTH_PASSWORD` | Yes* | Admin login password |
| `SESSION_SECRET` | Yes (prod) | JWT secret, min 32 characters |
| `CONFIG_PIN` | No | PIN to protect Settings |
| `UPLOAD_DIR` | No | Upload directory (default `./data/uploads`) |
| `MAX_UPLOAD_MB` | No | Max upload size MB (default 25) |
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

See [SECURITY.md](SECURITY.md) for details.

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
| `npm run release:check` | Full check (typecheck → lint → test → build) |

---

## Known Limitations

- Reports page is placeholder
- VPN, routing protocols, complex object-group nesting not supported
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
