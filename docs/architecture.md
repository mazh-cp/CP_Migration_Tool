# Architecture

## Overview

Cisco ASA/FTD to Check Point converter: a modular, explainable conversion pipeline.

```
┌─────────────┐    ┌──────────────┐    ┌─────────────┐    ┌─────────────┐    ┌──────────────┐
│  Import     │───▶│  Parse       │───▶│  Normalize  │───▶│  Map        │───▶│  Export      │
│  (ASA/FTD)  │    │  (AST)       │    │  (vendor-   │    │  (CP model) │    │  (JSON/CLI)  │
│             │    │              │    │   neutral)  │    │             │    │              │
└─────────────┘    └──────────────┘    └─────────────┘    └─────────────┘    └──────────────┘
                         │                     │                  │
                         └─────────────────────┴──────────────────┘
                                    Validation Layer
```

## Module Responsibilities

### `/apps/web`
- Next.js App Router UI
- API route handlers (projects, import, parse, mapping, export)
- Project stepper, sidebar navigation, tables, detail panels

### `/packages/core`
- Domain models: Project, NormalizedObject, NormalizedPolicyRule, NormalizedNATRule, MappingDecision, ValidationFinding
- Normalizer: AST → vendor-neutral models
- Mapping engine: normalized → Check Point target models
- Validation engine: uniqueness, missing refs, service definitions
- Security: redaction for secrets, audit logging

### `/packages/parsers`
- ASA: tokenizer, parser, AST
- FTD: JSON parser, text parser (ASA-compatible)
- Output: AST + parser warnings

### `/packages/exporters`
- Check Point: JSON bundle, CLI template
- Future: Gaia/SmartConsole API

### `/packages/ui`
- Shared components: Sidebar, ProjectStepper
- Reusable table, drawer, badge components

## Tenant isolation and security

- **One primary tenant per user:** Normal users have exactly one primary tenant membership (enforced via `TenantMembership.isPrimary`).
- **Email uniqueness:** Same email cannot be reused across customer tenants; internal support identities are excepted.
- **Session-bound tenant:** Tenant identity is resolved only from validated server-side `UserSession`; never from request parameters, body, query, or headers.
- **Project APIs:** All `/api/projects/*` routes scope queries with `where: { id: projectId, tenantId: session.tenantId }` (or equivalent); tenant comes from session only.
- **Platform admin support:** Support access uses a separate time-limited `PlatformAdminSession` with explicit target tenant, justification, and full audit logging. Customer tenant APIs reject platform admins unless they are in valid support mode for that tenant.
- **Single active session per user per tenant:** On login, any existing ACTIVE `UserSession` for the same user and tenant is revoked before creating the new session.

## SSO (URL-based 3rd-party redirect)

3rd-party portals can redirect users with an opaque SSO ID in the URL (`/auth/sso-callback`). The app validates the redirect, looks up or JIT-provisions the user by `ssoExternalId` + `ssoTenantSlug`, and creates a tenant session.

- **SSO ID:** Opaque identifier (not email) to reduce enumeration.
- **Signature:** When `SSO_PARTNER_SECRET` is set, `sig` and `ts` are required; `sig` = HMAC-SHA256 over `sso_id|tenant|ts`.
- **Tenant resolution:** Derived from `tenant` slug or default; never from untrusted sources after validation.

## Weekly cleanup

**Internal scheduler** (default): cleanup runs automatically at 2 AM every Saturday when the app is running. Registered in `instrumentation.ts` via `node-cron`. Set `CLEANUP_INTERNAL_ENABLED=false` to disable.

Cleanup removes:

- Expired or revoked `UserSession` and `PlatformAdminSession`
- Upload files older than `CLEANUP_UPLOAD_DAYS` (default 30)
- Audit logs older than `CLEANUP_AUDIT_RETENTION_DAYS` (default 365)

Manual triggers: `npm run cleanup` or `POST /api/cron/cleanup` with `Authorization: Bearer <CRON_SECRET>`.
