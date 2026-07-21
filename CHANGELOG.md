# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased]

## [1.6.0] - 2026-07-21

### Added

- **Migration coverage report:** every parse now produces a `coverage` section in the migration report — converted counts (objects, rules, NAT, routes, interfaces, zones), review-note categories, and unsupported source constructs grouped by command with samples. Nothing is silently dropped. A **Migration coverage panel** on the Export page surfaces it in the UI.
- **Static routing:** ASA `route` and `ipv6 route` are parsed and exported as Gaia `set static-route` / `set ipv6 static-route` commands. Dynamic routing (OSPF/BGP/EIGRP/RIP) is captured as review notes and emitted as Gaia comments.
- **VPN review notes across vendors:** ASA remote-access + site-to-site (tunnel-groups, group-policies, crypto maps, pools), FortiGate `vpn ipsec phase1-interface`, and Palo Alto `network/ike/gateway` are captured as `vpn.notes.json` in export bundles and shown on the Export page. Pre-shared keys are never captured or exported — only a presence flag.
- **High availability + inspection notes (ASA):** `failover` config (keys masked) and `policy-map` inspects / `threat-detection` are captured as `high-availability` and `inspection` manual-review items recommending ClusterXL/Gaia clustering and Threat Prevention blade mapping.
- **IPv6:** ASA IPv6 objects (`subnet 2001:db8::/64`, IPv6 hosts) and `any4`/`any6` ACL keywords; FortiGate `address6` / `addrgrp6` / `policy6`; Palo Alto IPv6 `ip-netmask` host/network classification (`/128` host vs `/32` network).
- **`scripts/redact-normalized-data.ts`:** one-off backfill that re-runs secret redaction over existing `NormalizedData` rows (`--dry-run` supported).

### Changed

- **Object-group nesting (ASA):** groups now resolve order-independently via two-pass normalization — forward references and multi-level nesting work; unknown and self-references produce warnings instead of silent drops.
- **Normalized/export APIs** return `routes` and `vpn`; `NormalizedData` gains additive `routesJson` / `vpnJson` columns (run `npx prisma db push` — non-destructive).
- **Turborepo:** `typecheck` now depends on the package's own `build`, fixing an intermittent `TS6053` race between Next.js typecheck and `.next` cleaning.

### Security

- **`redactSecrets` repaired and enforced:** previous patterns used PCRE-only `\K` (never matched in JavaScript). Rewritten with capture groups (enable secrets, passwords, SNMP communities, PSKs, OSPF/BGP auth keys, ISAKMP keys, PEM blocks) and now applied to parse warnings and coverage-report samples before persistence and API exposure.
- **Secrets never captured at parse time:** BGP neighbor passwords, OSPF authentication/message-digest keys, and `failover key` values are masked (`***`) in captured routing/HA notes; FortiGate `psksecret` and PAN IKE pre-shared keys are recorded as presence flags only.

## [1.5.3] - 2026-04-09

### Changed

- **Node.js 22.x LTS** is now the supported runtime: `package.json` `engines.node` is `>=22`, `.nvmrc` pins `22`, `.npmrc` enables `engine-strict`. Install and upgrade scripts (`deploy/install_azure_ubuntu.sh`, `deploy/update_azure_ubuntu.sh`) use NodeSource **setup_22.x** and upgrade existing Node versions below 22.
- **CI / Turborepo:** `turbo.json` lists `globalPassThroughEnv` (`SESSION_SECRET`, `DATABASE_URL`, etc.) so GitHub Actions env vars reach `next build` under Turborepo’s strict env mode. Security workflow uses `actions/checkout@v5`, `actions/setup-node@v5`, and a higher Node heap limit for the build step.

### Deploy

- Pinned examples and default **`DOC_RELEASE_TAG`** updated to **v1.5.3**.

## [1.5.2] - 2026-04-08

### Security

