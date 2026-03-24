# Production upgrade (Ubuntu)

Full detail: [REMOTE_INSTALL.md](../REMOTE_INSTALL.md).

**Current release tag:** `v1.2.0` (see root `CHANGELOG.md`).

```bash
# Latest main
curl -fsSL https://raw.githubusercontent.com/mazh-cp/CP_Migration_Tool/main/deploy/update_azure_ubuntu.sh | sudo bash
```

```bash
# Pinned v1.2.0 (server repo checkout matches tag)
BRANCH=v1.2.0 curl -fsSL https://raw.githubusercontent.com/mazh-cp/CP_Migration_Tool/v1.2.0/deploy/update_azure_ubuntu.sh | sudo bash
```

Environment overrides: `APP_DIR`, `SERVICE_USER`, `SERVICE_NAME`, `PORT`, `BRANCH`, `DOC_RELEASE_TAG`.
