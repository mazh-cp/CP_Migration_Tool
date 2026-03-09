# User Guide — CP Migration Tool

**Cisco ASA/FTD → Check Point Migration**

This guide walks you through converting Cisco ASA or FTD configurations to Check Point format using CP Migration Tool.

---

## Overview

The workflow has 8 steps:

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
- Review the counts: Objects, Rules, NAT, Interfaces, Warnings
- Click **Proceed to Map Interfaces**
- You can **Re-run Parse** if you change the source config

---

### 4. Map Interfaces

- For each ASA interface, select the Check Point interface (MGMT, eth0, eth1, etc.)
- Optionally set **IP override** and **Mask override**
- Click **Save mappings** → **Next: Map Objects**

---

### 5. Map Objects

- Review proposed Check Point mappings for network objects and services
- **Confidence:** Green (high), Amber (medium), Red (low)
- Edit mappings as needed
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

- **Target:** SMS only, Gateway only, or Both
- **Format (SMS):** Mgmt API (JSON + CLI), SmartConsole (CSV), or Both
- Click **Download**

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
| Parse fails | Check source format; ensure ASA/FTD syntax |
| Missing object refs | Fix in Validate step before export |
| Export blocked | Resolve all validation errors |
| Large file rejected | Check `MAX_UPLOAD_MB` in environment |
