# User Admin Guide

**Cisco ASA / FTD / Fortinet → Check Point Migrator**  
**Version:** 1.4.0

---

## 1. Overview

This guide covers administrative access, authentication, configuration, and security for the Migrator application (ASA, FTD, FortiGate/FortiManager paths → Check Point).

---

## 2. Access and Authentication

### 2.1 Login

- Navigate to the application URL (e.g. `http://localhost:3000`).
- Unauthenticated users are redirected to **/login**.
- Enter **Username** and **Password** as configured by the system administrator.
- Click **Sign in** to authenticate.
- On success, you are redirected to the **Dashboard**.

### 2.2 Credentials

Credentials are set via environment variables in `apps/web/.env`:

| Variable | Description |
|----------|-------------|
| `AUTH_USERNAME` | Login username |
| `AUTH_PASSWORD` | Login password |

**Admin responsibility:** Use strong, unique credentials. Change `AUTH_PASSWORD` from the default before deployment.

### 2.3 Session

- Sessions use a JWT stored in an HTTP-only cookie.
- Default expiry: 7 days.
- `SESSION_SECRET` (min 32 characters in production) must be set for secure signing.

---

## 3. Navigation

### 3.1 Main Navigation

| Item | Path | Purpose |
|------|------|---------|
| Dashboard | `/dashboard` | Overview and quick start |
| Projects | `/projects` | List and manage conversion projects |
| Reports | `/reports` | Conversion quality summaries (placeholder) |
| Settings | `/settings` | Application configuration |
| Log out | — | End session and return to login |

### 3.2 Project Workflow

Within a project, use the stepper to move between:

- Import → Parse → Map Interfaces → Map Objects → Map Policy → Validate → Export

**FortiGate path:** **Source type: Fortinet FortiGate** → import `.conf`/`.txt` → same stepper to Export. Checklist: **§6**.

**FortiManager path:** **Source type: Fortinet FortiManager (policy package)** → paste/upload JSON **or** **live API pull** on Import → same stepper. Checklist: **§7**.

---

## 4. Settings

### 4.1 Access

- Sidebar → **Settings**.
- If `CONFIG_PIN` is set, you must enter the PIN to unlock settings.

### 4.2 Configuration Protection (PIN)

| Variable | Description |
|----------|-------------|
| `CONFIG_PIN` | Optional. If set, Settings requires this PIN before editing. |

- If `CONFIG_PIN` is not set, settings are open to any logged-in user.
- If set, enter the PIN in the Settings page and click **Unlock** to edit.

### 4.3 Model Fetch Method

- **Default (OpenAI-compatible direct)** — Direct API calls (when applicable).
- **LiteLLM proxy** — Use a LiteLLM proxy endpoint:
  - **LiteLLM Base URL** — e.g. `http://localhost:4000`
  - **Model** — e.g. `gpt-4`, `ollama/llama2`
  - **API Key** — Optional. Enter your API key for models that require authentication. Keys are stored **server-side only** and never returned to the client or included in logs.

These settings apply when the application uses AI-assisted features.

---

## 5. Environment Variables Reference

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | SQLite path (e.g. `file:./data/dev.db`) |
| `AUTH_USERNAME` | Yes | Login username |
| `AUTH_PASSWORD` | Yes | Login password |
| `SESSION_SECRET` | Yes (prod) | JWT secret, min 32 chars in production |
| `CONFIG_PIN` | No | PIN to lock Settings |
| `UPLOAD_DIR` | No | Upload directory (default `./data/uploads`) |
| `MAX_UPLOAD_MB` | No | Max upload size in MB (default 25) |
| `LOG_LEVEL` | No | trace \| debug \| info \| warn \| error |
| `FMG_ALLOW_PRIVATE_URLS` | No | Lab only: allow FortiManager live import to use private/loopback URLs |
| `AUTH_DIAGNOSTIC_ENABLED` | No | Production: set `true` to enable `GET /api/auth/diagnostic` (default off in prod) |

