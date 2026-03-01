# Cisco ASA/FTD → Check Point Converter

Convert Cisco ASA and FTD configurations to Check Point equivalents. Modular, explainable, safe-by-default.

## Quick Start

From the project root (`/Users/mhamayun/Downloads/Cursor Workbooks/CISCO-2-CP`):

```bash
# Install
npm install

# Setup database
cd apps/web && npx prisma generate && npx prisma db push

# Run dev server
npm run dev
```

Then open http://localhost:3000

## Project Structure

```
/apps/web          Next.js App Router + API routes
/packages/core     Domain models, normalizer, mapping, validation
/packages/parsers  ASA parser, FTD (JSON/text) parser
/packages/exporters Check Point JSON + CLI exporters
/packages/ui       Shared UI: Sidebar, ProjectStepper
/docs              Architecture, mapping matrix, user guide
```

## Workflow

1. **Create project** → name + source type (ASA/FTD)
2. **Import** → paste or upload config
3. **Parse & Normalize** → run parser, see counts
4. **Map Objects** → review/edit proposed Check Point mappings
5. **Map Policy** → review rules + NAT
6. **Validate** → fix errors, acknowledge warnings
7. **Export** → JSON bundle or CLI template

## Environment

Copy `.env.example` to `apps/web/.env`:

```
DATABASE_URL=file:./data/dev.db
UPLOAD_DIR=./data/uploads
MAX_UPLOAD_MB=25
LOG_LEVEL=info
```

## Tests

```bash
npm run test
```
