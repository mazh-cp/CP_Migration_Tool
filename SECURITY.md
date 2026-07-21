# Security — Migrator

## Overview

Migrator handles sensitive data: firewall configs (which may contain credentials), user credentials, API keys, and session tokens. This document describes security controls and practices.

---

## Credentials and Secrets

| Item | Storage | Logging | Exposure |
|------|---------|---------|----------|
| AUTH_USERNAME / AUTH_PASSWORD | .env only (bootstrap only — see below) | Never | Not returned to client |
| SESSION_SECRET | .env only | Never | Never exposed |
| User passwords | DB (bcrypt hash, cost 12) | Never | Never returned |
| Session JWT | HTTP-only cookie | Never | Cookie only |
| LiteLLM API key | DB (encrypted at rest by DB) | Never | Not returned to client |
| Raw config content | DB/file | Never | Not in logs, error responses, or lower-privileged API reads |

### `AUTH_PASSWORD` is bootstrap-only

The env admin credentials seed the first login. Once that admin sets a password in **Settings → My profile**, `AUTH_PASSWORD` is no longer accepted (`User.passwordChangedByUser` gates it), and the DB hash is no longer re-synced from env. Remove `AUTH_PASSWORD` from `.env` after first login.

### Password policy

All in-app passwords (self-service change, admin-created users, admin resets) must be **12–72 characters** with at least one uppercase, lowercase, digit, and special character, must not contain the username, and are checked against a common-password denylist. Enforced server-side in `apps/web/src/lib/password-policy.ts`; the Settings UI shows a live checklist. Changing a password **revokes the account's other active sessions** and writes an audit entry (`password.change` / `password.reset`).

---

## Secret Redaction

Uploaded configs frequently contain credentials. Redaction is applied **before** any config-derived text is persisted, returned by the API, shown in the coverage report, or written to an export bundle — not just at export time.

- **At parse time:** routing/HA/VPN secrets are masked or presence-flagged as they are read — BGP neighbor passwords, OSPF `authentication-key` / `message-digest-key`, ASA `failover key` and `failover ipsec pre-shared-key`, tunnel-group / FortiGate `psksecret` / PAN IKE pre-shared keys (recorded as a boolean, never the value).
- **Warnings & coverage report:** parse warnings and the "not migrated" samples in the coverage report are run through `redactSecrets()`; every migration-report `manualReview` detail and risk is redacted before persistence (defense in depth).
- **`redactSecrets()` covers:** `enable secret`, `password` / legacy `passwd`, SNMP community, `pre-shared-key`, `authentication-key`, `failover key`, `crypto isakmp key`, keyed and bare `key` (AAA TACACS+/RADIUS shared secrets), and PEM private-key blocks.
- **Logs:** Passwords, tokens, API keys, connection strings are not logged.
- **Errors:** Stack traces and internal details are not returned to clients in production.
- **Historical rows:** `apps/web/scripts/redact-normalized-data.ts` re-applies redaction to existing `NormalizedData` rows (`--dry-run` supported).

---

## Authentication

- JWT in HTTP-only cookie; `secure` flag in production
- 7-day expiry
- SESSION_SECRET must be at least 32 characters in production (enforced at startup)
- Password complexity enforced server-side; a password change revokes the account's other active sessions (see Password policy above)
- One active session per user per tenant; tenant identity is resolved only from the validated server-side session, never from request input

---

## RBAC

- **Env admin:** Full access; can manage users and project members
- **Project roles:** owner, admin (manage members), editor (edit), viewer (read-only)
- Project access checked on all project-scoped API routes

---

## Production Requirements

1. **SESSION_SECRET** — Set and min 32 chars; app fails to start if missing in production
2. **HTTPS** — Use reverse proxy (nginx, Caddy) with TLS
3. **AUTH_PASSWORD** — Bootstrap only; log in, set a strong password in Settings → My profile (12+ chars, mixed classes), then remove `AUTH_PASSWORD` from `.env`
4. **Firewall** — Restrict port 3000 to trusted networks if needed
5. **Database** — SQLite file permissions; use PostgreSQL for multi-node

---

## Reporting Security Issues

Please report security vulnerabilities to the repository maintainers. Do not open public issues for security-sensitive findings.
