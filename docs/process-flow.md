# Process Flow Document

**Cisco ASA / FTD / Fortinet / Palo Alto → Check Point Migrator**  
**Version:** 1.5.3

---

## 1. High-Level Flow

```
┌─────────────┐     ┌─────────────┐     ┌──────────────┐     ┌─────────────┐     ┌─────────────┐
│   Login     │────▶│   Create    │────▶│   Import     │────▶│   Parse     │────▶│ Map         │
│             │     │   Project   │     │   Config     │     │   & Norm    │     │ Interfaces  │
└─────────────┘     └─────────────┘     └──────────────┘     └─────────────┘     └──────┬──────┘
       │                      │                   │                   │                  │
       │                      │                   │                   │                  ▼
       │                      │                   │                   │          ┌──────────────┐
       │                      │                   │                   │          │ Map Objects  │
       │                      │                   │                   │          └──────┬───────┘
       │                      │                   │                   │                 │
       │                      │                   │                   │                 ▼
       │                      │                   │                   │          ┌──────────────┐
       │                      │                   │                   │          │ Map Policy   │
       │                      │                   │                   │          └──────┬───────┘
       │                      │                   │                   │                 │
       │                      │                   │                   │                 ▼
       │                      │                   │                   │          ┌──────────────┐
       │                      │                   │                   │          │  Validate    │
       │                      │                   │                   │          └──────┬───────┘
       │                      │                   │                   │                 │
       │                      │                   │                   │                 ▼
       │                      │                   │                   │          ┌──────────────┐
       │                      │                   │                   └─────────▶│   Export     │
       │                      │                   │                              └──────────────┘
       │                      │                   │
       │                      │                   └── Paste or upload ASA / FTD / FortiGate / FortiManager / Palo Alto XML / FortiAnalyzer
       │                      │
       │                      └── Name + source type (ASA | FTD | Fortinet FortiGate | Fortinet FortiManager | Palo Alto XML)
       │
       └── AUTH_USERNAME / AUTH_PASSWORD
```

---

## 2. Detailed Process Flow

### Phase 0: Authentication

| Step | Action | Outcome |
|------|--------|---------|
| 1 | Navigate to app URL | Redirect to /login if not authenticated |
| 2 | Enter username and password | POST /api/auth/login |
| 3 | Valid credentials | JWT cookie set, redirect to /dashboard |
| 4 | Invalid credentials | Error message, remain on login |

---

### Phase 1: Project Creation

| Step | Action | Outcome |
|------|--------|---------|
| 1 | Dashboard → Create New Project | Navigate to /projects/new |
| 2 | Enter project name | Required |
| 3 | Select source type | **ASA**, **FTD**, **Fortinet FortiGate**, **Fortinet FortiManager** (policy package), or **Palo Alto Networks (PAN-OS XML)** |
| 4 | Click Create & Import | POST /api/projects, redirect to Import |

---

### Phase 2: Import

| Step | Action | Outcome |
|------|--------|---------|
| 1 | Paste config or upload file | Content in memory |
| 2 | Verify source type | Must match project (and artifact kind: firewall vs analyzer vs manager) |
| 3 | Click Import & Continue | POST /api/projects/[id]/import |
| 4 | Success | RawArtifact stored, status=imported, redirect to Parse |

**Constraints:** Max file size = MAX_UPLOAD_MB (default 25 MB); oversized payloads may return **413**.

**Formats by source:**

| Source | Typical upload |
|--------|----------------|
| ASA | `.txt`, `.cfg` text |
| FTD | JSON or ASA-compatible text |
| **Fortinet FortiGate** | FortiOS full config **`.conf` / `.txt`** (CLI backup or `show full-configuration` style) |
| FortiManager | Policy package **JSON** (paste/upload) or live JSON-RPC import |
| **Palo Alto (PAN-OS)** | Configuration **XML** (paste or `.xml` upload); `sourceType: paloalto` |
| FortiAnalyzer (optional) | JSON (`hits` array) or CSV with policy id/name + hits |

**Palo Alto note:** Import is **file or paste only** (no live device API in the app). XML should include address, service, and security-rule sections for best coverage; parse may emit **warnings** for App-ID and other constructs—operators validate in Map Policy / Validate.

**FortiGate note:** One primary firewall config artifact per parse path; optional **FortiAnalyzer** artifact can be imported in addition so parse merges hit statistics when both are present.

**FortiManager note:** Two import paths, same downstream phases:

| Path | How | Server behavior |
|------|-----|-----------------|
| **JSON file / paste** | User selects **FortiManager (JSON bundle)**; POST `/api/projects/[id]/import` with `sourceType: fortimanager` | Bundle stored as artifact; no outbound call to FortiManager. |
| **Live API pull** | Import page form: **Base URL**, **session** or **username+password**, **ADOM**, **policy package**, optional **VDOM**; POST `.../import/fortimanager-live` | Server-side JSON-RPC fetch; credentials used only for that request, not persisted. URL host validated against private/loopback IPs unless **`FMG_ALLOW_PRIVATE_URLS`** is set (lab). |

