# User Admin Guide

**Cisco ASA/FTD → Check Point Converter**  
**Version:** 0.9.0-rc1

---

## 1. Overview

This guide covers administrative access, authentication, configuration, and security for the Cisco → Check Point converter application.

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

Copy `apps/web/.env.example` to `apps/web/.env` and adjust values.

---

## 6. Logout

- Sidebar → **Log out**.
- Session cookie is cleared and you are redirected to **/login**.

---

## 7. Security Considerations

1. **Credentials:** Use strong `AUTH_USERNAME` and `AUTH_PASSWORD`; never use defaults in production.
2. **SESSION_SECRET:** Must be set and at least 32 characters in production.
3. **CONFIG_PIN:** Use for sensitive settings if multiple users share the same login.
4. **HTTPS:** In production, use HTTPS; the session cookie is marked `secure` when `NODE_ENV=production`.

---

## 8. Troubleshooting

| Issue | Possible cause | Action |
|-------|----------------|--------|
| Login fails | Wrong credentials | Check `AUTH_USERNAME` / `AUTH_PASSWORD` in `.env` |
| Redirect to login after login | Invalid/expired session | Clear cookies and log in again |
| Settings won't unlock | Wrong PIN | Check `CONFIG_PIN` in `.env` |
| Session error in production | Missing `SESSION_SECRET` | Set `SESSION_SECRET` (min 32 chars) |
