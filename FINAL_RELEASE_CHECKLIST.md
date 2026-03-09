# Final Release Checklist — CP Migration Tool v1.0.0

## Build

- [x] `npm run build` succeeds
- [x] No TypeScript errors
- [x] No build warnings (critical)

## Lint & Type Check

- [x] `npm run lint` passes
- [x] `npm run typecheck` passes

## Tests

- [ ] `npm run test` — run and verify
- [ ] Parser validation tests
- [ ] Route smoke tests

## Security

- [x] No hardcoded secrets
- [x] .env in .gitignore
- [x] SESSION_SECRET required in production
- [ ] `gitleaks detect` — run if gitleaks installed
- [ ] `npm audit` — run and fix high/critical

## Deployment

- [x] Health endpoint: GET /health
- [x] Ready endpoint: GET /ready
- [x] Bind: HOST=0.0.0.0, PORT=3000
- [x] deploy/install_azure_ubuntu.sh
- [x] systemd service file

## Manual Smoke Test

1. Start: `npm run dev` or `npm run start`
2. Open http://localhost:3000
3. Login with AUTH_USERNAME / AUTH_PASSWORD
4. Create project, import config, parse, map, validate, export
5. GET /health returns `{"status":"ok"}`
6. GET /ready returns `{"status":"ready"}` (if DB reachable)

## Known Risks / Manual Review

- **SQLite:** Single-node only; use PostgreSQL for scale
- **Upload dir:** Ensure writable; consider separate volume for production
- **LiteLLM:** API key stored in DB; ensure DB at-rest encryption if sensitive

## Recommended Next Improvements

- Add Prisma migrations (replace db push for production)
- Add rate limiting middleware for auth/login
- Add E2E tests
- PostgreSQL support for multi-node deployment
