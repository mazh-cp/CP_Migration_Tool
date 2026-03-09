# Process Flow Document

**Cisco ASA/FTD → Check Point Converter**  
**Version:** 0.9.0-rc1

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
       │                      │                   └── Paste or upload ASA/FTD config
       │                      │
       │                      └── Name + source type (ASA | FTD)
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
| 3 | Select source type (ASA or FTD) | Required |
| 4 | Click Create & Import | POST /api/projects, redirect to Import |

---

### Phase 2: Import

| Step | Action | Outcome |
|------|--------|---------|
| 1 | Paste config or upload file | Content in memory |
| 2 | Verify source type | Must match project |
| 3 | Click Import & Continue | POST /api/projects/[id]/import |
| 4 | Success | RawArtifact stored, status=imported, redirect to Parse |

**Constraints:** Max file size = MAX_UPLOAD_MB (default 25 MB). Supported formats: .txt, .cfg, .json.

---

### Phase 3: Parse & Normalize

| Step | Action | Outcome |
|------|--------|---------|
| 1 | Click Run Parse | POST /api/projects/[id]/parse |
| 2 | Parser runs | AST from ASA or FTD |
| 3 | Normalizer runs | Vendor-neutral objects, rules, NAT, interfaces |
| 4 | Mapping engine proposes targets | MappingDecision records created |
| 5 | Validator runs | Initial findings |
| 6 | Success | Counts shown: objects, rules, NAT, interfaces, warnings |
| 7 | Click Proceed to Map Interfaces | Redirect to Map Interfaces |

---

### Phase 4: Map Interfaces

| Step | Action | Outcome |
|------|--------|---------|
| 1 | View ASA interfaces | From normalized data |
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
| Source type | ASA / FTD | Parser and normalizer choice |
| Missing object reference | Placeholder / Replace with Any / Custom | Validation and export |
| Export target | SMS / Gateway / Both | Output format |
| SMS format | Mgmt API / SmartConsole / Both | File structure in ZIP |

---

## 5. Data Flow Summary

```
Raw Config (ASA/FTD text or JSON)
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
