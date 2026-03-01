# User Guide

## Step-by-Step Usage

### 1. Create Project
- Go to **Projects** → **New Project**
- Enter project name and source type (ASA / FTD / Both)
- Click **Create & Import**

### 2. Import
- **Paste** or **Upload** your Cisco ASA/FTD configuration
- Choose source type (ASA or FTD)
- Click **Import & Continue**

### 3. Parse & Normalize
- Click **Run Parse**
- Review counts: objects, rules, NAT, warnings
- Click **Proceed to Map Objects**

### 4. Map Objects
- Review proposed Check Point mappings for network objects and services
- Confidence scores: green (high), amber (medium), red (low)
- Click **Next: Map Policy**

### 5. Map Policy
- Review access rules and NAT mappings
- Click **Next: Validate & Fix**

### 6. Validate & Fix
- Resolve errors (required for export)
- Warnings and info can be acknowledged
- Click **Next: Export** when ready

### 7. Export
- Choose format: JSON bundle or CLI template
- Click **Download**
