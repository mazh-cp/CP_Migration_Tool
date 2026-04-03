# User Guide

**Cisco ASA / FTD / Fortinet → Check Point Migration**

This guide walks you through converting firewall configurations to Check Point format using Migrator.

---

## Overview

The workflow has 8 steps (same for ASA, FTD, **FortiGate**, and **FortiManager** after you pick the right source type):

1. Create Project  
2. Import Config  
3. Parse & Normalize  
4. Map Interfaces  
5. Map Objects  
6. Map Policy  
7. Validate & Fix  
8. Export  

---

## FortiGate (FortiOS) → Check Point — step by step

Use this path when the source firewall is a **FortiGate** (FortiOS CLI configuration backup).

### 1. Export the FortiGate configuration

- From the FortiGate **GUI**: use **Backup** (configuration) and download plain text, **or**
- From **CLI**: save output of a **full configuration** dump (e.g. `show full-configuration`) to a **`.conf`** or **`.txt`** file.
- Use one file per Migrator project. If you use **VDOMs**, export the scope (global vs VDOM) that matches what you are migrating.

### 2. Create project

- **Dashboard** → **Create New Project**, or **Projects** → **New Project**
- Enter a **project name**
- Select **Source type: Fortinet FortiGate**
- Click **Create & Import** → opens **Import**

### 3. Import

- Confirm **Fortinet FortiGate** is selected on the Import page.
- **Paste** the full config or **upload** your `.conf` / `.txt` file.
- Click **Import & Continue** → **Parse** page.

**Optional — hit counts:** You can also import **FortiAnalyzer** data (`sourceType` **fortianalyzer**, JSON or CSV) so that **Parse** merges **hit counts** into rules when a firewall configuration is already imported. Prefer importing the **newest** firewall config artifact when combining multiple imports.

### 4. Parse & Normalize

- Click **Run Parse**. Parsing runs in the **background**; the page polls until the job finishes.
- Review **Objects**, **Rules**, **NAT**, **Interfaces**, and **Warnings**.
- Click **Proceed to Map Interfaces**.

### 5. Map Interfaces

- Map each **FortiGate** interface to the target **Check Point** interface name (and IP/mask overrides if needed).
- **Save mappings** → **Map Objects**.

### 6. Map Objects

- Review proposed **Check Point** names for hosts, networks, groups, and services.
- **Edit** names or service **ports/ranges** before export if your naming standard requires it.
- **Map Policy**.

### 7. Map Policy

- Review **access rules** and **NAT**; adjust using supported overrides where shown.
- **Validate**.

### 8. Validate & Fix

- Resolve **errors** (missing references, invalid export names, etc.).
- **Re-validate** until no blocking errors → **Export**.

### 9. Export

- Choose **SMS only**, **Gateway only**, or **Both**.
- For SMS: **Mgmt API**, **SmartConsole**, or **Both** → **Download** the ZIP/artifacts.

---

## FortiManager (policy package) → Check Point — step by step

Use this when the source of truth is a **FortiManager ADOM policy package** (not a standalone FortiGate CLI backup).

### 1. Know your package scope

- **ADOM** name (e.g. `root` or a custom ADOM).
- **Policy package** name installed in that ADOM.
- **VDOM** (optional): if the package path in FortiManager is scoped to a VDOM, enter the same **VDOM** on live pull; omit if not used.

### 2. Create project

- **Dashboard** → **Create New Project**, or **Projects** → **New Project**
- **Source type: Fortinet FortiManager (policy package)**
- **Create & Import** → **Import** page

### 3. Import — JSON paste or file

- Set **Source type** to **Fortinet FortiManager (JSON bundle)**.
- **Paste** the bundle or **upload** a `.json` file (addresses, groups, services, firewall policy for the package).
- **Import & Continue** → **Parse**.

### 4. Import — live pull from FortiManager (alternative)

- Scroll to **FortiManager — live API pull** on the Import page.
- **Base URL**: `https://your-fortimanager.example` (Migrator server must reach this URL).
- Authentication: **Session key** from a FortiManager API admin, **or** **username / password** (used only for this request, not stored).
- **ADOM**, **Policy package**, optional **VDOM**.
- **Pull from FortiManager & import** → **Parse** on success.

**Note:** Production: use valid TLS and a routable manager URL. Lab private IPs may require **`FMG_ALLOW_PRIVATE_URLS`** on the Migrator server.

### 5. Parse through Export

- **Run Parse** (background job).
- **Map Interfaces** → **Map Objects** → **Map Policy** → **Validate** → **Export** — same as the FortiGate section.

**Optional:** **FortiAnalyzer** hit import for merged hit counts (see FortiGate section).

