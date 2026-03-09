# Final Build Architecture Review

**Document Version:** 1.0  
**Date:** 2025-03-06  
**Target:** Final Testing Build Candidate (v0.9.0-rc1)

---

## 1. Current Repository Structure

```
CISCO-2-CP/
├── apps/
│   └── web/                    # Next.js 15 App Router application
│       ├── prisma/             # Prisma schema, no migrations (db push)
│       ├── src/
│       │   ├── app/
│       │   │   ├── (app)/      # Authenticated layout with Sidebar
│       │   │   │   ├── dashboard/
│       │   │   │   ├── projects/
│       │   │   │   │   ├── [projectId]/
│       │   │   │   │   │   ├── import/
│       │   │   │   │   │   ├── parse/
│       │   │   │   │   │   ├── map/interfaces/
│       │   │   │   │   │   ├── map/objects/
│       │   │   │   │   │   ├── map/policy/
│       │   │   │   │   │   ├── validate/
│       │   │   │   │   │   └── export/
│       │   │   │   ├── reports/
│       │   │   │   └── settings/
│       │   │   ├── login/
│       │   │   └── api/        # Route Handlers
│       │   ├── lib/            # auth, logger, prisma, upload
│       │   └── middleware.ts   # JWT auth guard
│       └── .env.example
├── packages/
│   ├── core/       # Normalize, mapping, validation, security
│   ├── parsers/    # ASA, FTD JSON/text parsers
│   ├── exporters/  # Check Point JSON, CLI, Gaia, SmartConsole
│   └── ui/         # Sidebar, ProjectStepper
├── docs/
│   ├── architecture.md
│   ├── user-guide.md
│   ├── mapping-matrix.md
│   └── limitations.md
├── package.json    # Root workspace
├── turbo.json
└── .gitignore
```

---

## 2. Application Architecture Summary

| Layer | Technology |
|-------|------------|
| **Frontend** | Next.js 15, React 18, Tailwind CSS, dark theme |
| **Routing** | App Router, layout groups `(app)` / `login` |
| **API** | Next.js Route Handlers, JWT auth via `jose` |
| **Database** | SQLite via Prisma 5.22 |
| **Parser** | Custom line-based ASA, FTD JSON/text |
| **Build** | Turbo monorepo, tsup (packages), next build (web) |
| **Tests** | Vitest 2.1 (passWithNoTests in some packages) |

---

## 3. Major Modules and Responsibilities

| Module | Responsibility |
|--------|----------------|
| **apps/web** | UI, API routes, auth, project CRUD, import/parse/map/validate/export |
| **@cisco2cp/core** | Domain models, normalizer, mapping engine, validation, redaction |
| **@cisco2cp/parsers** | ASA parser, FTD JSON/text parsers, AST output |
| **@cisco2cp/exporters** | JSON bundle, CLI template, Gaia clish, SmartConsole CSV |
| **@cisco2cp/ui** | Sidebar, ProjectStepper |

---

## 4. Current Alpha Maturity Assessment

| Area | Maturity | Notes |
|------|----------|-------|
| **Core conversion** | Alpha | ASA/FTD parse → normalize → map → export works end-to-end |
| **UI flow** | Alpha | Stepper, breadcrumbs, forms; some empty/loading states minimal |
| **Validation** | Alpha | Missing refs, fix flow, fix-missing-ref API |
| **Security** | Alpha | JWT auth, env credentials, upload limits; needs hardening |
| **Testing** | Pre-alpha | Few unit tests, no integration tests |
| **Docs** | Alpha | architecture, user-guide, mapping-matrix, limitations exist |

---

## 5. Known Technical Debt

- **No Prisma migrations**: Uses `db push` only; no migration history
- **SQLite**: Suitable for dev/test; production would need PostgreSQL
- **Reports page**: Placeholder only ("Coming in next iteration")
- **No typecheck script**: Missing `tsc --noEmit` in root/package scripts
- **No release:check script**: Single script to run install → typecheck → lint → test → build
- **Parser**: Some FTD paths swallow errors and fall back; warnings collected but not always surfaced
- **Import API**: Saves file to disk and stores content in DB; `saveArtifact` path not consistently used for reads
- **fix-missing-ref**: No Zod validation for request body
- **interface-mappings POST**: No project existence check before upsert
- **Parse route**: Sets `currentStep: 'map-objects'` but stepper expects `map-interfaces` first (flow is correct: Parse → Map Interfaces → Map Objects)

---

## 6. Release Blockers (P0)

