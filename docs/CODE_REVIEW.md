# Code Review: CISCO-2-CP

Expert review of code quality, bugs, security, performance, and best practices. References use file paths and line numbers where applicable.

---

## 1. Code Quality

### 1.1 Session / auth duplication

- **`apps/web/src/lib/session-context.ts`** and **`apps/web/src/lib/auth.ts`** both define session secret validation and encoding (session-context.ts L187–193, auth.ts L7–13). Middleware also duplicates the same logic (middleware.ts L5–12).
- **Suggestion:** Export a single `getSessionSecret()` (or shared module) and use it from auth, session-context, and middleware to avoid drift and duplicate production checks.

### 1.2 Magic strings

- Cookie names `cisco2cp_session`, `cisco2cp_support_session` appear in session-context.ts; middleware uses `COOKIE_NAME = 'cisco2cp_session'` separately.
- **Suggestion:** Use `getSessionCookieName()` from session-context in middleware so the cookie name is defined in one place.

### 1.3 Inconsistent role typing

- **`apps/web/src/lib/project-access.ts`** uses `ProjectRole` and tenant roles are plain `string` in `TenantSession`.
- **`apps/web/src/app/api/users/[userId]/route.ts`** uses `ALLOWED_TENANT_ROLES` for validation but request body is typed as `{ role?: string }`.
- **Suggestion:** Define a shared `TenantRole` type and use Zod or a const array for request validation so role values are typed end-to-end.

### 1.4 SSO PUT validation

- **`apps/web/src/app/api/sso/route.ts`** (L33–38): `putSchema` is an object of functions; `enabled` is only checked when `body.enabled !== undefined` (L56), so `enabled: "true"` (string) would pass and then `body.enabled === true` would be false.
- **Suggestion:** Use a single Zod schema for the PUT body and parse once; reject non-boolean `enabled` explicitly.

### 1.5 Config route body typing

- **`apps/web/src/app/api/config/route.ts`** (L44–50): Body is cast with `as` and not validated. Malformed or unexpected keys are accepted.
- **Suggestion:** Validate with Zod (or similar) and return 400 with clear errors for invalid payloads.

---

## 2. Bug Detection

### 2.1 Audit log failed login with `actorUserId: 'anonymous'` (potential runtime error)

- **`apps/web/src/app/api/auth/login/route.ts`** (L16–17): Failed login audit uses `actorUserId: 'anonymous'`.
- **`apps/web/prisma/schema.prisma`** (L118, L130): `AuditLog.actorUserId` is required and has a relation to `User.id`. If the database enforces foreign keys, inserting `'anonymous'` will fail (no user with that id).
- **Fix options:**  
  - Make `actorUserId` optional in the schema for audit events with no real actor, or  
  - Create a reserved system user (e.g. id `'system'`) and use that for anonymous/failed-login events.

### 2.2 Auth env-user branch: missing `tenantId` before membership upsert

- **`apps/web/src/lib/auth.ts`** (L141–156): In the `if (!user)` block you set `tenantId` from `getDefaultTenantId()` and then upsert membership. In the `else` block you only update the user and do not pass `tenantId`; `ensurePrimaryTenantForUser(user.id)` is called later (L164) for both branches, so the user always gets a primary tenant. So behavior is correct, but the flow is a bit fragile.
- **Suggestion:** Add a short comment in the `else` branch that tenant membership is ensured below so future edits don’t remove the call.

### 2.3 Settings SSO: client secret in response

- **`apps/web/src/app/api/sso/route.ts`** GET (L24–30): Returns full `config` object. If the client stores OIDC client secret in `config`, it will be sent to the browser.
- **Suggestion:** When returning SSO config, redact or omit `clientSecret` (and similar secrets) in the GET response; only allow setting them via PUT.

### 2.4 Settings page: SSO config type

- **`apps/web/src/app/(app)/settings/page.tsx`** (L107): SSO config from API is typed as `Record<string, string>`. The API actually returns `Record<string, unknown>` (sso/route.ts L19). Values like `certificate` can be multi-line strings; ensure they’re handled as strings when reading (e.g. `String(c?.certificate ?? '')`) to avoid runtime issues.

### 2.5 PATCH /api/users/[userId] with empty body

- **`apps/web/src/app/api/users/[userId]/route.ts`** (L16–21): If the client sends an empty body `{}`, `body.role` is undefined and the route returns 400. That’s correct; no bug, but consider documenting that `role` is required in PATCH.

---

## 3. Security Analysis

### 3.1 Config route authorization

- **`apps/web/src/app/api/config/route.ts`** PUT: Only check is `CONFIG_PIN` + unlock cookie. Any authenticated user (including viewer) can change app-wide config (e.g. LiteLLM URL/model) when `CONFIG_PIN` is not set.
- **Recommendation:** Require tenant role `admin` (or platform admin) for config PUT, or document that `CONFIG_PIN` must be set in production so only PIN holders can change config.

### 3.2 Auth diagnostic information disclosure

- **`apps/web/src/app/api/auth/diagnostic/route.ts`** (L12–17): Returns `expectedUser` (admin username) and whether auth env is set. Path is under `/api/auth/` so middleware does not require auth.
- **Recommendation:** In production, either restrict this route (e.g. allow only from localhost or require a secret query param) or remove/redact `expectedUser` and avoid leaking whether env auth is configured.

