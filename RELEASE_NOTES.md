# Release Notes — CP Migration Tool

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

**Project:** CP Migration Tool (formerly Cisco ASA/FTD → Check Point Converter)  
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
