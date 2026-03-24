#!/usr/bin/env bash
# =============================================================================
# Migrator — canonical production upgrade entrypoint (Ubuntu / Azure VM)
#
# Same behavior as update_azure_ubuntu.sh; use this name in runbooks and curl.
#
# Latest main:
#   curl -fsSL https://raw.githubusercontent.com/mazh-cp/CP_Migration_Tool/main/deploy/upgrade-production.sh | sudo bash
#
# Pinned release (checkout tag on server):
#   BRANCH=v1.3.0 curl -fsSL https://raw.githubusercontent.com/mazh-cp/CP_Migration_Tool/v1.3.0/deploy/upgrade-production.sh | sudo bash
#
# Optional: APP_DIR PORT SERVICE_NAME SERVICE_USER REPO_URL DOC_RELEASE_TAG
# =============================================================================
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export DOC_RELEASE_TAG="${DOC_RELEASE_TAG:-v1.3.0}"
exec bash "$DIR/update_azure_ubuntu.sh" "$@"