### 3.3 Login: no rate limiting

- **`apps/web/src/app/api/auth/login/route.ts`**: No rate limiting on login attempts. Enables brute-force and credential stuffing.
- **Recommendation:** Add rate limiting (e.g. per IP or per username) and optionally CAPTCHA after repeated failures.

### 3.4 Session secret in development

- **`session-context.ts`** (L193) and **auth.ts** (L12): Fallback secret `'dev-secret-change-in-production'` is used when `SESSION_SECRET` is unset. Comment and production check are good, but the same weak default is in middleware.
- **Recommendation:** Ensure deployment checks (or health checks) verify `SESSION_SECRET` in production so the app fails fast instead of running with a known default.

### 3.5 Input validation

- **Login route** (L9): Request body is cast `as { username?: string; password?: string }` with no schema. Very long username/password could be passed.
- **Suggestion:** Validate with Zod (e.g. max length, trim) and reject invalid payloads with 400.

### 3.6 Tenant isolation (positive)

- Project and user APIs correctly use `requireTenantSession()` or `requireProjectAccess(projectId)` and derive tenant from session only. No tenant id from query/body is trusted. Good.

---

## 4. Performance

### 4.1 N+1 in requireTenantSession

- **`apps/web/src/lib/session-context.ts`** (L91–106): After loading `UserSession` (with user and tenant), a second query loads `TenantMembership`. You could include membership in the first query via a relation or a single broader query to avoid two round-trips.
- **Suggestion:** If Prisma schema allows, use `include: { user: {...}, tenant: true }` and a relation from User to TenantMembership for the current tenant, or one query that joins session + membership.

### 4.2 Session secret

- **auth.ts** (L7–13): Secret is created once at module load. **session-context.ts** (L187–193): Secret is created on every `getSessionSecret()` call. Session-context is called on every request that needs tenant/session.
- **Suggestion:** Use a module-level secret (like auth.ts) in session-context so the encoder isn’t recreated every time.

### 4.3 Settings page: multiple useEffects

- **`apps/web/src/app/(app)/settings/page.tsx`**: Several useEffects run when `isAdmin` flips; each fetches independently. Could coalesce into one “admin data” fetch (users + projects + SSO) to reduce requests and simplify loading/error state.

---

## 5. Best Practices

### 5.1 Error handling

- **Login route** (L66): Generic catch returns 500 and logs; no distinction between validation errors and DB errors. Good for not leaking internals; consider logging with request id for debugging.
- **SSO GET** (L20–23): Invalid JSON in `idp.config` is swallowed and an empty object is used. Consider logging a warning so misconfigured data can be detected.

### 5.2 Audit logging

- **audit.ts** (L9–21): `redactDetails` only redacts top-level keys whose name contains a secret keyword and value is a string. Nested objects (e.g. `details: { credentials: { password: 'x' } }`) are not redacted.
- **Suggestion:** Redact recursively, or at least document that callers must not pass nested secrets, or redact any key that matches and allow value to be string or object (redact object values as `[REDACTED]`).

### 5.3 API response shape

- **POST /api/users** (users/route.ts L82): Returns created user without `tenantRole` or `isPrimary`. Frontend compensates in Settings. Prefer returning the same shape as GET (including `tenantRole`, `isPrimary`) so clients stay consistent.

### 5.4 Middleware and matcher

- **middleware.ts** (L79–81): Matcher excludes `health` and `ready`; comment says to avoid “headers already sent” with not-found. Ensure health/ready are not matched so they never run auth logic; current matcher is correct.

### 5.5 Tests

- **Recommendation:** Add or extend tests for: (1) failed login audit with a reserved system user or nullable actorUserId, (2) config PUT with CONFIG_PIN unset (expect 403 if you add role check), (3) SSO GET redaction of clientSecret, (4) PATCH /api/users/[userId] with invalid role.

---

## 6. Summary of Actionable Fixes

| Priority | Item | Location | Action |
|----------|------|----------|--------|
| High | Audit failed login actorUserId | login/route.ts, schema or audit | Use nullable actorUserId or system user; avoid FK violation |
| High | Config PUT authorization | config/route.ts | Require admin role or document CONFIG_PIN requirement |
| High | SSO GET exposes secrets | sso/route.ts | Redact clientSecret/certificate in GET response |
| Medium | Diagnostic route leaks username | auth/diagnostic/route.ts | Restrict or redact in production |
| Medium | Login rate limiting | auth/login/route.ts | Add rate limiting (and optionally CAPTCHA) |
| Medium | Shared session secret/cookie name | auth, session-context, middleware | Single source for secret and cookie name |
| Low | Config PUT body validation | config/route.ts | Validate with Zod |
| Low | SSO PUT body validation | sso/route.ts | Use Zod for full body validation |
| Low | Audit redaction depth | audit.ts | Redact nested secrets or document contract |
| Low | POST /api/users response shape | users/route.ts | Return tenantRole, isPrimary in response |

Implementing the high-priority items first will address the main security and correctness risks; the rest improve maintainability and defense in depth.
