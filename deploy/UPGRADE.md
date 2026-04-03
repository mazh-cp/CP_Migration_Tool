# Production upgrade (Ubuntu)

Full detail: [REMOTE_INSTALL.md](../REMOTE_INSTALL.md).

**Current release tag:** `v1.4.1` (see root `CHANGELOG.md`).

## On the server (curl)

`sudo` does not inherit `BRANCH=…` from the left side of the pipe. For a **pinned tag**, use **`bash -s -- <tag>`** or **`sudo env BRANCH=… bash`**.

```bash
# Latest main
curl -fsSL https://raw.githubusercontent.com/mazh-cp/CP_Migration_Tool/main/deploy/upgrade-production.sh | sudo bash
```

```bash
# Pinned v1.4.1 (recommended wrapper)
curl -fsSL https://raw.githubusercontent.com/mazh-cp/CP_Migration_Tool/v1.4.1/deploy/upgrade-production.sh | sudo bash -s -- v1.4.1
```

```bash
# Same, via env
curl -fsSL https://raw.githubusercontent.com/mazh-cp/CP_Migration_Tool/v1.4.1/deploy/upgrade-production.sh | sudo env BRANCH=v1.4.1 bash
```

```bash
# Self-contained updater (no wrapper; same as above for any tag)
curl -fsSL https://raw.githubusercontent.com/mazh-cp/CP_Migration_Tool/v1.4.1/deploy/update_azure_ubuntu.sh | sudo env BRANCH=v1.4.1 bash
```

Legacy alias: `deploy/update_azure_ubuntu.sh` (same behavior).

## From your laptop (SSH)

```bash
REMOTE=ubuntu@YOUR-VM ./deploy/upgrade-remote-production.sh v1.4.1
```

Environment overrides: `APP_DIR`, `SERVICE_USER`, `SERVICE_NAME`, `PORT`, `BRANCH`, `DOC_RELEASE_TAG`, `REPO_SLUG` (remote script only).
