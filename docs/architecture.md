# Architecture

## Overview

Cisco ASA/FTD to Check Point converter: a modular, explainable conversion pipeline.

```
┌─────────────┐    ┌──────────────┐    ┌─────────────┐    ┌─────────────┐    ┌──────────────┐
│  Import     │───▶│  Parse       │───▶│  Normalize  │───▶│  Map        │───▶│  Export      │
│  (ASA/FTD)  │    │  (AST)       │    │  (vendor-   │    │  (CP model) │    │  (JSON/CLI)  │
│             │    │              │    │   neutral)  │    │             │    │              │
└─────────────┘    └──────────────┘    └─────────────┘    └─────────────┘    └──────────────┘
                         │                     │                  │
                         └─────────────────────┴──────────────────┘
                                    Validation Layer
```

## Module Responsibilities

### `/apps/web`
- Next.js App Router UI
- API route handlers (projects, import, parse, mapping, export)
- Project stepper, sidebar navigation, tables, detail panels

### `/packages/core`
- Domain models: Project, NormalizedObject, NormalizedPolicyRule, NormalizedNATRule, MappingDecision, ValidationFinding
- Normalizer: AST → vendor-neutral models
- Mapping engine: normalized → Check Point target models
- Validation engine: uniqueness, missing refs, service definitions
- Security: redaction for secrets, audit logging

### `/packages/parsers`
- ASA: tokenizer, parser, AST
- FTD: JSON parser, text parser (ASA-compatible)
- Output: AST + parser warnings

### `/packages/exporters`
- Check Point: JSON bundle, CLI template
- Future: Gaia/SmartConsole API

### `/packages/ui`
- Shared components: Sidebar, ProjectStepper
- Reusable table, drawer, badge components
