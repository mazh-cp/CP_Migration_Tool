# User Guide — Migrator

**Cisco ASA / FTD / Fortinet / Palo Alto → Check Point Migration**

This guide walks you through converting firewall configurations to Check Point format using Migrator.

**How this guide is organized:** Vendor-specific **import** instructions first (**FortiGate**, **FortiManager**, **Palo Alto**), then a shared **ASA / FTD** walkthrough (steps 1–8) that applies to **all** sources for Parse onward. **Supported formats** and **troubleshooting** are at the end. Administrators: auth, env, and checklists in [ADMIN_GUIDE.md](ADMIN_GUIDE.md) and [docs/user-admin-guide.md](docs/user-admin-guide.md).

---

## Overview

The workflow has 8 steps (same for ASA, FTD, **FortiGate**, **FortiManager**, and **Palo Alto (PAN-OS XML)** after you pick the right source type):

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
- Review **Objects**, **Rules**, **NAT**, **Routes**, **Interfaces**, and **Warnings**, plus any **review notes** (VPN, HA, inspection — captured for manual recreation, secrets never stored).
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
- **Paste** the bundle or **upload** a `.json` file (same structure Migrator expects: addresses, groups, services, firewall policy for the package).
- **Import & Continue** → **Parse**.

### 4. Import — live pull from FortiManager (alternative)

- Scroll to **FortiManager — live API pull** on the Import page.
- **Base URL**: `https://your-fortimanager.example` (Migrator server must reach this URL over the network).
- Authentication (pick one):
  - **Session key** from a FortiManager API admin, **or**
  - Check **Use username / password** and enter API user credentials (used **only for this request**, not stored).
- Enter **ADOM**, **Policy package**, and **VDOM** if required.
- **Pull from FortiManager & import** → **Parse** on success.

**Note:** In production, use a proper hostname/TLS. For lab firewalls using private IPs, the server may require **`FMG_ALLOW_PRIVATE_URLS`** (see admin env reference).

### 5. Parse through Export

- **Run Parse** (background job; wait for completion).
- **Map Interfaces** → **Map Objects** → **Map Policy** → **Validate** → **Export** — same as the FortiGate section above.

**Optional:** Import **FortiAnalyzer** hit data after the manager bundle if you want hit counts merged on parse (see FortiGate section).

---

## Palo Alto Networks (PAN-OS XML) → Check Point — step by step

Use this path when the source is a **Palo Alto Networks** firewall (or Panorama-exported XML) and you have **PAN-OS configuration in XML** form.

### 1. Export the PAN-OS configuration as XML

- Use your standard process to obtain **XML** (e.g. **running configuration** XML, **`show configuration running`** output saved as XML, or a device-group / template export that includes **address**, **service**, and **security** sections).  
- Save as **`.xml`** or paste the full document. One logical scope (device or consistent policy set) per Migrator project is easiest to validate.

### 2. Create project

- **Dashboard** → **Create New Project**, or **Projects** → **New Project**
- **Source type: Palo Alto Networks (PAN-OS XML export)**
- **Create & Import** → **Import** page

### 3. Import

- Set **Source type** to **Palo Alto Networks (PAN-OS XML)**.
- **Paste** the XML or **upload** a **`.xml`** file.
- **Import & Continue** → **Parse** page.

**Optional — hit counts:** Import **FortiAnalyzer** data after the firewall XML if your process still uses analyzer hits with this project; parse merges hits when a firewall-class config artifact exists (see FortiGate section).

### 4. Parse through Export

- **Run Parse** (background job; wait for completion). Read **Warnings** carefully—**App-ID** and other PAN-OS-specific fields may need manual review in **Map Policy** / **Validate**.
- **Map Interfaces** → **Map Objects** → **Map Policy** → **Validate** → **Export** — same as the FortiGate section above.

---

## Step-by-Step Usage (ASA / FTD)

### 1. Create Project

- Go to **Dashboard** → **Create New Project**, or **Projects** → **New Project**
- Enter a **project name** (e.g. "Branch-FW-Migration")
- Select **source type**: **ASA**, **FTD**, **Fortinet FortiGate**, **Fortinet FortiManager**, or **Palo Alto Networks (PAN-OS XML)** (vendor-specific detail in sections above)
- Click **Create & Import**
- You are redirected to the Import page

---

### 2. Import

