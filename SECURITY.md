# Security — CP Migration Tool

## Overview

CP Migration Tool handles sensitive data: firewall configs (which may contain credentials), user credentials, API keys, and session tokens. This document describes security controls and practices.

---

## Credentials and Secrets

| Item | Storage | Logging | Exposure |
|------|---------|---------|----------|
| AUTH_USERNAME / AUTH_PASSWORD | .env only | Never | Not returned to client |
| SESSION_SECRET | .env only | Never | Never exposed |
| User passwords | DB (bcrypt hash) | Never | Never returned |
| Session JWT | HTTP-only cookie | Never | Cookie only |
| LiteLLM API key | DB (encrypted at rest by DB) | Never | Not returned to client |
| Raw config content | DB/file | Never | Not in logs or error responses |

---

## Secret Redaction

- **Logs:** Passwords, tokens, API keys, connection strings are not logged
- **Errors:** Stack traces and internal details are not returned to clients in production
- **Exports:** ASA/FTD secrets (enable secret, password, SNMP community, keys, certs) are redacted via `redactSecrets()`

---

## Authentication

- JWT in HTTP-only cookie; `secure` flag in production
- 7-day expiry
- SESSION_SECRET must be at least 32 characters in production (enforced at startup)

---

## RBAC

- **Env admin:** Full access; can manage users and project members
- **Project roles:** owner, admin (manage members), editor (edit), viewer (read-only)
- Project access checked on all project-scoped API routes

---

## Production Requirements

1. **SESSION_SECRET** — Set and min 32 chars; app fails to start if missing in production
2. **HTTPS** — Use reverse proxy (nginx, Caddy) with TLS
3. **AUTH_PASSWORD** — Change from default; use strong password
4. **Firewall** — Restrict port 3000 to trusted networks if needed
5. **Database** — SQLite file permissions; use PostgreSQL for multi-node

---

## Reporting Security Issues

Please report security vulnerabilities to the repository maintainers. Do not open public issues for security-sensitive findings.
