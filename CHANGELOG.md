# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

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
