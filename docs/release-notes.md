# Release Notes

## v0.9.0-rc1 (2025-03-06) — Final Testing Build Candidate

This is the first release candidate for controlled testing. It is **not** intended for production public launch.

### New Features

- **Release checks**: `npm run release:check` runs typecheck, lint, test, and build
- **Environment template**: Complete `.env.example` for deployment setup

### Improvements

- **Workflow**: Parse step correctly directs users to Map Interfaces → Map Objects
- **Security**: Production requires SESSION_SECRET (min 32 chars)
- **API hardening**: Zod validation on fix-missing-ref and interface-mappings

### Parser Support

- ASA: object network, object service, object-group, access-list extended, nat, interface, nameif
- FTD: JSON and text (ASA-compatible) parsing

### Export Targets

- SMS only: Mgmt API (JSON + CLI), SmartConsole (CSV)
- Gateway only: Gaia clish (interfaces, routes)
- Both: ZIP with all artifacts

### Known Limitations

- Reports page is placeholder
- SQLite for dev/test; use PostgreSQL for production
- No Prisma migrations (schema via `db push`)
- VPN, routing protocols, complex object-group nesting not supported

### Testing Scope

- Install, typecheck, lint, test, build verified
- Manual QA checklist in `docs/final-build-test-checklist.md`
