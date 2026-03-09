# Final Build Test Checklist

**Version:** 0.9.0-rc1  
**Date:** 2025-03-06

## Pre-requisites

- [ ] Node.js >= 18
- [ ] `npm install` completes
- [ ] `cp apps/web/.env.example apps/web/.env` and configure
- [ ] `npm run db:push` (from apps/web or via postinstall)

## Automated Checks

- [ ] `npm run typecheck` — PASS
- [ ] `npm run lint` — PASS
- [ ] `npm run test` — PASS
- [ ] `npm run build` — PASS
- [ ] `npm run release:check` — PASS

## Install Test

- [ ] Fresh clone
- [ ] `npm install`
- [ ] `cd apps/web && npx prisma generate && npx prisma db push`
- [ ] `npm run dev` starts on port 3000

## Login / Auth Test

- [ ] Navigate to `/login`
- [ ] Login with AUTH_USERNAME / AUTH_PASSWORD
- [ ] Redirect to `/dashboard`
- [ ] Unauthenticated redirect to `/login`
- [ ] Logout clears session

## Create Project Test

- [ ] Dashboard → Create New Project
- [ ] Enter name and source type (ASA or FTD)
- [ ] Create & Import
- [ ] Redirect to Import page

## Upload Config Test

- [ ] Paste or upload ASA/FTD config
- [ ] Import & Continue
- [ ] Redirect to Parse page

## Parse Test

- [ ] Run Parse
- [ ] Counts displayed (objects, rules, NAT, interfaces, warnings)
- [ ] Proceed to Map Interfaces

## Map Interfaces Test

- [ ] ASA interfaces listed
- [ ] Map to Check Point interfaces (MGMT, eth0, etc.)
- [ ] Save mappings
- [ ] Next: Map Objects

## Map Objects Test

- [ ] Object/service mappings displayed
- [ ] Confidence indicators
- [ ] Override if supported
- [ ] Next: Map Policy

## Map Policy Test

- [ ] Rules and NAT mappings visible
- [ ] Human-readable Source/Destination names
- [ ] Next: Validate

## Validation Test

- [ ] Validation findings shown
- [ ] Missing ref fixes: create placeholder, replace with Any
- [ ] Re-validate
- [ ] Export enabled when no errors

## Export Test

- [ ] Select target (SMS / Gateway / Both)
- [ ] Select SMS format if applicable
- [ ] Download produces ZIP, JSON, or CLI
- [ ] File opens / parses correctly

## Error Handling Test

- [ ] Invalid login shows error
- [ ] Missing project returns 404
- [ ] Parse failure shows generic error (no stack trace)
- [ ] Large file rejection at import (MAX_UPLOAD_MB)

## Regression

- [ ] All core screens load
- [ ] Breadcrumbs and stepper consistent
- [ ] Back/Next navigation works
- [ ] Settings page loads (if CONFIG_PIN used)
