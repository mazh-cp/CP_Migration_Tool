# Production upgrade (Ubuntu)

Full detail: [REMOTE_INSTALL.md](../REMOTE_INSTALL.md).

**Current release tag:** `v1.3.0` (see root `CHANGELOG.md`).

## On the server (curl)

```bash
# Latest main
curl -fsSL https://raw.githubusercontent.com/mazh-cp/CP_Migration_Tool/main/deploy/upgrade-production.sh | sudo bash
```

```bash
# Pinned v1.3.0 (server checkout matches tag)
BRANCH=v1.3.0 curl -fsSL https://raw.githubusercontent.com/mazh-cp/CP_Migration_Tool/v1.3.0/deploy/upgrade-production.sh | sudo bash
```

Legacy alias: `deploy/update_azure_ubuntu.sh` (same behavior).

## From your laptop (SSH)

```bash
REMOTE=ubuntu@YOUR-VM ./deploy/upgrade-remote-production.sh v1.3.0
```

Environment overrides: `APP_DIR`, `SERVICE_USER`, `SERVICE_NAME`, `PORT`, `BRANCH`, `DOC_RELEASE_TAG`, `REPO_SLUG` (remote script only).