---

## Step-by-Step Usage (ASA / FTD)

### 1. Create Project

- Go to **Dashboard** → **Create New Project**, or **Projects** → **New Project**
- Enter a **project name** (e.g. "Branch-FW-Migration")
- Select **source type**: **ASA**, **FTD**, **Fortinet FortiGate**, or **Fortinet FortiManager** (FortiGate / FortiManager detail above)
- Click **Create & Import**
- You are redirected to the Import page

---

### 2. Import

- **Paste** your configuration into the text area, or **upload** a file  
  - ASA: `.txt`, `.cfg`  
  - FTD: `.json` or ASA-compatible text  
  - **FortiGate:** `.conf` / `.txt` full backup (see FortiGate section above)  
  - **FortiManager:** `.json` policy bundle, **or** use **live API pull** (see FortiManager section above)
- Ensure the **source type** on the Import page matches the project
- Click **Import & Continue**
- The config is stored and you proceed to the Parse page

**Tips:**
- Max file size is 25 MB (configurable via `MAX_UPLOAD_MB`); very large configs may return **413** if over the limit
- For FTD, use JSON export or text format compatible with ASA

---

### 3. Parse & Normalize

- Click **Run Parse**
- The parser converts the config into normalized objects, rules, NAT, and interfaces
- Review the counts:
  - **Objects** — Network and service objects
  - **Rules** — Access rules
  - **NAT** — NAT statements
  - **Interfaces** — Source firewall interfaces
  - **Warnings** — Unsupported or ambiguous lines
- Click **Proceed to Map Interfaces**
- You can **Re-run Parse** if you change the source config

---

### 4. Map Interfaces

- For each **source** interface (ASA, FTD, or FortiGate), select the corresponding Check Point interface (MGMT, eth0, eth1, etc.)
- Optionally set **IP override** and **Mask override** for Check Point
- Click **Save mappings** → **Next: Map Objects**

If no interfaces exist, you can skip to Map Objects.

---

### 5. Map Objects

- Review proposed Check Point mappings for network objects and services
- **Confidence indicators:**
  - **Green (high)** — Strong match
  - **Amber (medium)** — Review recommended
  - **Red (low)** — Manual override recommended
- Edit mappings if needed (including Check Point export names and service ports where supported)
- Click **Next: Map Policy**

---

### 6. Map Policy

- Review access rules with human-readable Source → Destination names
- Review NAT mappings (static, dynamic/hide)
- Click **Next: Validate & Fix**

---

### 7. Validate & Fix

- The validator reports errors, warnings, and info
- **Errors** must be fixed before export (e.g. missing object references)
- For **Missing object references** you can:
  - **Create placeholder** — Add 0.0.0.0/0 placeholder
  - **Replace with Any** — Use Check Point "Any" object
  - **Create custom object** — Define a valid Check Point object (host, network, range, FQDN)
- Click **Re-validate** after applying fixes
- When there are no errors, the **Next: Export** button becomes active
- Click **Next: Export**

---

### 8. Export

- Select **Target**:
  - **SMS only** — Policy, objects, rules, NAT for Check Point Management
  - **Gateway only** — Gaia clish (interfaces, routes)
  - **Both** — ZIP containing SMS and Gateway outputs
- If SMS: select **Format**:
  - **Mgmt API** — JSON bundle + CLI template
  - **SmartConsole** — CSV files for GUI import
  - **Both** — Both formats in ZIP
- Click **Download**
- Save the ZIP, JSON, or CLI file

---

## Supported Formats

| Source | Format |
|--------|--------|
| ASA | Plain text (.txt, .cfg) |
| FTD | JSON or ASA-compatible text |
| **FortiGate (FortiOS)** | Full configuration **.conf** / **.txt** (CLI backup or `show full-configuration` style) |
| FortiManager | Policy package **JSON** (paste/upload or live import, depending on setup) |
| FortiAnalyzer (optional) | JSON or CSV hit data (use with a firewall config for merged hits on parse) |

| Export | Output |
|--------|--------|
| Mgmt API | bundle.json, run_import.cli |
| SmartConsole | objects.csv, services.csv, groups.csv, policy.csv, nat.csv |
| Gateway | gaia_clish.txt |

---

## Troubleshooting

| Issue | Action |
|-------|--------|
| Parse fails | Check source format; ensure ASA/FTD/FortiOS syntax; FortiGate needs full config text |
| Missing object references | Fix in Validate step before export |
| Export blocked | Resolve all validation errors |
| Large file rejected | Check `MAX_UPLOAD_MB` in environment |

See [Limitations](limitations.md) for unsupported features.
