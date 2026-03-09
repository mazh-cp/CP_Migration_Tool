# GitHub Release Preparation

**Version:** 0.9.0-rc1  
**Date:** 2025-03-06

## Branch Recommendation

- `main` or `release/0.9.0-rc1`

## Completed Fixes

- Parse step sets `currentStep` to `map-interfaces`
- Zod validation on fix-missing-ref and interface-mappings
- SESSION_SECRET enforcement in production
- API error responses avoid leaking stack traces
- .env.example with all variables
- typecheck, release:check scripts
- Architecture review, test checklist, mapping matrix
- CHANGELOG and release notes

## Remaining Known Issues

- Reports page is placeholder
- No Prisma migrations (db push only)
- UI package lint is placeholder (typecheck used)
- No E2E tests

## Commands to Verify Repo

```bash
# Fresh install
rm -rf node_modules apps/*/node_modules packages/*/node_modules
npm install

# Full release check
npm run release:check
```

## Commit Plan

1. `chore: stabilize dependencies and build scripts`
2. `fix: harden parser step flow and API validation`
3. `security: enforce SESSION_SECRET and redact error details`
4. `docs: add architecture review, test checklist, release notes`

## Push Plan

```bash
git status
git add .
git commit -m "chore: final testing build v0.9.0-rc1"
git push origin main
```

Or with tags:

```bash
git tag v0.9.0-rc1
git push origin v0.9.0-rc1
```