- **Paste** your configuration into the text area, or **upload** a file  
  - ASA: `.txt`, `.cfg`  
  - FTD: `.json` or ASA-compatible text  
  - **FortiGate:** `.conf` / `.txt` full backup (see FortiGate section above)  
  - **FortiManager:** `.json` policy bundle, **or** use **live API pull** (see FortiManager section above)  
  - **Palo Alto:** `.xml` PAN-OS configuration (see Palo Alto section above)
- Ensure the **source type** on the Import page matches the project
- Click **Import & Continue**
- The config is stored and you proceed to the Parse page

**Tips:**
- Max file size is 25 MB (configurable via `MAX_UPLOAD_MB`); very large configs may return **413** if over the limit
- For FTD, use JSON export or text format compatible with ASA

---

### 3. Parse & Normalize

- Click **Run Parse**
- The parser converts the config into normalized objects, rules, NAT, routes, and interfaces
- Review the counts:
  - **Objects** — Network and service objects (IPv4 and IPv6)
  - **Rules** — Access rules
  - **NAT** — NAT statements
  - **Routes** — Static routes (converted); dynamic routing (OSPF/BGP/EIGRP) is captured as review notes
  - **Interfaces** — Source firewall interfaces
  - **Warnings** — Unsupported or ambiguous constructs (credentials are masked)
- **Review notes** are captured for VPN, high availability (failover), and inspection (policy-map / threat-detection) — these are not auto-converted and are surfaced for manual recreation. Pre-shared keys and other secrets are never captured.
- Click **Proceed to Map Interfaces**
- You can **Re-run Parse** if you change the source config

---

### 4. Map Interfaces

- For each **source** interface or zone context (ASA, FTD, FortiGate, FortiManager, or Palo Alto), select the Check Point interface (MGMT, eth0, eth1, etc.)
- Optionally set **IP override** and **Mask override**
- Click **Save mappings** → **Next: Map Objects**

---

### 5. Map Objects

- Review proposed Check Point mappings for network objects and services
- **Confidence:** Green (high), Amber (medium), Red (low)
- Edit mappings as needed (including Check Point export names and service ports where supported)
- Click **Next: Map Policy**

---

### 6. Map Policy

- Review access rules (Source → Destination)
- Review NAT mappings
- Click **Next: Validate & Fix**

---

### 7. Validate & Fix

- Validator reports errors, warnings, and info
- **Errors** must be fixed before export
- For **Missing object references**:
  - **Create placeholder** — Add 0.0.0.0/0
  - **Replace with Any** — Use Check Point "Any"
  - **Create custom object** — Define host, network, range, or FQDN
- Click **Re-validate** after fixes
- When no errors remain, click **Next: Export**

---

### 8. Export

- The Export page shows a **Migration coverage** panel first: converted counts, categories that need manual review (VPN, HA, inspection, etc.), and any source constructs that were **not migrated** (grouped by command). Review it before downloading.
- **Target:** SMS only, Gateway only, or Both
- **Format (SMS):** Mgmt API (JSON + CLI), SmartConsole (CSV), or Both
- Click **Download**
- The bundle includes `migration-report.json` (Mgmt API), and — when the source had VPN — `vpn.notes.json`. The Gateway export (`gaia_clish.txt`) includes static and IPv6 routes; dynamic routing appears as comments for manual setup.

---

## Managing your account

- **Settings → My profile:** change your email and password. A new password must meet the complexity policy (12–72 chars; upper, lower, digit, and special character; not your username) — a live checklist shows each requirement as you type.
- Changing your password signs out your other active sessions.
- Admins can create users and reset member passwords from **Settings → Users**.

---

## Supported Formats

| Source | Format |
|--------|--------|
| ASA | Plain text (.txt, .cfg) |
| FTD | JSON or ASA-compatible text |
| **FortiGate (FortiOS)** | Full configuration **.conf** / **.txt** (CLI backup or `show full-configuration` style) |
| FortiManager | Policy package **JSON** (paste/upload or live import, depending on setup) |
| **Palo Alto (PAN-OS)** | Configuration **XML** (paste or `.xml` upload) |
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
| Parse fails | Check source format; ASA/FTD/FortiOS syntax; FortiGate needs full config text; Palo Alto needs valid PAN-OS **XML** |
| Missing object refs | Fix in Validate step before export |
| Export blocked | Resolve all validation errors |
| Large file rejected | Check `MAX_UPLOAD_MB` in environment |

See [docs/limitations.md](docs/limitations.md) for unsupported features.
