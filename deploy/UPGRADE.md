# Production upgrade (Ubuntu)

Full detail: [REMOTE_INSTALL.md](../REMOTE_INSTALL.md).

```bash
# Latest main
curl -fsSL https://raw.githubusercontent.com/mazh-cp/CP_Migration_Tool/main/deploy/update_azure_ubuntu.sh | sudo bash
```

```bash
# Pinned tag (replace v1.1.0 if needed)
BRANCH=v1.1.0 curl -fsSL https://raw.githubusercontent.com/mazh-cp/CP_Migration_Tool/v1.1.0/deploy/update_azure_ubuntu.sh | sudo bash
```

Environment overrides: `APP_DIR`, `SERVICE_USER`, `SERVICE_NAME`, `PORT`, `BRANCH`, `DOC_RELEASE_TAG`.