Copy `apps/web/.env.example` to `apps/web/.env` and adjust values.

---

## 6. FortiGate configuration → Check Point (step-by-step)

Administrators can use this checklist when onboarding operators.

| Step | UI / action | Notes |
|------|-------------|--------|
| 1 | Obtain FortiOS backup | Full config text (`.conf` / `.txt`); GUI backup or CLI `show full-configuration` style output. |
| 2 | **Projects** → **New Project** | **Source type: Fortinet FortiGate** → **Create & Import**. |
| 3 | **Import** | Select **Fortinet FortiGate**; paste or upload → **Import & Continue**. Max size from `MAX_UPLOAD_MB`. |
| 4 | **Parse** → **Run Parse** | Async job; wait for completion, review counts/warnings → **Map Interfaces**. |
| 5 | **Map Interfaces** | Map FortiGate interfaces to Check Point names → save → **Map Objects**. |
| 6 | **Map Objects** | Review/edit Check Point object names and service ports → **Map Policy**. |
| 7 | **Map Policy** | Review rules/NAT; apply overrides where needed → **Validate**. |
| 8 | **Validate** | Clear errors → **Export**. |
| 9 | **Export** | SMS / Gateway / Both; choose Mgmt API and/or SmartConsole → **Download**. |

**Optional:** Import **FortiAnalyzer** hit data (`fortianalyzer`) to merge hit counts on parse when a firewall config is present.

---

## 7. FortiManager (policy package) → Check Point (step-by-step)

| Step | UI / action | Notes |
|------|-------------|--------|
| 1 | Gather **ADOM**, **policy package**, optional **VDOM** | Must match the package you are migrating. |
| 2 | **Projects** → **New Project** | **Source type: Fortinet FortiManager (policy package)** → **Create & Import**. |
| 3a | **Import** — paste/upload | Source **FortiManager (JSON bundle)**; paste or upload `.json` → **Import & Continue**. |
| 3b | **Import** — **live API pull** | **Base URL** (HTTPS), **session key** *or* **username/password**, **ADOM**, **package**, optional **VDOM** → **Pull from FortiManager & import**. Credentials not stored server-side. |
| 4 | **Parse** → **Run Parse** | Async job; review counts/warnings → **Map Interfaces**. |
| 5 | **Map Interfaces** | Map source interfaces to Check Point → **Map Objects**. |
| 6 | **Map Objects** | Review/edit names and services → **Map Policy**. |
| 7 | **Map Policy** | Rules/NAT → **Validate**. |
| 8 | **Validate** | Clear errors → **Export**. |
| 9 | **Export** | SMS / Gateway / Both; Mgmt API and/or SmartConsole → **Download**. |

**Ops:** Migrator server must reach FortiManager for live pull. Production URLs should be reachable and TLS-valid; **`FMG_ALLOW_PRIVATE_URLS`** is for lab use only.

---

## 8. Logout

- Sidebar → **Log out**.
- Session cookie is cleared and you are redirected to **/login**.

---

## 9. Security Considerations

1. **Credentials:** Use strong `AUTH_USERNAME` and `AUTH_PASSWORD`; never use defaults in production.
2. **SESSION_SECRET:** Must be set and at least 32 characters in production.
3. **CONFIG_PIN:** Use for sensitive settings if multiple users share the same login.
4. **HTTPS:** In production, use HTTPS; the session cookie is marked `secure` when `NODE_ENV=production`.

---

## 10. Troubleshooting

| Issue | Possible cause | Action |
|-------|----------------|--------|
| Login fails | Wrong credentials | Check `AUTH_USERNAME` / `AUTH_PASSWORD` in `.env` |
| Redirect to login after login | Invalid/expired session | Clear cookies and log in again |
| Settings won't unlock | Wrong PIN | Check `CONFIG_PIN` in `.env` |
| Session error in production | Missing `SESSION_SECRET` | Set `SESSION_SECRET` (min 32 chars) |