| # | Blocker | Severity |
|---|---------|----------|
| 1 | Parse sets `currentStep: 'map-objects'`; should be `map-interfaces` for correct stepper flow | P0 |
| 2 | Missing typecheck script | P0 |
| 3 | Missing release:check script | P0 |
| 4 | .env.example incomplete (UPLOAD_DIR, MAX_UPLOAD_MB, LOG_LEVEL, SESSION_SECRET) | P0 |
| 5 | Weak default SESSION_SECRET in auth/middleware when env not set | P0 |
| 6 | No input validation on fix-missing-ref, interface-mappings POST | P0 |

---

## 7. Recommended Fixes in Priority Order

### P0 — Must fix before test build
- Add typecheck script to root and apps
- Add release:check script
- Complete .env.example with all variables and comments
- Fail fast if SESSION_SECRET is not set in production
- Add Zod validation to fix-missing-ref and interface-mappings POST
- Fix parse route: set `currentStep: 'map-interfaces'` after parse
- Ensure API errors do not leak stack traces to client

### P1 — Should fix
- Add project existence check to interface-mappings POST
- Standardize empty/loading/error states across pages
- Add breadcrumb consistency (some pages have it, some minimal)
- Add toast/notification for save success and export success
- Add confirm dialog for destructive actions (e.g. re-run parse overwrites)

### P2 — Future improvement
- Prisma migrations for schema versioning
- Replace SQLite with PostgreSQL for production
- Implement Reports page
- Add integration/E2E tests
- Add request correlation IDs for debugging

---

## 8. Dead Code / Duplicates / Gaps

| Category | Finding |
|----------|---------|
| **Dead code** | None identified (no obvious unused components or routes) |
| **Duplicate utilities** | `ObjectFormData` validation in `checkpoint-format.ts` and fix-missing-ref; acceptable |
| **Stale branches** | Parse uses `artifacts[0]`; multi-artifact not supported (acceptable for MVP) |
| **Unused components** | Reports page is placeholder; Settings uses AppConfig/LiteLLM (optional) |
| **Partially implemented** | Job/JobLog models exist but parse runs sync; Job created but not fully async |
| **TODO/FIXME** | None found in codebase |
| **Endpoints not used by UI** | All API routes appear used |
| **UI screens broken** | None; Reports is intentionally placeholder |
| **Routes without validation** | fix-missing-ref, interface-mappings POST |
| **Silent error swallowing** | Parse page `fetch` catches and uses `alert`; some API catch blocks return generic 500 |
| **Logs leaking sensitive data** | Raw config not logged; AUTH_PASSWORD/SESSION_SECRET should not appear in logs (verify) |

---

## 9. API Endpoint Classification

| Route | Status | Notes |
|-------|--------|-------|
| /api/auth/login | Stable | Zod-like validation in body |
| /api/auth/logout | Stable | Cookie delete |
| /api/auth/verify-pin | Stable | Optional PIN |
| /api/config | Stable | GET/PUT |
| /api/projects | Stable | List, create |
| /api/projects/[id] | Stable | Get project |
| /api/projects/[id]/import | Stable | Zod validation |
| /api/projects/[id]/parse | Stable | Missing input size validation for content |
| /api/projects/[id]/normalized | Stable | Read-only |
| /api/projects/[id]/mapping | Stable | Read-only |
| /api/projects/[id]/mapping/override | Needs review | Validation present? |
| /api/projects/[id]/interface-mappings | Needs validation | POST body not validated with Zod |
| /api/projects/[id]/status | Stable | Read-only |
| /api/projects/[id]/validate | Stable | POST, no body |
| /api/projects/[id]/fix-missing-ref | Needs validation | POST body not Zod-validated |
| /api/projects/[id]/export | Stable | body.target/smsFormat optional |

---

## 10. Parser Pipeline Current Behavior

| Step | Behavior |
|------|----------|
| **Source formats** | ASA text, FTD JSON, FTD text (ASA-compatible) |
| **Supported statements** | object network, object service, object-group network/service, access-list extended, nat, interface, nameif |
| **Unsupported** | Skipped with warning; parser continues |
| **Failures** | Single unsupported line → warning, loop continues; does not crash entire parse |
| **Large configs** | Sync processing; may block event loop for very large files |
| **File size** | Checked at import (MAX_UPLOAD_MB), not at parse (content already in DB) |

---

## 11. Storage Layout

| Type | Location | Notes |
|------|----------|-------|
| Database | `DATABASE_URL` (default `./data/dev.db`) | SQLite file |
| Uploads | `UPLOAD_DIR/{projectId}/` (default `./data/uploads`) | Optional; content also in RawArtifact.content |
| Exports | Generated on-demand, streamed to client | No persistent export storage |
| Temp | None explicit | JSZip generates in memory |