After either path, status becomes **imported** and the user continues to **Parse** like other source types.

---

### Phase 3: Parse & Normalize

| Step | Action | Outcome |
|------|--------|---------|
| 1 | Click Run Parse | POST /api/projects/[id]/parse → **202** + `jobId`; UI polls GET `/api/projects/[id]/status?jobId=` until complete (avoids proxy **504** on long parses) |
| 2 | Parser runs | Statements from ASA, FTD JSON/text, **FortiOS CLI config**, FortiManager bundle, or **PAN-OS XML** |
| 3 | Normalizer runs | Vendor-neutral objects, rules, NAT, interfaces |
| 4 | Mapping engine proposes targets | MappingDecision records created |
| 5 | Validator runs | Initial findings |
| 6 | Success | Counts shown: objects, rules, NAT, interfaces, warnings |
| 7 | Click Proceed to Map Interfaces | Redirect to Map Interfaces |

---

### Phase 4: Map Interfaces

| Step | Action | Outcome |
|------|--------|---------|
| 1 | View source firewall interfaces | From normalized data (ASA, FTD, FortiGate, FortiManager, Palo Alto) |
| 2 | Map each to Check Point | MGMT, eth0, eth1, etc. or custom |
| 3 | Optional: IP/mask override | For Check Point topology |
| 4 | Click Save mappings | POST /api/projects/[id]/interface-mappings |
| 5 | Click Next: Map Objects | Redirect to Map Objects |

---

### Phase 5: Map Objects

| Step | Action | Outcome |
|------|--------|---------|
| 1 | Review proposed mappings | Network objects, services |
| 2 | Confidence indicators | High (green), medium (amber), low (red) |
| 3 | Override if needed | Edit proposed Check Point target |
| 4 | Click Next: Map Policy | Redirect to Map Policy |

---

### Phase 6: Map Policy

| Step | Action | Outcome |
|------|--------|---------|
| 1 | Review access rules | Source → Destination, human-readable names |
| 2 | Review NAT mappings | Static, dynamic/hide |
| 3 | Click Next: Validate & Fix | Redirect to Validate |

---

### Phase 7: Validate

| Step | Action | Outcome |
|------|--------|---------|
| 1 | Run validation | POST /api/projects/[id]/validate |
| 2 | Review findings | Errors, warnings, info |
| 3 | Fix missing refs | Create placeholder, replace with Any, or create custom object |
| 4 | Re-validate | Confirm no errors |
| 5 | No errors | Export button enabled |
| 6 | Click Next: Export | Redirect to Export |

---

### Phase 8: Export

| Step | Action | Outcome |
|------|--------|---------|
| 1 | Select target | SMS only | Gateway only | Both |
| 2 | If SMS: select format | Mgmt API | SmartConsole | Both |
| 3 | Click Download | POST /api/projects/[id]/export |
| 4 | Download | ZIP, JSON, or CLI file |

**Export outputs:**
- **SMS Mgmt API:** bundle.json + run_import.cli
- **SMS SmartConsole:** objects.csv, services.csv, groups.csv, policy.csv, nat.csv
- **Gateway:** gaia_clish.txt (interfaces, routes)

---

## 3. State Transitions

| Current Status | Action | New Status |
|----------------|--------|------------|
| draft | Import config | imported |
| imported | Run parse | parsed / mapped |
| parsed | Map interfaces, objects, policy | mapped |
| mapped | Run validate (no errors) | validated |
| validated | Export | exported |

---

## 4. Decision Points

| Decision | Options | Impact |
|----------|---------|--------|
| Source type | ASA / FTD / Fortinet FortiGate / Fortinet FortiManager / Palo Alto XML | Parser choice; FortiGate/FortiManager/Palo Alto share ASA-oriented normalization after parse |
| Missing object reference | Placeholder / Replace with Any / Custom | Validation and export |
| Export target | SMS / Gateway / Both | Output format |
| SMS format | Mgmt API / SmartConsole / Both | File structure in ZIP |

---

## 5. Data Flow Summary

```
Raw Config (ASA/FTD text or JSON; FortiOS .conf/.txt; FortiManager JSON; PAN-OS XML; optional FortiAnalyzer)
    │
    ▼
Parser (AST)
    │
    ▼
Normalizer (vendor-neutral objects, rules, NAT, interfaces)
    │
    ├──────────────────────────────────────┐
    ▼                                      ▼
Mapping Engine                    Validation Engine
(proposed Check Point targets)    (findings)
    │                                      │
    ▼                                      ▼
User Overrides                    User Fixes (placeholder, Any, custom)
    │                                      │
    └──────────────────┬───────────────────┘
                       ▼
                 Export Engine
                       │
                       ▼
                 Check Point artifacts (JSON, CLI, CSV)
```
