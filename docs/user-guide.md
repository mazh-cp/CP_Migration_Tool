# User Guide

**Cisco ASA/FTD → Check Point Converter**

This guide walks you through converting Cisco ASA or FTD configurations to Check Point format.

---

## Overview

The converter follows an 8-step workflow:

1. Create Project  
2. Import Config  
3. Parse & Normalize  
4. Map Interfaces  
5. Map Objects  
6. Map Policy  
7. Validate & Fix  
8. Export  

---

## Step-by-Step Usage

### 1. Create Project

- Go to **Dashboard** → **Create New Project**, or **Projects** → **New Project**
- Enter a **project name** (e.g. "Branch-FW-Migration")
- Select **source type**: ASA or FTD
- Click **Create & Import**
- You are redirected to the Import page

---

### 2. Import

- **Paste** your Cisco ASA/FTD configuration into the text area, or **upload** a file (`.txt`, `.cfg`, or `.json` for FTD)
- Ensure the **source type** matches the project (ASA or FTD)
- Click **Import & Continue**
- The config is stored and you proceed to the Parse page

**Tips:**
- Max file size is 25 MB (configurable via `MAX_UPLOAD_MB`)
- For FTD, use JSON export or text format compatible with ASA

---

### 3. Parse & Normalize

- Click **Run Parse**
- The parser converts the config into normalized objects, rules, NAT, and interfaces
- Review the counts:
  - **Objects** — Network and service objects
  - **Rules** — Access-list rules
  - **NAT** — NAT statements
  - **Interfaces** — ASA interfaces
  - **Warnings** — Unsupported or ambiguous lines
- Click **Proceed to Map Interfaces**

You can click **Re-run Parse** if you change the source config.

---

### 4. Map Interfaces

- For each ASA interface, select the corresponding Check Point interface (MGMT, eth0, eth1, etc.)
- Optionally set **IP override** and **Mask override** for Check Point
- Click **Save mappings**
- Click **Next: Map Objects**

If no interfaces exist, you can skip to Map Objects.

---

### 5. Map Objects

- Review proposed Check Point mappings for network objects and services
- **Confidence indicators:**
  - **Green (high)** — Strong match
  - **Amber (medium)** — Review recommended
  - **Red (low)** — Manual override recommended
- Edit mappings if needed
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

| Export | Output |
|--------|--------|
| Mgmt API | bundle.json, run_import.cli |
| SmartConsole | objects.csv, services.csv, groups.csv, policy.csv, nat.csv |
| Gateway | gaia_clish.txt |

---

## Troubleshooting

| Issue | Action |
|-------|--------|
| Parse fails | Check source format; ensure ASA or FTD syntax |
| Missing object references | Fix in Validate step before export |
| Export blocked | Resolve all validation errors |
| Large file rejected | Check `MAX_UPLOAD_MB` in environment |

See [Limitations](limitations.md) for unsupported features.
