# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased]

## [1.3.0] - 2026-03-24

### Added

- **ASA text — FTD/FMC `access-list … advanced`:** Parser accepts **`advanced`** ACEs (e.g. `permit` / `deny` / **`trust`**, `ifc`, `object-group`, `rule-id`, `event-log`) and emits normalized **Map Policy** rules. **`trust`** is normalized as **allow** (same as permit).
- **Deploy:** **`deploy/upgrade-production.sh`** — canonical curl target for production upgrades (delegates to `update_azure_ubuntu.sh`).
- **Deploy:** **`deploy/upgrade-remote-production.sh`** — upgrade a VM from your workstation via **SSH + curl** (no local clone).

### Fixed

- **Object groups:** `object-group network` / `service` parsers no longer consume the next non-member line (e.g. **`access-list`** immediately after a group), which could drop ACL statements after the last group in a file.
- **Status / parseCounts:** SQLite `$queryRaw` can return **BigInt** for `json_array_length`; `NextResponse.json` threw *Do not know how to serialize a BigInt*. Counts are coerced to **number** in `getNormalizedCounts`.
- **Parse performance:** Replaced **per-row** mapping `upsert` (could be 10k+ sequential SQLite calls) with **`deleteMany` + batched `createMany`** — large configs complete in minutes instead of stalling.
- **Parse UI:** Poll wait extended to **60 minutes** with clearer elapsed-time hint; `journalctl` documents phase timings (`parse`, `normalize`, `persist_mappings`).
- **Normalize:** **`object-group NAME`** / **`object NAME`** in ACE source/destination resolve by **NAME** in the object registry.

### Changed

- **`access-list … remark`:** Silently skipped (no parse warning).

## [1.2.0] - 2025-03-25

### Added

- **`GET /api/projects/[projectId]/normalized-summary`** — array counts only (SQLite `json_array_length`), avoids multi‑MB `GET /normalized` on the Parse step.
- **`lib/normalized-counts.ts`** — shared count helper for summary + status APIs.
- **`parseCounts`** on **`GET /api/projects/[projectId]/status?jobId=`** when a **parse** job reaches **completed** (same small payload as legacy synchronous `POST /parse`).

### Fixed

- **Parse / gateway 504:** `POST /parse` returns **202** immediately; normalize/map runs in a **background job**; UI polls **`/status?jobId=`** so proxies (Azure AG, Nginx) do not time out on long parses.
- **Parse UI / 504 after success:** First async refactor loaded full **`/normalized`** for counts — **restored** small counts via **`parseCounts`** on the status poll and **`/normalized-summary`** fallback.

### Changed

- Parse page: polling UI with elapsed-time hint; documents **`REMOTE_INSTALL.md`** / **`read-api-json`** for 502/504 and proxy timeouts.

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