- **Express Palo Alto API (`server.js`):** Production requires **`PALO_ALTO_EXPRESS_API_KEY`** and **`PALO_ALTO_HOST_ALLOWLIST`** (or explicit **`PALO_ALTO_ALLOW_ANY_HOST=true`**). Requests may authenticate with `Authorization: Bearer` or `X-API-Key` when the key is set.
- **SSRF guard:** Resolves hostnames, blocks loopback, **169.254.0.0/16**, and optional RFC1918 via **`PALO_ALTO_BLOCK_PRIVATE_HOSTS`**. Allowlist enforced when configured.
- **PanFirewallClient:** `maxRedirects: 0`, response size cap (~200MB), 120s timeout; XML API parser uses **`processEntities: false`** and ignores DTD/processing instructions; safe **vsys** names in XPath helpers.
- **Web import API:** `POST .../import` returns artifact **metadata only** (no **`content`** body). **FortiManager live** errors return a generic 502 message (details in server logs).
- **Auth diagnostic:** No longer returns the configured admin **username** in JSON.

### Added

- **`.github/workflows/security.yml`:** `npm ci`, `npm audit --audit-level=high`, lint, typecheck, test, build.
- **FortiManager:** **`FMG_REQUEST_TIMEOUT_MS`** (default 120s) on JSON-RPC **`fetch`**.
- **Next.js:** Optional **`Strict-Transport-Security`** when **`ENABLE_HSTS=1`** (HTTPS deployments only).
- **`GET /health`:** Includes **`uptime`** (seconds).
- **Express:** Graceful **SIGTERM/SIGINT** shutdown, **`uncaughtException`** / **`unhandledRejection`** handlers; **`app.disable('x-powered-by')`**.
- **`.gitignore`:** `*.pem`, `*.key`, `*.p12`, `*.pfx`. **`scripts/clear-ports.sh`:** also clears port **3004**.

### Changed

- **Next.js** and **eslint-config-next** to **15.5.14** (security patches). Dependency audit fixes for **high** severity issues.

### Deploy

- Pinned examples and default **`DOC_RELEASE_TAG`** updated to **v1.5.2**.

## [1.5.1] - 2026-04-07

### Fixed

- **Palo Alto Map Interfaces:** Parser now emits `interface` AST nodes from **security-rule zones**, **vsys zone definitions**, and **device-level `network/interface`** (running-config places `network` under `devices/entry`, not under `vsys`).
- **Palo Alto L3 interfaces:** Supports `network/interface/ethernet/entry` (and related types), plus IPv4 from **`layer3/ip`** or direct **`ip`** subinterfaces (`<ip><entry name="a.b.c.d/nn"/>`).

### Changed

- **Map Interfaces UI:** Vendor-neutral copy (ASA / Palo Alto zones & L3 / FortiGate) and clearer empty state.

### Deploy

- Pinned examples and default **`DOC_RELEASE_TAG`** updated to **v1.5.1**.

## [1.5.0] - 2026-04-06

### Added

- **Palo Alto PAN-OS** in the web migrator: `paloalto` source type end-to-end (import → parse → normalize → map → export) alongside ASA/FTD/Fortinet.
- **`@cisco2cp/parsers`:** `parsePaloAltoXml`, `preparePaloAltoInput` (plain XML, API-wrapped XML, base64 ZIP, raw ZIP-as-string, set-format CLI); Vitest coverage and sample fixtures.
- **`@cisco2cp/exporters`:** `buildR8xMigrationFromStatements` and `getR8xMigrationSummary` for Check Point **R8x-style** migration JSON from the shared AST.
- **Optional Express API** (`server.js`, `app.js`): Palo Alto → R8x JSON over HTTP (default port **3001**), including upload, live firewall fetch, and Panorama device list / device config fetch.

### Changed

- Express Panorama **device fetch** uses **full device config XML** from the API (replaces the previous JavaScript-only merged shared pre/post rule layers).

### Removed

- Duplicate Palo Alto **JavaScript** parsers, transformers, and `xmlParser.js` in `src/`; Jest-based integration tests for that stack. Single parse/export path uses **`@cisco2cp/parsers`** + **`@cisco2cp/exporters`**.

### Documentation

- Admin/user guides, `docs/limitations.md`, and process docs updated for Palo Alto workflows and formats.

### Deploy

- Pinned examples and default **`DOC_RELEASE_TAG`** / upgrade script defaults updated to **v1.5.0**.

## [1.4.1] - 2026-04-04

### Added

