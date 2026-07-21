# Production upgrade — curl commands (Ubuntu VM)

**Current release tag:** `v1.6.1` (see root `CHANGELOG.md`).

Run these **on the server** after `ssh ubuntu@your-vm` (or paste into a VM cloud-init / runbook). They download the updater from GitHub and run it with `sudo`.

**Important:** `sudo` does **not** inherit `BRANCH=…` from `BRANCH=v1.x curl | sudo bash`. Always pass the git ref **inside** `sudo` (`env BRANCH=…` or `bash -s -- <ref>`).

---

## Curl upgrade — pinned tag (recommended)

```bash
curl -fsSL https://raw.githubusercontent.com/mazh-cp/CP_Migration_Tool/v1.6.1/deploy/upgrade-production.sh | sudo env BRANCH=v1.6.1 DOC_RELEASE_TAG=v1.6.1 bash
```

Same ref, using the wrapper’s positional argument:

```bash
curl -fsSL https://raw.githubusercontent.com/mazh-cp/CP_Migration_Tool/v1.6.1/deploy/upgrade-production.sh | sudo bash -s -- v1.6.1
```

Direct updater (no `upgrade-production.sh` wrapper — same end result):

```bash
curl -fsSL https://raw.githubusercontent.com/mazh-cp/CP_Migration_Tool/v1.6.1/deploy/update_azure_ubuntu.sh | sudo env BRANCH=v1.6.1 DOC_RELEASE_TAG=v1.6.1 bash
```

---

## Curl upgrade — latest `main`

```bash
curl -fsSL https://raw.githubusercontent.com/mazh-cp/CP_Migration_Tool/main/deploy/upgrade-production.sh | sudo env BRANCH=main DOC_RELEASE_TAG=main bash
```

Or:

```bash
curl -fsSL https://raw.githubusercontent.com/mazh-cp/CP_Migration_Tool/main/deploy/upgrade-production.sh | sudo bash
```

---

## Optional environment (prepend to `sudo env` or export before `curl`)

| Variable | Example | Purpose |
|----------|---------|---------|
| `PORT` | `PORT=3000` | Systemd / health check port (also reads `PORT` from `apps/web/.env` when set) |
| `APP_DIR` | `APP_DIR=/opt/cp_migration_tool` | Git checkout path |
| `SERVICE_USER` | `SERVICE_USER=cpmt` | User that runs `npm` / the app |
| `SERVICE_NAME` | `SERVICE_NAME=cp-migration-tool` | systemd unit name |
| `NODE_OPTIONS` | `--max-old-space-size=8192` | Node heap for `npm run build` (default `6144` is set in the updater if unset) |

Example:

```bash
curl -fsSL https://raw.githubusercontent.com/mazh-cp/CP_Migration_Tool/v1.6.1/deploy/upgrade-production.sh | sudo env BRANCH=v1.6.1 DOC_RELEASE_TAG=v1.6.1 PORT=3000 bash
```

---

## From your laptop (single line, no clone)

```bash
ssh -t ubuntu@YOUR-VM 'curl -fsSL https://raw.githubusercontent.com/mazh-cp/CP_Migration_Tool/v1.6.1/deploy/upgrade-production.sh | sudo env BRANCH=v1.6.1 DOC_RELEASE_TAG=v1.6.1 bash'
```

```bash
ssh -t ubuntu@YOUR-VM 'curl -fsSL https://raw.githubusercontent.com/mazh-cp/CP_Migration_Tool/main/deploy/upgrade-production.sh | sudo env BRANCH=main DOC_RELEASE_TAG=main bash'
```

---

## From a local git clone (helper script)

```bash
REMOTE=ubuntu@YOUR-VM ./deploy/upgrade-remote-production.sh v1.6.1
```

Overrides: `REPO_SLUG`, `DOC_RELEASE_TAG`, `NODE_OPTIONS`, `SSH_OPTS` (see `deploy/upgrade-remote-production.sh`).

---

More context: [REMOTE_INSTALL.md](../REMOTE_INSTALL.md), [DEPLOYMENT.md](../DEPLOYMENT.md).
