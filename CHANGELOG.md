# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased]

### Fixed

- **Parse / 504:** `POST /parse` returns **202** immediately and runs normalize/map in the **background**; UI polls `GET /status?jobId=` so Azure/nginx gateways no longer time out on large configs.
- **Parse UI / 504 after success:** Parse page used `GET /normalized` (very large JSON) for counts — gateways could **504** even when parse logged complete. Added **`GET /normalized-summary`** (counts only).
- **Regression note:** Older builds returned parse counts in the **single** `POST /parse` JSON; the first async refactor dropped that and pulled full `/normalized` instead — **restored** by **`parseCounts`** on `GET /status?jobId=` when the job completes (same small payload behavior as before).

## [1.1.0] - 2025-03-24

### Added

- **Validate:** Actions for **DUPLICATE_NAME** (rename) and **SERVICE_NO_PORT** (add port); `POST /api/projects/[projectId]/patch-object`
- **Web:** Safe API JSON parsing when proxies return HTML (`read-api-json`) on import/parse
- **Docs:** `REMOTE_INSTALL.md` — large uploads, `MAX_UPLOAD_MB`, Nginx vs direct `:3000`

### Changed

- **Core:** FQDN normalized objects map to Check Point **`fqdn`** target (not host); CSV/CLI export include FQDN domain
- **Validate:** “Other findings” hints clarified (not clickable links)

### Fixed

- Production JSON parse errors from HTML error pages (nginx body limits, gateways)

## [0.9.0-rc1] - 2025-03-06

### Added

- **Release engineering**
  - `typecheck` script across all packages
  - `release:check` script (typecheck → lint → test → build)
  - `test:unit` alias
  - `start` script for production server
- **Documentation**
  - `docs/final-build-architecture-review.md` - Architecture and technical debt
  - `docs/final-build-test-checklist.md` - Manual QA checklist
  - `docs/mapping-support-matrix.md` - ASA → Check Point mapping table
  - `docs/github-release-prep.md` - GitHub upload guide
  - `docs/final-release-gate.md` - Release gate report
- **Environment**
  - `.env.example` with all required variables and comments

### Changed

- Parse route now sets `currentStep` to `map-interfaces` (correct stepper flow)
- API error responses no longer leak stack traces (parse route)
- SESSION_SECRET: production fails fast if not set or &lt; 32 chars
- Zod validation for `fix-missing-ref` and `interface-mappings` POST

### Fixed

- Parse → Map Interfaces → Map Objects workflow alignment

### Security

- SESSION_SECRET enforcement in production
- Input validation on fix-missing-ref and interface-mappings APIs

## [0.1.0] - Alpha

- Initial alpha: ASA/FTD parse, normalize, map, validate, export
- Interface mapping, Map Interfaces step
- SMS/Gateway export options