- **Documentation:** Step-by-step **FortiGate** (FortiOS) import → parse → Check Point export in `ADMIN_GUIDE.md`, `USER_GUIDE.md`, `docs/user-guide.md`, `docs/user-admin-guide.md`, and `docs/process-flow.md`.
- **Documentation:** Parallel **FortiManager** (JSON paste/upload and live API pull) workflow in the same guides; **FortiManager** scope note in `docs/limitations.md`.

### Changed

- **Deploy:** Pinned examples and default `DOC_RELEASE_TAG` / remote upgrade default ref updated to **v1.4.1** (`deploy/upgrade-production.sh`, `deploy/update_azure_ubuntu.sh`, `deploy/upgrade-remote-production.sh`, `deploy/UPGRADE.md`, `deploy/install_azure_ubuntu.sh` header).

## [1.4.0] - 2026-04-03

### Added

- **Fortinet FortiGate import:** Paste or upload FortiOS CLI-style configuration backups (`.conf` / `.txt`). Parser extracts firewall addresses, address groups, custom services, service groups, IPv4 policies, and system interfaces; policies map into the same normalized object/rule model used for Check Point export. Common predefined services (e.g. HTTP, HTTPS, DNS) are synthesized when referenced by policy.
- **FortiManager:** Import JSON bundles (paste/upload) with `sourceType` `fortimanager`, or **live pull** from FortiManager JSON-RPC (`POST .../import/fortimanager-live`) using session key or username/password. Object database + policy package are fetched server-side; credentials are not stored.
- **FortiAnalyzer:** Optional `fortianalyzer` artifact (JSON `hits` array or CSV with `policyId`/`policyName` + `hits`). On **Parse**, hit counts merge into normalized rules when a firewall config artifact exists. Latest config artifact is chosen by upload time (not only the first row).
- **Parsers:** `parseFortiManagerExport` for CMDB-style FortiManager JSON; FortiGate / FortiManager inventory-style scanners; `ExplicitPolicyRule.ruleId` for FortiOS policyid matching.
- **Migration assurance:** Pre-parse inventory, extended migration report, optional functional test plan in export when present; `migrationReportJson` on normalized data.
- **Map (pre-export):** Edit Check Point names, normalized source names, and service ports/ranges on Map Objects; rule / NAT comment edits on Map Policy; `validateCheckPointExportName` and related API wiring.
- **AST / normalize:** New `explicit-policy-rule` statement type for multi-field vendor policies (used by the FortiGate parser); ASA/FTD behavior unchanged.
- **Parse job:** Parser warnings from ASA and FortiGate runs are merged into normalized warnings; FTD JSON + text fallback warning merging improved.
- **Web:** Shared `AppShell` layout; `/projects/new` lives under `app/projects/new` so dev chunk URLs avoid route-group parentheses (reduces `ChunkLoadError` timeouts). Client chunk-load recovery and longer dev `chunkLoadTimeout` as additional mitigations.

### Changed

- **`GET /api/auth/diagnostic`:** In production, returns **404** unless `AUTH_DIAGNOSTIC_ENABLED=true` (development unchanged).

### Fixed

- **Import API:** Oversized uploads that hit `MAX_UPLOAD_MB` return **413** with a clear message instead of a generic **500**.

### Security

- **FortiManager live import:** Server-side `fetch` targets are validated to block loopback, link-local, and private IP literals (SSRF mitigation). Set `FMG_ALLOW_PRIVATE_URLS=true` for lab installs.

## [1.3.1] - 2026-03-24

### Fixed

- **`deploy/upgrade-production.sh` when curl-piped:** Bash does not set `BASH_SOURCE` for stdin scripts, and `set -u` made `${BASH_SOURCE[0]}` fail; the wrapper also looked for `update_azure_ubuntu.sh` in the wrong directory. The wrapper now **downloads `update_azure_ubuntu.sh` from GitHub** when no local sibling exists (same `BRANCH` / `REPO_SLUG` as the deployment).

### Changed

- **Docs:** Pinned-tag examples use **`sudo bash -s -- v1.x`** or **`sudo env BRANCH=v1.x bash`** because **`sudo` does not inherit `BRANCH` from `BRANCH=v1.x curl | sudo bash`**.

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
